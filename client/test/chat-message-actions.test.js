const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadTs } = require('./helpers/loadTs');

const root = path.join(__dirname, '..');
const { messageActionItems } = loadTs(path.join(root, 'lib', 'chat', 'messageActions.ts'));
const { messagePlainText } = loadTs(path.join(root, 'lib', 'chat', 'messageBody.ts'));
const source = fs.readFileSync(path.join(root, 'pages', 'chats.tsx'), 'utf8');

const labels = (items) => items.map((item) => item.label);

test('menu items follow legacy: Reply, Copy, Pin/Unpin, Delete for me; Delete for everyone for the sender only', () => {
  assert.deepEqual(labels(messageActionItems({ pinned: false, ownMessage: false })), ['Reply', 'Copy', 'Pin message', 'Delete for me']);
  assert.deepEqual(labels(messageActionItems({ pinned: true, ownMessage: true })), ['Reply', 'Copy', 'Unpin message', 'Delete for me', 'Delete for everyone']);
  assert.deepEqual(messageActionItems({ pinned: false, ownMessage: true }).map((item) => item.action), ['reply', 'copy', 'pin', 'delete_for_me', 'delete_for_everyone']);
});

test('copied and quoted text is plain text with line breaks, like the legacy previewText', () => {
  assert.equal(messagePlainText('<b>Hello</b> there<br>Line 2'), 'Hello there\nLine 2');
  assert.equal(messagePlainText('<div>First</div><div>Second</div>'), 'First\nSecond');
  assert.equal(messagePlainText('<ul><li>One</li><li>Two</li></ul>'), 'One\nTwo');
  assert.equal(messagePlainText('a&nbsp;&amp;&nbsp;b'), 'a & b');
  assert.equal(messagePlainText('plain <3 text'), 'plain <3 text');
  assert.equal(messagePlainText('<p>a</p><p></p><p></p><p>b</p>'), 'a\n\nb');
  assert.equal(messagePlainText(null), '');
});

test('actions apply to text messages in person-to-person chats only', () => {
  assert.match(source, /!isElie\s*&& m\.message_type === 'text'\s*&& !m\.deleted_at\s*&& !\(m as OptimisticChatMessage\)\._optimistic/);
  assert.match(source, /\{actionable && \(\s*<div className="msg-action-wrap"/);
});

test('right-click on desktop, 500 ms long-press with a 12 px move tolerance on touch', () => {
  assert.match(source, /if \(window\.matchMedia\('\(max-width: 760px\)'\)\.matches\) \{\s*event\.preventDefault\(\);\s*return;\s*\}/);
  assert.match(source, /closest\('a,button,input,textarea,video,audio'\)/);
  assert.match(source, /openMessageMenu\(message, press\.x, press\.y\);\s*\}, 500\);/);
  assert.match(source, /Math\.hypot\(touch\.clientX - press\.x, touch\.clientY - press\.y\) > 12/);
});

test('delete for everyone confirms; failures are shown; the thread and cache are refreshed in full', () => {
  assert.match(source, /window\.confirm\('Delete this message for everyone\? This cannot be undone\.'\)/);
  assert.match(source, /window\.alert\(\(err instanceof Error && err\.message\) \|\| 'Unable to update message'\)/);
  assert.match(source, /setMessages\(currentUserId, conversationId, list\)/);
  assert.doesNotMatch(source, /await syncConversationMessages\(currentUserId, conversationId/, 'a since-delta sync would miss pins and deletions');
});

test('reply quotes scroll to the original; the composer preview uses legacy text and Escape cancels', () => {
  assert.match(source, /'This message is unavailable'/);
  assert.match(source, /onClick=\{\(\) => scrollToMessage\(m\.reply_to_message_id as string\)\}/);
  assert.match(source, /'Replying to you' : 'Replying to message'/);
  assert.equal((source.match(/if \(e\.key === 'Escape' && replyTo\) \{\s*setReplyTo\(null\);/g) || []).length, 2);
  assert.match(source, /highlightedMessageId === m\.id \? 'reply-target-highlight' : ''/);
});

test('pinned banner and deleted messages match legacy', () => {
  assert.match(source, /\{messagePlainText\(pinnedMessage\.body\) \|\| 'Message'\}/);
  assert.match(source, /\{isDeleted \? \(\s*\/\* Deleted message, any type/);
});

test('copy confirms with a status note', () => {
  assert.match(source, /showCopyNote\(copied \? 'Copied' : 'Unable to copy'\)/);
  assert.match(source, /className="chat-copy-note" role="status" aria-live="polite"/);
  const css = fs.readFileSync(path.join(root, 'public', 'js', 'chats.css'), 'utf8');
  assert.match(css, /\.chat-copy-note\{/);
  assert.match(source, /<symbol id="i-copy"/);
});
