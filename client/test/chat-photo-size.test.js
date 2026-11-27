'use strict';

// A single photo opens at its real size, like an album does, instead of
// starting as a small bubble and growing when the image loads: the sender's
// browser sends its size with the upload, and the bubble reserves that box.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadTs } = require('./helpers/loadTs');
const { loadChats, render } = require('./helpers/chatsPage');

const root = path.join(__dirname, '..');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');
const composer = loadTs(path.join(root, 'lib', 'chat', 'composer.ts'));

async function upload(kind, { localUrl, image } = {}) {
  const bodies = [];
  const api = async (url, init) => { bodies.push(JSON.parse(init.body)); return url.endsWith('/upload-init') ? { uploadUrl: 'https://r2/put', attachmentId: 'a1' } : {}; };
  const previous = global.Image;
  if (image) global.Image = image;
  try {
    await composer.uploadAttachment({ api, fetchFn: async () => ({ ok: true }), conversationId: 'c1', file: { name: 'IMG.jpg', type: 'image/jpeg', size: 9 }, kind, localUrl, onReserved() {} });
  } finally {
    if (image) global.Image = previous;
  }
  return bodies[0];
}

/** An Image that loads `src` with this size (or fails). */
const fakeImage = (width, height, fail = false) => class {
  set src(url) { this.url = url; setTimeout(() => (fail ? this.onerror(new Error('bad')) : (Object.assign(this, { naturalWidth: width, naturalHeight: height }), this.onload()))); }
};

test('a photo is uploaded with its size as it shows; files and unreadable photos without', async () => {
  assert.deepEqual(await upload('photo', { localUrl: 'blob:p', image: fakeImage(1200, 1600) }),
    { filename: 'IMG.jpg', mimeType: 'image/jpeg', fileSize: 9, kind: 'photo', width: 1200, height: 1600 });
  assert.equal((await upload('photo', { localUrl: 'blob:p', image: fakeImage(0, 0, true) })).width, undefined, 'a photo the browser cannot read still uploads');
  assert.equal((await upload('file', { localUrl: 'blob:p', image: fakeImage(10, 10) })).width, undefined);
  assert.match(read('pages', 'chats.tsx'), /uploads\.map\(\(\{ file, tempId, localUrl \}\) => uploadAttachment\(\{[\s\S]{0,140}localUrl,/);
});

test('a photo with a known size reserves its box before it loads; one without keeps measuring on load', () => {
  const { PhotoBubble } = loadChats('components/chat/MessageMedia.tsx');
  const props = { attachmentId: null, localUrl: 'blob:p', alt: 'IMG.jpg', api: async () => ({}), onOpen() {} };
  const sized = render(PhotoBubble, { ...props, size: { width: 1200, height: 1600 } });
  assert.match(sized, /<div class="bubble bubble-media has-photo-size" style="--photo-w:1200px;--photo-ratio:1200 \/ 1600">/);
  const older = render(PhotoBubble, { ...props, size: { width: null, height: null } });
  assert.match(older, /<div class="bubble bubble-media"><div class="chat-media-wrap">/);
  assert.match(read('pages', 'chats.tsx'), /<PhotoBubble[\s\S]{0,300}size=\{m\.attachment\}/);
});

test('the reserved box is the same one a loaded photo fits: 330 × 360 desktop, 340/78vw × 420 phone', () => {
  const css = read('public', 'js', 'chats.css');
  assert.match(css, /\.bubble-media\.has-photo-size\{\s*--photo-max-w:330px;\s*--photo-max-h:360px;\s*--photo-box:min\(var\(--photo-w\), var\(--photo-max-w\), calc\(var\(--photo-max-h\) \* var\(--photo-ratio\)\)\);/);
  assert.match(css, /\.has-photo-size > \.chat-media-wrap\{ width:var\(--photo-box\); aspect-ratio:var\(--photo-ratio\); \}/);
  assert.match(css, /\.bubble-media\.has-photo-size\{ --photo-max-w:min\(340px, 78vw\); --photo-max-h:420px; \}/);
  assert.match(css, /\.chat-message-image\{\s*display:block;\s*max-width:330px;\s*max-height:360px;/, 'the box a loaded photo fits');
});
