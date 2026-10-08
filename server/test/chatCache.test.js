'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const chatCache = require('../../client/public/js/chat-cache');

test('chatCache initializes and operates in fallback memory mode in node environment', async () => {
  assert.equal(typeof chatCache.getInbox, 'function');
  assert.equal(typeof chatCache.setInbox, 'function');
  assert.equal(typeof chatCache.getMessages, 'function');
  assert.equal(typeof chatCache.setMessages, 'function');
  assert.equal(typeof chatCache.mergeMessages, 'function');
  assert.equal(typeof chatCache.appendMessage, 'function');
  assert.equal(typeof chatCache.updateMessage, 'function');
  assert.equal(typeof chatCache.removeMessage, 'function');
  assert.equal(typeof chatCache.clearUser, 'function');
});

test('chatCache stores and retrieves inbox conversations isolated by user', async () => {
  await chatCache.clearAll();

  const user1 = 'user-uuid-1';
  const user2 = 'user-uuid-2';

  const conversationsUser1 = [
    { id: 'conv-1', participant: { full_name: 'Alice' }, lastMessage: { body: 'Hello Alice' } },
    { id: 'conv-2', participant: { full_name: 'Bob' }, lastMessage: { body: 'Hey Bob' } }
  ];

  const conversationsUser2 = [
    { id: 'conv-3', participant: { full_name: 'Charlie' }, lastMessage: { body: 'Hi Charlie' } }
  ];

  await chatCache.setInbox(user1, conversationsUser1);
  await chatCache.setInbox(user2, conversationsUser2);

  const cached1 = await chatCache.getInbox(user1);
  const cached2 = await chatCache.getInbox(user2);

  assert.equal(cached1.length, 2);
  assert.equal(cached1[0].id, 'conv-1');
  assert.equal(cached1[0].participant.full_name, 'Alice');

  assert.equal(cached2.length, 1);
  assert.equal(cached2[0].id, 'conv-3');
  assert.equal(cached2[0].participant.full_name, 'Charlie');

  const cached3 = await chatCache.getInbox('non-existent-user');
  assert.equal(cached3, null);
});

test('chatCache updates conversation preview in cached inbox', async () => {
  await chatCache.clearAll();
  const userId = 'user-update-test';

  const initialConversations = [
    { id: 'conv-10', participant: { full_name: 'David' }, lastMessage: { body: 'First message', created_at: '2026-01-01T10:00:00Z' } }
  ];

  await chatCache.setInbox(userId, initialConversations);

  await chatCache.updateInboxConversation(userId, 'conv-10', {
    lastMessage: { id: 'msg-99', body: 'Updated latest message', created_at: '2026-01-01T10:05:00Z' }
  });

  const updatedInbox = await chatCache.getInbox(userId);
  assert.equal(updatedInbox.length, 1);
  assert.equal(updatedInbox[0].lastMessage.body, 'Updated latest message');
});

test('chatCache stores, deduplicates, and chronologically sorts conversation messages', async () => {
  await chatCache.clearAll();
  const userId = 'user-msg-test';
  const convId = 'conv-20';

  const initialMessages = [
    { id: 'm2', body: 'Second', created_at: '2026-01-01T12:05:00Z' },
    { id: 'm1', body: 'First', created_at: '2026-01-01T12:00:00Z' },
    { id: 'm3', body: 'Third', created_at: '2026-01-01T12:10:00Z' }
  ];

  await chatCache.setMessages(userId, convId, initialMessages);

  const cached = await chatCache.getMessages(userId, convId);
  assert.equal(cached.length, 3);
  // Must be sorted ascending
  assert.equal(cached[0].id, 'm1');
  assert.equal(cached[1].id, 'm2');
  assert.equal(cached[2].id, 'm3');

  // Merging a duplicate with updated fields and a new message
  const deltaMessages = [
    { id: 'm2', body: 'Second (edited/read)', read_at: '2026-01-01T12:06:00Z', created_at: '2026-01-01T12:05:00Z' },
    { id: 'm4', body: 'Fourth', created_at: '2026-01-01T12:15:00Z' }
  ];

  const merged = await chatCache.mergeMessages(userId, convId, deltaMessages);
  assert.equal(merged.length, 4);
  assert.equal(merged[1].id, 'm2');
  assert.equal(merged[1].body, 'Second (edited/read)');
  assert.equal(merged[1].read_at, '2026-01-01T12:06:00Z');
  assert.equal(merged[3].id, 'm4');
  assert.equal(merged[3].body, 'Fourth');
});

test('appendMessage updates message cache and inbox preview simultaneously', async () => {
  await chatCache.clearAll();
  const userId = 'user-append-test';
  const convId = 'conv-30';

  await chatCache.setInbox(userId, [
    { id: convId, participant: { full_name: 'Emma' }, lastMessage: null }
  ]);

  const newMsg = {
    id: 'msg-realtime-1',
    conversation_id: convId,
    body: 'Realtime incoming message',
    created_at: '2026-01-01T14:00:00Z'
  };

  await chatCache.appendMessage(userId, convId, newMsg);

  const messages = await chatCache.getMessages(userId, convId);
  assert.equal(messages.length, 1);
  assert.equal(messages[0].id, 'msg-realtime-1');

  const inbox = await chatCache.getInbox(userId);
  assert.equal(inbox[0].lastMessage.body, 'Realtime incoming message');
});

test('updateMessage and removeMessage modify cached messages', async () => {
  await chatCache.clearAll();
  const userId = 'user-mod-test';
  const convId = 'conv-40';

  await chatCache.setMessages(userId, convId, [
    { id: 'm1', body: 'Hello', created_at: '2026-01-01T15:00:00Z', pinned_at: null },
    { id: 'm2', body: 'World', created_at: '2026-01-01T15:01:00Z', deleted_at: null }
  ]);

  await chatCache.updateMessage(userId, convId, 'm1', { pinned_at: '2026-01-01T15:05:00Z' });
  let messages = await chatCache.getMessages(userId, convId);
  assert.equal(messages[0].pinned_at, '2026-01-01T15:05:00Z');

  await chatCache.removeMessage(userId, convId, 'm2');
  messages = await chatCache.getMessages(userId, convId);
  assert.equal(messages.length, 1);
  assert.equal(messages[0].id, 'm1');
});

test('clearUser clears only specified user cache on logout', async () => {
  await chatCache.clearAll();
  const userA = 'user-a';
  const userB = 'user-b';

  await chatCache.setInbox(userA, [{ id: 'c1' }]);
  await chatCache.setMessages(userA, 'c1', [{ id: 'm1', created_at: '2026-01-01T00:00:00Z' }]);

  await chatCache.setInbox(userB, [{ id: 'c2' }]);
  await chatCache.setMessages(userB, 'c2', [{ id: 'm2', created_at: '2026-01-01T00:00:00Z' }]);

  await chatCache.clearUser(userA);

  assert.equal(await chatCache.getInbox(userA), null);
  assert.equal(await chatCache.getMessages(userA, 'c1'), null);

  const inboxB = await chatCache.getInbox(userB);
  assert.equal(inboxB.length, 1);
  const msgB = await chatCache.getMessages(userB, 'c2');
  assert.equal(msgB.length, 1);
});

test('chatCache gracefully handles invalid inputs without crashing', async () => {
  assert.equal(await chatCache.getInbox(null), null);
  assert.equal(await chatCache.getMessages(null, null), null);
  await assert.doesNotReject(async () => {
    await chatCache.setInbox(null, null);
    await chatCache.setMessages(null, null, null);
    await chatCache.mergeMessages(null, null, null);
    await chatCache.appendMessage(null, null, null);
    await chatCache.updateMessage(null, null, null, null);
    await chatCache.removeMessage(null, null, null);
    await chatCache.clearUser(null);
  });
});
