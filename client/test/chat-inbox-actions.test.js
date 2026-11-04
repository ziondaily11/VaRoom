const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'pages', 'chats.tsx'), 'utf8');

test('inbox chats open a menu: right-click on desktop, 500 ms long-press on phones', () => {
  assert.match(source, /onContextMenu=\{\(e\) => onInboxContextMenu\(e, c\)\}\s*onTouchStart=\{\(e\) => onInboxTouchStart\(e, c\)\}/);
  assert.match(source, /if \(window\.matchMedia\('\(max-width: 760px\)'\)\.matches\) return;\s*setInboxMenu\(\{ conversation, x: event\.clientX, y: event\.clientY \}\);/);
  assert.match(source, /inboxPressOpenedRef\.current = true;\s*setInboxMenu\(\{ conversation, x: press\.x, y: press\.y \}\);\s*\}, 500\);/);
  assert.match(source, /if \(inboxPressOpenedRef\.current\) \{ inboxPressOpenedRef\.current = false; return; \}/, 'the tap ending a long-press does not open the chat');
});

test('the menu offers Archive or Unarchive and Delete chat', () => {
  assert.match(source, /inboxMenu\.conversation\.archived\s*\? \{ action: 'unarchive' as const, icon: 'i-archive', label: 'Unarchive chat' \}\s*: \{ action: 'archive' as const, icon: 'i-archive', label: 'Archive chat' \}/);
  assert.match(source, /\{ action: 'delete' as const, icon: 'i-trash', label: 'Delete chat' \}/);
  assert.match(source, /if \(action === 'delete'\) void deleteChat\(conversation\);\s*else void setConversationArchived\(conversation\.id, action === 'archive'\);/);
});

test('Delete chat confirms, clears the caches, closes the open chat and is undone if the server refuses', () => {
  assert.match(source, /window\.confirm\(`Delete your chat with \$\{name\}\? Its messages will be cleared for you\. \$\{name\} keeps their copy\.`\)/);
  assert.match(source, /\/api\/chat\/conversations\/\$\{encodeURIComponent\(conversation\.id\)\}\/delete`, \{ method: 'POST', body: '\{\}' \}/);
  assert.match(source, /if \(activeIdRef\.current && cleared\.includes\(activeIdRef\.current\)\) closeConversation\(\);/);
  assert.match(source, /cleared\.forEach\(\(id\) => \{ setMessages\(userId, id, \[\]\)\.catch\(\(\) => \{\}\); \}\);/);
  assert.match(source, /setInbox\(userId, inbox\.filter\(\(c\) => !cleared\.includes\(c\.id\)\)\)/);
  assert.match(source, /setConversations\(previous\);\s*showStatusNote\('Chat not deleted\. Please try again\.', 3500\);/);
});
