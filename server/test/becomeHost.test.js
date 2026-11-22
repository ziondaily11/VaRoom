'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { createAccountRoutes, parseHostSetup } = require('../routes/accountRoutes');
const { createAttemptLimiter } = require('../lib/stepUp');

const USER = 'u-1';
const token = (claims) => `h.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.s`;
const fresh = token({ session_id: 's-1', amr: [{ method: 'password', timestamp: Math.floor(Date.now() / 1000) - 60 }] });
const stale = token({ session_id: 's-2', amr: [{ method: 'password', timestamp: Math.floor(Date.now() / 1000) - 13 * 3600 }] });
const FORM = { username: 'palm_view', phone: '0712 345 678', city: 'Nairobi, Kenya', niche: 'airbnb', discoverName: 'Palm View Apartments' };

/** Profiles and step-ups in memory, answering the queries the route makes. */
function fakeAdmin(profiles) {
  const updates = [];
  const metadata = [];
  return {
    updates,
    metadata,
    profiles,
    auth: {
      getUser: async (jwt) => (jwt === fresh || jwt === stale
        ? { data: { user: { id: USER, user_metadata: { role: 'client', full_name: 'Amina' } } }, error: null }
        : { data: { user: null }, error: new Error('bad token') }),
      admin: { updateUserById: async (id, attrs) => { metadata.push([id, attrs]); return { error: null }; } },
    },
    from(table) {
      const filters = [];
      let patch = null;
      let like = null;
      const rows = () => (table === 'profiles' ? profiles : []).filter((row) => filters.every((f) => f(row)) && (!like || row.username.toLowerCase() === like));
      const query = {
        select() { return query; },
        eq(column, value) { filters.push((row) => row[column] === value); return query; },
        neq(column, value) { filters.push((row) => row[column] !== value); return query; },
        ilike(_column, value) { like = value.replace(/\\(.)/g, '$1').toLowerCase(); return query; },
        update(next) { patch = next; return query; },
        limit: async () => ({ data: rows(), error: null }),
        maybeSingle: async () => {
          const row = rows()[0] || null;
          if (patch && row) { Object.assign(row, patch); updates.push(patch); }
          return { data: row, error: null };
        },
      };
      return query;
    },
  };
}

async function post(admin, auth, body) {
  const app = express();
  app.use(express.json());
  app.use('/api', createAccountRoutes({ supabaseAdmin: admin, paystack: {}, createAnonClient: () => ({}), attempts: createAttemptLimiter() }));
  const server = app.listen(0);
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/account/become-host`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', ...(auth ? { Authorization: `Bearer ${auth}` } : {}) }, body: JSON.stringify(body),
    });
    return { status: response.status, body: await response.json() };
  } finally {
    server.close();
  }
}

const client = () => ({ id: USER, role: 'client', onboarding_completed: true, username: 'amina', listing_categories: null });

test('the form is checked as onboarding checks it; the phone is saved as +254…', () => {
  assert.deepEqual(parseHostSetup(FORM, USER), { username: 'palm_view', phone: '+254712345678', city: 'Nairobi, Kenya', niche: 'airbnb', discoverName: 'Palm View Apartments', avatarPath: undefined });
  assert.match(parseHostSetup({ ...FORM, username: 'ab' }, USER).error, /3 to 20/);
  assert.match(parseHostSetup({ ...FORM, phone: '12' }, USER).error, /phone/);
  assert.match(parseHostSetup({ ...FORM, city: 'N' }, USER).error, /city/);
  assert.match(parseHostSetup({ ...FORM, niche: 'castle' }, USER).error, /category/);
  assert.match(parseHostSetup({ ...FORM, discoverName: 'x'.repeat(41) }, USER).error, /2 and 40/);
  assert.equal(parseHostSetup({ ...FORM, avatarPath: `${USER}/avatar_123.jpg` }, USER).avatarPath, `${USER}/avatar_123.jpg`);
  assert.equal(parseHostSetup({ ...FORM, avatarPath: null }, USER).avatarPath, null);
  assert.match(parseHostSetup({ ...FORM, avatarPath: 'someone-else/avatar_1.jpg' }, USER).error, /photo/, 'only the account’s own folder');
});

test('a client becomes a host in one update, and the sign-up role follows', async () => {
  const admin = fakeAdmin([client(), { id: 'u-2', role: 'host', username: 'other' }]);
  const result = await post(admin, fresh, { ...FORM, avatarPath: `${USER}/avatar_9.jpg` });
  assert.equal(result.status, 200);
  assert.deepEqual(result.body, { success: true, role: 'host' });
  assert.deepEqual(admin.updates, [{
    role: 'host', username: 'palm_view', phone: '+254712345678', city: 'Nairobi, Kenya', listing_categories: ['airbnb'],
    full_name: 'Palm View Apartments', onboarding_completed: true, avatar_url: `${USER}/avatar_9.jpg`,
  }]);
  assert.deepEqual(admin.metadata, [[USER, { user_metadata: { role: 'host', full_name: 'Amina' } }]]);
});

test('a retry after a lost response succeeds without writing again', async () => {
  const admin = fakeAdmin([{ ...client(), role: 'host' }]);
  const result = await post(admin, fresh, FORM);
  assert.equal(result.status, 200);
  assert.deepEqual(admin.updates, []);
});

test('an old session must verify first, as Settings → Your Account asks', async () => {
  const admin = fakeAdmin([client()]);
  const result = await post(admin, stale, FORM);
  assert.equal(result.status, 403);
  assert.equal(result.body.code, 'step_up_required');
  assert.deepEqual(admin.updates, []);
});

test('a taken username, an unfinished account and no session are refused without changes', async () => {
  const taken = fakeAdmin([client(), { id: 'u-2', role: 'host', username: 'Palm_View' }]);
  const result = await post(taken, fresh, FORM);
  assert.equal(result.status, 409);
  assert.equal(result.body.code, 'username_taken');
  assert.deepEqual(taken.updates, []);

  const unfinished = fakeAdmin([{ ...client(), onboarding_completed: false }]);
  assert.equal((await post(unfinished, fresh, FORM)).status, 409);
  assert.deepEqual(unfinished.updates, []);

  assert.equal((await post(fakeAdmin([client()]), null, FORM)).status, 401);
  assert.equal((await post(fakeAdmin([client()]), fresh, { ...FORM, niche: 'castle' })).status, 400);
});
