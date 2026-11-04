const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadTs } = require('./helpers/loadTs');

const root = path.join(__dirname, '..');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');
const source = read('pages', 'chats.tsx');

test('typing indicators: announced at most every 2.5 s over the chat channel, shown 4 s, both only with the setting on', () => {
  assert.match(source, /const TYPING_SEND_INTERVAL = 2500;\s*const TYPING_SHOW_MS = 4000;/);
  assert.match(source, /if \(isElie \|\| !channel \|\| !typingOnRef\.current\) return;/);
  assert.match(source, /void channel\.send\(\{ type: 'broadcast', event: 'typing', payload: \{ user_id: userIdRef\.current \} \}\);/);
  assert.match(source, /\.on\('broadcast', \{ event: 'typing' \}, \(\{ payload \}[^)]*\) => \{[\s\S]*?if \(!payload\?\.user_id \|\| payload\.user_id === currentUserId \|\| !typingOnRef\.current\) return;\s*showTyping\(id\);/);
  assert.match(source, /typingOnRef\.current = chatPrefs \? chatPrefs\.typingIndicators : true;/);
  assert.match(source, /if \(payload\.new\?\.sender_id && payload\.new\.sender_id !== currentUserId\) clearTyping\(\);/, 'their message ends "typing…"');
  assert.match(source, /typingInConversation === activeId \? 'typing…'/);
  assert.equal((source.match(/announceTyping\(\);/g) || []).length, 2, 'desktop editor and phone textarea');
});

test('archived chats: hidden from the inbox, listed under Archived, archived from the info panel, opened from Chat Settings', () => {
  assert.match(source, /const inView = conversations\.filter\(\(c\) => Boolean\(c\.archived\) === \(inboxView === 'archived'\)\);/);
  assert.match(source, /<li className="contact-item archived-entry" role="button"/);
  assert.match(source, /'No archived chats'/);
  assert.match(source, /api\(`\/api\/chat\/conversations\/\$\{encodeURIComponent\(id\)\}\/archive`, \{ method: 'POST', body: JSON\.stringify\(\{ archived \}\) \}\)/);
  assert.match(source, /apply\(failed, !archived\);/, 'undone when the server refuses');
  assert.match(source, /updateInboxConversation\(userId, id, \{ archived: value \}\)/, 'the cached inbox follows');
  assert.match(source, /if \(routerQueryArchived\) setInboxView\('archived'\);/);
  const info = read('components', 'chat', 'ConversationInfo.tsx');
  assert.match(info, /\{archived \? 'Unarchive chat' : 'Archive chat'\}/);
});

test('message previews: only "New message" notifications with a message id, fetched while the setting is on', () => {
  const { notificationMessageId } = loadTs(path.join(root, 'lib', 'notifications', 'messagePreviews.ts'));
  assert.equal(notificationMessageId({ type: 'new_message', metadata: { message_id: 'm1' } }), 'm1');
  assert.equal(notificationMessageId({ type: 'new_message', metadata: {} }), null);
  assert.equal(notificationMessageId({ type: 'booking_request', metadata: { message_id: 'm1' } }), null);
  const page = read('pages', 'notifications.tsx');
  assert.match(page, /useMessagePreviews\(authUserId, notifications, chatPrefs \? chatPrefs\.messagePreviews : false\)/);
  assert.match(page, /preview \? <p className="notif-desc notif-preview">“\{preview\}”<\/p> : null/);
  const hook = read('lib', 'notifications', 'messagePreviews.ts');
  assert.match(hook, /`\/api\/chat\/message-previews\?ids=\$\{batch\.map\(encodeURIComponent\)\.join\(','\)\}`/);
  assert.doesNotMatch(hook, /localStorage|indexedDB|setInbox/, 'previews are never stored');
});
