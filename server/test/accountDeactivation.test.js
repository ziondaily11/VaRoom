'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const {
  DELETION_GRACE_DAYS, deactivateAccount, reactivateAccount, runDeactivationMaintenance, deactivatedAmong,
} = require('../lib/accountDeactivation');

// An in-memory stand-in for the admin client: enough of PostgREST's chain for these queries.
function fakeAdmin(tables) {
  const signOuts = [];
  return {
    tables,
    signOuts,
    auth: { admin: { signOut: async (token, scope) => { signOuts.push([token, scope]); return { error: null }; } } },
    from(table) {
      const filters = [];
      let patch = null;
      let limit = Infinity;
      const rows = () => (tables[table] || []).filter((row) => filters.every((f) => f(row)));
      const query = {
        select() { return query; },
        update(values) { patch = values; return query; },
        eq(column, value) { filters.push((row) => row[column] === value); return query; },
        in(column, list) { filters.push((row) => list.includes(row[column])); return query; },
        not(column, op, value) { filters.push((row) => (op === 'is' && value === null ? row[column] != null : true)); return query; },
        lte(column, value) { filters.push((row) => row[column] != null && row[column] <= value); return query; },
        order() { return query; },
        limit(n) { limit = n; return query; },
        maybeSingle: async () => ({ data: rows()[0] || null, error: null }),
        then(resolve) {
          if (patch) { rows().forEach((row) => Object.assign(row, patch)); return resolve({ error: null }); }
          return resolve({ data: rows().slice(0, limit), error: null });
        },
      };
      return query;
    },
  };
}

const NOW = new Date('2026-11-05T12:00:00.000Z');
const days = (n) => new Date(NOW.getTime() + n * 24 * 60 * 60 * 1000).toISOString();

function paystackStub(failCodes = []) {
  const disabled = [];
  return {
    disabled,
    disableSubscription: async ({ code }) => {
      if (failCodes.includes(code)) throw new Error('Paystack unavailable');
      disabled.push(code);
    },
  };
}

test('Delete account: deactivated now, deleted after 30 days; every session ends; plans stop renewing', async () => {
  const admin = fakeAdmin({
    profiles: [{ id: 'H1', deactivated_at: null, deletion_scheduled_for: null }],
    host_subscriptions: [
      { id: 'S1', host_id: 'H1', status: 'active', provider_subscription_code: 'SUB_1', provider_email_token: 'tok1' },
      { id: 'S2', host_id: 'H1', status: 'cancel_requested', provider_subscription_code: 'SUB_2', provider_email_token: 'tok2' },
      { id: 'S3', host_id: 'OTHER', status: 'active', provider_subscription_code: 'SUB_3', provider_email_token: 'tok3' },
    ],
  });
  const paystack = paystackStub();
  const result = await deactivateAccount(admin, paystack, { userId: 'H1', accessToken: 'jwt', scheduleDeletion: true, now: NOW });
  assert.equal(DELETION_GRACE_DAYS, 30);
  assert.equal(result.deactivatedAt, NOW.toISOString());
  assert.equal(result.deletionScheduledFor, days(30));
  assert.deepEqual(admin.tables.profiles[0], { id: 'H1', deactivated_at: NOW.toISOString(), deletion_scheduled_for: days(30) });
  assert.deepEqual(admin.signOuts, [['jwt', 'global']], 'signed out on every device');
  assert.deepEqual(paystack.disabled, ['SUB_1'], 'only this host’s renewing plan');
  assert.equal(admin.tables.host_subscriptions[0].status, 'cancel_requested');
  assert.equal(admin.tables.host_subscriptions[2].status, 'active', 'other hosts untouched');
});

test('Deactivate account: no deletion date; a Paystack failure does not stop the deactivation', async () => {
  const admin = fakeAdmin({
    profiles: [{ id: 'H1', deactivated_at: null, deletion_scheduled_for: null }],
    host_subscriptions: [{ id: 'S1', host_id: 'H1', status: 'active', provider_subscription_code: 'SUB_1', provider_email_token: 'tok1' }],
  });
  const result = await deactivateAccount(admin, paystackStub(['SUB_1']), { userId: 'H1', accessToken: 'jwt', scheduleDeletion: false, now: NOW });
  assert.equal(result.deletionScheduledFor, null);
  assert.equal(admin.tables.profiles[0].deactivated_at, NOW.toISOString());
  assert.equal(admin.tables.profiles[0].deletion_scheduled_for, null);
  assert.equal(admin.tables.host_subscriptions[0].status, 'active', 'left for the hourly retry');
});

test('signing in again restores the account; a session from before the deactivation does not', async () => {
  const deactivatedAt = NOW.toISOString();
  const admin = fakeAdmin({ profiles: [{ id: 'U1', deactivated_at: deactivatedAt, deletion_scheduled_for: days(30) }] });
  const stale = await reactivateAccount(admin, { id: 'U1', last_sign_in_at: days(-2) });
  assert.deepEqual(stale, { reactivated: false, reason: 'sign_in_required' });
  assert.equal(admin.tables.profiles[0].deactivated_at, deactivatedAt, 'still deactivated');
  assert.deepEqual(await reactivateAccount(admin, { id: 'U1' }), { reactivated: false, reason: 'sign_in_required' }, 'no sign-in time: no');

  const restored = await reactivateAccount(admin, { id: 'U1', last_sign_in_at: days(3) });
  assert.deepEqual(restored, { reactivated: true, wasScheduledForDeletion: true });
  assert.deepEqual(admin.tables.profiles[0], { id: 'U1', deactivated_at: null, deletion_scheduled_for: null });
  assert.deepEqual(await reactivateAccount(admin, { id: 'U1', last_sign_in_at: days(4) }), { reactivated: false, reason: 'active' });
});

test('maintenance: deletes only accounts past their 30 days, skips one restored meanwhile, retries renewals', async () => {
  const admin = fakeAdmin({
    profiles: [
      { id: 'DUE', deactivated_at: days(-31), deletion_scheduled_for: days(-1) },
      { id: 'NOT_YET', deactivated_at: days(-10), deletion_scheduled_for: days(20) },
      { id: 'PAUSED', deactivated_at: days(-90), deletion_scheduled_for: null },
      { id: 'BROKEN', deactivated_at: days(-40), deletion_scheduled_for: days(-10) },
      { id: 'ACTIVE_HOST', deactivated_at: null, deletion_scheduled_for: null },
    ],
    host_subscriptions: [
      { id: 'S1', host_id: 'PAUSED', status: 'active', provider_subscription_code: 'SUB_P', provider_email_token: 't' },
      { id: 'S2', host_id: 'ACTIVE_HOST', status: 'active', provider_subscription_code: 'SUB_A', provider_email_token: 't' },
    ],
  });
  const deleted = [];
  const deleteAccount = async (id) => {
    if (id === 'BROKEN') throw new Error('storage unavailable');
    deleted.push(id);
  };
  const paystack = paystackStub();
  const result = await runDeactivationMaintenance(admin, paystack, { deleteAccount, now: NOW });
  assert.deepEqual(deleted, ['DUE']);
  assert.deepEqual(result.deleted, ['DUE']);
  assert.deepEqual(result.failed.map((f) => f.id), ['BROKEN'], 'a failure is reported and retried next run');
  assert.deepEqual(paystack.disabled, ['SUB_P'], 'a deactivated host’s plan stops renewing; an active host’s does not');

  // Restored between the listing and the deletion: kept.
  const racing = fakeAdmin({ profiles: [{ id: 'R1', deactivated_at: days(-31), deletion_scheduled_for: days(-1) }], host_subscriptions: [] });
  const originalFrom = racing.from.bind(racing);
  let reads = 0;
  racing.from = (table) => {
    if (table === 'profiles' && ++reads === 2) Object.assign(racing.tables.profiles[0], { deactivated_at: null, deletion_scheduled_for: null });
    return originalFrom(table);
  };
  const kept = [];
  await runDeactivationMaintenance(racing, paystackStub(), { deleteAccount: async (id) => kept.push(id), now: NOW });
  assert.deepEqual(kept, [], 'a sign-in just before the deletion keeps the account');
});

test('deactivatedAmong: only deactivated ids', async () => {
  const admin = fakeAdmin({ profiles: [{ id: 'A', deactivated_at: NOW.toISOString() }, { id: 'B', deactivated_at: null }] });
  assert.deepEqual([...await deactivatedAmong(admin, ['A', 'B', 'A', null])], ['A']);
  assert.deepEqual([...await deactivatedAmong(admin, [])], []);
});

test('wiring: routes, hourly job, hidden listings, chats, profiles, reviews, migration', () => {
  const read = (...parts) => fs.readFileSync(path.join(__dirname, '..', ...parts), 'utf8');
  const server = read('server.js');
  assert.doesNotMatch(server, /app\.post\('\/api\/delete-account'/, 'moved to routes/accountRoutes.js');
  assert.match(server, /app\.use\('\/api', createAccountRoutes\(\{ supabaseAdmin \}\)\);/);
  assert.match(server, /setInterval\(runDeactivationMaintenanceNow, DEACTIVATION_MAINTENANCE_INTERVAL_MS\)\.unref\(\);/);
  assert.match(server, /deleteAccount: permanentlyDeleteAccount/);

  const routes = read('routes', 'accountRoutes.js');
  assert.match(routes, /router\.post\('\/delete-account'[\s\S]*scheduleDeletion: true/);
  assert.match(routes, /router\.post\('\/account\/deactivate'[\s\S]*scheduleDeletion: false/);
  assert.match(routes, /router\.post\('\/account\/reactivate'/);
  assert.doesNotMatch(routes, /permanentlyDeleteAccount/, 'nothing is erased at once');

  const media = require('../lib/listingMediaAccess');
  const listing = { id: 'L', host_id: 'H', publication_state: 'published', created_at: NOW.toISOString(), host: { deactivated_at: NOW.toISOString() } };
  assert.equal(media.decideListingMediaAccess(listing, null).allowed, false, 'hidden from visitors');
  assert.equal(media.decideListingMediaAccess(listing, 'H').allowed, true, 'not from its owner');
  assert.equal(media.decideListingMediaAccess({ ...listing, host: [{ deactivated_at: null }] }, null).allowed, true);
  for (const file of [['routes', 'photoRoutes.js'], ['routes', 'videoRoutes.js'], ['routes', 'listingRoutes.js']]) {
    assert.match(read(...file), /LISTING_HOST_STATE/, file.join('/'));
  }
  assert.match(read('routes', 'listingDocumentRoutes.js'), /&& !\(host && host\.deactivated_at\)/);
  assert.match(read('lib', 'locationAccess.js'), /if \(hostDeactivated\(listing\)\) return \{ error: 'Listing not found' \};/);
  assert.match(read('routes', 'hotelReservationRoutes.js'), /listingHost && listingHost\.deactivated_at/);
  assert.match(read('routes', 'reviewRoutes.js'), /filter\(\(review\) => !\(clientsById\[review\.client_id\] && clientsById\[review\.client_id\]\.deactivated_at\)\)/);
  assert.match(read('routes', 'profileRoutes.js'), /profile\.deactivated_at && !\(viewer && viewer\.id === profile\.id\)/);

  const chat = read('routes', 'chatRoutes.js');
  assert.match(chat, /full_name: 'Deactivated account', username: null, avatar_url: null, phone: null, deactivated: true/);
  assert.match(chat, /code: ACCOUNT_DEACTIVATED/);
  assert.match(chat, /listingHost && listingHost\.deactivated_at\)\) return res\.status\(404\)/);

  const sql = read('migrations', '20261105_000060_account_deactivation.sql');
  assert.match(sql, /using \(publication_state = 'published' and moderation_status = 'active' and public\.varoom_account_active\(host_id\)\)/);
  assert.match(sql, /with check \(auth\.uid\(\) = client_id and public\.varoom_account_active\(host_id\)\)/);
  assert.match(sql, /raise exception 'Account deactivation is managed by VaRoom'/);
});
