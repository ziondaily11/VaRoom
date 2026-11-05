'use strict';

// Inbox actions (lib/chat/inbox): the chat menu, selection mode, archiving
// and Delete chat. The press handlers stay in the page (they hold timers in
// refs); their wiring keeps a minimal source check.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadTs } = require('./helpers/loadTs');
const { renderChatsPage } = require('./helpers/chatsPage');

const root = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'pages', 'chats.tsx'), 'utf8');
const css = fs.readFileSync(path.join(root, 'public', 'js', 'chats.css'), 'utf8');
const inbox = loadTs(path.join(root, 'lib', 'chat', 'inbox.ts'));
const thread = loadTs(path.join(root, 'lib', 'chat', 'thread.ts'));

const chat = (id, extra = {}) => ({ id, participant: { full_name: `Person ${id}` }, ...extra });

test('inbox chats open a menu: right-click on desktop, 500 ms long-press on phones', () => {
  assert.equal(thread.LONG_PRESS_MS, 500);
  assert.match(source, /onContextMenu=\{\(e\) => onInboxContextMenu\(e, c\)\}\s*onTouchStart=\{\(e\) => onInboxTouchStart\(e, c\)\}/);
  assert.match(source, /if \(window\.matchMedia\('\(max-width: 760px\)'\)\.matches\) return;\s*setInboxMenu\(\{ conversation, x: event\.clientX, y: event\.clientY \}\);/);
  assert.match(source, /inboxPressOpenedRef\.current = true;\s*setInboxMenu\(\{ conversation, x: press\.x, y: press\.y \}\);\s*\}, LONG_PRESS_MS\);/);
  assert.match(source, /if \(inboxPressOpenedRef\.current\) \{ inboxPressOpenedRef\.current = false; return; \}/, 'the tap ending a long-press does not open the chat');
});

test('the menu offers Archive or Unarchive, Delete chat and Select chats', () => {
  assert.deepEqual(inbox.inboxMenuItems(false).map((i) => [i.action, i.icon, i.label]), [
    ['archive', 'i-archive', 'Archive chat'], ['delete', 'i-trash', 'Delete chat'], ['select', 'i-check', 'Select chats'],
  ]);
  assert.deepEqual(inbox.inboxMenuItems(true).map((i) => i.label), ['Unarchive chat', 'Delete chat', 'Select chats']);
  assert.match(source, /if \(action === 'select'\) setSelectedChats\(new Set\(\[conversation\.id\]\)\);\s*else if \(action === 'delete'\) void deleteChats\(\[conversation\]\);\s*else void setConversationArchived\(conversation\.id, action === 'archive'\);/);
});

test('selection mode: tapping ticks chats; unticking the last leaves; Escape, Cancel, another view or account leave too', () => {
  const one = inbox.toggleSelection(null, 'a');
  assert.deepEqual([...one], ['a']);
  const two = inbox.toggleSelection(one, 'b');
  assert.deepEqual([...two], ['a', 'b']);
  assert.notEqual(two, one, 'a new set (re-render)');
  assert.deepEqual([...inbox.toggleSelection(two, 'a')], ['b']);
  assert.equal(inbox.toggleSelection(new Set(['b']), 'b'), null, 'selection mode ends');
  assert.match(source, /if \(selectedChats\) \{ toggleChatSelection\(c\.id\); return; \}/);
  assert.match(source, /role=\{selectedChats \? 'checkbox' : 'button'\}\s*aria-checked=\{selectedChats \? isSelected : undefined\}/);
  assert.match(source, /<span className="inbox-select-count" aria-live="polite">\{selectedChats\.size\} selected<\/span>/);
  assert.match(source, /void archiveChats\(ids, inboxView !== 'archived'\);/);
  assert.match(source, /const chats = selectedConversations; setSelectedChats\(null\); void deleteChats\(chats\);/);
  assert.match(source, /if \(event\.key === 'Escape'\) setSelectedChats\(null\);/);
  assert.match(source, /useEffect\(\(\) => \{ setSelectedChats\(null\); \}, \[inboxView, userId\]\);/);
});

test('Delete chat confirms once (one chat or many), clears every conversation the server cleared; refused chats come back', async () => {
  assert.equal(inbox.deleteChatsQuestion([chat('a')]), 'Delete your chat with Person a? Its messages will be cleared for you. Person a keeps their copy.');
  assert.equal(inbox.deleteChatsQuestion([{ id: 'x', participant: { username: 'zion' } }]), 'Delete your chat with zion? Its messages will be cleared for you. zion keeps their copy.');
  assert.equal(inbox.deleteChatsQuestion([{ id: 'x' }]), 'Delete your chat with this person? Its messages will be cleared for you. this person keeps their copy.');
  assert.equal(inbox.deleteChatsQuestion([chat('a'), chat('b')]), 'Delete 2 chats? Their messages will be cleared for you. The other people keep their copies.');

  const calls = [];
  const api = async (url, init) => {
    calls.push([url, init.method, init.body]);
    if (url.includes('/b%20/')) throw new Error('refused');
    if (url.includes('/a/')) return { conversationIds: ['a', 'a-old'] };
    return {};
  };
  const result = await inbox.deleteOnServer(api, [chat('a'), chat('b '), chat('c')]);
  assert.deepEqual(calls, [
    ['/api/chat/conversations/a/delete', 'POST', '{}'],
    ['/api/chat/conversations/b%20/delete', 'POST', '{}'],
    ['/api/chat/conversations/c/delete', 'POST', '{}'],
  ], 'all at once');
  assert.deepEqual(result.cleared, ['a', 'a-old', 'c'], 'all their conversations with that person');
  assert.deepEqual(result.failed.map((c) => c.id), ['b ']);

  const now = [chat('n', { lastMessage: { created_at: '2026-11-03T10:00:00Z' } })];
  const restored = inbox.restoreChats(now, [chat('old', { created_at: '2026-10-01T00:00:00Z' }), chat('n'), chat('new', { lastMessage: { created_at: '2026-11-04T10:00:00Z' } })]);
  assert.deepEqual(restored.map((c) => c.id), ['new', 'n', 'old'], 'newest first, no duplicates');

  assert.deepEqual({ ...inbox.deleteStatusNote(1, 0) }, { text: 'Chat deleted' });
  assert.deepEqual({ ...inbox.deleteStatusNote(3, 0) }, { text: '3 chats deleted' });
  assert.deepEqual({ ...inbox.deleteStatusNote(3, 1) }, { text: 'Chat not deleted. Please try again.', ms: 3500 });
  assert.deepEqual({ ...inbox.deleteStatusNote(3, 2) }, { text: '2 chats not deleted. Please try again.', ms: 3500 });

  // The page closes the open chat and clears both caches for what the server cleared.
  assert.match(source, /if \(!window\.confirm\(deleteChatsQuestion\(chats\)\)\) return;/);
  assert.match(source, /if \(activeIdRef\.current && cleared\.includes\(activeIdRef\.current\)\) closeConversation\(\);/);
  assert.match(source, /cleared\.forEach\(\(id\) => \{ setMessages\(userId, id, \[\]\)\.catch\(\(\) => \{\}\); \}\);/);
  assert.match(source, /setInbox\(userId, inbox\.filter\(\(c\) => !cleared\.includes\(c\.id\)\)\)/);
});

test('archiving many at once: shown at once; any the server refuses go back', async () => {
  const bodies = [];
  const api = async (url, init) => { bodies.push([url, JSON.parse(init.body)]); if (url.includes('/b/')) throw new Error('no'); return {}; };
  assert.deepEqual(await inbox.archiveOnServer(api, ['a', 'b', 'c'], true), ['b']);
  assert.deepEqual(bodies[0], ['/api/chat/conversations/a/archive', { archived: true }]);
  assert.deepEqual(await inbox.archiveOnServer(async () => ({}), ['a'], false), []);
  assert.deepEqual({ ...inbox.archiveStatusNote(1, 0, true) }, { text: 'Chat archived' });
  assert.deepEqual({ ...inbox.archiveStatusNote(3, 0, false) }, { text: '3 chats unarchived' });
  assert.deepEqual({ ...inbox.archiveStatusNote(2, 1, true) }, { text: 'Chat not archived. Please try again.', ms: 3500 });
  assert.deepEqual({ ...inbox.archiveStatusNote(0, 2, false) }, { text: '2 chats not unarchived. Please try again.', ms: 3500 });
  assert.match(source, /apply\(conversationIds, archived\);\s*const failed = await archiveOnServer\(api, conversationIds, archived\);/);
  assert.match(source, /apply\(failed, !archived\);/);
  assert.match(source, /const setConversationArchived = \(conversationId: string, archived: boolean\) => archiveChats\(\[conversationId\], archived\);/);
});

test('the Archived row comes first, always, with its icon level with the label and the count once a chat is archived', () => {
  const list = renderChatsPage().html.match(/<ul class="contact-list" id="contactList">([\s\S]*?)<\/ul>/)[1];
  assert.match(list, /^<li class="contact-item archived-entry" role="button" tabindex="0"><span class="archived-icon" aria-hidden="true"><svg class="icon"><use href="#i-archive"><\/use><\/svg><\/span><div class="contact-body"><div class="contact-top"><div class="contact-name">Archived<\/div><\/div><\/div><\/li><li class="contact-item " role="button" tabindex="0"><div class="avatar-wrap"/, 'first, before Elie; no count with none archived');
  assert.match(source, /\{archivedCount > 0 && <div className="contact-time">\{archivedCount\}<\/div>\}/);
  assert.match(css, /\.contact-item\.archived-entry,\s*\.contact-item\.archived-header\{ align-items:center; \}/);
});
