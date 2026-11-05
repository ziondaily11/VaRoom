'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const express = require('express');
const {
  FRESH_SIGN_IN_MS, STEP_UP_TTL_MS, verifiedTokenClaims, sessionSignedInAt, securityStatus, recordStepUp, passwordMatches, createAttemptLimiter,
} = require('../lib/stepUp');

const NOW = Date.parse('2026-11-05T12:00:00.000Z');
const HOUR = 60 * 60 * 1000;
const token = (claims) => `h.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.s`;
const claimsSignedIn = (msAgo, sessionId = 'sess-1') => ({ session_id: sessionId, amr: [{ method: 'password', timestamp: Math.floor((NOW - msAgo) / 1000) }] });

function fakeAdmin(stepUps = []) {
  const signOuts = [];
  return {
    stepUps,
    signOuts,
    auth: { admin: { signOut: async (jwt, scope) => { signOuts.push([jwt, scope]); return { error: null }; } } },
    from(table) {
      assert.equal(table, 'account_step_ups');
      const filters = [];
      const query = {
        select() { return query; },
        eq(column, value) { filters.push((row) => row[column] === value); return query; },
        maybeSingle: async () => ({ data: stepUps.find((row) => filters.every((f) => f(row))) || null, error: null }),
        upsert: async (row) => {
          const index = stepUps.findIndex((r) => r.session_id === row.session_id);
          if (index >= 0) stepUps[index] = row; else stepUps.push(row);
          return { error: null };
        },
      };
      return query;
    },
  };
}

test('windows: fresh for 12 hours after sign-in; a verification lasts 24 hours', () => {
  assert.equal(FRESH_SIGN_IN_MS, 12 * HOUR);
  assert.equal(STEP_UP_TTL_MS, 24 * HOUR);
});

test('claims: read from a validated token; sign-in time is the latest amr entry', () => {
  assert.deepEqual(verifiedTokenClaims(token({ session_id: 's', amr: [] })), { session_id: 's', amr: [] });
  assert.equal(verifiedTokenClaims('garbage'), null);
  assert.equal(sessionSignedInAt({ amr: [{ timestamp: 100 }, { timestamp: 250 }] }), 250000);
  assert.equal(sessionSignedInAt({ amr: [] }), null);
  assert.equal(sessionSignedInAt(null), null);
});

test('a recent sign-in opens without asking; an old session asks; a verification opens it for 24 hours in that session only', async () => {
  const admin = fakeAdmin();
  const fresh = await securityStatus(admin, { userId: 'U1', claims: claimsSignedIn(2 * HOUR), now: NOW });
  assert.deepEqual(fresh, { unlocked: true, reason: 'fresh_sign_in', unlockedUntil: new Date(NOW - 2 * HOUR + 12 * HOUR).toISOString() });

  const stale = await securityStatus(admin, { userId: 'U1', claims: claimsSignedIn(13 * HOUR), now: NOW });
  assert.deepEqual(stale, { unlocked: false, reason: 'stale_session', unlockedUntil: null });
  assert.equal((await securityStatus(admin, { userId: 'U1', claims: null, now: NOW })).unlocked, false, 'no claims: locked');

  const recorded = await recordStepUp(admin, { userId: 'U1', claims: claimsSignedIn(13 * HOUR), method: 'password', now: NOW });
  assert.equal(recorded.unlockedUntil, new Date(NOW + 24 * HOUR).toISOString());
  assert.equal(admin.stepUps[0].session_id, 'sess-1');

  assert.equal((await securityStatus(admin, { userId: 'U1', claims: claimsSignedIn(13 * HOUR), now: NOW + 5 * HOUR })).reason, 'verified', 'stays open in that session');
  assert.equal((await securityStatus(admin, { userId: 'U1', claims: claimsSignedIn(13 * HOUR, 'sess-2'), now: NOW + HOUR })).unlocked, false, 'another session (another device) asks');
  assert.equal((await securityStatus(admin, { userId: 'U2', claims: claimsSignedIn(13 * HOUR), now: NOW + HOUR })).unlocked, false, 'never another account');
  assert.equal((await securityStatus(admin, { userId: 'U1', claims: claimsSignedIn(13 * HOUR), now: NOW + 25 * HOUR })).unlocked, false, 'at most 24 hours');
  await assert.rejects(recordStepUp(admin, { userId: 'U1', claims: {}, method: 'password', now: NOW }), /no id/);
});

test('password check: same user only; the session it creates is ended', async () => {
  const admin = fakeAdmin();
  const anon = (user, error = null) => () => ({ auth: { signInWithPassword: async () => ({ data: { user, session: user ? { access_token: 'throwaway' } : null }, error }) } });
  assert.deepEqual(await passwordMatches(anon({ id: 'U1' }), admin, { email: 'a@b.c', password: 'x', userId: 'U1' }), { ok: true });
  assert.deepEqual(admin.signOuts, [['throwaway', 'local']]);
  assert.deepEqual(await passwordMatches(anon({ id: 'OTHER' }), admin, { email: 'a@b.c', password: 'x', userId: 'U1' }), { ok: false });
  assert.deepEqual(await passwordMatches(anon(null, { message: 'Invalid login credentials' }), admin, { email: 'a@b.c', password: 'x', userId: 'U1' }), { ok: false });
  assert.deepEqual(await passwordMatches(() => { throw new Error('no key'); }, admin, { email: 'a@b.c', password: 'x', userId: 'U1' }), { ok: false, unavailable: true });
});

test('wrong passwords: five per 15 minutes, then a wait', () => {
  let clock = NOW;
  const limiter = createAttemptLimiter({ now: () => clock });
  for (let i = 0; i < 5; i += 1) { assert.equal(limiter.blocked('U1'), false); limiter.fail('U1'); }
  assert.equal(limiter.blocked('U1'), true);
  assert.equal(limiter.blocked('U2'), false, 'per account');
  clock += 15 * 60 * 1000 + 1;
  assert.equal(limiter.blocked('U1'), false, 'the wait ends');
  limiter.fail('U1'); limiter.reset('U1');
  assert.equal(limiter.blocked('U1'), false);
});

test('routes: status and password verification, over HTTP', async () => {
  const { createAccountRoutes } = require('../routes/accountRoutes');
  const admin = fakeAdmin();
  const user = { id: 'U1', email: 'host@example.com' };
  admin.auth.getUser = async (jwt) => (jwt.startsWith('h.') ? { data: { user }, error: null } : { data: { user: null }, error: { message: 'bad' } });
  let passwordOk = false;
  const createAnonClient = () => ({ auth: { signInWithPassword: async () => (passwordOk ? { data: { user, session: null }, error: null } : { data: {}, error: { message: 'Invalid login credentials' } }) } });
  const app = express();
  app.use(express.json());
  app.use('/api', createAccountRoutes({ supabaseAdmin: admin, paystack: {}, createAnonClient, attempts: createAttemptLimiter({ maxAttempts: 2 }) }));
  const server = app.listen(0);
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const stale = token({ session_id: 'sess-9', amr: [{ method: 'password', timestamp: Math.floor((Date.now() - 20 * HOUR) / 1000) }] });
  const call = (url, init = {}) => fetch(base + url, { ...init, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${stale}`, ...(init.headers || {}) } })
    .then(async (response) => ({ status: response.status, body: await response.json() }));
  try {
    assert.equal((await call('/account/security-status')).body.unlocked, false);
    assert.equal((await call('/account/security-status', { headers: { Authorization: 'Bearer nope' } })).status, 401);
    assert.equal((await call('/account/verify-password', { method: 'POST', body: JSON.stringify({}) })).status, 400);
    assert.equal((await call('/account/verify-password', { method: 'POST', body: JSON.stringify({ password: 'wrong' }) })).status, 401);
    assert.equal((await call('/account/verify-password', { method: 'POST', body: JSON.stringify({ password: 'wrong' }) })).status, 401);
    assert.equal((await call('/account/verify-password', { method: 'POST', body: JSON.stringify({ password: 'right' }) })).status, 429, 'locked out after the limit');
    const limiterFree = createAttemptLimiter();
    server.close();
    const app2 = express();
    app2.use(express.json());
    app2.use('/api', createAccountRoutes({ supabaseAdmin: admin, paystack: {}, createAnonClient, attempts: limiterFree }));
    const server2 = app2.listen(0);
    const base2 = `http://127.0.0.1:${server2.address().port}/api`;
    passwordOk = true;
    const verified = await fetch(`${base2}/account/verify-password`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${stale}` }, body: JSON.stringify({ password: 'right' }) }).then((r) => r.json());
    assert.equal(verified.unlocked, true);
    const after = await fetch(`${base2}/account/security-status`, { headers: { Authorization: `Bearer ${stale}` } }).then((r) => r.json());
    assert.deepEqual({ unlocked: after.unlocked, reason: after.reason }, { unlocked: true, reason: 'verified' }, 'the same session no longer asks');
    server2.close();
  } finally {
    server.close();
  }
});

test('wiring: Google verification is recorded for the session; migrations enforce contact changes', () => {
  const read = (...parts) => fs.readFileSync(path.join(__dirname, '..', ...parts), 'utf8');
  assert.match(read('server.js'), /recordStepUp\(supabaseAdmin, \{ userId: user\.id, claims: verifiedTokenClaims\(bearerToken\(req\)\), method: 'google' \}\)/);
  const table = read('migrations', '20261105_000061_account_step_up.sql');
  assert.match(table, /signed_in_at >= extract\(epoch from now\(\)\) - 12 \* 3600/, 'same 12 hours as lib/stepUp.js');
  assert.match(table, /s\.verified_at > now\(\) - interval '24 hours'/, 'same 24 hours as lib/stepUp.js');
  assert.doesNotMatch(table, /create policy/, 'the table file changes nothing for the current app');
  const enforce = read('migrations', '20261105_000062_contact_step_up_enforcement.sql');
  assert.match(enforce, /with check \(profile_id = auth\.uid\(\) and public\.varoom_session_unlocked\(\)\)/);
  assert.match(enforce, /and coalesce\(old\.onboarding_completed, false\)/, 'accounts still in onboarding are exempt');
  assert.match(enforce, /new\.phone is distinct from old\.phone\s+or new\.full_name is distinct from old\.full_name\s+or new\.username is distinct from old\.username\)\s+and not public\.varoom_session_unlocked\(\)/);
});
