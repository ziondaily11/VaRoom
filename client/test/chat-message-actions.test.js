const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadTs } = require('./helpers/loadTs');

const root = path.join(__dirname, '..');
const { messageActionItems, messageCopyText, messageSummary, pastedImage, photoCaption } = loadTs(path.join(root, 'lib', 'chat', 'messageActions.ts'));
const { messagePlainText } = loadTs(path.join(root, 'lib', 'chat', 'messageBody.ts'));
const source = fs.readFileSync(path.join(root, 'pages', 'chats.tsx'), 'utf8');

const labels = (items) => items.map((item) => item.label);

test('menu items follow legacy: Reply, Copy, Pin/Unpin, Delete for me; Delete for everyone for the sender only', () => {
  assert.deepEqual(labels(messageActionItems({ pinned: false, ownMessage: false })), ['Reply', 'Copy', 'Pin message', 'Delete for me']);
  assert.deepEqual(labels(messageActionItems({ pinned: true, ownMessage: true })), ['Reply', 'Copy', 'Unpin message', 'Delete for me', 'Delete for everyone']);
  assert.deepEqual(messageActionItems({ pinned: false, ownMessage: true }).map((item) => item.action), ['reply', 'copy', 'pin', 'delete_for_me', 'delete_for_everyone']);
  assert.deepEqual(labels(messageActionItems({ pinned: false, ownMessage: true, canCopy: false })), ['Reply', 'Pin message', 'Delete for me', 'Delete for everyone'], 'no Copy without text');
});

test('Copy takes a text message or a photo caption; nothing for listings, files, voice or a photo sent without a caption', () => {
  const photo = { id: 'a1', kind: 'photo', original_filename: 'IMG_1.jpg' };
  assert.equal(messageCopyText({ message_type: 'text', body: '<b>Hi</b>' }), 'Hi');
  assert.equal(messageCopyText({ body: 'Legacy row' }), 'Legacy row');
  assert.equal(messageCopyText({ message_type: 'photo', body: 'Nice view', attachment: photo }), 'Nice view');
  assert.equal(messageCopyText({ message_type: 'photo', body: 'IMG_1.jpg', attachment: photo }), '', 'the file name is not a caption');
  assert.equal(photoCaption({ message_type: 'photo', body: 'IMG_1.jpg', attachment: photo }), '');
  for (const type of ['listing', 'file', 'voice']) assert.equal(messageCopyText({ message_type: type, body: 'x' }), '', type);
});

test('reply quotes and the pin banner sum up every kind of message', () => {
  const photo = { id: 'a1', kind: 'photo', original_filename: 'IMG_1.jpg' };
  assert.deepEqual({ ...messageSummary({ message_type: 'photo', body: 'IMG_1.jpg', attachment: photo }) }, { text: 'Photo', photoAttachmentId: 'a1' });
  assert.deepEqual({ ...messageSummary({ message_type: 'photo', body: 'The kitchen', attachment: photo }) }, { text: 'The kitchen', photoAttachmentId: 'a1' });
  assert.equal(messageSummary({ message_type: 'listing', body: '', listing: { id: 'l1', title: 'Garden flat' } }).text, 'Listing: Garden flat');
  assert.equal(messageSummary({ message_type: 'listing', body: '' }).text, 'Listing');
  assert.equal(messageSummary({ message_type: 'file', body: 'lease.pdf', attachment: { id: 'f1', kind: 'file', original_filename: 'lease.pdf' } }).text, 'File: lease.pdf');
  assert.equal(messageSummary({ message_type: 'voice', body: '' }).text, 'Voice message');
  assert.equal(messageSummary({ message_type: 'text', body: 'Hello' }).text, 'Hello');
  assert.equal(messageSummary({ message_type: 'photo', deleted_at: 't', attachment: photo }).text, 'This message is unavailable');
  assert.equal(messageSummary(null).text, 'This message is unavailable');
});

test('a pasted screenshot or copied image is picked up; a paste with text stays text', () => {
  const image = { name: 'image.png', type: 'image/png' };
  const clip = ({ text = '', files = [], items } = {}) => ({ getData: (type) => (type === 'text/plain' ? text : ''), files, items });
  assert.equal(pastedImage(clip({ files: [image] })), image);
  assert.equal(pastedImage(clip({ files: [], items: [{ kind: 'string', type: 'text/html', getAsFile: () => null }, { kind: 'file', type: 'image/jpeg', getAsFile: () => image }] })), image);
  assert.equal(pastedImage(clip({ text: 'Quarterly report', files: [image] })), null, 'office apps add a picture of copied text');
  assert.equal(pastedImage(clip({ files: [{ name: 'a.pdf', type: 'application/pdf' }] })), null);
  assert.equal(pastedImage(null), null);
  assert.match(source, /const image = pastedImage\(event\.clipboardData\);\s*if \(!image\) return;\s*event\.preventDefault\(\);\s*setPendingPreviewFile\(image\);/);
  assert.match(source, /if \(isElie \|\| !activeId\) return;/);
  assert.equal((source.match(/onPaste=\{onComposerPaste\}/g) || []).length, 2, 'desktop editor and phone textarea');
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

test('actions apply to every kind of message in person-to-person chats', () => {
  assert.match(source, /!isElie\s*&& m\.message_type !== 'system'\s*&& !m\.deleted_at\s*&& !\(m as OptimisticChatMessage\)\._optimistic/);
  assert.match(source, /canCopy: Boolean\(messageCopyText\(messageMenu\.message\)\)/);
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
  assert.match(source, /const summary = messageSummary\(original\);/);
  assert.match(source, /\{summary\.photoAttachmentId && <ReplyThumb attachmentId=\{summary\.photoAttachmentId\} api=\{api\} \/>\}/);
  assert.match(source, /onClick=\{\(\) => scrollToMessage\(m\.reply_to_message_id as string\)\}/);
  assert.match(source, /'Replying to you' : 'Replying to message'/);
  assert.equal((source.match(/if \(e\.key === 'Escape' && replyTo\) \{\s*setReplyTo\(null\);/g) || []).length, 2);
  assert.match(source, /highlightedMessageId === m\.id \? 'reply-target-highlight' : ''/);
});

test('pinned banner and deleted messages match legacy', () => {
  assert.match(source, /\{messageSummary\(pinnedMessage\)\.text \|\| 'Message'\}/);
  assert.match(source, /\{isDeleted \? \(\s*\/\* Deleted message, any type/);
});

test('copy confirms with a status note', () => {
  assert.match(source, /showStatusNote\(copied \? 'Copied' : 'Unable to copy'\)/);
  assert.match(source, /className="chat-status-note" role="status" aria-live="polite"/);
  const css = fs.readFileSync(path.join(root, 'public', 'js', 'chats.css'), 'utf8');
  assert.match(css, /\.chat-status-note\{/);
  assert.match(source, /<symbol id="i-copy"/);
});
