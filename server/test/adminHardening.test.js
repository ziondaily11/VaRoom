'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const express = require('express');

process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'http://localhost:54321';
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'test';
process.env.ADMIN_SESSION_SECRET = 'admin-test-secret';

const security = require('../lib/adminSecurity');
const { scheduleJob, jobStatus } = require('../lib/jobHealth');
const { healthReport } = require('../lib/adminHealth');
const { createAdminRoutes, hashPassword } = require('../routes/adminRoutes');
const { fakeSupabase } = require('./helpers/fakeSupabase');

// RFC 6238 appendix B: the SHA-1 secret "12345678901234567890".
const RFC_SECRET = security.base32Encode(Buffer.from('12345678901234567890'));

test('authenticator codes match the RFC 6238 test vectors and allow one step of drift', () => {
  assert.equal(RFC_SECRET, 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ');
  assert.equal(security.totp(RFC_SECRET, 59 * 1000), '287082');
  assert.equal(security.totp(RFC_SECRET, 1111111109 * 1000), '081804');
  assert.equal(security.totp(RFC_SECRET, 2000000000 * 1000), '279037');
  const now = 1111111109 * 1000;
  assert.equal(security.verifyTotp(RFC_SECRET, '081804', now), true);
  assert.equal(security.verifyTotp(RFC_SECRET, '081 804', now), true);
  assert.equal(security.verifyTotp(RFC_SECRET, security.totp(RFC_SECRET, now - 30000), now), true, 'the previous step');
  assert.equal(security.verifyTotp(RFC_SECRET, security.totp(RFC_SECRET, now - 90000), now), false, 'three steps old');
  assert.equal(security.verifyTotp(RFC_SECRET, 'abcdef', now), false);
  const stored = security.encryptSecret(RFC_SECRET);
  assert.notEqual(stored, RFC_SECRET);
  assert.equal(security.decryptSecret(stored), RFC_SECRET);
  assert.match(security.otpauthUri(RFC_SECRET, 'ada@varoom.co.ke'), /^otpauth:\/\/totp\/VaRoom%20Admin%3Aada%40varoom\.co\.ke\?secret=GEZD/);
});

test('the lockout: the fifth failure in a row locks the admin row for 15 minutes', () => {
  const now = Date.now();
  assert.deepEqual(security.failedAttempt({ failed_logins: 3 }, now), { failed_logins: 4 });
  const locked = security.failedAttempt({ failed_logins: 4 }, now);
  assert.equal(locked.failed_logins, 0);
  assert.equal(Date.parse(locked.locked_until), now + 15 * 60 * 1000);
  assert.equal(security.lockout(locked, now + 60000).waitSeconds, 14 * 60);
  assert.equal(security.lockout(locked, now + 16 * 60 * 1000), null);
});

async function adminServer(db) {
  const app = express();
  app.use(express.json());
  app.use('/admin', createAdminRoutes(db));
  const server = app.listen(0);
  const base = `http://127.0.0.1:${server.address().port}/admin`;
  const sessionFor = (id) => {
    const expires = Math.floor(Date.now() / 1000) + 600;
    return `varoom_admin_session=${id}.${expires}.${crypto.createHmac('sha256', process.env.ADMIN_SESSION_SECRET).update(`${id}.${expires}`).digest('hex')}`;
  };
  const call = (method, path, body, as) => fetch(base + path, {
    method, redirect: 'manual', headers: { 'Content-Type': 'application/json', ...(as ? { Cookie: sessionFor(as) } : {}) }, body: body && JSON.stringify(body),
  });
  return { call, close: () => server.close() };
}

test('sign-in with two-step: password, then a code; wrong passwords and codes lock the row', async () => {
  const secret = security.newTotpSecret();
  const db = fakeSupabase({ admins: [{
    id: 'A1', name: 'Ada', email: 'ada@varoom.co.ke', role: 'super_admin', password_hash: await hashPassword('correct horse battery'),
    totp_secret_encrypted: security.encryptSecret(secret), totp_enabled_at: '2026-11-01', failed_logins: 0, locked_until: null,
  }] });
  const { call, close } = await adminServer(db);
  try {
    const noCode = await call('POST', '/login', { email: 'ada@varoom.co.ke', password: 'correct horse battery' });
    assert.equal(noCode.status, 401);
    assert.equal((await noCode.json()).code_required, true);
    assert.equal(db.tables.admins[0].failed_logins, 0, 'asking for the code is not a failure');

    const wrongCode = await call('POST', '/login', { email: 'ada@varoom.co.ke', password: 'correct horse battery', code: '000000' === security.totp(secret) ? '111111' : '000000' });
    assert.equal(wrongCode.status, 401);
    assert.equal(db.tables.admins[0].failed_logins, 1);

    const ok = await call('POST', '/login', { email: 'ada@varoom.co.ke', password: 'correct horse battery', code: security.totp(secret) });
    assert.equal(ok.status, 200);
    assert.equal((await ok.json()).admin.totp_enabled, true);
    assert.match(ok.headers.get('set-cookie'), /varoom_admin_session=/);
    assert.equal(db.tables.admins[0].failed_logins, 0);

    for (let i = 0; i < 5; i += 1) await call('POST', '/login', { email: 'ada@varoom.co.ke', password: 'wrong' });
    const locked = await call('POST', '/login', { email: 'ada@varoom.co.ke', password: 'correct horse battery', code: security.totp(secret) });
    assert.equal(locked.status, 429, 'locked even with the right password, and the lock is on the row');
    assert.ok(db.tables.admins[0].locked_until);
  } finally { close(); }
});

test('setting up two-step: a secret, a confirming code, then sign-in needs a code; turning it off needs one too', async () => {
  const db = fakeSupabase({ admins: [{ id: 'A1', name: 'Ada', email: 'ada@varoom.co.ke', role: 'support', totp_enabled_at: null }] });
  const { call, close } = await adminServer(db);
  try {
    const setup = await (await call('POST', '/me/totp/setup', {}, 'A1')).json();
    assert.match(setup.secret, /^[A-Z2-7]{32}$/);
    assert.equal(security.decryptSecret(db.tables.admins[0].totp_secret_encrypted), setup.secret);
    assert.equal((await call('POST', '/me/totp/enable', { code: '12' }, 'A1')).status, 400);
    assert.equal((await call('POST', '/me/totp/enable', { code: security.totp(setup.secret) }, 'A1')).status, 200);
    assert.ok(db.tables.admins[0].totp_enabled_at);
    assert.equal((await (await call('GET', '/session', null, 'A1')).json()).admin.totp_enabled, true);
    assert.equal((await call('POST', '/me/totp/setup', {}, 'A1')).status, 409);
    assert.equal((await call('POST', '/me/totp/disable', { code: security.totp(setup.secret) }, 'A1')).status, 200);
    assert.equal(db.tables.admins[0].totp_enabled_at, null);
  } finally { close(); }
});

test('managing admins: super admins change roles, reset two-step and remove others, never themselves', async () => {
  const db = fakeSupabase({ admins: [
    { id: 'A1', name: 'Ada', email: 'ada@varoom.co.ke', role: 'super_admin' },
    { id: 'A2', name: 'Bo', email: 'bo@varoom.co.ke', role: 'support', totp_enabled_at: '2026-11-01', totp_secret_encrypted: 'x' },
  ] });
  const { call, close } = await adminServer(db);
  try {
    assert.equal((await call('PATCH', '/admins/A2', { role: 'super_admin' }, 'A2')).status, 403, 'support cannot manage admins');
    assert.equal((await call('PATCH', '/admins/A1', { role: 'support' }, 'A1')).status, 400, 'not your own role');
    assert.equal((await call('PATCH', '/admins/A2', { role: 'read_only' }, 'A1')).status, 200);
    assert.equal(db.tables.admins[1].role, 'read_only');
    assert.equal((await call('POST', '/admins/A2/totp/reset', {}, 'A1')).status, 200);
    assert.deepEqual([db.tables.admins[1].totp_enabled_at, db.tables.admins[1].totp_secret_encrypted], [null, null]);
    assert.equal((await call('DELETE', '/admins/A1', null, 'A1')).status, 400, 'not yourself');
    assert.equal((await call('DELETE', '/admins/A2', null, 'A1')).status, 204);
    assert.equal(db.tables.admins.length, 1);
    assert.equal((await call('GET', '/session', null, 'A2')).status, 401, 'a removed admin is signed out at once');
    assert.deepEqual(db.tables.admin_activity.map((a) => a.action), ['admin_role_changed', 'admin_two_step_reset', 'admin_removed']);
  } finally { close(); }
});

test('accounts past 1,000: the Users list pages through the database; reviews, verification and documents', async () => {
  const pages = [];
  const db = fakeSupabase({
    admins: [{ id: 'A1', name: 'Ada', email: 'ada@varoom.co.ke', role: 'super_admin' }],
    profiles: [{ id: 'H1', verified: false }],
    reviews: [{ id: 'R1', listing_id: 'L1', host_id: 'H1', client_id: 'G1', rating: 1, comment: 'Spam', status: 'published', created_at: '2026-11-01', listing: { title: 'Flat' } }],
    listing_documents: [{ id: 'D1', host_id: 'H1', status: 'ready', deleted_at: null, storage_provider: 'supabase', storage_bucket: 'docs', storage_key: 'k', original_filename: 'deed.pdf', mime_type: 'application/pdf' }],
  }, { rpc: { admin_list_accounts: (args) => { pages.push(args); return [{ id: 'U51', email: 'u51@x.io', full_name: 'Fifty One', username: null, banned_until: null, total: 1234 }]; } } });
  db.storage = { from: () => ({ createSignedUrl: async () => ({ data: { signedUrl: 'https://storage.example/deed.pdf' }, error: null }) }) };
  const { call, close } = await adminServer(db);
  try {
    const page = await (await call('GET', '/users?q=fifty&offset=50', null, 'A1')).json();
    assert.deepEqual(pages[0], { p_query: 'fifty', p_limit: 50, p_offset: 50 });
    assert.equal(page.total, 1234);
    assert.deepEqual([page.data[0].profile.full_name, page.data[0].account.status], ['Fifty One', 'active']);

    assert.equal((await call('PATCH', '/listing-reviews/R1', { status: 'removed' }, 'A1')).status, 400, 'hiding needs a reason');
    assert.equal((await call('PATCH', '/listing-reviews/R1', { status: 'removed', reason: 'Spam' }, 'A1')).status, 200);
    assert.equal(db.tables.reviews[0].status, 'removed');

    assert.equal((await call('POST', '/users/H1/verified', { verified: true, reason: 'Title deed checked' }, 'A1')).status, 200);
    assert.equal(db.tables.profiles[0].verified, true);
    assert.equal(db.tables.notifications[0].type, 'host_verified');
  } finally { close(); }
});

test('health: jobs report their last run and error; problems are listed; one failing check hides nothing', async () => {
  const tick = scheduleJob('Test job', { first: 3600000, every: 3600000 }, async () => { throw new Error('database down'); });
  await tick();
  const failing = jobStatus().find((job) => job.name === 'Test job');
  assert.equal(failing.last_error, 'database down');
  assert.ok(failing.last_run_at);

  const old = new Date(Date.now() - 3 * 86400000).toISOString();
  const db = fakeSupabase({
    support_ticket_replies: [{ id: 'E1', delivery_status: 'failed', recipient: 'a@x.io', subject: 'Hi', provider_error: 'bounced', sent_at: new Date().toISOString() }],
    paystack_webhook_events: [],
    host_subscriptions: [{ id: 'S1', host_id: 'H1', plan_id: 'pro', status: 'active', provider_subscription_code: 'SUB_1', current_period_end: old }, { id: 'S2', host_id: 'H2', plan_id: 'pro', status: 'active', provider_subscription_code: null, current_period_end: old }],
    calendar_feeds: [],
    draft_media_cleanup_jobs: [],
    admins: [{ name: 'Ada', email: 'ada@varoom.co.ke', role: 'super_admin', totp_enabled_at: null }],
  });
  const report = await healthReport(db, {
    fetchFn: async (url) => ({ ok: !url.includes('news'), status: url.includes('news') ? 503 : 200 }),
    env: { PROPERTY_NEWS_API_URL: 'https://news.example', RESEND_API_KEY: 'x' },
  });
  assert.equal(report.jobs.find((job) => job.name === 'Test job').state, 'failing');
  assert.equal(report.email.count, 1);
  assert.deepEqual(report.stuckPlans.recent.map((p) => p.id), ['S1'], 'a free plan is not a stuck renewal');
  assert.deepEqual(report.services.map((s) => [s.name, s.ok]), [['Elie', true], ['Property News', false]]);
  assert.deepEqual([report.config.inboundEmail, report.config.outboundEmail, report.config.adminsWithoutTwoStep.length], [false, true, 1]);

  const broken = await healthReport({ from: () => { throw new Error('down'); } }, { fetchFn: async () => ({ ok: true, status: 200 }), env: {} });
  assert.equal(broken.email.error, 'down');
  assert.equal(broken.services.length, 2, 'the other checks still ran');
});
