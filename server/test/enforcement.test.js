'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
// Notices load lib/notifications.js, whose client needs these (no request is made).
process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'http://localhost:54321';
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'test';
const enforcement = require('../lib/enforcement');

const { fakeSupabase: fakeDb } = require('./helpers/fakeSupabase');

const rule = (key, mode, threshold, window_hours = 168) => ({ key, mode, threshold, window_hours });

test('scam-like messages: money before a viewing, or leaving VaRoom', () => {
  for (const text of [
    'Send the viewing fee via M-Pesa till 123456 to reserve',
    'Pay the deposit before the viewing please',
    "Let's talk outside VaRoom on WhatsApp",
  ]) assert.equal(enforcement.looksLikeScam(text), true, text);
  for (const text of ['Is the deposit refundable?', 'Can I view it on Saturday?', 'The rent is 20,000 a month', '']) {
    assert.equal(enforcement.looksLikeScam(text), false, text);
  }
});

test('a timed suspension counts as active once it has ended', () => {
  const past = new Date(Date.now() - 1000).toISOString();
  const future = new Date(Date.now() + 60000).toISOString();
  assert.equal(enforcement.effectiveStatus(null), 'active');
  assert.equal(enforcement.effectiveStatus({ status: 'suspended', suspended_until: past }), 'active');
  assert.equal(enforcement.effectiveStatus({ status: 'suspended', suspended_until: future }), 'suspended');
  assert.equal(enforcement.effectiveStatus({ status: 'suspended', suspended_until: null }), 'suspended');
  assert.equal(enforcement.effectiveStatus({ status: 'disabled' }), 'disabled');
});

test('an admin suspension: controls, record, audit and notice; disabling bans sign-in', async () => {
  const db = fakeDb();
  const result = await enforcement.applyAction(db, { userId: 'U1', action: 'suspended', reason: 'Spam', days: 7, adminId: 'A1' });
  assert.equal(result.status, 'suspended');
  const days = (Date.parse(result.suspended_until) - Date.now()) / 86400000;
  assert.ok(days > 6.9 && days <= 7, String(days));
  assert.equal(db.tables.account_controls[0].status, 'suspended');
  assert.equal(db.tables.account_controls[0].changed_by, 'A1');
  assert.equal(db.tables.account_enforcement_actions[0].action, 'suspended');
  assert.deepEqual(db.tables.admin_activity.map((a) => [a.admin_id, a.action]), [['A1', 'account_suspended']]);
  assert.equal(db.tables.notifications[0].type, 'account_suspended');
  assert.match(db.tables.notifications[0].message, /Reason: Spam/);
  assert.deepEqual(db.bans, [['U1', 'none']]);

  await enforcement.applyAction(db, { userId: 'U1', action: 'disabled', reason: 'Fraud', adminId: 'A1' });
  assert.deepEqual(db.bans.at(-1), ['U1', '876000h']);
  await enforcement.applyAction(db, { userId: 'U1', action: 'warning', reason: 'Note' });
  assert.equal(db.tables.account_controls[0].status, 'disabled', 'a warning leaves the account as it is');
  assert.equal(db.tables.admin_activity.at(-1).admin_id, null, 'a rule acts as System');
});

test('reports from different people: shadow records, enforce suspends once until reviewed', async () => {
  const reports = ['R1', 'R2', 'R2', 'R3'].map((reporter) => ({ reporter_user_id: reporter, reported_user_id: 'U1', status: 'pending', created_at: new Date().toISOString() }));
  const shadow = fakeDb({ moderation_rules: [rule('account_reports', 'shadow', 3)], chat_user_reports: reports });
  await enforcement.checkAccountReports(shadow, 'U1');
  assert.equal(shadow.tables.account_controls.length, 0);
  assert.deepEqual(shadow.tables.moderation_rule_hits.map((h) => h.action), ['would_suspended']);

  const live = fakeDb({ moderation_rules: [rule('account_reports', 'enforce', 3)], chat_user_reports: reports });
  await enforcement.checkAccountReports(live, 'U1');
  await enforcement.checkAccountReports(live, 'U1');
  assert.equal(live.tables.account_controls[0].status, 'suspended');
  assert.equal(live.tables.account_controls[0].suspended_until, null);
  assert.equal(live.tables.account_controls[0].rule_key, 'account_reports');
  assert.equal(live.tables.account_enforcement_actions.length, 1);

  const twoPeople = fakeDb({ moderation_rules: [rule('account_reports', 'enforce', 3)], chat_user_reports: reports.slice(0, 3) });
  await enforcement.checkAccountReports(twoPeople, 'U1');
  assert.equal(twoPeople.tables.account_controls.length, 0, 'one person reporting twice counts once');
});

test('repeat problems climb the ladder: a warning, then 7 days, then until reviewed', async () => {
  const db = fakeDb({ moderation_rules: [rule('scam_messages', 'enforce', 1, 1)] });
  const scam = 'Pay the deposit before the viewing';
  await enforcement.checkMessage(db, 'U1', 'M1', scam);
  assert.equal(db.tables.account_enforcement_actions.at(-1).action, 'warning');
  assert.equal(db.tables.account_controls.length, 0);

  db.tables.moderation_rule_hits.length = 0; // a new window
  await enforcement.checkMessage(db, 'U1', 'M2', scam);
  assert.equal(db.tables.account_controls[0].status, 'suspended');
  assert.ok(db.tables.account_controls[0].suspended_until);

  db.tables.account_controls[0].suspended_until = new Date(Date.now() - 1000).toISOString();
  assert.equal(await enforcement.liftEndedSuspensions(db), 1);
  assert.equal(db.tables.account_controls[0].status, 'active');
  assert.equal(db.tables.account_enforcement_actions.at(-1).action, 'restored');

  db.tables.moderation_rule_hits.length = 0;
  await enforcement.checkMessage(db, 'U1', 'M3', scam);
  assert.equal(db.tables.account_controls[0].status, 'suspended');
  assert.equal(db.tables.account_controls[0].suspended_until, null);
  await enforcement.checkMessage(db, 'U1', 'M4', 'Hello, is it available?');
  assert.equal(db.tables.moderation_rule_hits.filter((h) => h.action === 'flagged').length, 1, 'ordinary messages are not flagged');
});

test('listing reports hide the listing and tell the host', async () => {
  const reports = ['R1', 'R2', 'R3'].map((reporter) => ({ listing_id: 'L1', reporter_user_id: reporter, status: 'pending', created_at: new Date().toISOString() }));
  const db = fakeDb({ moderation_rules: [rule('listing_reports', 'enforce', 3)], listing_reports: reports, listings: [{ id: 'L1', title: 'Flat', host_id: 'H1', moderation_status: 'active' }] });
  await enforcement.checkListingReports(db, 'L1');
  assert.equal(db.tables.listings[0].moderation_status, 'hidden');
  assert.equal(db.tables.notifications[0].type, 'listing_hidden');
  assert.equal(db.tables.notifications[0].recipient_user_id, 'H1');
});

test('linked accounts share a restriction, and restoring lifts the one the rule applied', async () => {
  const db = fakeDb({
    moderation_rules: [rule('linked_accounts', 'enforce', 1, 1)],
    account_group_members: [{ user_id: 'U1', group_id: 'G' }, { user_id: 'U2', group_id: 'G' }],
  });
  await enforcement.applyAction(db, { userId: 'U1', action: 'suspended', reason: 'Spam', adminId: 'A1' });
  const linked = db.tables.account_controls.find((c) => c.user_id === 'U2');
  assert.equal(linked.status, 'suspended');
  assert.equal(linked.rule_key, 'linked_accounts');
  await enforcement.applyAction(db, { userId: 'U1', action: 'restored', reason: 'Appeal accepted', adminId: 'A1' });
  assert.equal(db.tables.account_controls.find((c) => c.user_id === 'U2').status, 'active');
});

test('a rule that is off does nothing, and a failing rule never throws', async () => {
  const db = fakeDb({ moderation_rules: [rule('conversation_burst', 'off', 1, 1)] });
  await enforcement.noteConversationStarted(db, 'U1', 'C1');
  assert.equal(db.tables.moderation_rule_hits.length, 0);
  const broken = { from: () => { throw new Error('down'); } };
  await enforcement.checkAccountReports(broken, 'U1');
  await enforcement.checkExpiredRequests(broken, ['H1']);
});

test('the rules are wired where their events happen', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const read = (file) => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
  const chat = read('routes/chatRoutes.js');
  assert.match(chat, /void enforcement\.checkAccountReports\(supabaseAdmin, reportedUserId\)/);
  assert.match(chat, /if \(messageType === 'text'\) void enforcement\.checkMessage\(supabaseAdmin, user\.id, data\.id, content\)/);
  assert.match(chat, /void enforcement\.noteConversationStarted\(supabaseAdmin, user\.id, conversationId\)/);
  assert.match(read('routes/accountGroupRoutes.js'), /void enforcement\.checkLinkedAccounts\(admin, currentUser\.id, additionalUser\.id\)/);
  const server = read('server.js');
  assert.match(server, /void enforcement\.checkListingReports\(supabaseAdmin, data\.listing_id\)/);
  assert.match(server, /enforcement\.checkExpiredRequests\(supabaseAdmin, expired\.map\(\(row\) => row\.host_id\)\)/);
  assert.match(server, /setInterval\(liftEndedSuspensionsNow, 10 \* 60 \* 1000\)/);
  assert.match(read('routes/adminRoutes.js'), /enforcement\.applyAction\(supabaseAdmin, \{/);
});
