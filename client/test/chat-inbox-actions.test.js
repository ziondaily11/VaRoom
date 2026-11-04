const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'pages', 'chats.tsx'), 'utf8');
const css = fs.readFileSync(path.join(root, 'public', 'js', 'chats.css'), 'utf8');

test('inbox chats open a menu: right-click on desktop, 500 ms long-press on phones', () => {
  assert.match(source, /onContextMenu=\{\(e\) => onInboxContextMenu\(e, c\)\}\s*onTouchStart=\{\(e\) => onInboxTouchStart\(e, c\)\}/);
  assert.match(source, /if \(window\.matchMedia\('\(max-width: 760px\)'\)\.matches\) return;\s*setInboxMenu\(\{ conversation, x: event\.clientX, y: event\.clientY \}\);/);
  assert.match(source, /inboxPressOpenedRef\.current = true;\s*setInboxMenu\(\{ conversation, x: press\.x, y: press\.y \}\);\s*\}, 500\);/);
  assert.match(source, /if \(inboxPressOpenedRef\.current\) \{ inboxPressOpenedRef\.current = false; return; \}/, 'the tap ending a long-press does not open the chat');
});

test('the menu offers Archive or Unarchive, Delete chat and Select chats', () => {
  assert.match(source, /inboxMenu\.conversation\.archived\s*\? \{ action: 'unarchive' as const, icon: 'i-archive', label: 'Unarchive chat' \}\s*: \{ action: 'archive' as const, icon: 'i-archive', label: 'Archive chat' \}/);
  assert.match(source, /\{ action: 'delete' as const, icon: 'i-trash', label: 'Delete chat' \}/);
  assert.match(source, /\{ action: 'select' as const, icon: 'i-check', label: 'Select chats' \}/);
  assert.match(source, /if \(action === 'select'\) setSelectedChats\(new Set\(\[conversation\.id\]\)\);\s*else if \(action === 'delete'\) void deleteChats\(\[conversation\]\);\s*else void setConversationArchived\(conversation\.id, action === 'archive'\);/);
});

test('selection mode: tapping ticks chats, the bar archives (or unarchives) or deletes them together, Escape or Cancel leaves', () => {
  assert.match(source, /if \(selectedChats\) \{ toggleChatSelection\(c\.id\); return; \}/);
  assert.match(source, /return next\.size \? next : null;/, 'unticking the last chat leaves selection mode');
  assert.match(source, /role=\{selectedChats \? 'checkbox' : 'button'\}\s*aria-checked=\{selectedChats \? isSelected : undefined\}/);
  assert.match(source, /<span className="inbox-select-count" aria-live="polite">\{selectedChats\.size\} selected<\/span>/);
  assert.match(source, /void archiveChats\(ids, inboxView !== 'archived'\);/);
  assert.match(source, /const chats = selectedConversations; setSelectedChats\(null\); void deleteChats\(chats\);/);
  assert.match(source, /if \(event\.key === 'Escape'\) setSelectedChats\(null\);/);
  assert.match(source, /useEffect\(\(\) => \{ setSelectedChats\(null\); \}, \[inboxView, userId\]\);/);
});

test('Delete chat confirms once (one chat or many), clears the caches, closes the open chat; refused chats come back', () => {
  assert.match(source, /`Delete your chat with \$\{nameOf\(chats\[0\]\)\}\? Its messages will be cleared for you\. \$\{nameOf\(chats\[0\]\)\} keeps their copy\.`/);
  assert.match(source, /`Delete \$\{chats\.length\} chats\? Their messages will be cleared for you\. The other people keep their copies\.`/);
  assert.match(source, /\/api\/chat\/conversations\/\$\{encodeURIComponent\(c\.id\)\}\/delete`, \{ method: 'POST', body: '\{\}' \}/);
  assert.match(source, /if \(activeIdRef\.current && cleared\.includes\(activeIdRef\.current\)\) closeConversation\(\);/);
  assert.match(source, /cleared\.forEach\(\(id\) => \{ setMessages\(userId, id, \[\]\)\.catch\(\(\) => \{\}\); \}\);/);
  assert.match(source, /setInbox\(userId, inbox\.filter\(\(c\) => !cleared\.includes\(c\.id\)\)\)/);
  assert.match(source, /\.\.\.failed\.filter\(\(f\) => !prev\.some\(\(c\) => c\.id === f\.id\)\)/);
});

test('archiving many at once: any the server refuses go back', () => {
  assert.match(source, /const results = await Promise\.allSettled\(conversationIds\.map\(\(id\) => \(/);
  assert.match(source, /apply\(failed, !archived\);/);
  assert.match(source, /const setConversationArchived = \(conversationId: string, archived: boolean\) => archiveChats\(\[conversationId\], archived\);/);
});

test('the Archived row comes first, always, with its icon level with the label and the count once a chat is archived', () => {
  const archivedRow = source.indexOf('className="contact-item archived-entry"');
  const elieRow = source.indexOf('{/* Elie Assistant Permanent Row */}');
  assert.ok(archivedRow > 0 && archivedRow < elieRow, 'before Elie');
  assert.doesNotMatch(source, /\{archivedCount > 0 && \(\s*<li className="contact-item archived-entry"/, 'shown even with none archived');
  assert.match(source, /\{archivedCount > 0 && <div className="contact-time">\{archivedCount\}<\/div>\}/);
  assert.match(css, /\.contact-item\.archived-entry,\s*\.contact-item\.archived-header\{ align-items:center; \}/);
});
