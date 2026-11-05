'use strict';

// Live updates in Chats: the inbox order and previews (lib/chat/inbox
// bumpInbox), what a Realtime insert fetches (lib/chat/thread), presence.
// The Realtime handlers themselves run inside the page's selection callback;
// their wiring keeps a minimal source check.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadTs } = require('./helpers/loadTs');

const root = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'pages', 'chats.tsx'), 'utf8');
const inbox = loadTs(path.join(root, 'lib', 'chat', 'inbox.ts'));
const thread = loadTs(path.join(root, 'lib', 'chat', 'thread.ts'));

test('inbox: newest conversation first, preview from its last message (legacy updateConversationPreview)', () => {
  const list = [
    { id: 'a', created_at: '2026-11-01T00:00:00Z', lastMessage: { id: 'm1', created_at: '2026-11-02T00:00:00Z' } },
    { id: 'b', created_at: '2026-10-01T00:00:00Z', lastMessage: null },
    { id: 'c', created_at: '2026-11-03T00:00:00Z', lastMessage: null },
  ];
  const bumped = inbox.bumpInbox(list, 'b', { id: 'm9', created_at: '2026-11-04T00:00:00Z' });
  assert.deepEqual(bumped.map((c) => c.id), ['b', 'c', 'a']);
  assert.equal(bumped[0].lastMessage.id, 'm9');
  assert.equal(list[1].lastMessage, null, 'the previous state is not changed');
  assert.equal(inbox.bumpInbox(bumped, 'b', { id: 'm9', created_at: 'x' }), bumped, 'no re-render when nothing changed');
  assert.notEqual(inbox.bumpInbox(bumped, 'b', { id: 'm9', deleted_at: 't', created_at: '2026-11-04T00:00:00Z' }), bumped, 'a deletion changes the preview');
  assert.equal(inbox.bumpInbox(list, 'zzz', { id: 'm' }), list, 'unknown conversations are ignored');
  const emptied = inbox.bumpInbox(bumped, 'b', null);
  assert.deepEqual(emptied.map((c) => c.id), ['c', 'a', 'b'], 'an emptied thread sorts by when it began');
  assert.equal(thread.lastMessage([]), null);
  assert.deepEqual(thread.lastMessage([{ id: 1 }, { id: 2 }]), { id: 2 });
  // Every path that changes a thread updates the inbox: open, send, upload, share, Realtime, refresh.
  for (const call of [
    /if \(finalMsgs\.length\) bumpConversation\(id, finalMsgs\[finalMsgs\.length - 1\]\);/,
    /if \(sent\.length\) bumpConversation\(conversationId, sent\[sent\.length - 1\]\);/,
    /bumpConversation\(conversationId, sent\);[\s\S]*bumpConversation\(conversationId, sent\);/,
    /bumpConversation\(id, latest\);/,
    /bumpConversation\(conversationId, lastMessage\(list\)\);/,
  ]) assert.match(source, call);
  assert.match(source, /setConversations\(\(prev\) => bumpInbox\(prev, conversationId, lastMessage\)\);/);
});

test('realtime insert: no request for messages already shown; otherwise one request from the newest shown message', () => {
  const shown = [
    { id: 'm1', created_at: '2026-11-02T09:00:00Z' },
    { id: 'm2', created_at: '2026-11-02T09:05:00+03:00' },
    { id: 'optimistic-1', created_at: '2026-11-02T09:09:00Z', _optimistic: true },
  ];
  assert.equal(thread.alreadyShown(shown, 'm2'), true, 'our own send: no request');
  assert.equal(thread.alreadyShown(shown, undefined), true);
  assert.equal(thread.alreadyShown(shown, 'm3'), false);
  assert.equal(thread.newerMessagesUrl('c 1', shown), '/api/chat/conversations/c%201/messages?since=2026-11-02T09%3A05%3A00%2B03%3A00', 'uploads in progress are not the since point');
  assert.equal(thread.newerMessagesUrl('c1', []), '/api/chat/conversations/c1/messages');
  assert.deepEqual(thread.unseenMessages(shown, [{ id: 'm2' }, { id: 'm3' }]).map((m) => m.id), ['m3']);
  assert.equal(thread.messagesUrl('c1', null), '/api/chat/conversations/c1/messages');
  assert.match(source, /if \(alreadyShown\(messagesStateRef\.current, payload\.new\?\.id\)\) return;/);
  assert.match(source, /await api<\{ messages\?: ChatMessage\[\] \}>\(newerMessagesUrl\(id, messagesStateRef\.current\)\)/);
});

test('realtime edits and deletions refetch in full through the cache', () => {
  const start = source.indexOf("event: 'UPDATE'");
  const update = source.slice(start, source.indexOf(".on('presence'", start));
  assert.equal((update.match(/await refreshConversation\(id\);/g) || []).length, 2, 'message edits and per-person deletions');
  assert.match(source, /const res = await api<\{ messages\?: ChatMessage\[\] \}>\(messagesUrl\(conversationId\)\);/, 'a full fetch, not a since delta');
});

test('presence: cleared when switching; the header stays blank until presence syncs', () => {
  const status = (overrides) => thread.headerStatus({ isElie: false, activeId: 'c1', typingIn: null, presenceKnownId: null, online: false, ...overrides });
  assert.equal(status(), '', 'blank until presence syncs');
  assert.equal(status({ presenceKnownId: 'c1' }), 'Offline');
  assert.equal(status({ presenceKnownId: 'c1', online: true }), 'Online');
  assert.equal(status({ presenceKnownId: 'c0', online: true }), '', 'another conversation\'s presence');
  assert.equal(status({ presenceKnownId: 'c1', typingIn: 'c1' }), 'typing…');
  assert.equal(status({ activeId: null, typingIn: null, presenceKnownId: 'x' }), '');
  assert.equal(status({ isElie: true, typingIn: 'c1' }), 'Your VaRoom search assistant');
  assert.match(source, /if \(previousConversationId && !isSameConversation\) \{\s*setOnlineUsers\(\(prev\) => \{/);
  assert.match(source, /next\.delete\(previousConversationId\);/);
  assert.match(source, /setPresenceKnownId\(id\);/);
  assert.match(source, /status === 'CHANNEL_ERROR' \|\| status === 'TIMED_OUT'/);
});
