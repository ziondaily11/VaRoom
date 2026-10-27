const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const root = path.join(__dirname, '..');
const cacheModulePath = path.join(root, 'lib', 'chatCache.ts');

function loadChatCacheModule() {
  const tsSource = fs.readFileSync(cacheModulePath, 'utf8');
  const compiled = ts.transpileModule(tsSource, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;

  const m = { exports: {} };
  const fn = new Function('module', 'exports', 'require', compiled);
  fn(m, m.exports, require);
  return m.exports;
}

test('chatCache.ts - module exports and types integrity', () => {
  const cache = loadChatCacheModule();
  assert.equal(typeof cache.getInbox, 'function');
  assert.equal(typeof cache.setInbox, 'function');
  assert.equal(typeof cache.syncInbox, 'function');
  assert.equal(typeof cache.updateInboxConversation, 'function');
  assert.equal(typeof cache.getMessages, 'function');
  assert.equal(typeof cache.setMessages, 'function');
  assert.equal(typeof cache.syncConversationMessages, 'function');
  assert.equal(typeof cache.mergeMessages, 'function');
  assert.equal(typeof cache.appendMessage, 'function');
  assert.equal(typeof cache.updateMessage, 'function');
  assert.equal(typeof cache.removeMessage, 'function');
  assert.equal(typeof cache.getMedia, 'function');
  assert.equal(typeof cache.getMediaUrl, 'function');
  assert.equal(typeof cache.saveMedia, 'function');
  assert.equal(typeof cache.fetchAndCacheMedia, 'function');
  assert.equal(typeof cache.removeMedia, 'function');
  assert.equal(typeof cache.clearMedia, 'function');
  assert.equal(typeof cache.getMediaStats, 'function');
  assert.equal(typeof cache.prefetch, 'function');
  assert.equal(typeof cache.cancelPrefetch, 'function');
  assert.equal(typeof cache.isPrefetching, 'function');
  assert.equal(typeof cache.clearUser, 'function');
  assert.equal(typeof cache.clearAll, 'function');
});

test('chatCache.ts - inbox operations and lastMessage patch updates', async () => {
  const cache = loadChatCacheModule();
  await cache.clearAll();
  const userId = 'usr-test-1';

  const initial = await cache.getInbox(userId);
  assert.equal(initial, null);

  const mockConversations = [
    {
      id: 'conv-101',
      participant: { full_name: 'Jane Host', username: 'jane' },
      lastMessage: { id: 'm-1', body: 'Welcome to Nairobi!', created_at: '2026-10-01T08:00:00Z', conversation_id: 'conv-101', sender_id: 'usr-jane' }
    },
    {
      id: 'conv-102',
      participant: { full_name: 'John Client', username: 'john' },
      lastMessage: { id: 'm-2', body: 'Is parking available?', created_at: '2026-10-01T09:00:00Z', conversation_id: 'conv-102', sender_id: 'usr-test-1' }
    }
  ];

  await cache.setInbox(userId, mockConversations);
  const cached = await cache.getInbox(userId);
  assert.ok(Array.isArray(cached));
  assert.equal(cached.length, 2);
  assert.equal(cached[0].id, 'conv-101');
  assert.equal(cached[0].participant.full_name, 'Jane Host');

  await cache.updateInboxConversation(userId, 'conv-101', {
    lastMessage: { id: 'm-3', body: 'Yes, parking is free.', created_at: '2026-10-01T10:00:00Z', conversation_id: 'conv-101', sender_id: 'usr-jane' }
  });

  const updatedInbox = await cache.getInbox(userId);
  const conv101 = updatedInbox.find((c) => c.id === 'conv-101');
  assert.equal(conv101.lastMessage.body, 'Yes, parking is free.');
});

test('chatCache.ts - message deduplication, chronological sorting and delta merging', async () => {
  const cache = loadChatCacheModule();
  await cache.clearAll();
  const userId = 'usr-test-2';
  const convId = 'conv-201';

  const initial = await cache.getMessages(userId, convId);
  assert.equal(initial, null);

  const initialMessages = [
    { id: 'm-1', conversation_id: convId, sender_id: 'u1', body: 'Hello', created_at: '2026-10-01T10:00:00Z' },
    { id: 'm-2', conversation_id: convId, sender_id: 'u2', body: 'Hi there', created_at: '2026-10-01T10:02:00Z' }
  ];

  await cache.setMessages(userId, convId, initialMessages);
  const cached = await cache.getMessages(userId, convId);
  assert.equal(cached.length, 2);

  // Incoming delta with an updated read_at on m-2 and a new message m-3
  const deltaMessages = [
    { id: 'm-2', conversation_id: convId, sender_id: 'u2', body: 'Hi there', created_at: '2026-10-01T10:02:00Z', read_at: '2026-10-01T10:03:00Z' },
    { id: 'm-3', conversation_id: convId, sender_id: 'u1', body: 'Can I check in early?', created_at: '2026-10-01T10:05:00Z' }
  ];

  const merged = await cache.mergeMessages(userId, convId, deltaMessages);
  assert.equal(merged.length, 3);
  assert.equal(merged[1].id, 'm-2');
  assert.equal(merged[1].read_at, '2026-10-01T10:03:00Z');
  assert.equal(merged[2].id, 'm-3');

  // Realtime append
  const realtimeMsg = { id: 'm-4', conversation_id: convId, sender_id: 'u2', body: 'Yes, 11am is fine', created_at: '2026-10-01T10:06:00Z' };
  const appended = await cache.appendMessage(userId, convId, realtimeMsg);
  assert.equal(appended.length, 4);
  assert.equal(appended[3].id, 'm-4');
});

test('chatCache.ts - account switching and cache isolation', async () => {
  const cache = loadChatCacheModule();
  await cache.clearAll();

  const userA = 'user-account-A';
  const userB = 'user-account-B';

  await cache.setInbox(userA, [
    { id: 'conv-A', participant: { username: 'alice' } }
  ]);
  await cache.setMessages(userA, 'conv-A', [
    { id: 'msg-A', conversation_id: 'conv-A', sender_id: userA, body: 'Secret for Account A', created_at: '2026-10-01T00:00:00Z' }
  ]);

  // Account B must not see Account A's conversations or messages
  const userBInbox = await cache.getInbox(userB);
  assert.equal(userBInbox, null);
  const userBMessages = await cache.getMessages(userB, 'conv-A');
  assert.equal(userBMessages, null);

  // Clearing Account A must not affect Account B data
  await cache.setInbox(userB, [
    { id: 'conv-B', participant: { username: 'bob' } }
  ]);
  await cache.clearUser(userA);

  assert.equal(await cache.getInbox(userA), null);
  assert.equal(await cache.getMessages(userA, 'conv-A'), null);

  const preservedB = await cache.getInbox(userB);
  assert.ok(preservedB);
  assert.equal(preservedB[0].id, 'conv-B');
});

test('chatCache.ts - in-flight request deduplication for concurrent syncs', async () => {
  const cache = loadChatCacheModule();
  await cache.clearAll();
  const userId = 'usr-dedup';

  let apiCallCount = 0;
  const mockFetchFn = async () => {
    apiCallCount++;
    await new Promise((resolve) => setTimeout(resolve, 20));
    return { conversations: [{ id: 'c-dedup', participant: { username: 'dedup-test' } }] };
  };

  const [p1, p2, p3] = await Promise.all([
    cache.syncInbox(userId, { fetchFn: mockFetchFn }),
    cache.syncInbox(userId, { fetchFn: mockFetchFn }),
    cache.syncInbox(userId, { fetchFn: mockFetchFn }),
  ]);

  assert.equal(apiCallCount, 1, 'Only one HTTP fetch call should be executed concurrently');
  assert.deepEqual(p1, p2);
  assert.deepEqual(p2, p3);
});
