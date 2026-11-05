'use strict';

// The Chats composer: sending (lib/chat/composer), files and photos, the
// share-listing sheet, the keyboard rules and the phone viewport
// (lib/chat/chatViewport).

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadTs } = require('./helpers/loadTs');
const { loadChats, renderChatsPage, render, section } = require('./helpers/chatsPage');

const root = path.join(__dirname, '..');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');
const composer = loadTs(path.join(root, 'lib', 'chat', 'composer.ts'));
const viewport = loadTs(path.join(root, 'lib', 'chat', 'chatViewport.ts'));
const sheets = loadTs(path.join(root, 'lib', 'chat', 'sheets.ts'));

function recordingApi(respond = () => ({})) {
  const calls = [];
  const api = async (url, init = {}) => {
    calls.push({ url, method: init.method || 'GET', body: init.body ? JSON.parse(init.body) : undefined });
    return respond(url, init);
  };
  return { api, calls };
}

const send = (input, deps) => composer.sendComposerMessage({ conversationId: 'c 1', content: 'Hi', plainText: 'Hi', reply: null, listingId: undefined, file: null, ...input }, {
  lock: { current: false }, uploadFile() {}, onAccepted() {}, ...deps,
});

test('sending: one at a time; the composer clears only after the server accepts', async () => {
  const events = [];
  let resolve;
  const api = (url, init) => { events.push(['request', url, JSON.parse(init.body)]); return new Promise((r) => { resolve = r; }); };
  const lock = { current: false };
  const first = send({}, { api, lock, onAccepted: () => events.push(['accepted']) });
  assert.equal(lock.current, true);
  assert.equal(await send({}, { api, lock }), null, 'a second send while one runs does nothing');
  assert.deepEqual(events, [['request', '/api/chat/conversations/c%201/messages', { content: 'Hi', messageType: 'text' }]], 'not cleared yet');
  resolve({ message: { id: 'm1' } });
  assert.deepEqual((await first).map((m) => m.id), ['m1']);
  assert.deepEqual(events.slice(1), [['accepted']]);
  assert.equal(lock.current, false);

  const failing = { current: false };
  let accepted = false;
  await assert.rejects(send({}, { api: async () => { throw new Error('offline'); }, lock: failing, onAccepted: () => { accepted = true; } }), /offline/);
  assert.equal(accepted, false, 'a failed send keeps the text');
  assert.equal(failing.current, false, 'and allows another try');
  assert.match(read('pages', 'chats.tsx'), /showStatusNote\('Message not sent\. Please try again\.', 3500\)/);
});

test('a text message carries the reply and the listing asked about; a sent reply shows its quote at once', async () => {
  const reply = { id: 'r1', sender_id: 'u2', body: 'Is it free?', deleted_at: null, message_type: 'text', attachment: null, listing: null, created_at: 't', conversation_id: 'c' };
  const { api, calls } = recordingApi(() => ({ message: { id: 'm2', reply_to_message_id: 'r1' } }));
  const sent = await send({ reply, listingId: 'l9' }, { api });
  assert.deepEqual(calls[0].body, { content: 'Hi', messageType: 'text', replyToMessageId: 'r1', listingId: 'l9' });
  assert.deepEqual({ ...sent[0].reply_to_message }, { id: 'r1', sender_id: 'u2', body: 'Is it free?', deleted_at: null, message_type: 'text', attachment: null, listing: null });
  const several = recordingApi(() => ({ messages: [{ id: 'a' }, { id: 'b' }] }));
  assert.deepEqual((await send({}, { api: several.api })).map((m) => m.id), ['a', 'b']);
});

test('@reply alone runs the chatbot command; as a reply it is ordinary text', async () => {
  const { api, calls } = recordingApi(() => ({ messages: [{ id: 'bot' }] }));
  await send({ content: '@Reply', plainText: '@Reply' }, { api });
  assert.deepEqual(calls[0], { url: '/api/chat/conversations/c%201/reply', method: 'POST', body: { command: '@reply' } });
  await send({ content: '@reply', plainText: '@reply', reply: { id: 'r1' } }, { api });
  assert.equal(calls[1].url, '/api/chat/conversations/c%201/messages');
});

test('a file waiting on a phone goes with the send: its caption is the text, or its name', async () => {
  const file = { name: 'lease.pdf', type: 'application/pdf', size: 10 };
  const uploads = [];
  const { api, calls } = recordingApi();
  let accepted = 0;
  assert.deepEqual(await send({ file, content: '<b>Signed</b>', plainText: 'Signed' }, { api, uploadFile: (f, caption) => uploads.push([f.name, caption]), onAccepted: () => { accepted += 1; } }), []);
  await send({ file, content: '', plainText: '' }, { api, uploadFile: (f, caption) => uploads.push([f.name, caption]) });
  assert.deepEqual(uploads, [['lease.pdf', '<b>Signed</b>'], ['lease.pdf', 'lease.pdf']]);
  assert.equal(calls.length, 0, 'the upload sends it (no text message)');
  assert.equal(accepted, 1, 'the composer clears');
});

test('after a send the desktop editor is emptied and formatting turned off (legacy)', () => {
  const on = new Set(['bold', 'insertOrderedList']);
  const executed = [];
  composer.clearActiveFormatting({ queryCommandState: (c) => on.has(c), execCommand: (c, ui) => { executed.push([c, ui]); return true; } });
  assert.deepEqual(executed, [['bold', false], ['insertOrderedList', false]]);
  assert.deepEqual(composer.FORMAT_COMMANDS, ['bold', 'italic', 'underline', 'insertUnorderedList', 'insertOrderedList']);
});

test('role gating: clients share photos only; hosts also files and listings', () => {
  const Actions = loadChats('components/ChatComposerActions.tsx').default;
  const props = { isElie: false, canSend: true, onSend() {}, onPhotoClick() {}, onFileClick() {}, onMobileAttach() {}, onShareListing() {} };
  const client = render(Actions, { ...props, role: 'client' });
  const host = render(Actions, { ...props, role: 'host' });
  assert.match(client, /class="share-file" type="button" hidden=""/);
  assert.match(client, /title="Share listing" aria-label="Share listing" role="menuitem" hidden=""/);
  assert.match(client, /aria-label="Add photos"/);
  assert.doesNotMatch(host, /hidden=""/);
  assert.match(host, /aria-label="Attach photos, files or a listing"/);
  assert.match(host, /class="send-message" type="button" title="Send message" aria-label="Send message" aria-disabled="false"/);
  assert.doesNotMatch(read('components', 'ChatComposerActions.tsx'), /aria-disabled="true"/, 'enabled by canSend');

  // The page's phone menu (signed-in client before the account loads).
  const menu = section(renderChatsPage({ initialConversationId: 'c1' }).html, '<div class="mobile-attach-menu"', '</div>');
  assert.match(menu, /role="menuitem" hidden="" data-attach="files"/);
  assert.match(menu, /role="menuitem" hidden="" data-attach="listing"/);
  assert.doesNotMatch(menu, /Photos<\/button>[^<]*hidden/);
  assert.equal(composer.fileDestination({ name: 'a.pdf', type: 'application/pdf' }, false, () => false), 'ignore', 'clients never send files');
  assert.doesNotMatch(read('pages', 'chats.tsx'), /Listing sharing coming soon/);
});

test('files: images go to the photo preview, phones hold other files for the send button, desktop uploads at once', () => {
  let asked = 0;
  const phone = () => { asked += 1; return true; };
  assert.equal(composer.fileDestination({ name: 'IMG.HEIC', type: '' }, true, phone), 'preview');
  assert.equal(asked, 0);
  assert.equal(composer.fileDestination({ name: 'lease.pdf', type: 'application/pdf' }, true, phone), 'hold');
  assert.equal(composer.fileDestination({ name: 'lease.pdf', type: 'application/pdf' }, true, () => false), 'upload');
  assert.equal(composer.pendingFileLabel({ name: 'lease.pdf' }, false), 'File: lease.pdf');
  assert.equal(composer.pendingFileLabel({ name: 'lease.pdf' }, true), '');
  assert.equal(composer.pendingFileLabel(null, false), '');
  const inputs = renderChatsPage({ initialConversationId: 'c1' }).html.match(/<input type="file"[^>]*>/g);
  assert.deepEqual(inputs, ['<input type="file" accept="image/*" multiple="" style="display:none"/>', '<input type="file" style="display:none"/>'], 'any file type, as legacy');
});

test('mime types: the browser\'s, else from the extension', () => {
  assert.equal(composer.inferMimeType({ name: 'a.bin', type: 'image/png' }), 'image/png');
  assert.equal(composer.inferMimeType({ name: 'Report.DOCX', type: '' }), 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  assert.equal(composer.inferMimeType({ name: 'photo.heic', type: 'application/octet-stream' }), 'image/heic');
  assert.equal(composer.inferMimeType({ name: 'noext', type: '' }), 'application/octet-stream');
});

test('share-listing sheet: account-scoped listings, multi-select, one message per listing, stays open on failure', async () => {
  const fresh = () => loadTs(path.join(root, 'lib', 'chat', 'sheets.ts'));
  const listings = fresh();
  const urls = [];
  const api = async (url) => { urls.push(url); return { listings: [{ id: 'l1', title: 'Garden flat', location_text: 'Kilimani' }, { id: 'l2', title: 'Office', location_text: 'Westlands' }] }; };
  const [a, b] = await Promise.all([listings.hostListings('h1', api), listings.hostListings('h1', api)]);
  assert.equal(a, b);
  assert.deepEqual(urls, ['/api/chat/listings'], 'once per account per page session');
  await listings.hostListings('h2', api);
  assert.equal(urls.length, 2, 'another account loads its own');
  let fail = true;
  const flaky = async () => { if (fail) throw new Error('offline'); return {}; };
  const retry = fresh();
  await assert.rejects(retry.hostListings('h1', flaky));
  fail = false;
  assert.deepEqual(await retry.hostListings('h1', flaky), [], 'a failed load is tried again');

  assert.deepEqual(sheets.filterShareListings(a, '  kili ').map((l) => l.id), ['l1']);
  assert.deepEqual(sheets.filterShareListings(a, '').map((l) => l.id), ['l1', 'l2']);
  assert.deepEqual(sheets.filterShareListings(null, 'x'), []);

  let closed = 0;
  await sheets.submitThenClose(async () => {}, () => { closed += 1; });
  await sheets.submitThenClose(async () => { throw new Error('refused'); }, () => { closed += 1; });
  assert.equal(closed, 1, 'stays open to retry');

  const { api: post, calls } = recordingApi(() => ({ message: { id: 'm1' } }));
  assert.deepEqual(await composer.postListingMessage(post, 'c1', { id: 'l1', title: 'Garden flat' }), { id: 'm1' });
  assert.deepEqual(calls[0], { url: '/api/chat/conversations/c1/messages', method: 'POST', body: { content: 'Garden flat', listingId: 'l1', messageType: 'listing' } });

  const Sheet = loadChats('components/chat/ShareListingSheet.tsx').default;
  const html = render(Sheet, { open: true, userId: 'h1', api, onClose() {}, onShare: async () => {} });
  assert.match(html, /<button class="chat-btn chat-btn-primary" type="button" disabled="">Share listing<\/button>/, 'nothing selected');
  assert.equal(render(Sheet, { open: false, userId: 'h1', api, onClose() {}, onShare: async () => {} }), '');
  assert.match(read('components', 'chat', 'ShareListingSheet.tsx'), /You have no listings to share yet\./);
  assert.match(read('public', 'js', 'chats.css'), /\.chat-share\{ max-width:760px;/);
});

test('photo preview: one object URL per photo, released when it leaves; Escape closes', () => {
  const known = new Map();
  const made = [];
  const create = (file) => { made.push(file.name); return `blob:${file.name}`; };
  const a = { name: 'a' };
  const b = { name: 'b' };
  assert.equal(composer.previewUrlFor(a, known, create), 'blob:a');
  assert.equal(composer.previewUrlFor(a, known, create), 'blob:a');
  composer.previewUrlFor(b, known, create);
  assert.deepEqual(made, ['a', 'b'], 'not recreated on re-render');
  const revoked = [];
  composer.releasePreviewUrls(known, [b], (url) => revoked.push(url));
  assert.deepEqual(revoked, ['blob:a']);
  assert.deepEqual([...known.keys()], [b]);
  assert.doesNotMatch(read('pages', 'chats.tsx'), /src=\{URL\.createObjectURL\(/);

  const MediaPreviewComposer = loadChats('components/chat/MediaPreviewComposer.tsx').default;
  const html = render(MediaPreviewComposer, { images: ['blob:a', 'blob:b'], maxImages: 4, sending: false, onCancel() {}, onSend() {}, onRemove() {}, onAdd() {} });
  assert.match(html, /id="chatMediaPreviewCaption"[^>]*value=""/, 'the caption lives in the preview');
  const source = read('pages', 'chats.tsx');
  assert.match(source, /onSend=\{\(caption\) => \{ void sendAttachments\(pendingPreviewFiles, 'photo', caption\); \}\}/);
  assert.match(source, /if \(event\.key !== 'Escape'\) return;\s*setPendingPreviewFiles\(\[\]\);/);
});

test('keys: Escape cancels a reply; Enter sends (desktop always, the phone textarea on phones); Elie ignores Ctrl/Cmd+B/I/U', () => {
  const key = (key, extra = {}) => ({ key, shiftKey: false, ctrlKey: false, metaKey: false, ...extra });
  const desktop = { editor: 'desktop', isElie: false, replying: false, isPhone: () => { throw new Error('not asked'); } };
  assert.equal(composer.composerKeyAction(key('Enter'), desktop), 'send');
  assert.equal(composer.composerKeyAction(key('Enter', { shiftKey: true }), desktop), null, 'a new line');
  assert.equal(composer.composerKeyAction(key('Escape'), desktop), null);
  assert.equal(composer.composerKeyAction(key('Escape'), { ...desktop, replying: true }), 'cancel-reply');
  assert.equal(composer.composerKeyAction(key('B', { ctrlKey: true }), { ...desktop, isElie: true }), 'block');
  assert.equal(composer.composerKeyAction(key('i', { metaKey: true }), { ...desktop, isElie: true }), 'block');
  assert.equal(composer.composerKeyAction(key('b', { ctrlKey: true }), desktop), null, 'formatting in conversations');
  const phone = { editor: 'phone', isElie: true, replying: false, isPhone: () => true };
  assert.equal(composer.composerKeyAction(key('Enter'), phone), 'send');
  assert.equal(composer.composerKeyAction(key('Enter'), { ...phone, isPhone: () => false }), null, 'the textarea is not used on desktop');
  assert.equal(composer.composerKeyAction(key('b', { ctrlKey: true }), phone), null);
});

function fakeElement() {
  const listeners = new Map();
  const classes = new Set();
  return {
    listeners,
    classes,
    scrollTop: 0, scrollHeight: 1000, clientHeight: 400,
    addEventListener(type, fn) { listeners.set(type, fn); },
    removeEventListener(type, fn) { if (listeners.get(type) === fn) listeners.delete(type); },
    classList: { remove: (n) => classes.delete(n), toggle: (n, on) => (on ? classes.add(n) : classes.delete(n)) },
  };
}

test('phone viewport: shell follows the visual viewport, keyboard state, list pinned to the bottom, listeners released', () => {
  const shell = fakeElement();
  const messages = fakeElement();
  const composerEl = fakeElement();
  const textarea = fakeElement();
  const props = new Map();
  const vv = Object.assign(fakeElement(), { height: 400, offsetTop: 12.4, scale: 1 });
  const win = Object.assign(fakeElement(), {
    innerHeight: 800,
    visualViewport: vv,
    matchMedia: (query) => { assert.equal(query, '(max-width:760px)'); return media; },
    requestAnimationFrame: (fn) => fn(),
    setTimeout: () => 1,
    clearTimeout() {},
  });
  const media = Object.assign(fakeElement(), { matches: true });
  const doc = { activeElement: textarea, documentElement: { style: { setProperty: (k, v) => props.set(k, v), removeProperty: (k) => props.delete(k) } } };
  const stop = viewport.bindChatViewport({ shell, messages, composer: composerEl, textarea, win, doc });

  assert.equal(props.get('--vvh'), '400px');
  assert.equal(props.get('--vv-top'), '12px');
  assert.ok(shell.classes.has('kb-open'), 'the keyboard takes 400px');
  assert.equal(messages.scrollTop, 1000, 'pinned to the newest message');

  messages.scrollTop = 100;
  messages.listeners.get('scroll')();
  vv.listeners.get('resize')();
  assert.equal(messages.scrollTop, 100, 'scrolled up (more than 80px from the bottom): left alone');

  vv.scale = 1.5;
  vv.listeners.get('resize')();
  assert.equal(props.has('--vvh'), false, 'pinch-zoomed: not fought');

  stop();
  for (const target of [win, vv, textarea, messages, media]) assert.equal(target.listeners.size, 0);
  assert.equal(shell.classes.has('kb-open'), false);

  assert.equal(viewport.keepsKeyboardOpen(true, { closest: (s) => (s === viewport.KEEP_FOCUS_SELECTOR ? {} : null) }), true);
  assert.equal(viewport.keepsKeyboardOpen(false, { closest: () => ({}) }), false, 'desktop: normal focus');
  assert.equal(viewport.keepsKeyboardOpen(true, { closest: () => null }), false);
  assert.match(read('pages', 'chats.tsx'), /useChatViewport\(\{ shellRef: appShellRef, messagesRef, composerRef, textareaRef: mobileTextareaRef \}\);/);
});

test('uploads in progress or failed show their state for files as well as photos', () => {
  const t = loadTs(path.join(root, 'lib', 'chat', 'thread.ts'));
  assert.equal(t.uploadSending({ _optimistic: true }), true);
  assert.equal(t.uploadSending({ _optimistic: true, _failed: true }), false);
  assert.equal(t.uploadSending({}), false);
  assert.equal(t.uploadFailed({ _optimistic: true, _failed: true }), true);
  assert.equal(t.uploadFailed({ _failed: true }), false);
  // Photos: with a caption the state follows it; without one it is the footer. Text and files: after the body.
  const source = read('pages', 'chats.tsx');
  assert.match(source, /\{renderMessageBody\(m\.body \|\| ''\)\}\s*\{uploadState\}/);
  assert.match(source, /<div className="chat-message-caption">\{renderMessageBody\(m\.body \|\| ''\)\}\{meta\}<\/div>\s*\{uploadState\}/);
  assert.match(source, /\) : uploadState \|\| undefined\}/);
});

test('a photo without a caption carries its time and ticks over the image in a thin frame', () => {
  const { PhotoBubble } = loadChats('components/chat/MessageMedia.tsx');
  const React = require('react');
  const html = render(PhotoBubble, {
    attachmentId: null, localUrl: 'blob:p', alt: 'IMG_1.jpg', api: async () => ({}), onOpen() {},
    overlay: React.createElement('span', { className: 'msg-meta' }, '09:14'),
    footer: React.createElement('div', { className: 'msg-failed' }),
  });
  assert.match(html, /<div class="chat-media-wrap"><span class="chat-media-loader" aria-label="Loading media"><\/span><img class="chat-message-image" src="blob:p" alt="IMG_1.jpg"\/><span class="msg-meta">09:14<\/span><\/div><div class="msg-failed"><\/div><\/div>$/, 'over the image; the footer below it');
  assert.match(read('pages', 'chats.tsx'), /overlay=\{photoCaption\(m\) \? undefined : meta\}/);
  const css = read('public', 'js', 'chats.css');
  assert.match(css, /\.bubble\.bubble-media\{\s*padding:3px;/);
  assert.match(css, /\.chat-media-wrap > \.msg-meta\{\s*position:absolute;/);
});
