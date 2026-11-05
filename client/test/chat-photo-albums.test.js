const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadTs } = require('./helpers/loadTs');

const root = path.join(__dirname, '..');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');
const albums = loadTs(path.join(root, 'lib', 'chat', 'photoAlbums.ts'));
const { loadChats, renderChatsPage, render } = require('./helpers/chatsPage');

const img = (name) => ({ name, type: 'image/jpeg' });

test('up to 4 photos can wait in the preview; other files and extra photos are left out', () => {
  assert.equal(albums.ALBUM_MAX, 4);
  const first = albums.addToSelection([], [img('a'), { name: 'b.pdf', type: 'application/pdf' }, img('c')]);
  assert.deepEqual(first.files.map((f) => f.name), ['a', 'c']);
  assert.equal(first.dropped, 0);
  const full = albums.addToSelection(first.files, [img('d'), img('e'), img('f')]);
  assert.deepEqual(full.files.map((f) => f.name), ['a', 'c', 'd', 'e']);
  assert.equal(full.dropped, 1);
  assert.equal(albums.isImageFile({ name: 'IMG.HEIC', type: '' }), true);
});

test('a run of photos with the same album id shows once, on its first message; a deleted photo leaves it', () => {
  const photo = (id, extra = {}) => ({ id, sender_id: 'u1', album_id: 'al', message_type: 'photo', created_at: id, ...extra });
  const thread = [{ id: 't', sender_id: 'u2', message_type: 'text' }, photo('p1'), photo('p2'), photo('p3', { deleted_at: 'x' }), photo('p4')];
  assert.equal(albums.albumAt(thread, 0), null);
  assert.deepEqual(albums.albumAt(thread, 1).map((m) => m.id), ['p1', 'p2']);
  assert.equal(albums.albumAt(thread, 2), 'member');
  assert.equal(albums.albumAt(thread, 3), null, 'deleted: shown on its own');
  assert.equal(albums.albumAt(thread, 4), null, 'a lone photo shows as a single photo');
  assert.equal(albums.albumAt([photo('a'), photo('b', { sender_id: 'u2' })], 0), null, 'another sender never joins');
});

test('the album shows the least advanced ticks and its first caption', () => {
  assert.equal(albums.albumStatus(['read', 'delivered', 'read']), 'delivered');
  assert.equal(albums.albumStatus(['read', 'sending']), 'sending');
  assert.equal(albums.albumStatus([null, 'sent']), 'sent');
  assert.equal(albums.albumStatus([null]), null);
  const attachment = { id: 'a', kind: 'photo', original_filename: 'IMG_1.jpg' };
  assert.equal(albums.albumCaption([{ message_type: 'photo', body: 'IMG_1.jpg', attachment }, { message_type: 'photo', body: 'Our flat', attachment: { ...attachment, original_filename: 'IMG_2.jpg' } }]), 'Our flat');
});

test('sending: one album id, uploads in parallel, saved in order, caption on the first photo', async () => {
  const composer = loadTs(path.join(root, 'lib', 'chat', 'composer.ts'));
  let made = 0;
  const uuid = () => { made += 1; return 'album-1'; };
  assert.equal(composer.newAlbumId('photo', 3, uuid), 'album-1');
  assert.equal(composer.newAlbumId('photo', 1, uuid), undefined, 'a single photo');
  assert.equal(composer.newAlbumId('file', 2, uuid), undefined);
  assert.equal(made, 1);
  assert.equal(composer.uploadContent(0, '  Our flat ', 'IMG_1.jpg'), 'Our flat');
  assert.equal(composer.uploadContent(1, 'Our flat', 'IMG_2.jpg'), 'IMG_2.jpg');
  assert.equal(composer.uploadContent(0, '   ', 'IMG_1.jpg'), 'IMG_1.jpg');
  assert.equal(composer.uploadContent(0, undefined, 'lease.pdf'), 'lease.pdf');

  // The uploads finish out of order (the second first, the third fails): saved in order.
  const later = (value, ms) => new Promise((resolve, reject) => setTimeout(() => (value instanceof Error ? reject(value) : resolve(value)), ms));
  const uploads = [
    { tempId: 't1', content: 'Our flat', upload: later('a1', 20) },
    { tempId: 't2', content: 'IMG_2.jpg', upload: later('a2', 1) },
    { tempId: 't3', content: 'IMG_3.jpg', upload: later(new Error('R2 direct upload failed'), 5) },
    { tempId: 't4', content: 'IMG_4.jpg', upload: later('a4', 1) },
  ];
  uploads.forEach((u) => u.upload.catch(() => {}));
  const saved = [];
  const events = [];
  const error = console.error;
  console.error = () => {};
  try {
    await composer.saveAttachmentMessages({
      api: async (url, init) => { const body = JSON.parse(init.body); saved.push([url, body]); return { message: { id: `m-${body.attachmentId}` } }; },
      conversationId: 'c1',
      kind: 'photo',
      albumId: 'album-1',
      uploads,
      onSent: (m) => events.push(['sent', m.id]),
      onFailed: (tempId) => events.push(['failed', tempId]),
    });
  } finally {
    console.error = error;
  }
  assert.deepEqual(saved.map(([, body]) => body.attachmentId), ['a1', 'a2', 'a4']);
  assert.deepEqual(saved[0], ['/api/chat/conversations/c1/messages', { content: 'Our flat', attachmentId: 'a1', messageType: 'photo', albumId: 'album-1' }]);
  assert.deepEqual(events, [['sent', 'm-a1'], ['sent', 'm-a2'], ['failed', 't3'], ['sent', 'm-a4']]);

  const single = [];
  await composer.saveAttachmentMessages({ api: async (url, init) => { single.push(JSON.parse(init.body)); return {}; }, conversationId: 'c1', kind: 'file', albumId: undefined, uploads: [{ tempId: 't', content: 'lease.pdf', upload: Promise.resolve('f1') }], onSent() { throw new Error('no message returned'); }, onFailed() {} });
  assert.deepEqual(single, [{ content: 'lease.pdf', attachmentId: 'f1', messageType: 'file' }], 'no album id');

  const source = read('pages', 'chats.tsx');
  assert.match(renderChatsPage({ initialConversationId: 'c1' }).html, /<input type="file" accept="image\/\*" multiple=""/, 'the photo picker takes several');
  assert.match(source, /if \(dropped\) showStatusNote\(`Up to \$\{ALBUM_MAX\} photos can be sent at a time\.`, 3500\);/);
});

test('the thread shows albums as a collage; a tile\'s right-click or long-press acts on that photo; the viewer pages through', () => {
  const source = read('pages', 'chats.tsx');
  assert.match(source, /if \(album === 'member'\) return null;/);
  assert.match(source, /onContextMenu: \(e: React\.MouseEvent\) => \{ e\.stopPropagation\(\); onMessageContextMenu\(e, photo\); \},/);
  assert.match(source, /onOpen=\{\(items, index\) => setSelectedPhotoPreview\(\{ items, index \}\)\}/);

  const { PhotoAlbum, ImagePreview } = loadChats('components/chat/MessageMedia.tsx');
  const photos = ['p1', 'p2', 'p3'].map((id) => ({ id, attachmentId: null, localUrl: `blob:${id}`, alt: id, state: null }));
  const collage = render(PhotoAlbum, { photos: [...photos, { id: 'p4', attachmentId: 'a4', alt: 'p4', state: 'failed' }, { id: 'p5', attachmentId: 'a5', alt: 'p5', state: null }], api: async () => ({}), onOpen() {}, onDismiss() {} });
  assert.match(collage, /<div class="chat-album chat-album-4">/, 'at most four tiles');
  assert.equal((collage.match(/class="chat-album-tile"/g) || []).length, 4);
  assert.match(collage, /data-message-id="p4"[\s\S]*<span class="chat-album-failed">Failed · Dismiss<\/span>/);
  assert.match(render(PhotoAlbum, { photos: photos.slice(0, 3), api: async () => ({}), onOpen() {}, onDismiss() {} }), /chat-album chat-album-3/);

  assert.equal(albums.viewerKeyStep('ArrowRight', 3), 1);
  assert.equal(albums.viewerKeyStep('ArrowLeft', 3), -1);
  assert.equal(albums.viewerKeyStep('ArrowRight', 1), 0, 'a single photo does not page');
  assert.equal(albums.viewerKeyStep('Enter', 3), 0);
  assert.equal(albums.swipeStep(200, 100, 2), 1, 'swipe left: next');
  assert.equal(albums.swipeStep(100, 200, 2), -1, 'swipe right: previous');
  assert.equal(albums.swipeStep(100, 139, 2), 0, 'under 40 px');
  assert.equal(albums.swipeStep(100, 300, 1), 0);
  assert.equal(albums.swipeStep(null, 300, 2), 0);
  assert.equal(albums.swipeStep(100, undefined, 2), 0);
  const viewer = render(ImagePreview, { items: [{ url: 'blob:a', alt: 'A' }, { url: 'blob:b', alt: 'B' }], index: 1, onClose() {} });
  assert.match(viewer, /<div class="chat-image-preview" role="dialog" aria-label="Image 2 of 2"><img src="blob:b" alt="B"\/>/);
  assert.match(viewer, /aria-label="Previous photo"[\s\S]*aria-label="Next photo"[\s\S]*2 \/ 2/);
  assert.doesNotMatch(render(ImagePreview, { items: [{ url: 'blob:a', alt: 'A' }], onClose() {} }), /chat-image-preview-nav/);

  const css = read('public', 'js', 'chats.css');
  assert.match(css, /\.chat-album-3 > \.chat-album-tile:first-child\{ grid-row:1 \/ span 2; \}/);
  assert.match(css, /\.chat-album\{ position:relative; display:grid; gap:2px; width:330px;/);
  assert.match(css, /\.chat-album\{ width:min\(340px, 78vw\); \}/, 'phones keep the photo width');
});
