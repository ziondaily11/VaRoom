const assert = require('node:assert/strict');
const test = require('node:test');
const mediaStorage = require('../lib/mediaStorageService');

const LISTING_ID = '123e4567-e89b-12d3-a456-426614174000';
const USER_ID = '123e4567-e89b-12d3-a456-426614174001';
const MEDIA_ID = '123e4567-e89b-12d3-a456-426614174002';

test('generates scoped, unique R2 keys for all newly moved media categories', () => {
  assert.equal(
    mediaStorage.generateListingPhotoObjectKey(LISTING_ID, MEDIA_ID, 'JPG'),
    `listing-photos/${mediaStorage.ENVIRONMENT}/${LISTING_ID}/${MEDIA_ID}.jpg`
  );
  assert.equal(
    mediaStorage.generateProfilePhotoObjectKey(USER_ID, MEDIA_ID, 'png'),
    `avatars/${mediaStorage.ENVIRONMENT}/${USER_ID}/${MEDIA_ID}.png`
  );
  assert.equal(
    mediaStorage.generateUpdateImageObjectKey(USER_ID, MEDIA_ID, 'webp'),
    `updates/${mediaStorage.ENVIRONMENT}/${USER_ID}/${MEDIA_ID}.webp`
  );
});

test('rejects path separators and invalid extensions in generated R2 keys', () => {
  assert.throws(
    () => mediaStorage.generateListingPhotoObjectKey('../outside', MEDIA_ID, 'jpg'),
    /Invalid listing id/
  );
  assert.throws(
    () => mediaStorage.generateProfilePhotoObjectKey(USER_ID, 'a/b', 'png'),
    /Invalid media id/
  );
  assert.throws(
    () => mediaStorage.generateUpdateImageObjectKey(USER_ID, MEDIA_ID, '../jpg'),
    /Invalid file extension/
  );
});
