'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const routes = fs.readFileSync(path.join(__dirname, '..', 'routes', 'chatRoutes.js'), 'utf8');

test('albums: photos only, the sender\'s own, at most 4; stored and returned; one notification per album', () => {
  assert.match(routes, /assertAllowedKeys\(req\.body, \['content', 'attachmentId', 'messageType', 'listingId', 'replyToMessageId', 'albumId'\]\);/);
  assert.match(routes, /if \(albumId && messageType !== 'photo'\) \{\s*throw new ValidationError\('Only photos can be sent as an album'\);/);
  assert.match(routes, /if \(\(albumRows \|\| \[\]\)\.some\(\(row\) => row\.sender_id !== user\.id\)\) \{/);
  assert.match(routes, /if \(albumSoFar >= ALBUM_MAX\) throw new ValidationError/);
  assert.match(routes, /const ALBUM_MAX = 4;/);
  assert.match(routes, /album_id: albumId \|\| null,/);
  assert.equal((routes.match(/reply_to_message_id,album_id,deleted_at,pinned_at'\)/g) || []).length, 2, 'thread reads return album_id');
  assert.match(routes, /if \(!albumSoFar\) \{\s*try \{/);
  const migration = fs.readFileSync(path.join(__dirname, '..', 'migrations', '20261104_000056_chat_photo_albums.sql'), 'utf8');
  assert.match(migration, /add column if not exists album_id uuid;/);
});
