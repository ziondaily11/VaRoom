'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const express = require('express');

process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'http://localhost:54321';
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'test';
process.env.ADMIN_SESSION_SECRET = 'admin-test-secret';
process.env.RESEND_API_KEY = 'test-key';

const { attentionCounts, accountCounts } = require('../lib/adminHealth');
const { activityNames } = require('../lib/adminInvestigation');
const { effectiveStatus } = require('../lib/enforcement');
const { createAdminRoutes } = require('../routes/adminRoutes');
const { fakeSupabase } = require('./helpers/fakeSupabase');

const DAY = 86400000;
const iso = (days) => new Date(Date.now() + days * DAY).toISOString();
const U1 = '11111111-1111-4111-8111-111111111111';
const L1 = '22222222-2222-4222-8222-222222222222';

test('the Overview\'s "Needs attention" counts what is waiting, and accounts by status', async () => {
  const db = fakeSupabase({
    support_ticket_replies: [{ id: 'r1', delivery_status: 'failed', sent_at: iso(-1) }, { id: 'r2', delivery_status: 'failed', sent_at: iso(-9) }, { id: 'r3', delivery_status: 'sent', sent_at: iso(-1) }],
    support_tickets: [{ id: 't1', category: 'appeal', status: 'open' }, { id: 't2', category: 'appeal', status: 'closed' }, { id: 't3', category: 'billing', status: 'open' }],
    listing_reports: [{ id: 'lr', status: 'pending' }, { id: 'lr2', status: 'resolved' }],
    chat_user_reports: [{ id: 'cr', status: 'pending' }],
    host_subscriptions: [
      { id: 's1', status: 'active', provider_subscription_code: 'SUB', current_period_end: iso(-3) },
      { id: 's2', status: 'active', provider_subscription_code: null, current_period_end: iso(-3) },
      { id: 's3', status: 'active', provider_subscription_code: 'SUB2', current_period_end: iso(5) },
    ],
    admins: [{ id: 'a1', totp_enabled_at: null }, { id: 'a2', totp_enabled_at: iso(-1) }],
    moderation_rules: [{ key: 'account_reports', mode: 'shadow' }, { key: 'scam_messages', mode: 'enforce' }],
    account_controls: [
      { user_id: 'u1', status: 'suspended', suspended_until: null },
      { user_id: 'u2', status: 'suspended', suspended_until: iso(-1) },
      { user_id: 'u3', status: 'disabled', suspended_until: null },
      { user_id: 'u4', status: 'active' },
    ],
  }, { rpc: { admin_list_accounts: () => [{ id: 'x', total: 35 }] } });
  assert.deepEqual(await attentionCounts(db), { failedEmails: 1, appeals: 1, pendingReports: 2, stuckPlans: 1, adminsWithoutTwoStep: 1, shadowRules: 1 });
  assert.deepEqual(await accountCounts(db, effectiveStatus), { total: 35, suspended: 1, disabled: 1 }, 'an ended timed suspension is active');

  const broken = { from: () => { throw new Error('down'); } };
  assert.equal((await attentionCounts(broken)).failedEmails, null, 'a failed count is null, never an error');
});

test('audit rows get readable names for people, listings, tickets and rules', async () => {
  const db = fakeSupabase({
    profiles: [{ id: U1, full_name: 'Achieng Otieno' }],
    listings: [{ id: L1, title: 'Garden flat' }],
  });
  const rows = await activityNames(db, [
    { id: '1', target_type: 'user', target_id: U1 },
    { id: '2', target_type: 'listing', target_id: L1 },
    { id: '3', target_type: 'rule', target_id: 'scam_messages' },
    { id: '4', target_type: 'property_news', target_id: 'not-a-uuid' },
  ], { scam_messages: 'Scam-like messages' });
  assert.deepEqual(rows.map((r) => r.target_name), ['Achieng Otieno', 'Garden flat', 'Scam-like messages', null]);
});

async function adminServer(db) {
  db.tables.admins = [{ id: 'A1', name: 'Ada', email: 'ada@varoom.co.ke', role: 'support' }];
  const app = express();
  app.use(express.json());
  app.use('/admin', createAdminRoutes(db));
  const server = app.listen(0);
  const expires = Math.floor(Date.now() / 1000) + 600;
  const cookie = `varoom_admin_session=A1.${expires}.${crypto.createHmac('sha256', process.env.ADMIN_SESSION_SECRET).update(`A1.${expires}`).digest('hex')}`;
  const call = (method, path, body) => fetch(`http://127.0.0.1:${server.address().port}/admin${path}`, {
    method, headers: { 'Content-Type': 'application/json', Cookie: cookie }, body: body && JSON.stringify(body),
  });
  return { call, close: () => server.close() };
}

test('Users: the Restricted list shows suspended and disabled accounts only', async () => {
  const db = fakeSupabase({
    account_controls: [
      { user_id: U1, status: 'suspended', suspended_until: null, changed_at: iso(-1), reason: 'Spam' },
      { user_id: 'ended', status: 'suspended', suspended_until: iso(-1), changed_at: iso(-2) },
    ],
    profiles: [{ id: U1, full_name: 'Achieng Otieno', role: 'host' }],
  });
  db.users[U1] = { id: U1, email: 'achieng@example.com', created_at: iso(-30), app_metadata: { provider: 'google' } };
  const { call, close } = await adminServer(db);
  try {
    const body = await (await call('GET', '/users?status=restricted')).json();
    assert.equal(body.total, 1);
    assert.deepEqual([body.data[0].email, body.data[0].provider, body.data[0].profile.role, body.data[0].account.status], ['achieng@example.com', 'google', 'host', 'suspended']);
  } finally { close(); }
});

test('Send again: a failed reply is re-sent on its thread and marked delivered; others are refused', async () => {
  const realFetch = globalThis.fetch;
  const sent = [];
  globalThis.fetch = async (url, options) => {
    if (String(url).startsWith('https://api.resend.com')) {
      sent.push(JSON.parse(options.body));
      return { ok: true, json: async () => ({ id: 'resend-2' }), text: async () => '' };
    }
    return realFetch(url, options);
  };
  const db = fakeSupabase({
    support_ticket_replies: [
      { id: 'R1', ticket_id: 'T1', direction: 'outbound', delivery_status: 'failed', recipient: 'kev@example.com', subject: 'Re: Help [#T1]', message: 'Hi Kev,\n\nWe are on it.', message_id: '<m1@varoom.co.ke>', in_reply_to: '<orig@x>', provider_error: 'not authorized' },
      { id: 'R2', ticket_id: 'T1', direction: 'outbound', delivery_status: 'sent' },
    ],
  });
  const { call, close } = await adminServer(db);
  try {
    const ok = await call('POST', '/support/tickets/T1/replies/R1/resend', {});
    assert.equal(ok.status, 200);
    assert.equal(sent.length, 1);
    assert.deepEqual([sent[0].to, sent[0].headers['Message-ID'], sent[0].headers['In-Reply-To']], ['kev@example.com', '<m1@varoom.co.ke>', '<orig@x>']);
    assert.equal(sent[0].html, '<p>Hi Kev,</p><p>We are on it.</p>');
    const row = db.tables.support_ticket_replies[0];
    assert.deepEqual([row.delivery_status, row.resend_email_id, row.provider_error], ['sent', 'resend-2', null]);
    assert.equal(db.tables.admin_activity[0].action, 'support_reply_resent');
    assert.equal((await call('POST', '/support/tickets/T1/replies/R2/resend', {})).status, 409, 'a delivered reply is not sent twice');
    assert.equal((await call('POST', '/support/tickets/T9/replies/R1/resend', {})).status, 404, 'the reply must belong to the ticket');
  } finally {
    close();
    globalThis.fetch = realFetch;
  }
});
