const assert = require('node:assert/strict');
const test = require('node:test');
const sharp = require('sharp');
const { ValidationError } = require('../lib/inputValidation');
const {
  MAX_IMAGE_BYTES,
  imageType,
  verifyImageBuffer,
  isPublicMediaObjectKey,
} = require('../lib/mediaValidation');

test('accepts only supported image MIME types and bounded upload sizes', () => {
  assert.equal(imageType('image/jpeg').extension, 'jpg');
  assert.equal(imageType('image/png').format, 'png');
  assert.equal(imageType('image/webp').format, 'webp');
  assert.equal(imageType('image/svg+xml'), null);
  assert.equal(MAX_IMAGE_BYTES, 5 * 1024 * 1024);
});

test('verifies image bytes against the declared MIME type', async () => {
  const jpeg = await sharp({
    create: { width: 8, height: 8, channels: 3, background: { r: 10, g: 20, b: 30 } },
  }).jpeg().toBuffer();

  assert.equal((await verifyImageBuffer(jpeg, 'image/jpeg')).format, 'jpeg');
  await assert.rejects(
    verifyImageBuffer(jpeg, 'image/png'),
    (error) => error instanceof ValidationError && /does not match/.test(error.message)
  );
  await assert.rejects(
    verifyImageBuffer(Buffer.from('not an image'), 'image/jpeg'),
    ValidationError
  );
  await assert.rejects(
    verifyImageBuffer(Buffer.alloc(MAX_IMAGE_BYTES + 1), 'image/jpeg'),
    ValidationError
  );
});

test('public media routes accept only generated public-media key layouts', () => {
  const id = '123e4567-e89b-12d3-a456-426614174000';
  assert.equal(isPublicMediaObjectKey(`listing-photos/production/${id}/${id}.jpg`), true);
  assert.equal(isPublicMediaObjectKey(`avatars/production/${id}/${id}.webp`), true);
  assert.equal(isPublicMediaObjectKey(`updates/production/migrated/${id}/0.png`), true);
  assert.equal(isPublicMediaObjectKey(`chat-attachments/production/${id}/${id}.jpg`), false);
  assert.equal(isPublicMediaObjectKey(`listing-photos/production/../${id}.jpg`), false);
  assert.equal(isPublicMediaObjectKey('videos/production/private.mp4'), false);
});
