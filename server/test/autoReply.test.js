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

function makeDb({ awayMode = true, hostStatus = 'active', failProfiles = false } = {}) {
  return {
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
  const saved = { from: supabaseAdmin.from, getUser: supabaseAdmin.auth.getUser };
  supabaseAdmin.from = (table) => makeQuery(db, table);
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

    const [reply] = autoReplies(db);
    assert.ok(reply, 'reply saved');
    assert.equal(reply.body, undefined, 'no plaintext column');
    assert.equal(decryptMessage(reply.ciphertext, reply.iv, reply.key_version), 'Yes, it is free this weekend.');

    const guestNotification = db.notifications.find((n) => n.recipient_user_id === GUEST);
    assert.ok(guestNotification, 'guest notified');
    assert.equal(guestNotification.metadata.auto_reply, true);
    assert.equal(guestNotification.event_key, `message:${CONVERSATION}:${reply.id}`);
  });
});

test('the guest message is accepted when the chatbot fails or times out', async () => {
  const db = makeDb();
  await withServer(db, () => { throw new TypeError('fetch failed'); }, async ({ call, chatbot }) => {
    const sent = await sendAsGuest(call, 'Hello?');
    assert.equal(sent.status, 201);
    await waitForIdle();
    assert.equal(chatbot.calls.length, 1);
    assert.equal(autoReplies(db).length, 0);
  });
  await withServer(makeDb(), () => jsonResponse(503, { detail: 'Gemini down' }), async ({ call, db: freshDb }) => {
    const sent = await sendAsGuest(call, 'Hello again?');
    assert.equal(sent.status, 201);
    await waitForIdle();
    assert.equal(autoReplies(freshDb).length, 0);
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
    await withServer(makeDb(), () => jsonResponse(200, { reply: 'x' }), async ({ call, chatbot }) => {
      assert.equal((await sendAsGuest(call, 'Hi')).status, 201);
      await waitForIdle();
      assert.equal(chatbot.calls.length, 0);
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
    assert.equal(autoReplies(db).length, 1);
    const state = autoReply._awayState.get(CONVERSATION);
    assert.ok(state && state.timer, 'a follow-up is scheduled for the end of the cooldown');

    // Let the cooldown pass: back-date the first reply, then fire the timer.
    autoReplies(db)[0].created_at = new Date(Date.now() - autoReply.COOLDOWN_MS - 1000).toISOString();
    t.mock.timers.tick(autoReply.COOLDOWN_MS + 10 * 60_000);
    await waitForIdle();

    assert.equal(chatbot.calls.length, 2);
    assert.equal(chatbot.calls[1].body.guest_message, 'Second question\nThird question');
    assert.equal(autoReplies(db).length, 2);
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
