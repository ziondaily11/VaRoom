const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadTs } = require('./helpers/loadTs');

const root = path.join(__dirname, '..');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');
const source = read('pages', 'chats.tsx');
const thread = loadTs(path.join(root, 'lib', 'chat', 'thread.ts'));
const inbox = loadTs(path.join(root, 'lib', 'chat', 'inbox.ts'));
const { loadChats, render } = require('./helpers/chatsPage');

test('typing indicators: announced at most every 2.5 s over the chat channel, shown 4 s, both only with the setting on', () => {
  assert.equal(thread.TYPING_SEND_INTERVAL, 2500);
  assert.equal(thread.TYPING_SHOW_MS, 4000);
  const due = (overrides) => thread.shouldAnnounceTyping({ isElie: false, hasChannel: true, typingOn: true, lastSent: 10000, now: 12500, ...overrides });
  assert.equal(due(), true);
  assert.equal(due({ now: 12499 }), false, 'at most every 2.5 s');
  assert.equal(due({ typingOn: false }), false, 'setting off: not announced');
  assert.equal(due({ isElie: true }), false);
  assert.equal(due({ hasChannel: false }), false);
  assert.equal(thread.showsTypingFrom({ user_id: 'u2' }, 'u1', true), true);
  assert.equal(thread.showsTypingFrom({ user_id: 'u2' }, 'u1', false), false, 'setting off: not shown');
  assert.equal(thread.showsTypingFrom({ user_id: 'u1' }, 'u1', true), false, 'never our own');
  assert.equal(thread.showsTypingFrom(undefined, 'u1', true), false);
  assert.equal(thread.endsTyping({ sender_id: 'u2' }, 'u1'), true, 'their message ends "typing…"');
  assert.equal(thread.endsTyping({ sender_id: 'u1' }, 'u1'), false);
  assert.equal(thread.endsTyping(undefined, 'u1'), false);
  assert.equal(thread.typingEnabled(null), true, 'on until the account\'s settings load');
  assert.equal(thread.typingEnabled({ typingIndicators: false }), false);
  assert.equal(thread.headerStatus({ isElie: false, activeId: 'c1', typingIn: 'c1', presenceKnownId: 'c1', online: true }), 'typing…');
  // Sent over the conversation's channel, from the desktop editor and the phone textarea.
  assert.match(source, /void channel\.send\(\{ type: 'broadcast', event: 'typing', payload: \{ user_id: userIdRef\.current \} \}\);/);
  assert.match(source, /if \(!showsTypingFrom\(payload, currentUserId, typingOnRef\.current\)\) return;\s*showTyping\(id\);/);
  assert.match(source, /typingTimerRef\.current = window\.setTimeout\(\(\) => setTypingInConversation\(null\), TYPING_SHOW_MS\);/);
  assert.equal((source.match(/announceTyping\(\);/g) || []).length, 2, 'desktop editor and phone textarea');
});

test('archived chats: hidden from the inbox, listed under Archived, archived from the info panel, opened from Chat Settings', () => {
  const chats = [
    { id: 'a', participant: { full_name: 'Amina Otieno', username: 'amina' }, lastMessage: { body: 'Is the <b>flat</b> free?' } },
    { id: 'b', archived: true, participant: { full_name: 'Brian' } },
    { id: 'c', participant: { username: 'chris' } },
  ];
  assert.deepEqual(inbox.filterInbox(chats, 'all', '').map((c) => c.id), ['a', 'c']);
  assert.deepEqual(inbox.filterInbox(chats, 'archived', '').map((c) => c.id), ['b']);
  assert.deepEqual(inbox.filterInbox(chats, 'all', 'AMINA').map((c) => c.id), ['a'], 'by name');
  assert.deepEqual(inbox.filterInbox(chats, 'all', 'chr').map((c) => c.id), ['c'], 'by username');
  assert.deepEqual(inbox.filterInbox(chats, 'all', 'flat free').map((c) => c.id), ['a'], 'by the preview text');
  assert.deepEqual(inbox.filterInbox(chats, 'all', '   ').map((c) => c.id), ['a', 'c']);
  assert.deepEqual(inbox.filterInbox(chats, 'archived', 'amina'), [], 'search stays in the view');
  assert.match(source, /\{inboxView === 'archived' && !searchQuery\.trim\(\) \? 'No archived chats' : 'No messages found'\}/);
  assert.match(source, /updateInboxConversation\(userId, id, \{ archived: value \}\)/, 'the cached inbox follows');
  assert.match(source, /if \(routerQueryArchived\) setInboxView\('archived'\);/);
  const { default: ConversationInfo } = loadChats('components/chat/ConversationInfo.tsx');
  const panel = (archived) => render(ConversationInfo, { conversation: { id: 'c1', participant: { full_name: 'Amina' } }, avatar: null, online: null, messages: [], api: async () => ({}), onOpenImage() {}, onOpenFile() {}, archived, onArchive() {}, onReport() {}, onBlock() {} });
  assert.match(panel(false), /<use href="#i-archive"><\/use><\/svg> Archive chat<\/button>/);
  assert.match(panel(true), /Unarchive chat/);
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
