'use strict';

process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'test-service-role-key';
process.env.VA_ROOM_ENCRYPTION_KEY = process.env.VA_ROOM_ENCRYPTION_KEY || require('crypto').randomBytes(32).toString('base64');
process.env.VA_ROOM_ENCRYPTION_ACTIVE_VERSION = process.env.VA_ROOM_ENCRYPTION_ACTIVE_VERSION || '1';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const express = require('express');
const supabaseAdmin = require('../lib/supabaseClient');
const { decryptMessage } = require('../lib/messageEncryptionService');
const { approvalText, hostCanMessage } = require('../lib/bookingChat');
const chatRoutes = require('../routes/chatRoutes');
const bookingRoutes = require('../routes/bookingRoutes');

const HOST = '11111111-1111-4111-8111-111111111111';
const GUEST = '22222222-2222-4222-8222-222222222222';
const OTHER = '33333333-3333-4333-8333-333333333333';
const MEMBER = '44444444-4444-4444-8444-444444444444';
const LISTING = '55555555-5555-4555-8555-555555555555';
const BOOKING = '66666666-6666-4666-8666-666666666666';
const TOKENS = { host: HOST, guest: GUEST, other: OTHER, member: MEMBER };

const hoursAgo = (hours) => new Date(Date.now() - hours * 3600_000).toISOString();

function makeDb({ status = 'pending', createdAt = hoursAgo(1), guest = {}, roles = ['manager', 'messaging'], refuse = null } = {}) {
  return {
    refuse,
    bookings: [{
      id: BOOKING, host_id: HOST, client_id: GUEST, listing_id: LISTING, status, created_at: createdAt,
      start_date: '2026-12-21', end_date: '2026-12-24', hours: null, start_time: null, end_time: null,
      lease_start_date: null, lease_months: null, guest_count: 2,
    }],
    profiles: [{ id: HOST, full_name: 'Host' }, { id: GUEST, full_name: 'Guest', who_can_message: 'no_one', ...guest }],
    host_team_members: [{ host_id: HOST, member_id: MEMBER, roles, status: 'active' }],
    account_controls: [],
    conversations: [],
    messages: [],
  };
}

// Just the query shapes these routes use; or() understands conversationsBetween's pair filter.
function makeQuery(db, table) {
  const rows = db[table] || (db[table] = []);
  const filters = [];
  let op = 'select';
  let values = null;
  let order = null;
  let limit = null;
  const query = {
    select() { return query; },
    eq(column, value) { filters.push((row) => row[column] === value); return query; },
    in(column, list) { filters.push((row) => list.includes(row[column])); return query; },
    or(expression) {
      const pairs = [...expression.matchAll(/host_id\.eq\.([\w-]+),client_id\.eq\.([\w-]+)/g)].map((m) => [m[1], m[2]]);
      filters.push((row) => pairs.some(([hostId, clientId]) => row.host_id === hostId && row.client_id === clientId));
      return query;
    },
    order(column, { ascending = true } = {}) { order = { column, ascending }; return query; },
    limit(count) { limit = count; return query; },
    update(next) { op = 'update'; values = next; return query; },
    insert(record) { op = 'insert'; values = record; return query; },
    upsert(record) { op = 'insert'; values = record; return query; },
    result() {
      if (op === 'insert') {
        const row = { id: crypto.randomUUID(), created_at: new Date().toISOString(), ...values };
        rows.push(row);
        return { data: [row], error: null };
      }
      let matched = rows.filter((row) => filters.every((filter) => filter(row)));
      if (op === 'update') {
        if (table === 'bookings' && db.refuse && matched.length) return { data: null, error: { message: db.refuse } };
        matched.forEach((row) => Object.assign(row, values));
      }
      if (order) matched = [...matched].sort((a, b) => (a[order.column] < b[order.column] ? -1 : 1) * (order.ascending ? 1 : -1));
      if (limit !== null) matched = matched.slice(0, limit);
      return { data: matched.map((row) => ({ ...row })), error: null };
    },
    async maybeSingle() { const { data, error } = query.result(); return { data: data && data[0] ? data[0] : null, error }; },
    async single() { return query.maybeSingle(); },
    then(resolve, reject) { return Promise.resolve(query.result()).then(resolve, reject); },
  };
  return query;
}

async function withServer(db, run) {
  const saved = { from: supabaseAdmin.from, getUser: supabaseAdmin.auth.getUser };
  supabaseAdmin.from = (table) => makeQuery(db, table);
  supabaseAdmin.auth.getUser = async (token) => (TOKENS[token]
    ? { data: { user: { id: TOKENS[token] } }, error: null }
    : { data: { user: null }, error: { message: 'invalid' } });
  const app = express();
  app.use(express.json());
  app.use('/api', chatRoutes);
  app.use('/api', bookingRoutes);
  const server = app.listen(0);
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const call = async (path, token, body, actingFor) => {
    const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
    if (actingFor) headers['X-VaRoom-Host'] = actingFor;
    const response = await fetch(`${base}${path}`, { method: 'POST', headers, body: JSON.stringify(body) });
    return { status: response.status, body: await response.json().catch(() => null) };
  };
  try {
    await run(call);
  } finally {
    server.close();
    supabaseAdmin.from = saved.from;
    supabaseAdmin.auth.getUser = saved.getUser;
  }
}

const startFromBooking = (call, token, actingFor) => call('/chat/conversations/start', token, { bookingId: BOOKING }, actingFor);
const respond = (call, token, decision, actingFor) => call(`/bookings/${BOOKING}/respond`, token, { decision }, actingFor);
const plain = (row) => decryptMessage(row.ciphertext, row.iv, row.key_version);

test('which bookings a host may message the guest of: open requests, approved and completed', () => {
  const now = Date.now();
  assert.equal(hostCanMessage({ status: 'pending', created_at: hoursAgo(47) }, now), true);
  assert.equal(hostCanMessage({ status: 'pending', created_at: hoursAgo(49) }, now), false, 'expired after 48 hours');
  assert.equal(hostCanMessage({ status: 'approved' }), true);
  assert.equal(hostCanMessage({ status: 'completed' }), true);
  for (const status of ['declined', 'cancelled', 'expired']) assert.equal(hostCanMessage({ status }), false, status);
});

test('the approval message gives the dates as the guest\'s card does', () => {
  assert.equal(approvalText({ start_date: '2026-12-21', end_date: '2026-12-24', guest_count: 2 }),
    'Your booking request (21 Dec 2026 → 24 Dec 2026 · 2 guests) is approved. Message me here if you have any questions.');
  assert.equal(approvalText({ hours: 3, start_date: '2026-12-01', start_time: '10:00:00', end_time: '13:00:00' }),
    'Your booking request (1 Dec 2026 · 10:00–13:00) is approved. Message me here if you have any questions.');
  assert.equal(approvalText({ lease_start_date: '2027-01-01', lease_months: 6 }),
    'Your booking request (from 1 Jan 2027 · 6 months) is approved. Message me here if you have any questions.');
  assert.equal(approvalText({}), 'Your booking request is approved. Message me here if you have any questions.');
});

test('a host starts the chat from a booking, even with a guest who takes no new messages; reuses it after', async () => {
  const db = makeDb();
  await withServer(db, async (call) => {
    const first = await startFromBooking(call, 'host');
    assert.equal(first.status, 201);
    assert.equal(first.body.created, true);
    assert.deepEqual(db.conversations.map((c) => [c.listing_id, c.host_id, c.client_id]), [[LISTING, HOST, GUEST]]);
    const again = await startFromBooking(call, 'host');
    assert.deepEqual(again.body, { conversationId: first.body.conversationId, created: false });
    assert.equal(db.conversations.length, 1);
    assert.equal((await startFromBooking(call, 'other')).status, 404, 'someone else\'s booking');
    assert.equal((await startFromBooking(call, 'guest')).status, 404, 'the guest uses Message host');
    assert.equal((await call('/chat/conversations/start', 'host', { bookingId: BOOKING, listingId: LISTING })).status, 400, 'one or the other');
  });
});

test('no chat from a closed booking or with a deactivated guest', async () => {
  for (const options of [{ status: 'declined' }, { status: 'cancelled' }, { createdAt: hoursAgo(49) }]) {
    await withServer(makeDb(options), async (call) => assert.equal((await startFromBooking(call, 'host')).status, 404, JSON.stringify(options)));
  }
  await withServer(makeDb({ status: 'approved', guest: { deactivated_at: hoursAgo(1) } }), async (call) => {
    const refused = await startFromBooking(call, 'host');
    assert.equal(refused.status, 403);
    assert.equal(refused.body.code, 'account_deactivated');
  });
});

test('a team member messages as the company only with the Messaging role', async () => {
  await withServer(makeDb(), async (call) => assert.equal((await startFromBooking(call, 'member', HOST)).status, 201));
  // Without it, chat requests act as the person themselves: not their booking.
  await withServer(makeDb({ roles: ['manager'] }), async (call) => assert.equal((await startFromBooking(call, 'member', HOST)).status, 404));
});

test('approving posts one encrypted message from the host with the listing card; declining posts none', async () => {
  const db = makeDb();
  await withServer(db, async (call) => {
    const approved = await respond(call, 'host', 'approve');
    assert.deepEqual([approved.status, approved.body], [200, { status: 'approved' }]);
    assert.equal(db.bookings[0].status, 'approved');
    assert.ok(db.bookings[0].responded_at);
    assert.equal(db.messages.length, 1);
    const [message] = db.messages;
    assert.equal(message.sender_id, HOST);
    assert.equal(message.sent_by, null);
    assert.equal(message.listing_id, LISTING);
    assert.equal(message.message_type, 'text');
    assert.equal(message.body, undefined, 'no plaintext column');
    assert.match(plain(message), /^Your booking request \(21 Dec 2026 → 24 Dec 2026 · 2 guests\) is approved\./);
    assert.equal(message.conversation_id, db.conversations[0].id);
    const twice = await respond(call, 'host', 'approve');
    assert.deepEqual([twice.status, twice.body.error], [409, 'This booking request has already been processed.']);
    assert.equal(db.messages.length, 1, 'once only');
  });
  const declined = makeDb();
  await withServer(declined, async (call) => {
    assert.deepEqual((await respond(call, 'host', 'decline')).body, { status: 'declined' });
    assert.equal(declined.messages.length, 0);
    assert.equal(declined.conversations.length, 0);
  });
});

test('approval reuses the existing chat, and keeps the approval when the guest is deactivated', async () => {
  const db = makeDb();
  db.conversations.push({ id: 'c-old', host_id: HOST, client_id: GUEST, listing_id: 'another', created_at: hoursAgo(5) });
  await withServer(db, async (call) => {
    assert.equal((await respond(call, 'host', 'approve')).status, 200);
    assert.deepEqual(db.messages.map((m) => m.conversation_id), ['c-old']);
  });
  const gone = makeDb({ guest: { deactivated_at: hoursAgo(1) } });
  await withServer(gone, async (call) => {
    assert.equal((await respond(call, 'host', 'approve')).status, 200);
    assert.equal(gone.bookings[0].status, 'approved');
    assert.equal(gone.messages.length, 0);
  });
});

test('only the host or the company\'s Managers answer; suspended people cannot; booking rules pass through', async () => {
  await withServer(makeDb(), async (call) => {
    assert.equal((await respond(call, 'other', 'approve')).status, 409, 'not their request');
    assert.equal((await respond(call, 'guest', 'approve')).status, 409);
    assert.equal((await respond(call, 'host', 'maybe')).status, 400);
    assert.equal((await respond(call, 'nobody', 'approve')).status, 401);
  });
  const company = makeDb({ roles: ['manager'] });
  await withServer(company, async (call) => {
    assert.deepEqual((await respond(call, 'member', 'approve', HOST)).body, { status: 'approved' });
    assert.equal(company.messages[0].sender_id, HOST, 'as the company');
    assert.equal(company.messages[0].sent_by, MEMBER, 'written by the member');
  });
  await withServer(makeDb({ roles: ['messaging'] }), async (call) => assert.equal((await respond(call, 'member', 'approve', HOST)).status, 403));
  const suspended = makeDb();
  suspended.account_controls.push({ user_id: MEMBER, status: 'suspended' });
  await withServer(suspended, async (call) => {
    const refused = await respond(call, 'member', 'approve', HOST);
    assert.deepEqual([refused.status, refused.body.code], [403, 'ACCOUNT_SUSPENDED']);
    assert.equal(suspended.bookings[0].status, 'pending');
  });
  const expired = makeDb({ refuse: 'booking_rule: This request expired after 48 hours. The guest can send a new one.' });
  await withServer(expired, async (call) => {
    const refused = await respond(call, 'host', 'approve');
    assert.deepEqual([refused.status, refused.body.error], [409, 'booking_rule: This request expired after 48 hours. The guest can send a new one.']);
    assert.equal(expired.messages.length, 0);
  });
});
