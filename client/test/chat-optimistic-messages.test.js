const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadTs } = require('./helpers/loadTs');

const root = path.join(__dirname, '..');
const om = loadTs(path.join(root, 'lib', 'chat', 'optimisticMessages.ts'));
const source = fs.readFileSync(path.join(root, 'pages', 'chats.tsx'), 'utf8');

const upload = { id: 'optimistic-1', sender_id: 'u1', created_at: 't0', message_type: 'photo', attachment_id: 'a1', _optimistic: true, _localUrl: 'blob:one' };
const sent = { id: 'm1', sender_id: 'u1', created_at: 't1', message_type: 'photo', attachment_id: 'a1' };
const other = { id: 'm0', sender_id: 'u2', created_at: 't-1', message_type: 'text' };

test('the sent photo takes the optimistic row\'s place with the same key and local image', () => {
  const thread = om.mergeServerMessages([other, upload], [sent]);
  assert.equal(thread.length, 2);
  assert.equal(thread[1].id, 'm1');
  assert.equal(thread[1]._optimistic, undefined, 'no longer sending: ticks show');
  assert.equal(thread[1]._localUrl, 'blob:one', 'no reload from the server');
  assert.equal(om.messageKey(thread[1]), 'optimistic-1', 'React keeps the same bubble');
  assert.deepEqual(om.mergeServerMessages(thread, [sent]), thread, 'the send response after Realtime changes nothing');
});

test('messages that are not our upload are appended; a failed upload is not adopted', () => {
  assert.deepEqual(om.mergeServerMessages([upload], [other]).map((m) => m.id), ['optimistic-1', 'm0']);
  const failed = { ...upload, _failed: true };
  assert.deepEqual(om.mergeServerMessages([failed], [sent]).map((m) => m.id), ['optimistic-1', 'm1']);
});

test('a full refresh keeps uploads in progress and the local image of a sent photo', () => {
  const during = om.reconcileThread([other, upload], [other]);
  assert.deepEqual(during.map((m) => m.id), ['m0', 'optimistic-1'], 'a delivered-tick refresh does not drop the upload');
  const after = om.reconcileThread([other, upload], [other, sent]);
  assert.deepEqual(after.map((m) => om.messageKey(m)), ['m0', 'optimistic-1']);
  assert.equal(after[1]._localUrl, 'blob:one');
  const later = om.reconcileThread(after, [other, { ...sent, delivered_at: 't2' }]);
  assert.equal(later[1].delivered_at, 't2', 'server fields update');
  assert.equal(om.messageKey(later[1]), 'optimistic-1');
  assert.deepEqual([...om.localUrls(later)], ['blob:one']);
  assert.deepEqual([...om.localUrls([other, sent])], []);
});

test('an upload shows at once: the sender\'s row with its local image, sending; a photo has a pending attachment', () => {
  const composer = loadTs(path.join(root, 'lib', 'chat', 'composer.ts'));
  const base = { tempId: 'optimistic-9', conversationId: 'c1', senderId: 'u1', content: 'Our flat', createdAt: '2026-11-05T10:00:00.000Z', albumId: 'al', fileName: 'IMG_1.jpg', localUrl: 'blob:9' };
  const photo = composer.optimisticUpload({ ...base, kind: 'photo' });
  assert.deepEqual({ ...photo, attachment: { ...photo.attachment } }, {
    id: 'optimistic-9', conversation_id: 'c1', sender_id: 'u1', body: 'Our flat', created_at: '2026-11-05T10:00:00.000Z', message_type: 'photo', album_id: 'al',
    attachment: { id: 'optimistic-9', original_filename: 'IMG_1.jpg', kind: 'photo', status: 'pending' },
    _optimistic: true, _localUrl: 'blob:9',
  });
  const file = composer.optimisticUpload({ ...base, kind: 'file', albumId: undefined });
  assert.equal(file.attachment, null);
  assert.equal(file.album_id, null);
});

test('the server\'s copy is recognised by its attachment: reserved before the upload, then adopted on send, Realtime and refresh', async () => {
  const composer = loadTs(path.join(root, 'lib', 'chat', 'composer.ts'));
  const events = [];
  const api = async (url, init) => {
    events.push(['api', url, JSON.parse(init.body)]);
    return url.endsWith('/upload-init') ? { uploadUrl: 'https://r2.example/put', attachmentId: 'att 1' } : {};
  };
  const fetchFn = async (url, init) => { events.push(['put', url, init.method, init.headers['Content-Type'], init.body.name]); return { ok: true }; };
  const file = { name: 'lease.docx', type: '', size: 2048 };
  const id = await composer.uploadAttachment({ api, fetchFn, conversationId: 'c 1', file, kind: 'file', onReserved: (attachmentId) => events.push(['reserved', attachmentId]) });
  assert.equal(id, 'att 1');
  assert.deepEqual(events, [
    ['api', '/api/chat/conversations/c%201/attachments/upload-init', { filename: 'lease.docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', fileSize: 2048, kind: 'file' }],
    ['reserved', 'att 1'],
    ['put', 'https://r2.example/put', 'PUT', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'lease.docx'],
    ['api', '/api/chat/conversations/c%201/attachments/att%201/complete', {}],
  ]);
  await assert.rejects(
    composer.uploadAttachment({ api, fetchFn: async () => ({ ok: false }), conversationId: 'c1', file, kind: 'file', onReserved() {} }),
    /R2 direct upload failed/,
  );

  assert.match(source, /key=\{messageKey\(m as OptimisticChatMessage\)\}/);
  assert.match(source, /onReserved: \(attachmentId\) => setMessagesState\(\(prev\) => prev\.map\(\(m\) => \(m\.id === tempId \? \{ \.\.\.m, attachment_id: attachmentId \} : m\)\)\),/);
  assert.match(source, /if \(activeIdRef\.current === conversationId\) setMessagesState\(\(prev\) => mergeServerMessages\(prev, \[sent\]\)\);/);
  assert.match(source, /setMessagesState\(\(prev\) => mergeServerMessages\(prev, incoming\)\);/);
  assert.match(source, /setMessagesState\(\(prev\) => reconcileThread\(prev, list\)\);/);
  assert.doesNotMatch(source, /URL\.revokeObjectURL\(localObjectUrl\)/, 'the local image is released only when no message shows it');
});

test('the photo preview renders its caption box and send button', () => {
  const { loadChats, render } = require('./helpers/chatsPage');
  const MediaPreviewComposer = loadChats('components/chat/MediaPreviewComposer.tsx').default;
  const props = { maxImages: 4, onCancel() {}, onSend() {}, onRemove() {}, onAdd() {} };
  const html = render(MediaPreviewComposer, { ...props, images: ['blob:x'], sending: false });
  assert.match(html, /id="chatMediaPreviewCaption"[^>]*placeholder="Type a message"[^>]*value=""/);
  assert.match(html, /<img id="chatMediaPreviewImg" class="chat-media-preview-image" src="blob:x"/);
  assert.doesNotMatch(html, /id="chatMediaPreviewSend"[^>]*disabled/);
  const busy = render(MediaPreviewComposer, { ...props, images: ['blob:x'], sending: true });
  assert.match(busy, /id="chatMediaPreviewSend"[^>]*disabled=""/);
});
