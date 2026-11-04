const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadTs } = require('./helpers/loadTs');

const root = path.join(__dirname, '..');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');
const albums = loadTs(path.join(root, 'lib', 'chat', 'photoAlbums.ts'));
const source = read('pages', 'chats.tsx');

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

test('sending: one album id, uploads in parallel, saved in order, caption on the first photo', () => {
  assert.match(source, /const albumId = kind === 'photo' && files\.length > 1 \? crypto\.randomUUID\(\) : undefined;/);
  assert.match(source, /content: \(index === 0 \? \(caption \|\| ''\)\.trim\(\) : ''\) \|\| file\.name,/);
  assert.match(source, /const uploaded = uploads\.map\(async \(\{ file, tempId \}\) => \{/);
  assert.match(source, /for \(let index = 0; index < uploads\.length; index \+= 1\) \{[\s\S]*?const attachmentId = await uploaded\[index\];/);
  assert.match(source, /\.\.\.\(albumId \? \{ albumId \} : \{\}\),/);
  assert.match(source, /multiple\s*style=\{\{ display: 'none' \}\}/, 'the photo picker takes several');
  assert.match(source, /showStatusNote\(`Up to \$\{ALBUM_MAX\} photos can be sent at a time\.`, 3500\);/);
});

test('the thread shows albums as a collage; a tile\'s right-click or long-press acts on that photo; the viewer pages through', () => {
  assert.match(source, /if \(album === 'member'\) return null;/);
  assert.match(source, /onContextMenu: \(e: React\.MouseEvent\) => \{ e\.stopPropagation\(\); onMessageContextMenu\(e, photo\); \},/);
  assert.match(source, /onOpen=\{\(items, index\) => setSelectedPhotoPreview\(\{ items, index \}\)\}/);
  const media = read('components', 'chat', 'MessageMedia.tsx');
  assert.match(media, /<div className=\{`chat-album chat-album-\$\{count\}`\}>/);
  assert.match(media, /else if \(count > 1 && event\.key === 'ArrowRight'\) go\(1\);/);
  assert.match(media, /if \(count < 2 \|\| start === null \|\| end === undefined \|\| Math\.abs\(end - start\) < 40\) return;/, 'swipe');
  const css = read('public', 'js', 'chats.css');
  assert.match(css, /\.chat-album-3 > \.chat-album-tile:first-child\{ grid-row:1 \/ span 2; \}/);
  assert.match(css, /\.chat-album\{ position:relative; display:grid; gap:2px; width:330px;/);
  assert.match(css, /\.chat-album\{ width:min\(340px, 78vw\); \}/, 'phones keep the photo width');
});
