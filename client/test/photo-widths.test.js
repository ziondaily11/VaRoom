const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { loadTs } = require('./helpers/loadTs');

// Pages ask /api/photos for the size they show (server/lib/photoVariants.js).
const { resolveStoredPhotoUrl, resolveAvatarUrl, PHOTO_WIDTH } = loadTs(path.join(__dirname, '..', 'components', 'resolveStoredPhotoUrl.ts'));
const listingKey = 'photos/production/listing-photos/u/l/p/original.jpg';
const avatarKey = 'photos/production/avatars/u/p/original.jpg';

test('a width becomes ?w= on photo-route URLs only', () => {
  assert.equal(resolveStoredPhotoUrl(listingKey, 'listing-photos', null, PHOTO_WIDTH.card), `/api/photos/listing-photos/${listingKey}?w=800`);
  assert.equal(resolveStoredPhotoUrl(listingKey, 'listing-photos'), `/api/photos/listing-photos/${listingKey}`, 'galleries keep the full photo');
  assert.equal(resolveStoredPhotoUrl('https://cdn.example/a.jpg', 'listing-photos', null, 800), 'https://cdn.example/a.jpg', 'outside URLs are left alone');
  const legacy = { storage: { from: () => ({ getPublicUrl: (key) => ({ data: { publicUrl: `https://x.supabase.co/storage/v1/object/public/avatars/${key}` } }) }) } };
  assert.equal(resolveStoredPhotoUrl('old/me.jpg', 'avatars', legacy, 192), 'https://x.supabase.co/storage/v1/object/public/avatars/old/me.jpg', 'legacy Supabase files have no copies');
  assert.equal(resolveStoredPhotoUrl(null, 'avatars', null, 192), null);
});

test('avatars default to the small copy; profile headers ask for a larger one', () => {
  assert.equal(resolveAvatarUrl(avatarKey), `/api/photos/avatars/${avatarKey}?w=192`);
  assert.equal(resolveAvatarUrl(avatarKey, null, PHOTO_WIDTH.thumb), `/api/photos/avatars/${avatarKey}?w=480`);
});

test('the widths match what the server makes', () => {
  const { PHOTO_WIDTHS } = require('../../server/lib/photoVariants');
  assert.deepEqual(Object.values(PHOTO_WIDTH).sort((a, b) => a - b), [...PHOTO_WIDTHS]);
});
