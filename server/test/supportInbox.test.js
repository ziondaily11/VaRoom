'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const express = require('express');
const inbox = require('../lib/supportInbox');
const createSupportInboundRoutes = require('../routes/supportInboundRoutes');
const { fakeSupabase } = require('./helpers/fakeSupabase');

const SECRET = `whsec_${Buffer.from('a-test-signing-secret-32-bytes!!').toString('base64')}`;
const UNIQUE = { support_tickets: ['inbound_email_id'], support_ticket_replies: ['idempotency_key', 'inbound_email_id'] };

function sign(body, { id = 'msg_1', timestamp = Math.floor(Date.now() / 1000), secret = SECRET } = {}) {
  const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
  const signature = crypto.createHmac('sha256', key).update(`${id}.${timestamp}.${body}`).digest('base64');
  return { 'svix-id': id, 'svix-timestamp': String(timestamp), 'svix-signature': `v1,${signature}` };
}

function received(emailId, { from = 'Jane Doe <jane@example.com>', subject = 'Help please', text = 'My booking is stuck.', headers = {}, authentication = { dmarc: 'pass' } } = {}) {
  return { event: { type: 'email.received', data: { email_id: emailId, to: ['support@varoom.co.ke'] } }, email: { id: emailId, from, subject, text, headers: { from, ...headers }, authentication, message_id: `<${emailId}@mail.example.com>`, to: ['support@varoom.co.ke'] } };
}

function setup(seed = {}, rpc = {}) {
  const db = fakeSupabase({ support_tickets: [], support_ticket_replies: [], ...seed }, { unique: UNIQUE, rpc });
  const sent = [];
  const emails = {};
  const send = async (message) => { sent.push(message); return { id: `resend-${sent.length}` }; };
  const deliver = async (item) => { emails[item.event.data.email_id] = item.email; return inbox.handleReceived(db, item.event, { fetchEmail: async (id) => emails[id], send }); };
  return { db, sent, deliver };
}

test('webhook signatures: the Svix scheme, current timestamps only', () => {
  const body = '{"type":"email.received"}';
  assert.equal(inbox.verifyWebhook(body, sign(body), SECRET), true);
  assert.equal(inbox.verifyWebhook(`${body} `, sign(body), SECRET), false, 'a changed body fails');
  assert.equal(inbox.verifyWebhook(body, sign(body, { secret: `whsec_${Buffer.from('another-secret').toString('base64')}` }), SECRET), false);
  assert.equal(inbox.verifyWebhook(body, sign(body, { timestamp: Math.floor(Date.now() / 1000) - 600 }), SECRET), false, 'replays are refused');
  assert.equal(inbox.verifyWebhook(body, {}, SECRET), false);
});

test('a new email opens a ticket and is acknowledged once, threaded to it', async () => {
  const { db, sent, deliver } = setup({}, { varoom_user_id_by_email: () => null });
  const result = await deliver(received('e1'));
  assert.equal(result.reply, false);
  const ticket = db.tables.support_tickets[0];
  assert.deepEqual([ticket.source, ticket.category, ticket.email, ticket.name, ticket.message_id], ['email', 'booking', 'jane@example.com', 'Jane Doe', '<e1@mail.example.com>']);
  assert.equal(sent.length, 1);
  assert.match(sent[0].subject, /^We received your message \[#[0-9A-F]{8}\]$/);
  assert.equal(sent[0].headers['In-Reply-To'], '<e1@mail.example.com>');
  assert.equal(sent[0].headers['Auto-Submitted'], 'auto-replied');
  const ack = db.tables.support_ticket_replies[0];
  assert.deepEqual([ack.automatic, ack.direction, ack.delivery_status], [true, 'outbound', 'sent']);

  assert.deepEqual(await deliver(received('e1')), { skipped: 'already recorded' }, 'a retried webhook adds nothing');
  await deliver(received('e2', { subject: 'Another question' }));
  assert.equal(db.tables.support_tickets.length, 2);
  assert.equal(sent.length, 1, 'one acknowledgement per address per hour');
});

test('replies join their ticket by headers or [#REF] from the same address, and reopen it', async () => {
  const { db, deliver } = setup({}, { varoom_user_id_by_email: () => null });
  await deliver(received('e1'));
  const ticket = db.tables.support_tickets[0];
  ticket.status = 'resolved';
  const ackId = db.tables.support_ticket_replies[0].message_id;

  const byHeader = await deliver(received('e2', { subject: 'Re: We received your message', text: 'Thanks!\n\nOn Mon, VaRoom wrote:\n> old text', headers: { 'In-Reply-To': ackId } }));
  assert.deepEqual(byHeader, { ticketId: ticket.id, reply: true });
  const inbound = db.tables.support_ticket_replies.find((r) => r.direction === 'inbound');
  assert.equal(inbound.message, 'Thanks!', 'the quoted history is left out');
  assert.equal(ticket.status, 'open');

  const ref = inbox.ticketRef(ticket.id).slice(1);
  assert.equal((await deliver(received('e3', { subject: `Re: Help [#${ref}]` }))).reply, true);
  const stranger = await deliver(received('e4', { from: 'mallory@example.com', subject: `Re: Help [#${ref}]` }));
  assert.equal(stranger.reply, false, 'another address cannot post into the ticket by its number');
});

test('a restricted account is answered as an appeal, only when the email is authenticated', async () => {
  const until = new Date(Date.now() + 3 * 86400000).toISOString();
  const seed = { account_controls: [{ user_id: 'U1', status: 'suspended', reason: 'Spam messages', suspended_until: until }] };
  const { db, sent, deliver } = setup(seed, { varoom_user_id_by_email: ({ p_email }) => (p_email === 'jane@example.com' ? 'U1' : null) });
  await deliver(received('e1', { subject: 'Why was I blocked?' }));
  const ticket = db.tables.support_tickets[0];
  assert.deepEqual([ticket.user_id, ticket.category, ticket.priority], ['U1', 'appeal', 'high']);
  assert.match(sent[0].html, /suspended until/);
  assert.match(sent[0].html, /Reason: Spam messages/);
  assert.match(sent[0].html, /filed your message as an appeal/);

  const forged = setup(seed, { varoom_user_id_by_email: () => 'U1' });
  await forged.deliver(received('e9', { authentication: { dmarc: 'fail', spf: 'fail', dkim: 'fail' } }));
  assert.equal(forged.db.tables.support_tickets[0].user_id, null);
  assert.doesNotMatch(forged.sent[0].html, /Spam messages/, 'a forged sender learns nothing about the account');
});

test('auto-replies, bounces and VaRoom’s own mail never open tickets', async () => {
  const { db, sent, deliver } = setup({}, { varoom_user_id_by_email: () => null });
  assert.equal((await deliver(received('e1', { headers: { 'Auto-Submitted': 'auto-replied' } }))).skipped, 'automatic message');
  assert.equal((await deliver(received('e2', { from: 'MAILER-DAEMON@example.com' }))).skipped, 'automatic message');
  assert.equal((await deliver(received('e3', { from: 'VaRoom <support@varoom.co.ke>' }))).skipped, 'own address');
  assert.equal(db.tables.support_tickets.length, 0);
  assert.equal(sent.length, 0);
});

test('tickets answered with no word back for 7 days close; ones waiting on Support stay open', async () => {
  const old = new Date(Date.now() - 8 * 86400000).toISOString();
  const db = fakeSupabase({
    support_tickets: [{ id: 'T1', status: 'in_progress', updated_at: old }, { id: 'T2', status: 'open', updated_at: old }, { id: 'T3', status: 'open', updated_at: old }],
    support_ticket_replies: [
      { ticket_id: 'T1', direction: 'outbound', automatic: false, sent_at: old },
      { ticket_id: 'T2', direction: 'inbound', automatic: false, sent_at: old },
      { ticket_id: 'T3', direction: 'outbound', automatic: true, sent_at: old },
    ],
  });
  assert.equal(await inbox.closeStaleTickets(db), 1);
  assert.deepEqual(db.tables.support_tickets.map((t) => t.status), ['closed', 'open', 'open']);
  assert.equal(db.tables.admin_activity[0].action, 'support_ticket_auto_closed');
});

test('the webhook route: unsigned or unconfigured requests are refused; signed events are recorded', async () => {
  const db = fakeSupabase({ support_tickets: [], support_ticket_replies: [] }, { unique: UNIQUE, rpc: { varoom_user_id_by_email: () => null } });
  const item = received('e1');
  const app = express();
  app.use('/hook', express.raw({ type: () => true }), createSupportInboundRoutes(db, { secret: SECRET, fetchEmail: async () => item.email, send: async () => ({ id: 'r1' }) }));
  app.use('/off', express.raw({ type: () => true }), createSupportInboundRoutes(db, { secret: '' }));
  const server = app.listen(0);
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const body = JSON.stringify(item.event);
    const post = (path, headers) => fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body });
    assert.equal((await post('/off', sign(body))).status, 503);
    assert.equal((await post('/hook', { 'svix-id': 'x', 'svix-timestamp': '1', 'svix-signature': 'v1,bad' })).status, 401);
    const ok = await post('/hook', sign(body));
    assert.equal(ok.status, 200);
    assert.equal((await ok.json()).reply, false);
    assert.equal(db.tables.support_tickets.length, 1);
  } finally {
    server.close();
  }
});

test('categories and wiring', () => {
  assert.equal(inbox.categorize('My account was suspended, I want to appeal'), 'appeal');
  assert.equal(inbox.categorize("I can't log in, the code never arrives"), 'sign_in');
  assert.equal(inbox.categorize('I was charged twice for my plan'), 'billing');
  assert.equal(inbox.categorize('Hello there'), 'other');
  const fs = require('node:fs');
  const server = fs.readFileSync(require.resolve('../server.js'), 'utf8');
  assert.match(server, /app\.use\('\/api\/support\/inbound-email', express\.raw\(\{ type: \(\) => true, limit: '1mb' \}\), createSupportInboundRoutes\(supabaseAdmin\)\);\r?\n\r?\napp\.use\(express\.json/);
  assert.match(server, /supportInbox\.acknowledge\(supabaseAdmin, data, \{ restriction: triaged\.restriction \}\)/);
  assert.match(server, /setInterval\(closeStaleTicketsNow, 60 \* 60 \* 1000\)/);
});
