const test = require('node:test');
const assert = require('node:assert/strict');
const sharp = require('sharp');
const processing = require('../lib/chatAttachmentProcessingService');

const MAX_FILE_SIZE = 25 * 1024 * 1024;

test('validates attachment extensions, MIME types, sizes, and chat categories', () => {
  assert.doesNotThrow(() => processing.validateUploadMetadata(
    'receipt.jpg', 'image/webp', 'image/jpeg', 400_000, 600_000, 'photo', MAX_FILE_SIZE
  ));
  assert.doesNotThrow(() => processing.validateUploadMetadata(
    'shared-from-files.jpg', 'image/webp', 'image/jpeg', 400_000, 600_000, 'file', MAX_FILE_SIZE
  ));
  assert.throws(() => processing.validateUploadMetadata(
    'receipt.pdf', 'image/webp', 'image/jpeg', 400_000, 600_000, 'photo', MAX_FILE_SIZE
  ));
  assert.throws(() => processing.validateUploadMetadata(
    'movie.exe', 'video/mp4', 'video/mp4', 400_000, 400_000, 'file', MAX_FILE_SIZE
  ));
  assert.throws(() => processing.validateUploadMetadata(
    'movie.mp4', 'video/mp4', 'video/mp4', MAX_FILE_SIZE + 1, MAX_FILE_SIZE + 1, 'file', MAX_FILE_SIZE
  ));
  assert.throws(() => processing.validateUploadMetadata(
    'document.pdf', 'image/webp', 'application/pdf', 400_000, 400_000, 'file', MAX_FILE_SIZE
  ));
  assert.throws(() => processing.validateUploadMetadata(
    'receipt.jpg', 'image/jpeg', 'image/jpeg', 400_000, 600_000, 'photo', MAX_FILE_SIZE, 'failed'
  ));
  assert.equal(
    processing.thumbnailObjectKey('chat/attachment/original.webp'),
    'chat/attachment/thumbnail.webp'
  );
});

test('rejects image content with a mismatched or corrupted signature', () => {
  assert.throws(() => processing.validateFileSignature(Buffer.from('not an image'), 'image/jpeg'));
});

test('keeps small optimized JPEGs unchanged and creates a compact 4:3 thumbnail', async () => {
  const jpeg = await sharp({
    create: { width: 320, height: 240, channels: 3, background: { r: 35, g: 90, b: 180 } },
  }).jpeg({ quality: 82 }).toBuffer();
  const info = await processing.inspectImage(jpeg, 'image/jpeg');
  const optimized = await processing.optimizeImage(jpeg, 'image/jpeg', info);
  const thumbnail = await sharp(await processing.createImageThumbnail(jpeg)).metadata();

  assert.equal(optimized.optimizationStatus, 'unchanged');
  assert.equal(optimized.buffer, null);
  assert.equal(thumbnail.format, 'webp');
  assert.equal(thumbnail.width, processing.THUMBNAIL_WIDTH);
  assert.equal(thumbnail.height, processing.THUMBNAIL_HEIGHT);
});

test('resizes large JPEGs without changing their aspect ratio', async () => {
  const jpeg = await sharp({
    create: { width: 4000, height: 2000, channels: 3, background: { r: 210, g: 120, b: 60 } },
  }).jpeg({ quality: 92 }).toBuffer();
  const info = await processing.inspectImage(jpeg, 'image/jpeg');
  const optimized = await processing.optimizeImage(jpeg, 'image/jpeg', info);
  const metadata = await sharp(optimized.buffer).metadata();

  assert.equal(optimized.optimizationStatus, 'optimized');
  assert.ok(metadata.width <= processing.MAX_IMAGE_DIMENSION);
  assert.ok(metadata.height <= processing.MAX_IMAGE_DIMENSION);
  assert.ok(Math.abs(metadata.width / metadata.height - 2) < 0.01);
  assert.equal(metadata.format, 'webp');
});

test('accounts for EXIF orientation when recording image dimensions', async () => {
  const jpeg = await sharp({
    create: { width: 1200, height: 600, channels: 3, background: { r: 40, g: 80, b: 120 } },
  }).jpeg().withMetadata({ orientation: 6 }).toBuffer();
  const info = await processing.inspectImage(jpeg, 'image/jpeg');

  assert.equal(info.width, 600);
  assert.equal(info.height, 1200);
});

test('preserves transparency when resizing a PNG screenshot', async () => {
  const png = await sharp({
    create: { width: 3000, height: 1600, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  }).png().toBuffer();
  const info = await processing.inspectImage(png, 'image/png');
  const optimized = await processing.optimizeImage(png, 'image/png', info);
  const metadata = await sharp(optimized.buffer).metadata();

  assert.equal(metadata.format, 'webp');
  assert.equal(metadata.hasAlpha, true);
  assert.ok(metadata.width <= processing.MAX_IMAGE_DIMENSION);
});

test('accepts WebP image signatures and leaves small WebP files unchanged', async () => {
  const webp = await sharp({
    create: { width: 280, height: 210, channels: 3, background: { r: 120, g: 60, b: 20 } },
  }).webp({ quality: 80 }).toBuffer();
  const info = await processing.inspectImage(webp, 'image/webp');
  const optimized = await processing.optimizeImage(webp, 'image/webp', info);

  assert.equal(optimized.optimizationStatus, 'unchanged');
  assert.equal(optimized.buffer, null);
});

test('validates real document signatures without rewriting document data', () => {
  assert.doesNotThrow(() => processing.validateFileSignature(Buffer.from('%PDF-1.7\nbody\n%%EOF'), 'application/pdf'));
  assert.throws(() => processing.validateFileSignature(Buffer.from('not a PDF'), 'application/pdf'));
});
