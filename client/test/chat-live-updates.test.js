const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '..', 'pages', 'chats.tsx'), 'utf8');

function between(startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  assert.ok(start >= 0, startMarker);
  return source.slice(start, source.indexOf(endMarker, start + startMarker.length));
}

test('inbox: newest conversation first, preview from its last message (legacy updateConversationPreview)', () => {
  const bump = between('const bumpConversation = useCallback(', '}, []);');
  assert.match(bump, /next\[index\] = \{ \.\.\.current, lastMessage \};/);
  assert.match(bump, /new Date\(c\.lastMessage\?\.created_at \|\| c\.created_at \|\| 0\)\.getTime\(\)/);
  assert.match(bump, /next\.sort\(\(a, b\) => time\(b\) - time\(a\)\)/);
  assert.match(bump, /if \(unchanged\) return prev;/, 'no re-render when nothing changed');
  // Every path that changes a thread updates the inbox.
  assert.match(source, /if \(sent\.length\) bumpConversation\(conversationId, sent\[sent\.length - 1\]\);/);
  assert.match(source, /bumpConversation\(conversationId, sent\);/);
  assert.match(source, /bumpConversation\(conversationId, sent\);/);
  assert.match(source, /bumpConversation\(conversationId, list\.length \? list\[list\.length - 1\] : null\);/);
  assert.match(source, /if \(finalMsgs\.length\) bumpConversation\(id, finalMsgs\[finalMsgs\.length - 1\]\);/);
  assert.match(source, /bumpConversation\(id, latest\);/);
});

test('realtime insert: no request for messages already shown; otherwise one request from the newest shown message', () => {
  const insert = between("event: 'INSERT', schema: 'public', table: 'messages'", "event: 'UPDATE'");
  assert.match(insert, /if \(!msgId \|\| messagesStateRef\.current\.some\(\(m\) => m\.id === msgId\)\) return;/);
  assert.match(insert, /url \+= `\?since=\$\{encodeURIComponent\(newest\.created_at\)\}`/);
  assert.equal((insert.match(/await api(?:<[^>]+>)?\(/g) || []).length, 1, 'a single request');
  assert.match(insert, /!\(m as OptimisticChatMessage\)\._optimistic/, 'optimistic uploads are not used as the since point');
});

test('realtime edits and deletions refetch in full through the cache', () => {
  const update = between("event: 'UPDATE'", ".on('presence'");
  assert.equal((update.match(/await refreshConversation\(id\);/g) || []).length, 2);
  assert.doesNotMatch(update, /setMessagesState\(res\.messages/);
});

test('presence: cleared when switching; the header stays blank until presence syncs', () => {
  assert.match(source, /if \(previousConversationId && !isSameConversation\) \{\s*setOnlineUsers\(\(prev\) => \{/);
  assert.match(source, /next\.delete\(previousConversationId\);/);
  assert.match(source, /setPresenceKnownId\(id\);/);
  assert.match(source, /presenceKnownId === activeId \? \(isCurrentOnline \? 'Online' : 'Offline'\) : ''/);
  assert.match(source, /status === 'CHANNEL_ERROR' \|\| status === 'TIMED_OUT'/);
});
