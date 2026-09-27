'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { isNewR2PhotoObjectKey, isR2PhotoObjectKey } = require('../lib/photoStorageKeys');

test('recognizes current listing photo keys for rendering and upload completion', () => {
  const key = 'photos/production/listing-photos/user-id/photo-id/original.jpg';

  assert.equal(isNewR2PhotoObjectKey('listing-photos', key, 'production'), true);
  assert.equal(isR2PhotoObjectKey('listing-photos', key, 'production'), true);
});

test('recognizes keys written by the earlier listing-photo migration', () => {
  const key = 'listing-photos/production/listing-id/media-id.jpg';

  assert.equal(isNewR2PhotoObjectKey('listing-photos', key, 'production'), false);
  assert.equal(isR2PhotoObjectKey('listing-photos', key, 'production'), true);
});

test('recognizes migrated avatar and update image keys only for their categories', () => {
  assert.equal(isR2PhotoObjectKey('avatars', 'avatars/production/user-id/media-id.jpg', 'production'), true);
  assert.equal(isR2PhotoObjectKey('update-images', 'updates/production/migrated/update-id/0.jpg', 'production'), true);
  assert.equal(isR2PhotoObjectKey('listing-photos', 'avatars/production/user-id/media-id.jpg', 'production'), false);
});

test('rejects legacy Supabase paths, other environments, and traversal keys', () => {
  assert.equal(isR2PhotoObjectKey('listing-photos', 'user-id/listing-id/photo.jpg', 'production'), false);
  assert.equal(isR2PhotoObjectKey('listing-photos', 'listing-photos/development/listing-id/photo.jpg', 'production'), false);
  assert.equal(isR2PhotoObjectKey('listing-photos', 'listing-photos/production/../photo.jpg', 'production'), false);
});
