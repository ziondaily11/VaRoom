const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

// Load client-side chat-cache module in Node environment
const chatCache = require(path.join(__dirname, '../../client/public/js/chat-cache.js'));

test('VaRoomChatCache - inbox caching and updates', async () => {
  await chatCache.clearAll();
  const userId = 'user-123';

  // Initially null
  const initial = await chatCache.getInbox(userId);
  assert.equal(initial, null);

  // Set inbox
  const mockConversations = [
    {
      id: 'conv-1',
      participant: { full_name: 'Alice Host', username: 'alice' },
      lastMessage: { id: 'msg-1', body: 'Hello Alice', created_at: '2026-10-01T10:00:00Z' }
    },
    {
      id: 'conv-2',
      participant: { full_name: 'Bob Client', username: 'bob' },
      lastMessage: { id: 'msg-2', body: 'Hi Bob', created_at: '2026-10-02T12:00:00Z' }
    }
  ];

  await chatCache.setInbox(userId, mockConversations);
  const cached = await chatCache.getInbox(userId);
  assert.equal(cached.length, 2);
  assert.equal(cached[0].id, 'conv-1');

  // Update a single conversation in inbox
  await chatCache.updateInboxConversation(userId, 'conv-1', {
    lastMessage: { id: 'msg-3', body: 'New message from Alice', created_at: '2026-10-03T15:00:00Z' }
  });

  const updatedInbox = await chatCache.getInbox(userId);
  const conv1 = updatedInbox.find((c) => c.id === 'conv-1');
  assert.equal(conv1.lastMessage.body, 'New message from Alice');
});

test('VaRoomChatCache - conversation messages caching, deduplication and merging', async () => {
  await chatCache.clearAll();
  const userId = 'user-123';
  const convId = 'conv-1';

  // Initially empty/null
  const initial = await chatCache.getMessages(userId, convId);
  assert.equal(initial, null);

  // Set initial messages
  const initialMessages = [
    { id: 'm1', body: 'First message', created_at: '2026-10-01T10:00:00Z', sender_id: 'user-123' },
    { id: 'm2', body: 'Second message', created_at: '2026-10-01T10:05:00Z', sender_id: 'user-456' }
  ];

  await chatCache.setMessages(userId, convId, initialMessages);
  const cached = await chatCache.getMessages(userId, convId);
  assert.equal(cached.length, 2);
  assert.equal(cached[0].id, 'm1');
  assert.equal(cached[1].id, 'm2');

  // Merge delta messages (one duplicate with updated read_at, one new message)
  const deltaMessages = [
    { id: 'm2', body: 'Second message', created_at: '2026-10-01T10:05:00Z', sender_id: 'user-456', read_at: '2026-10-01T10:06:00Z' },
    { id: 'm3', body: 'Third message', created_at: '2026-10-01T10:10:00Z', sender_id: 'user-123' }
  ];

  const merged = await chatCache.mergeMessages(userId, convId, deltaMessages);
  assert.equal(merged.length, 3);
  assert.equal(merged[1].read_at, '2026-10-01T10:06:00Z');
  assert.equal(merged[2].id, 'm3');

  // Append new realtime message
  const realtimeMsg = { id: 'm4', body: 'Realtime message', created_at: '2026-10-01T10:15:00Z', sender_id: 'user-456' };
  const appended = await chatCache.appendMessage(userId, convId, realtimeMsg);
  assert.equal(appended.length, 4);
  assert.equal(appended[3].id, 'm4');

  // Update existing message
  await chatCache.updateMessage(userId, convId, { id: 'm4', body: 'Edited realtime message' });
  const messagesAfterUpdate = await chatCache.getMessages(userId, convId);
  assert.equal(messagesAfterUpdate.find((m) => m.id === 'm4').body, 'Edited realtime message');

  // Remove a deleted message
  await chatCache.removeMessage(userId, convId, 'm1');
  const messagesAfterRemove = await chatCache.getMessages(userId, convId);
  assert.equal(messagesAfterRemove.length, 3);
  assert.equal(messagesAfterRemove.find((m) => m.id === 'm1'), undefined);
});

test('VaRoomChatCache - shared media caching, retrieval and stats', async () => {
  await chatCache.clearAll();

  const mediaId = 'attachment:att-123';
  const mockBlob = {
    size: 1024,
    type: 'image/jpeg'
  };

  // Save media
  const saved = await chatCache.saveMedia(mediaId, mockBlob, { type: 'image', mimeType: 'image/jpeg' });
  assert.ok(saved);
  assert.equal(saved.size, 1024);
  assert.equal(saved.mimeType, 'image/jpeg');

  // Get media record
  const record = await chatCache.getMedia(mediaId);
  assert.ok(record);
  assert.equal(record.id, mediaId);
  assert.equal(record.size, 1024);

  // Check stats
  const stats = await chatCache.getMediaStats();
  assert.equal(stats.count, 1);
  assert.equal(stats.totalBytes, 1024);

  // Remove media
  await chatCache.removeMedia(mediaId);
  const afterRemove = await chatCache.getMedia(mediaId);
  assert.equal(afterRemove, null);
});

test('VaRoomChatCache - media size quota protection and clear operations', async () => {
  await chatCache.clearAll();

  // Test single oversized item rejection from persistent cache
  const oversizedBlob = {
    size: 25 * 1024 * 1024, // 25MB (limit is 20MB)
    type: 'video/mp4'
  };

  const savedOversized = await chatCache.saveMedia('listing-video:huge-vid', oversizedBlob, { type: 'video' });
  assert.ok(savedOversized);
  // Oversized blob shouldn't be added to the persistent media storage stats
  const stats = await chatCache.getMediaStats();
  assert.equal(stats.count, 0);

  // Clear all
  await chatCache.clearAll();
  const clearedStats = await chatCache.getMediaStats();
  assert.equal(clearedStats.count, 0);
  assert.equal(clearedStats.totalBytes, 0);
});

test('VaRoomChatCache - user session isolation and cleanup', async () => {
  await chatCache.clearAll();

  await chatCache.setInbox('user-A', [{ id: 'conv-A' }]);
  await chatCache.setMessages('user-A', 'conv-A', [{ id: 'msg-A', body: 'Hello A' }]);

  await chatCache.setInbox('user-B', [{ id: 'conv-B' }]);
  await chatCache.setMessages('user-B', 'conv-B', [{ id: 'msg-B', body: 'Hello B' }]);

  // Clear user-A
  await chatCache.clearUser('user-A');

  const inboxA = await chatCache.getInbox('user-A');
  const msgsA = await chatCache.getMessages('user-A', 'conv-A');
  assert.equal(inboxA, null);
  assert.equal(msgsA, null);

  // user-B remains intact
  const inboxB = await chatCache.getInbox('user-B');
  const msgsB = await chatCache.getMessages('user-B', 'conv-B');
  assert.equal(inboxB.length, 1);
  assert.equal(msgsB.length, 1);
});
