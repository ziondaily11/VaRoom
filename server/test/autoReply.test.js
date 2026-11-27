'use strict';

process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'test-service-role-key';
process.env.VA_ROOM_ENCRYPTION_KEY = require('crypto').randomBytes(32).toString('base64');
process.env.VA_ROOM_ENCRYPTION_ACTIVE_VERSION = '1';
process.env.CHATBOT_API_URL = 'https://chatbot.test';
process.env.CHATBOT_INTERNAL_API_KEY = 'test-internal-key';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const express = require('express');
const supabaseAdmin = require('../lib/supabaseClient');
const { encryptMessage, decryptMessage } = require('../lib/messageEncryptionService');
const autoReply = require('../lib/autoReply');
const chatRoutes = require('../routes/chatRoutes');

const HOST = '11111111-1111-4111-8111-111111111111';
const GUEST = '22222222-2222-4222-8222-222222222222';
const OTHER_HOST = '33333333-3333-4333-8333-333333333333';
const CONVERSATION = '44444444-4444-4444-8444-444444444444';
const LISTING = '55555555-5555-4555-8555-555555555555';
const OWN_ALTERNATIVE = '66666666-6666-4666-8666-666666666666';
const FOREIGN_LISTING = '77777777-7777-4777-8777-777777777777';

// --- In-memory Supabase ------------------------------------------------------

// `elie`: the host's plan includes Elie ('included'), doesn't ('plan'), or
// this month's Elie actions are used up ('limit').
function makeDb({ awayMode = true, hostStatus = 'active', failProfiles = false, elie = 'included' } = {}) {
  return {
    elie,
    elieActions: [],
    conversations: [{ id: CONVERSATION, host_id: HOST, client_id: GUEST, listing_id: LISTING, created_at: '2026-11-01T00:00:00.000Z' }],
    profiles: [
      { id: HOST, full_name: 'Host Person', away_mode: awayMode },
      { id: GUEST, full_name: 'Guest Person', away_mode: false },
    ],
    account_controls: hostStatus === 'active' ? [] : [{ user_id: HOST, status: hostStatus }],
    listings: [
      { id: LISTING, host_id: HOST, title: 'Garden flat', location_text: 'Kilimani', category: 'airbnb' },
      { id: OWN_ALTERNATIVE, host_id: HOST, title: 'Studio', location_text: 'Westlands', category: 'airbnb' },
      { id: FOREIGN_LISTING, host_id: OTHER_HOST, title: 'Not theirs', location_text: 'Karen', category: 'airbnb' },
    ],
    messages: [],
    notifications: [],
    message_user_deletions: [],
    message_attachments: [],
    failProfiles,
  };
}

// Inserted rows get increasing timestamps starting now (the cooldown compares with Date.now()).
let clock = Date.now();
function nextTimestamp() {
  clock += 1000;
  return new Date(clock).toISOString();
}

function makeQuery(db, table) {
  const filters = [];
  let operation = 'select';
  let values = null;
  let ordering = null;
  let limitCount = null;
  const rows = db[table] || (db[table] = []);
  const query = {
    select() { return this; },
    eq(column, value) { filters.push((row) => row[column] === value); return this; },
    neq(column, value) { filters.push((row) => row[column] !== value); return this; },
    is(column, value) { filters.push((row) => (row[column] === undefined ? null : row[column]) === value); return this; },
    in(column, list) { filters.push((row) => list.includes(row[column])); return this; },
    gte(column, value) { filters.push((row) => row[column] >= value); return this; },
    gt(column, value) { filters.push((row) => row[column] > value); return this; },
    lt(column, value) { filters.push((row) => row[column] < value); return this; },
    or() { return this; },
    order(column, { ascending = true } = {}) { ordering = { column, ascending }; return this; },
    limit(count) { limitCount = count; return this; },
    range() { return this; },
    insert(record) { operation = 'insert'; values = record; return this; },
    update(next) { operation = 'update'; values = next; return this; },
    upsert(record) { operation = 'insert'; values = record; return this; },
    result() {
      if (table === 'profiles' && db.failProfiles) return { data: null, error: { message: 'profiles unavailable' } };
      if (operation === 'insert') {
        const row = { id: crypto.randomUUID(), created_at: nextTimestamp(), ...values };
        if (table === 'messages' && row.sender_id === HOST && db.account_controls.some((c) => c.user_id === HOST && c.status !== 'active')) {
          return { data: null, error: { message: 'suspended', code: 'P0001' } };
        }
        rows.push(row);
        return { data: [structuredClone(row)], error: null };
      }
      let matched = rows.filter((row) => filters.every((filter) => filter(row)));
      if (operation === 'update') {
        matched.forEach((row) => Object.assign(row, values));
        return { data: matched, error: null };
      }
      if (ordering) {
        const { column, ascending } = ordering;
        matched = [...matched].sort((a, b) => (a[column] < b[column] ? -1 : a[column] > b[column] ? 1 : 0) * (ascending ? 1 : -1));
      }
      if (limitCount !== null) matched = matched.slice(0, limitCount);
      return { data: matched.map((row) => structuredClone(row)), error: null };
    },
    async maybeSingle() {
      const { data, error } = this.result();
      return { data: data && data[0] ? data[0] : null, error };
    },
    async single() { return this.maybeSingle(); },
    then(resolve, reject) { return Promise.resolve(this.result()).then(resolve, reject); },
  };
  return query;
}

// The Elie action functions (migration 20261125_000081).
function elieRpc(db) {
  return async (name, params) => {
    if (name === 'elie_use_host_action') {
      if (db.elie !== 'included') {
        return { data: { allowed: false, reason: db.elie, used: db.elie === 'limit' ? params.p_limit : 0, limit: params.p_limit }, error: null };
      }
      const id = db.elieActions.length + 1;
      db.elieActions.push({ id, host_id: params.p_host_id, kind: params.p_kind });
      return { data: { allowed: true, action_id: id, used: db.elieActions.length, limit: params.p_limit }, error: null };
    }
    if (name === 'elie_release_host_action') {
      db.elieActions = db.elieActions.filter((action) => action.id !== params.p_action_id);
      return { data: null, error: null };
    }
    return { data: null, error: { message: `unexpected rpc ${name}` } };
  };
}

// --- Chatbot stub -------------------------------------------------------------

function makeChatbot(handler) {
  const calls = [];
  const realFetch = global.fetch;
  global.fetch = async (url, options) => {
    if (String(url).startsWith(process.env.CHATBOT_API_URL)) {
      const body = JSON.parse(options.body);
      calls.push({ url: String(url), headers: options.headers, body });
      return handler(body, calls.length);
    }
    return realFetch(url, options);
  };
  return { calls, restore() { global.fetch = realFetch; } };
}

function jsonResponse(status, body) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

async function withServer(db, chatbotHandler, run) {
  const saved = { from: supabaseAdmin.from, rpc: supabaseAdmin.rpc, getUser: supabaseAdmin.auth.getUser };
  supabaseAdmin.from = (table) => makeQuery(db, table);
  supabaseAdmin.rpc = elieRpc(db);
  supabaseAdmin.auth.getUser = async (token) => {
    const id = token === 'host-token' ? HOST : token === 'guest-token' ? GUEST : token === 'other-token' ? OTHER_HOST : null;
    return id ? { data: { user: { id } }, error: null } : { data: { user: null }, error: { message: 'invalid' } };
  };
  const chatbot = makeChatbot(chatbotHandler);
  const app = express();
  app.use(express.json());
  app.use('/api', chatRoutes);
  const server = app.listen(0);
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const call = async (path, token, body) => {
    const response = await fetch(`${base}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
    return { status: response.status, body: await response.json().catch(() => null) };
  };
  try {
    await run({ call, chatbot, db });
  } finally {
    for (const state of autoReply._awayState.values()) if (state.timer) clearTimeout(state.timer);
    autoReply._awayState.clear();
    chatbot.restore();
    server.close();
    supabaseAdmin.from = saved.from;
    supabaseAdmin.rpc = saved.rpc;
    supabaseAdmin.auth.getUser = saved.getUser;
  }
}

async function waitForIdle() {
  for (let i = 0; i < 400; i += 1) {
    const busy = [...autoReply._awayState.values()].some((state) => state.running);
    if (!busy) return;
    await new Promise((resolve) => setImmediate(resolve));
  }
  throw new Error('auto-reply did not finish');
}

function seedMessage(db, { sender, text, minutesAgo, autoReplyFlag = false }) {
  db.messages.push({
    id: crypto.randomUUID(),
    conversation_id: CONVERSATION,
    sender_id: sender,
    ...encryptMessage(text),
    message_type: 'text',
    is_auto_reply: autoReplyFlag,
    deleted_at: null,
    created_at: new Date(Date.now() - minutesAgo * 60_000).toISOString(),
  });
}

const autoReplies = (db) => db.messages.filter((row) => row.is_auto_reply && row.message_type === 'text' && row.sender_id === HOST);
const plain = (row) => decryptMessage(row.ciphertext, row.iv, row.key_version);
// The host's away message goes first; Elie's answers are the other auto-replies.
const hostAwayText = (db) => autoReply.awayMessageText(db.profiles.find((p) => p.id === HOST).away_message);
const awayMessages = (db) => autoReplies(db).filter((row) => plain(row) === hostAwayText(db));
const elieReplies = (db) => autoReplies(db).filter((row) => plain(row) !== hostAwayText(db));
const sendAsGuest = (call, content) => call(`/chat/conversations/${CONVERSATION}/messages`, 'guest-token', { content });

// --- Away mode ----------------------------------------------------------------

test('away mode saves an encrypted reply as the host and notifies the guest', async () => {
  const db = makeDb();
  await withServer(db, () => jsonResponse(200, { reply: 'Yes, it is free this weekend.', alternative_listing_ids: [] }), async ({ call, chatbot }) => {
    const sent = await sendAsGuest(call, 'Is it available this weekend?');
    assert.equal(sent.status, 201);
    await waitForIdle();

    assert.equal(chatbot.calls.length, 1);
    const request = chatbot.calls[0];
    assert.equal(request.url, 'https://chatbot.test/internal/reply/generate');
    assert.equal(request.headers['X-Elie-Internal-Key'], 'test-internal-key');
    assert.equal(request.body.trigger, 'away');
    assert.equal(request.body.host_id, HOST);
    assert.equal(request.body.listing_id, LISTING);
    assert.equal(request.body.guest_message, 'Is it available this weekend?');
    assert.deepEqual(request.body.history, [{ speaker: 'guest', text: 'Is it available this weekend?' }]);

    const [away, reply] = autoReplies(db);
    assert.equal(plain(away), autoReply.DEFAULT_AWAY_MESSAGE, 'the away message goes first');
    assert.ok(reply, 'reply saved');
    assert.equal(reply.body, undefined, 'no plaintext column');
    assert.equal(decryptMessage(reply.ciphertext, reply.iv, reply.key_version), 'Yes, it is free this weekend.');

    const guestNotifications = db.notifications.filter((n) => n.recipient_user_id === GUEST);
    assert.deepEqual(guestNotifications.map((n) => n.event_key), [`message:${CONVERSATION}:${away.id}`, `message:${CONVERSATION}:${reply.id}`], 'guest notified of both');
    assert.ok(guestNotifications.every((n) => n.metadata.auto_reply === true));
  });
});

test('the guest message is accepted when the chatbot fails or times out', async () => {
  const db = makeDb();
  await withServer(db, () => { throw new TypeError('fetch failed'); }, async ({ call, chatbot }) => {
    const sent = await sendAsGuest(call, 'Hello?');
    assert.equal(sent.status, 201);
    await waitForIdle();
    assert.equal(chatbot.calls.length, 1);
    assert.equal(elieReplies(db).length, 0);
    assert.equal(awayMessages(db).length, 1, 'the away message does not depend on Elie');
  });
  await withServer(makeDb(), () => jsonResponse(503, { detail: 'Gemini down' }), async ({ call, db: freshDb }) => {
    const sent = await sendAsGuest(call, 'Hello again?');
    assert.equal(sent.status, 201);
    await waitForIdle();
    assert.equal(elieReplies(freshDb).length, 0);
    assert.equal(awayMessages(freshDb).length, 1);
  });
});

test('a failing lookup after the insert no longer turns a saved message into an error', async () => {
  const db = makeDb({ failProfiles: true });
  await withServer(db, () => jsonResponse(200, { reply: 'unused' }), async ({ call, chatbot }) => {
    const sent = await sendAsGuest(call, 'Hi there');
    assert.equal(sent.status, 201);
    assert.equal(sent.body.message.body, 'Hi there');
    await waitForIdle();
    assert.equal(chatbot.calls.length, 0, 'no reply without the host profile');
    assert.equal(db.messages.length, 1);
  });
});

test('no reply when the host is not away, is suspended, or replies are switched off', async () => {
  await withServer(makeDb({ awayMode: false }), () => jsonResponse(200, { reply: 'x' }), async ({ call, chatbot }) => {
    assert.equal((await sendAsGuest(call, 'Hi')).status, 201);
    await waitForIdle();
    assert.equal(chatbot.calls.length, 0);
  });
  await withServer(makeDb({ hostStatus: 'suspended' }), () => jsonResponse(200, { reply: 'x' }), async ({ call, chatbot }) => {
    assert.equal((await sendAsGuest(call, 'Hi')).status, 201);
    await waitForIdle();
    assert.equal(chatbot.calls.length, 0);
  });
  process.env.ELIE_AUTO_REPLY_ENABLED = 'false';
  try {
    await withServer(makeDb(), () => jsonResponse(200, { reply: 'x' }), async ({ call, chatbot, db }) => {
      assert.equal((await sendAsGuest(call, 'Hi')).status, 201);
      await waitForIdle();
      assert.equal(chatbot.calls.length, 0);
      assert.equal(awayMessages(db).length, 1, "with Elie switched off the host's away message still goes");
      assert.equal(elieReplies(db).length, 0);
    });
  } finally {
    delete process.env.ELIE_AUTO_REPLY_ENABLED;
  }
});

test('a burst gets one reply now and one after the cooldown covering the rest', async (t) => {
  const db = makeDb();
  let release;
  const firstCall = new Promise((resolve) => { release = resolve; });
  await withServer(db, async (body, count) => {
    if (count === 1) await firstCall;
    return jsonResponse(200, { reply: `Reply ${count}`, alternative_listing_ids: [] });
  }, async ({ call, chatbot }) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    assert.equal((await sendAsGuest(call, 'First question')).status, 201);
    assert.equal((await sendAsGuest(call, 'Second question')).status, 201);
    assert.equal((await sendAsGuest(call, 'Third question')).status, 201);
    release();
    await waitForIdle();

    assert.equal(chatbot.calls.length, 1, 'the burst did not trigger three replies');
    assert.equal(elieReplies(db).length, 1);
    assert.equal(awayMessages(db).length, 1);
    const state = autoReply._awayState.get(CONVERSATION);
    assert.ok(state && state.timer, 'a follow-up is scheduled for the end of the cooldown');

    // Let the cooldown pass: back-date the first reply, then fire the timer.
    autoReplies(db).forEach((row) => { row.created_at = new Date(Date.now() - autoReply.COOLDOWN_MS - 1000).toISOString(); });
    t.mock.timers.tick(autoReply.COOLDOWN_MS + 10 * 60_000);
    await waitForIdle();

    assert.equal(chatbot.calls.length, 2);
    assert.equal(chatbot.calls[1].body.guest_message, 'Second question\nThird question');
    assert.equal(elieReplies(db).length, 2);
    assert.equal(awayMessages(db).length, 1, 'the away message is sent once per away spell');
  });
});

test('the hourly cap stops further replies', async () => {
  const db = makeDb();
  for (let i = 0; i < autoReply.HOURLY_CAP; i += 1) {
    seedMessage(db, { sender: GUEST, text: `Question ${i}`, minutesAgo: 50 - i * 4 });
    seedMessage(db, { sender: HOST, text: `Answer ${i}`, minutesAgo: 49 - i * 4, autoReplyFlag: true });
  }
  await withServer(db, () => jsonResponse(200, { reply: 'x' }), async ({ call, chatbot }) => {
    assert.equal((await sendAsGuest(call, 'One more?')).status, 201);
    await waitForIdle();
    assert.equal(chatbot.calls.length, 0);
  });
});

test('suggested listings are shared only when they belong to the host', async () => {
  const db = makeDb();
  await withServer(db, () => jsonResponse(200, {
    reply: 'Here are cheaper options.',
    alternative_listing_ids: [OWN_ALTERNATIVE, FOREIGN_LISTING],
  }), async ({ call }) => {
    assert.equal((await sendAsGuest(call, 'Any cheaper options?')).status, 201);
    await waitForIdle();
    const shared = db.messages.filter((row) => row.message_type === 'listing');
    assert.equal(shared.length, 1);
    assert.equal(shared[0].listing_id, OWN_ALTERNATIVE);
    assert.equal(shared[0].is_auto_reply, true);
    assert.equal(decryptMessage(shared[0].ciphertext, shared[0].iv, shared[0].key_version), 'Shared listing: Studio');
  });
});

// --- @reply -------------------------------------------------------------------

const commandReply = (call, token) => call(`/chat/conversations/${CONVERSATION}/reply`, token, { command: '@reply' });

test('@reply answers the guest and returns the messages the chat page appends', async () => {
  const db = makeDb({ awayMode: false });
  seedMessage(db, { sender: GUEST, text: 'Do you allow pets?', minutesAgo: 5 });
  await withServer(db, () => jsonResponse(200, { reply: 'Small pets are welcome.', alternative_listing_ids: [] }), async ({ call, chatbot }) => {
    const result = await commandReply(call, 'host-token');
    assert.equal(result.status, 200);
    assert.equal(result.body.skipped, false);
    assert.equal(result.body.reply, 'Small pets are welcome.');
    assert.equal(result.body.message.body, 'Small pets are welcome.');
    assert.equal(result.body.message.sender_id, HOST);
    assert.equal(result.body.message.ciphertext, undefined, 'no ciphertext sent to the browser');
    assert.equal(result.body.messages.length, 1);
    assert.equal(chatbot.calls[0].body.trigger, 'command');
    assert.equal(chatbot.calls[0].body.guest_enquiry, 'Do you allow pets?');
  });
});

test('@reply is refused for the guest and for a suspended host, and reports an empty enquiry', async () => {
  const db = makeDb();
  seedMessage(db, { sender: GUEST, text: 'Hello', minutesAgo: 5 });
  await withServer(db, () => jsonResponse(200, { reply: 'x' }), async ({ call, chatbot }) => {
    assert.equal((await commandReply(call, 'guest-token')).status, 403);
    assert.equal(chatbot.calls.length, 0);
  });
  await withServer(makeDb({ hostStatus: 'suspended' }), () => jsonResponse(200, { reply: 'x' }), async ({ call }) => {
    const result = await commandReply(call, 'host-token');
    assert.equal(result.status, 403);
    assert.equal(result.body.code, 'ACCOUNT_SUSPENDED');
  });
  await withServer(makeDb(), () => jsonResponse(200, { reply: 'x' }), async ({ call, chatbot }) => {
    const result = await commandReply(call, 'host-token');
    assert.equal(result.status, 200);
    assert.equal(result.body.skipped, true);
    assert.equal(result.body.reply, 'There is no guest enquiry to reply to yet.');
    assert.equal(chatbot.calls.length, 0);
  });
});

test('@reply hides chatbot errors behind a generic message', async () => {
  const db = makeDb();
  seedMessage(db, { sender: GUEST, text: 'Hello', minutesAgo: 5 });
  await withServer(db, () => jsonResponse(400, { detail: 'Gemini client error (400): secret provider text' }), async ({ call }) => {
    const result = await commandReply(call, 'host-token');
    assert.equal(result.status, 503);
    assert.doesNotMatch(result.body.error, /Gemini|provider/);
    assert.equal(autoReplies(db).length, 0);
  });
});

test("the host's own away message is sent (without the quotes it is shown in), once until the host writes again", async () => {
  const db = makeDb();
  db.profiles.find((p) => p.id === HOST).away_message = '“Back on Monday — ask Elie meanwhile.”';
  await withServer(db, () => jsonResponse(200, { reply: 'Elie here.', alternative_listing_ids: [] }), async ({ call }) => {
    assert.equal((await sendAsGuest(call, 'Hello')).status, 201);
    await waitForIdle();
    assert.deepEqual(autoReplies(db).map(plain), ['Back on Monday — ask Elie meanwhile.', 'Elie here.']);
  });
  assert.equal(autoReply.awayMessageText('   '), autoReply.DEFAULT_AWAY_MESSAGE);
  const conversation = { host_id: HOST, client_id: GUEST };
  const away = { sender_id: HOST, is_auto_reply: true, message_type: 'text', text: 'Away' };
  assert.equal(autoReply.awayMessageSent([away, { sender_id: GUEST, text: 'Hi' }], conversation, 'Away'), true);
  assert.equal(autoReply.awayMessageSent([away, { sender_id: HOST, is_auto_reply: false, text: 'I am back' }], conversation, 'Away'), false, 'the host wrote: a new away spell');
  assert.equal(autoReply.awayMessageSent([], conversation, 'Away'), false);
});

test('auto-replies do not notify a guest who turned message notifications off', async () => {
  const db = makeDb();
  db.profiles.find((p) => p.id === GUEST).message_notifications = false;
  await withServer(db, () => jsonResponse(200, { reply: 'Elie here.', alternative_listing_ids: [] }), async ({ call }) => {
    assert.equal((await sendAsGuest(call, 'Hello')).status, 201);
    await waitForIdle();
    assert.equal(autoReplies(db).length, 2);
    assert.equal(db.notifications.filter((n) => n.recipient_user_id === GUEST).length, 0);
  });
});

// --- Questions about a listing ("Chat" on a listing) ----------------------------

test('a question can carry the listing it is about: one of the conversation\'s listings, never someone else\'s', async () => {
  await withServer(makeDb({ awayMode: false }), () => jsonResponse(200, { reply: 'x' }), async ({ call }) => {
    const asked = await call(`/chat/conversations/${CONVERSATION}/messages`, 'guest-token', { content: 'Is the studio free?', listingId: OWN_ALTERNATIVE });
    assert.equal(asked.status, 201);
    assert.equal(asked.body.message.listing_id, OWN_ALTERNATIVE);
    assert.equal(asked.body.message.listing.title, 'Studio', 'the card shows at once');
    const foreign = await call(`/chat/conversations/${CONVERSATION}/messages`, 'guest-token', { content: 'And this?', listingId: FOREIGN_LISTING });
    assert.equal(foreign.status, 403);
    assert.equal(foreign.body.error, 'That listing is not part of this conversation');
    const shareForeign = await call(`/chat/conversations/${CONVERSATION}/messages`, 'guest-token', { content: 'Studio', listingId: OWN_ALTERNATIVE, messageType: 'listing' });
    assert.equal(shareForeign.status, 403, 'sharing stays limited to the sender\'s own listings');
  });
});

test('Elie answers about the listing the guest\'s latest question is about', async () => {
  const db = makeDb();
  await withServer(db, () => jsonResponse(200, { reply: 'Yes.', alternative_listing_ids: [] }), async ({ call, chatbot }) => {
    assert.equal((await call(`/chat/conversations/${CONVERSATION}/messages`, 'guest-token', { content: 'Is the studio free?', listingId: OWN_ALTERNATIVE })).status, 201);
    await waitForIdle();
    assert.equal(chatbot.calls[0].body.listing_id, OWN_ALTERNATIVE);
  });
  const conversation = { host_id: HOST, client_id: GUEST, listing_id: LISTING };
  assert.equal(autoReply.enquiryListingId([{ sender_id: GUEST, message_type: 'text', text: 'Hi' }], conversation), LISTING, 'otherwise the listing the chat began with');
});

test('"Chat" on a listing reuses the conversation with that host; a new one only when there is none', async () => {
  const db = makeDb({ awayMode: false });
  await withServer(db, () => jsonResponse(200, { reply: 'x' }), async ({ call }) => {
    const reused = await call('/chat/conversations/start', 'guest-token', { listingId: OWN_ALTERNATIVE });
    assert.equal(reused.status, 200);
    assert.deepEqual(reused.body, { conversationId: CONVERSATION, created: false });
    assert.equal(db.conversations.length, 1, 'no second conversation with the same host');
    const own = await call('/chat/conversations/start', 'host-token', { listingId: LISTING });
    assert.equal(own.status, 400);
    const missing = await call('/chat/conversations/start', 'guest-token', { listingId: '99999999-9999-4999-8999-999999999999' });
    assert.equal(missing.status, 404);
  });
  const fresh = makeDb({ awayMode: false });
  fresh.conversations = [];
  await withServer(fresh, () => jsonResponse(200, { reply: 'x' }), async ({ call }) => {
    const created = await call('/chat/conversations/start', 'guest-token', { listingId: LISTING });
    assert.equal(created.status, 201);
    assert.equal(created.body.created, true);
    assert.deepEqual(fresh.conversations.map((c) => [c.listing_id, c.host_id, c.client_id]), [[LISTING, HOST, GUEST]]);
  });
});

test('outside the host\'s business hours, a guest gets the away message and Elie even with Away mode off', async () => {
  const db = makeDb({ awayMode: false });
  // Switched on with every day closed: away at any time.
  db.profiles.find((p) => p.id === HOST).away_schedule = { enabled: true, days: Array.from({ length: 7 }, () => null) };
  await withServer(db, () => jsonResponse(200, { reply: 'Elie here.', alternative_listing_ids: [] }), async ({ call, chatbot }) => {
    assert.equal((await sendAsGuest(call, 'Hello')).status, 201);
    await waitForIdle();
    assert.equal(chatbot.calls.length, 1);
    assert.deepEqual(autoReplies(db).map(plain), [autoReply.DEFAULT_AWAY_MESSAGE, 'Elie here.']);
  });
});


// --- Host Elie: plans with Elie, monthly actions, drafts -------------------------

test('away mode: every answer by Elie uses one Elie action; a failed one is given back', async () => {
  const db = makeDb();
  await withServer(db, () => jsonResponse(200, { reply: 'Yes.', alternative_listing_ids: [] }), async ({ call }) => {
    await sendAsGuest(call, 'Is it free?');
    await waitForIdle();
    assert.deepEqual(db.elieActions.map((action) => [action.host_id, action.kind]), [[HOST, 'away']]);
  });
  const failing = makeDb();
  await withServer(failing, () => jsonResponse(503, { detail: 'down' }), async ({ call }) => {
    await sendAsGuest(call, 'Hello?');
    await waitForIdle();
    assert.equal(elieReplies(failing).length, 0);
    assert.deepEqual(failing.elieActions, [], 'given back');
  });
});

test('a host without Elie, or out of actions, still sends the away message; Elie stays quiet', async () => {
  for (const elie of ['plan', 'limit']) {
    const db = makeDb({ elie });
    await withServer(db, () => jsonResponse(200, { reply: 'unused' }), async ({ call, chatbot }) => {
      assert.equal((await sendAsGuest(call, 'Hello')).status, 201);
      await waitForIdle();
      assert.equal(awayMessages(db).length, 1, elie);
      assert.equal(elieReplies(db).length, 0, elie);
      assert.equal(chatbot.calls.length, 0, elie);
      // A later message is not retried against the same refusal.
      await sendAsGuest(call, 'Anyone?');
      await waitForIdle();
      assert.equal(chatbot.calls.length, 0, elie);
    });
  }
});

test('@reply needs a plan with Elie and actions left, and says which is missing', async () => {
  for (const [elie, status, pattern] of [['plan', 403, /plans that include Elie/], ['limit', 429, /300 Elie actions this month/]]) {
    const db = makeDb({ elie });
    seedMessage(db, { sender: GUEST, text: 'Hello', minutesAgo: 5 });
    await withServer(db, () => jsonResponse(200, { reply: 'unused' }), async ({ call, chatbot }) => {
      const result = await commandReply(call, 'host-token');
      assert.equal(result.status, status);
      assert.match(result.body.error, pattern);
      assert.equal(result.body.elie.reason, elie);
      assert.equal(result.body.elie.plansUrl, '/pricing');
      assert.equal(chatbot.calls.length, 0);
      assert.equal(autoReplies(db).length, 0);
    });
  }
});

test('a draft is Elie\'s reply for the host to edit: nothing is sent, one action is used', async () => {
  const db = makeDb({ awayMode: false });
  seedMessage(db, { sender: GUEST, text: 'Is parking free?', minutesAgo: 5 });
  await withServer(db, () => jsonResponse(200, { reply: 'Yes, parking is free.', alternative_listing_ids: [OWN_ALTERNATIVE] }), async ({ call, chatbot }) => {
    const draft = await call(`/chat/conversations/${CONVERSATION}/draft`, 'host-token', {});
    assert.equal(draft.status, 200);
    assert.deepEqual(draft.body, { reply: 'Yes, parking is free.', skipped: false });
    assert.equal(chatbot.calls[0].body.trigger, 'draft');
    assert.equal(db.messages.filter((row) => row.sender_id === HOST).length, 0, 'nothing sent, no listing shared');
    assert.deepEqual(db.elieActions.map((action) => action.kind), ['draft']);

    const guest = await call(`/chat/conversations/${CONVERSATION}/draft`, 'guest-token', {});
    assert.equal(guest.status, 403);
    assert.equal((await call(`/chat/conversations/${CONVERSATION}/draft`, 'host-token', { extra: 1 })).status, 400);
  });
  const empty = makeDb({ awayMode: false });
  await withServer(empty, () => jsonResponse(200, { reply: 'unused' }), async ({ call, chatbot }) => {
    const draft = await call(`/chat/conversations/${CONVERSATION}/draft`, 'host-token', {});
    assert.deepEqual(draft.body, { reply: 'There is no guest enquiry to reply to yet.', skipped: true });
    assert.equal(chatbot.calls.length, 0);
    assert.deepEqual(empty.elieActions, [], 'no action used when there is nothing to answer');
  });
});

// --- Chat Settings → Elie ------------------------------------------------------

const hostProfile = (db) => db.profiles.find((p) => p.id === HOST);

test('"Elie answers while I\'m away" off: only the away message, no Elie action used', async () => {
  const db = makeDb();
  hostProfile(db).elie_away_replies = false;
  await withServer(db, () => jsonResponse(200, { reply: 'Elie here.', alternative_listing_ids: [] }), async ({ call, chatbot }) => {
    assert.equal((await sendAsGuest(call, 'Hello')).status, 201);
    await waitForIdle();
    assert.equal(chatbot.calls.length, 0);
    assert.deepEqual(autoReplies(db).map(plain), [autoReply.DEFAULT_AWAY_MESSAGE]);
    assert.equal(db.elieActions.length, 0);
  });
});

test('drafts on: Elie\'s answer waits encrypted for the host instead of being sent, using a draft action', async () => {
  const db = makeDb();
  hostProfile(db).elie_away_drafts = true;
  await withServer(db, () => jsonResponse(200, { reply: 'Yes, it is free.', alternative_listing_ids: [OWN_ALTERNATIVE] }), async ({ call }) => {
    assert.equal((await sendAsGuest(call, 'Is it free?')).status, 201);
    await waitForIdle();
    assert.deepEqual(autoReplies(db).map(plain), [autoReply.DEFAULT_AWAY_MESSAGE], 'only the away message reaches the guest');
    assert.equal(db.messages.filter((row) => row.message_type === 'listing').length, 0);
    const [draft] = db.elie_away_drafts;
    assert.equal(draft.conversation_id, CONVERSATION);
    assert.equal(draft.host_id, HOST);
    assert.equal(draft.body, undefined, 'no plaintext column');
    assert.equal(decryptMessage(draft.ciphertext, draft.iv, draft.key_version), 'Yes, it is free.');
    assert.deepEqual(db.elieActions.map((a) => a.kind), ['draft']);
  });
});

test('"Answer new enquiries": Elie answers a first enquiry while the host is not away, without the away message; never once the host has written', async () => {
  const db = makeDb({ awayMode: false });
  hostProfile(db).elie_new_enquiries = true;
  await withServer(db, () => jsonResponse(200, { reply: 'Welcome! It is free.', alternative_listing_ids: [] }), async ({ call }) => {
    assert.equal((await sendAsGuest(call, 'Is it free this weekend?')).status, 201);
    await waitForIdle();
    assert.deepEqual(autoReplies(db).map(plain), ['Welcome! It is free.']);
    assert.deepEqual(db.elieActions.map((a) => a.kind), ['away']);
  });
  const answered = makeDb({ awayMode: false });
  hostProfile(answered).elie_new_enquiries = true;
  seedMessage(answered, { sender: HOST, text: 'Hi, how can I help?', minutesAgo: 30 });
  await withServer(answered, () => jsonResponse(200, { reply: 'x', alternative_listing_ids: [] }), async ({ call, chatbot }) => {
    assert.equal((await sendAsGuest(call, 'Is it free?')).status, 201);
    await waitForIdle();
    assert.equal(chatbot.calls.length, 0, 'not a new enquiry');
  });
});

test('"Suggest my other listings" off: Elie\'s answer goes without listing cards (away and @reply)', async () => {
  const db = makeDb();
  hostProfile(db).elie_suggest_listings = false;
  await withServer(db, () => jsonResponse(200, { reply: 'Here are options.', alternative_listing_ids: [OWN_ALTERNATIVE] }), async ({ call }) => {
    assert.equal((await sendAsGuest(call, 'Any options?')).status, 201);
    await waitForIdle();
    assert.equal(db.messages.filter((row) => row.message_type === 'listing').length, 0);
    assert.ok(autoReplies(db).map(plain).includes('Here are options.'));
    assert.equal((await commandReply(call, 'host-token')).status, 200);
    assert.equal(db.messages.filter((row) => row.message_type === 'listing').length, 0, '@reply too');
  });
});
