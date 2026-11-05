const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadTs } = require('./helpers/loadTs');

const root = path.join(__dirname, '..');
const { messageActionItems, messageCopyText, messageSummary, pastedImage, photoCaption } = loadTs(path.join(root, 'lib', 'chat', 'messageActions.ts'));
const { messagePlainText } = loadTs(path.join(root, 'lib', 'chat', 'messageBody.ts'));
const source = fs.readFileSync(path.join(root, 'pages', 'chats.tsx'), 'utf8');
const thread = loadTs(path.join(root, 'lib', 'chat', 'thread.ts'));
const composer = () => loadTs(path.join(root, 'lib', 'chat', 'composer.ts'));
const { renderChatsPage } = require('./helpers/chatsPage');

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
  assert.match(source, /const image = pastedImage\(event\.clipboardData\);\s*if \(!image\) return;\s*event\.preventDefault\(\);\s*addPreviewImages\(\[image\]\);/);
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
  for (const type of ['text', 'photo', 'file', 'voice', 'listing', undefined]) {
    assert.equal(thread.canActOnMessage({ id: 'm', message_type: type }, false), true, String(type));
  }
  assert.equal(thread.canActOnMessage({ id: 'm', message_type: 'text' }, true), false, 'not in Elie');
  assert.equal(thread.canActOnMessage({ id: 'm', message_type: 'system' }, false), false);
  assert.equal(thread.canActOnMessage({ id: 'm', deleted_at: 't' }, false), false);
  assert.equal(thread.canActOnMessage({ id: 'optimistic-1', _optimistic: true }, false), false, 'not while uploading');
  assert.match(source, /canCopy: Boolean\(messageCopyText\(messageMenu\.message\)\)/);
  assert.match(source, /\{actionable && \(\s*<div className="msg-action-wrap"/);
});

test('right-click on desktop, 500 ms long-press with a 12 px move tolerance on touch', () => {
  const target = (insideControl) => ({ closest: (selector) => { assert.equal(selector, 'a,button,input,textarea,video,audio'); return insideControl ? {} : null; } });
  assert.equal(thread.messageContextMenu(false, target(false)), 'open');
  assert.equal(thread.messageContextMenu(false, target(true)), 'native', 'links, players and fields keep their own menu');
  assert.equal(thread.messageContextMenu(true, { closest() { throw new Error('not asked'); } }), 'suppress', 'phones use the long-press');
  assert.equal(thread.LONG_PRESS_MS, 500);
  assert.equal(thread.movedTooFar({ x: 100, y: 100 }, { clientX: 108, clientY: 108 }), false, '11.3 px');
  assert.equal(thread.movedTooFar({ x: 100, y: 100 }, { clientX: 109, clientY: 109 }), true, '12.7 px');
  assert.match(source, /openMessageMenu\(message, press\.x, press\.y\);\s*\}, LONG_PRESS_MS\);/);
  assert.match(source, /if \(movedTooFar\(press, touch\)\) cancelLongPress\(\);/);
});

test('pin, delete for me and delete for everyone (confirmed); failures are shown; the thread and cache are refreshed in full', async () => {
  const run = async ({ action = 'pin', confirmAnswer = true, fail = null, conversationId = 'c 1' } = {}) => {
    const log = [];
    await thread.runServerMessageAction({
      action,
      messageId: 'm 1',
      conversationId: () => conversationId,
      api: async (url, init) => { log.push(['api', url, JSON.parse(init.body)]); if (fail) throw fail; return {}; },
      confirm: (question) => { log.push(['confirm', question]); return confirmAnswer; },
      alert: (text) => log.push(['alert', text]),
      refresh: async (id) => { log.push(['refresh', id]); },
    });
    return log;
  };
  assert.deepEqual(await run(), [['api', '/api/chat/conversations/c%201/messages/m%201/actions', { action: 'pin' }], ['refresh', 'c 1']]);
  assert.deepEqual((await run({ action: 'delete_for_me' })).map((e) => e[0]), ['api', 'refresh'], 'no question for "for me"');
  assert.deepEqual(await run({ action: 'delete_for_everyone', confirmAnswer: false }), [['confirm', 'Delete this message for everyone? This cannot be undone.']]);
  assert.deepEqual((await run({ action: 'delete_for_everyone' })).map((e) => e[0]), ['confirm', 'api', 'refresh']);
  assert.deepEqual((await run({ fail: new Error('Only the sender can do that') })).slice(1), [['alert', 'Only the sender can do that']]);
  assert.deepEqual((await run({ fail: new Error('') })).slice(1), [['alert', 'Unable to update message']]);
  assert.deepEqual(await run({ conversationId: null }), [], 'no conversation open');
  assert.match(source, /setMessages\(currentUserId, conversationId, list\)/, 'the cache is rewritten');
  assert.doesNotMatch(source, /await syncConversationMessages\(currentUserId, conversationId/, 'a since-delta sync would miss pins and deletions');
});

test('reply quotes scroll to the original; the composer preview uses legacy text and Escape cancels', () => {
  const composer = loadTs(path.join(root, 'lib', 'chat', 'composer.ts'));
  const escape = { key: 'Escape', shiftKey: false, ctrlKey: false, metaKey: false };
  for (const editor of ['desktop', 'phone']) {
    assert.equal(composer.composerKeyAction(escape, { editor, isElie: false, replying: true, isPhone: () => true }), 'cancel-reply', editor);
  }
  assert.match(source, /const summary = messageSummary\(original\);/);
  assert.match(source, /\{summary\.photoAttachmentId && <ReplyThumb attachmentId=\{summary\.photoAttachmentId\} api=\{api\} \/>\}/);
  assert.match(source, /onClick=\{\(\) => scrollToMessage\(m\.reply_to_message_id as string\)\}/);
  assert.match(source, /'Replying to you' : 'Replying to message'/);
  assert.equal(thread.messageRowClass({ isSystem: false, isOut: true, isElieMessage: false, sameSender: false, isDeleted: false, highlighted: true }), 'msg-row out reply-target-highlight');
  assert.match(source, /highlighted: highlightedMessageId === m\.id,/);
});

test('pinned banner and deleted messages match legacy', () => {
  assert.match(source, /\{messageSummary\(pinnedMessage\)\.text \|\| 'Message'\}/);
  assert.match(source, /\{isDeleted \? \(\s*\/\* Deleted message, any type/);
});

test('copy: the Clipboard API, else a selected hidden field; confirmed with a status note', async () => {
  const written = [];
  assert.equal(await composer().copyText('Hello', { clipboard: { writeText: async (text) => { written.push(text); } }, doc: null }), true);
  assert.deepEqual(written, ['Hello']);

  const made = [];
  const doc = {
    body: { appendChild: (el) => made.push(el) },
    createElement: (tag) => ({ tag, style: {}, attributes: {}, setAttribute(k, v) { this.attributes[k] = v; }, select() { this.selected = true; }, remove() { this.removed = true; } }),
    execCommand: (command) => command === 'copy',
  };
  assert.equal(await composer().copyText('Hi', { clipboard: { writeText: async () => { throw new Error('denied'); } }, doc }), true);
  assert.deepEqual({ value: made[0].value, readonly: made[0].attributes.readonly, position: made[0].style.position, opacity: made[0].style.opacity, selected: made[0].selected, removed: made[0].removed }, { value: 'Hi', readonly: '', position: 'fixed', opacity: '0', selected: true, removed: true });
  assert.equal(await composer().copyText('Hi', { clipboard: undefined, doc: { ...doc, execCommand: () => { throw new Error('no'); } } }), false);

  assert.match(source, /showStatusNote\(copied \? 'Copied' : 'Unable to copy'\)/);
  const { html } = renderChatsPage();
  assert.match(html, /<div class="chat-status-note" role="status" aria-live="polite" hidden=""><\/div>/);
  assert.match(html, /<symbol id="i-copy"/);
  assert.match(fs.readFileSync(path.join(root, 'public', 'js', 'chats.css'), 'utf8'), /\.chat-status-note\{/);
});

test('the pinned banner opens the pinned message, by click or keyboard', () => {
  assert.match(source, /className="pinned-message"[\s\S]*?role="button"\s*tabIndex=\{0\}[\s\S]*?onClick=\{\(\) => scrollToMessage\(pinnedMessage\.id\)\}\s*onKeyDown=\{replyKeyHandler\(pinnedMessage\.id\)\}/);
});

test('"back to latest" appears above the composer once the thread is scrolled up, and returns to the newest message', () => {
  assert.equal(thread.SCROLL_LATEST_THRESHOLD, 400);
  assert.equal(thread.farFromLatest({ scrollHeight: 2000, scrollTop: 1200, clientHeight: 400 }), false, '400px up');
  assert.equal(thread.farFromLatest({ scrollHeight: 2000, scrollTop: 1199, clientHeight: 400 }), true);
  const { html } = renderChatsPage({ initialConversationId: 'c1' });
  assert.match(html, /<div class="scroll-latest-anchor"><button type="button" class="scroll-latest-btn" aria-label="Scroll to latest messages" title="Latest messages" hidden="">[\s\S]*?<\/button><\/div><div class="chat-input-area/, 'hidden at first, just before the composer');
  assert.doesNotMatch(renderChatsPage().html, /scroll-latest-anchor/, 'only with a conversation open');
  assert.match(source, /ref=\{messagesRef\}\s*onScroll=\{onMessagesScroll\}/);
  assert.match(source, /hidden=\{!showScrollLatest\}\s*onClick=\{\(\) => scrollToBottom\(true\)\}/);
  assert.match(source, /useEffect\(\(\) => \{ setShowScrollLatest\(false\); \}, \[activeId\]\);/);
});
