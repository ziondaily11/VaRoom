'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { alertMinutes, dueAlerts, alertEmail, sendUnreadChatAlerts, NOTIFICATION_EMAIL_FROM, HOURLY_CAP } = require('../lib/chatEmailAlerts');

const NOW = Date.parse('2026-11-12T12:00:00Z');
const ago = (minutes) => new Date(NOW - minutes * 60_000).toISOString();
const conversation = { id: 'c1', host_id: 'host', client_id: 'guest', listing_id: 'l1' };
const msg = (id, minutesAgo, extra = {}) => ({ id, conversation_id: 'c1', sender_id: 'guest', created_at: ago(minutesAgo), ...extra });
const due = (overrides = {}) => dueAlerts({
  messages: [msg('m1', 30), msg('m2', 20)],
  conversations: [conversation],
  profiles: [{ id: 'host', role: 'host' }, { id: 'guest', role: 'client' }],
  clears: new Map(),
  sent: new Map(),
  now: NOW,
  ...overrides,
});

test('timing: the person\'s choice, else hosts after 15 minutes and clients never', () => {
  assert.equal(alertMinutes({ role: 'host' }), 15);
  assert.equal(alertMinutes({ role: 'client' }), 0);
  assert.equal(alertMinutes({ role: 'host', email_alert_minutes: 0 }), 0);
  assert.equal(alertMinutes({ role: 'client', email_alert_minutes: 60 }), 60);
});

test('one alert per chat, for the oldest unread message, once it is old enough', () => {
  const alerts = due();
  assert.equal(alerts.length, 1);
  assert.equal(alerts[0].userId, 'host');
  assert.equal(alerts[0].message.id, 'm1');
  assert.equal(due({ messages: [msg('m1', 10)] }).length, 0, 'not yet 15 minutes');
  assert.equal(due({ profiles: [{ id: 'host', role: 'host', email_alert_minutes: 60 }] }).length, 0, 'waits for their hour');
  assert.equal(due({ profiles: [{ id: 'host', role: 'host', email_alert_minutes: 0 }] }).length, 0, 'never');
  assert.equal(due({ messages: [msg('m1', 30, { sender_id: 'host' })] }).length, 0, 'the client is not emailed by default');
  assert.equal(due({ messages: [msg('m1', 30, { is_auto_reply: true })] }).length, 0, "Elie's replies don't count");
});

test('no second email for the same unread run; a deleted chat counts only newer messages', () => {
  assert.equal(due({ sent: new Map([['host:c1', Date.parse(ago(25))]]) }).length, 0, 'already emailed since the first unread message');
  assert.equal(due({ sent: new Map([['host:c1', Date.parse(ago(40))]]) }).length, 1, 'an earlier email was for an earlier run');
  const cleared = due({ clears: new Map([['host:c1', Date.parse(ago(25))]]) });
  assert.equal(cleared[0].message.id, 'm2', 'only messages after "Delete chat"');
});

test('the email names who wrote and the listing, links to the chat, and never includes the message', () => {
  const email = alertEmail({ senderName: 'Amina <b>', listingTitle: 'Garden flat', link: 'https://varoom.co.ke/chats?c=c1' });
  assert.equal(email.subject, 'Amina <b> sent you a message on VaRoom');
  assert.match(email.html, /Amina &lt;b&gt; sent you a message about <strong>Garden flat<\/strong>/);
  assert.match(email.html, /href="https:\/\/varoom\.co\.ke\/chats\?c=c1"/);
  assert.equal(NOTIFICATION_EMAIL_FROM, 'VaRoom <notifications@varoom.co.ke>');
});

function fakeAdmin(tables, emails) {
  const writes = [];
  return {
    writes,
    auth: { admin: { getUserById: async (id) => ({ data: { user: emails[id] ? { email: emails[id] } : null } }) } },
    from(table) {
      const query = {
        select() { return query; }, is() { return query; }, gte() { return query; }, lte() { return query; },
        order() { return query; }, limit() { return query; }, in() { return query; },
        upsert(row) { writes.push([table, row]); return Promise.resolve({ error: null }); },
        then(resolve) { resolve({ data: tables[table] || [], error: null }); },
      };
      return query;
    },
  };
}

test('a run emails the host from notifications@, records it, and respects the hourly cap', async () => {
  const tables = {
    messages: [msg('m1', 30, { listing_id: null })],
    conversations: [conversation],
    profiles: [{ id: 'host', role: 'host', full_name: 'Hosty' }, { id: 'guest', role: 'client', full_name: 'Amina' }],
    listings: [{ id: 'l1', title: 'Garden flat' }],
  };
  const sent = [];
  const admin = fakeAdmin(tables, { host: 'host@example.com' });
  const count = await sendUnreadChatAlerts(admin, { now: NOW, baseUrl: 'https://varoom.co.ke/', send: async (email) => { sent.push(email); } });
  assert.equal(count, 1);
  assert.equal(sent[0].from, 'VaRoom <notifications@varoom.co.ke>');
  assert.equal(sent[0].to, 'host@example.com');
  assert.equal(sent[0].subject, 'Amina sent you a message on VaRoom');
  assert.match(sent[0].html, /about <strong>Garden flat<\/strong>/, "the conversation's listing");
  assert.equal(sent[0].idempotencyKey, 'chat-alert:host:m1');
  assert.deepEqual(admin.writes, [['chat_email_alerts', { user_id: 'host', conversation_id: 'c1', last_sent_at: new Date(NOW).toISOString() }]]);

  tables.chat_email_alerts = Array.from({ length: HOURLY_CAP }, (_, i) => ({ user_id: 'host', conversation_id: `other${i}`, last_sent_at: ago(10) }));
  assert.equal(await sendUnreadChatAlerts(fakeAdmin(tables, { host: 'host@example.com' }), { now: NOW, send: async () => {} }), 0, 'at most 5 an hour');
});
