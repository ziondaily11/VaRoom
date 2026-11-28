'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const express = require('express');

process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'http://localhost:54321';
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'test';
process.env.VA_ROOM_ENCRYPTION_KEY = crypto.randomBytes(32).toString('base64');
process.env.ADMIN_SESSION_SECRET = 'admin-test-secret';

const investigation = require('../lib/adminInvestigation');
const { encryptMessage } = require('../lib/messageEncryptionService');
const { createAdminRoutes } = require('../routes/adminRoutes');
const { fakeSupabase } = require('./helpers/fakeSupabase');

const U = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const LINKED = '33333333-3333-4333-8333-333333333333';

test('the account page gathers everything about one account', async () => {
  const db = fakeSupabase({
    profiles: [{ id: U, full_name: 'Jane Host', role: 'host' }, { id: OTHER, full_name: 'Guest Gary' }, { id: LINKED, full_name: 'Jane Second' }],
    account_controls: [{ user_id: LINKED, status: 'suspended', suspended_until: null }],
    listings: [{ id: 'L1', host_id: U, title: 'Flat', created_at: '2026-11-01' }],
    bookings: [{ id: 'B1', host_id: U, client_id: OTHER, listing_id: 'L1', status: 'approved', created_at: '2026-11-02' }],
    account_group_members: [{ user_id: U, group_id: 'G' }, { user_id: LINKED, group_id: 'G' }],
    host_team_members: [{ host_id: U, member_id: OTHER, roles: ['bookings'], status: 'active' }],
    chat_user_reports: [{ id: 'R1', reporter_user_id: OTHER, reported_user_id: U, reason: 'Rude', status: 'pending', created_at: '2026-11-03' }],
    listing_reports: [{ id: 'LR1', listing_id: 'L1', reporter_user_id: OTHER, reason: 'Fake', status: 'pending', created_at: '2026-11-04' }],
    support_tickets: [
      { id: 'T1', user_id: U, email: 'jane@example.com', subject: 'Help', status: 'open', created_at: '2026-11-05' },
      { id: 'T2', user_id: null, email: 'jane@example.com', subject: 'By email', status: 'open', created_at: '2026-11-06' },
    ],
    elie_ledger: [{ user_id: U, delta: 100, kind: 'welcome', created_at: '2026-11-01' }, { user_id: U, delta: -10, kind: 'search', created_at: '2026-11-02' }],
    admin_notes: [{ id: 'N1', user_id: U, body: 'Called her', created_at: '2026-11-07' }],
  });
  db.users[U] = { id: U, email: 'Jane@Example.com', created_at: '2026-10-01', app_metadata: { provider: 'google' } };
  const account = await investigation.accountOverview(db, U);
  assert.equal(account.user.provider, 'google');
  assert.equal(account.user.profile.full_name, 'Jane Host');
  assert.deepEqual(account.linked, [{ id: LINKED, name: 'Jane Second', status: 'suspended' }]);
  assert.deepEqual(account.team.map((t) => [t.as, t.name]), [['owner', 'Guest Gary']]);
  assert.equal(account.bookings.asHost.count, 1);
  assert.equal(account.bookings.asHost.recent[0].other, 'Guest Gary');
  assert.equal(account.reports.received[0].other, 'Guest Gary');
  assert.equal(account.reports.onListings[0].listing, 'Flat');
  assert.deepEqual(account.tickets.map((t) => t.id), ['T2', 'T1'], 'tickets by account and by email, once each, newest first');
  assert.equal(account.vcoins.balance, 90);
  assert.equal(account.notes[0].body, 'Called her');
  assert.equal(await investigation.accountOverview(fakeSupabase(), 'missing').then((a) => a.user.email), null);
});

test('search: ids, ticket numbers, titles and payment references', async () => {
  const ticketId = 'abcdef12-0000-4000-8000-000000000000';
  const db = fakeSupabase({
    profiles: [{ id: U, full_name: 'Jane' }],
    listings: [{ id: 'L1', title: 'Sunny 50% flat', host_id: U, moderation_status: 'active' }, { id: 'L2', title: '500 flat', host_id: U, moderation_status: 'active' }],
    support_tickets: [{ id: ticketId, subject: 'Help', email: 'jane@example.com', status: 'open' }],
    billing_payments: [{ id: 'P1', host_id: U, provider_reference: 'vr_ref_123', amount_minor: 100000, currency: 'KES', status: 'succeeded' }],
  }, { rpc: { admin_search_accounts: ({ p_query }) => (p_query === 'jane' ? [{ id: U, email: 'jane@example.com' }] : []) } });
  assert.deepEqual((await investigation.search(db, 'jane')).users.map((u) => u.id), [U]);
  assert.deepEqual((await investigation.search(db, U)).users.map((u) => u.id), [U]);
  assert.deepEqual((await investigation.search(db, '#ABCDEF12')).tickets.map((t) => t.id), [ticketId]);
  assert.deepEqual((await investigation.search(db, '50%')).listings.map((l) => l.id), ['L1'], '% is matched literally');
  assert.deepEqual((await investigation.search(db, 'ref_123')).payments.map((p) => p.id), ['P1']);
  assert.deepEqual(await investigation.search(db, 'j'), { users: [], listings: [], tickets: [], payments: [] });
});

function adminApp(db, role) {
  db.tables.admins = [{ id: 'A1', name: 'Ada', email: 'ada@varoom.co.ke', role }];
  const app = express();
  app.use(express.json());
  app.use('/admin', createAdminRoutes(db));
  const server = app.listen(0);
  const expires = Math.floor(Date.now() / 1000) + 600;
  const signature = crypto.createHmac('sha256', process.env.ADMIN_SESSION_SECRET).update(`A1.${expires}`).digest('hex');
  const call = (method, path, body) => fetch(`http://127.0.0.1:${server.address().port}/admin${path}`, {
    method, headers: { 'Content-Type': 'application/json', Cookie: `varoom_admin_session=A1.${expires}.${signature}` }, body: body && JSON.stringify(body),
  });
  return { call, close: () => server.close() };
}

function reportedChat() {
  return fakeSupabase({
    profiles: [{ id: U, full_name: 'Reporter Rita' }, { id: OTHER, full_name: 'Scammer Sam' }],
    chat_user_reports: [{ id: 'R1', conversation_id: 'C1', reporter_user_id: U, reported_user_id: OTHER, reason: 'Scam', status: 'pending', created_at: '2026-11-01' }],
    conversations: [{ id: 'C1', host_id: OTHER, client_id: U }],
    messages: [
      { id: 'M1', conversation_id: 'C1', sender_id: OTHER, created_at: '2026-11-01T10:00:00Z', message_type: 'text', ...encryptMessage('Pay the deposit before viewing') },
      { id: 'M2', conversation_id: 'C1', sender_id: U, created_at: '2026-11-01T10:01:00Z', message_type: 'text', deleted_at: '2026-11-01T10:02:00Z', ...encryptMessage('gone') },
    ],
  });
}

test('a reported conversation is readable by support, decrypted, and every reading is recorded', async () => {
  const db = reportedChat();
  const { call, close } = adminApp(db, 'support');
  try {
    const response = await call('GET', '/user-reports/R1/conversation');
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.deepEqual(body.messages.map((m) => m.body), ['Pay the deposit before viewing', 'This message was deleted']);
    assert.equal(body.report.reported, 'Scammer Sam');
    assert.deepEqual(db.tables.admin_activity.map((a) => [a.admin_id, a.action, a.target_id]), [['A1', 'reported_conversation_viewed', 'R1']]);
    assert.equal((await call('GET', '/user-reports/missing/conversation')).status, 404);
  } finally { close(); }

  const readOnly = adminApp(reportedChat(), 'read_only');
  try {
    assert.equal((await readOnly.call('GET', '/user-reports/R1/conversation')).status, 403, 'read-only admins cannot read conversations');
  } finally { readOnly.close(); }
});

test('acting on a chat report: super admins only, a reason, and it is resolved as actioned', async () => {
  const support = adminApp(reportedChat(), 'support');
  try {
    assert.equal((await support.call('PATCH', '/user-reports/R1', { action: 'suspend', reason: 'Scam' })).status, 403);
  } finally { support.close(); }

  const db = reportedChat();
  const { call, close } = adminApp(db, 'super_admin');
  try {
    assert.equal((await call('PATCH', '/user-reports/R1', { action: 'suspend' })).status, 400, 'a reason is required');
    assert.equal((await call('PATCH', '/user-reports/R1', { action: 'explode', reason: 'x' })).status, 400);
    const response = await call('PATCH', '/user-reports/R1', { action: 'suspend_7_days', reason: 'Asked for a deposit before viewing' });
    assert.equal(response.status, 200);
    assert.equal(db.tables.chat_user_reports[0].status, 'actioned');
    const control = db.tables.account_controls.find((c) => c.user_id === OTHER);
    assert.equal(control.status, 'suspended');
    assert.ok(control.suspended_until);
    assert.equal((await call('POST', `/users/${OTHER}/notes`, { body: 'Suspended after report R1' })).status, 201);
    assert.equal(db.tables.admin_notes[0].admin_id, 'A1');
  } finally { close(); }
});

test('acting on a listing report hides the listing and resolves the report', async () => {
  const db = fakeSupabase({
    listings: [{ id: 'L1', title: 'Flat', host_id: OTHER, moderation_status: 'active' }],
    listing_reports: [{ id: 'LR1', listing_id: 'L1', reporter_user_id: U, reason: 'Fake', status: 'pending', created_at: '2026-11-01', listing: { host_id: OTHER } }],
  });
  const { call, close } = adminApp(db, 'support');
  try {
    assert.equal((await call('PATCH', '/reports/LR1', { action: 'suspend_host', reason: 'x' })).status, 403, 'account actions need a super admin');
    assert.equal((await call('PATCH', '/reports/LR1', { action: 'hide_listing', reason: 'Fake photos' })).status, 200);
    assert.equal(db.tables.listings[0].moderation_status, 'hidden');
    assert.equal(db.tables.listing_reports[0].status, 'actioned');
    assert.equal((await call('PATCH', '/reports/LR1', { status: 'dismissed' })).status, 200, 'plain status changes still work');
  } finally { close(); }
});
