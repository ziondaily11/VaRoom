const sharp = require('sharp');
const { ValidationError } = require('./inputValidation');

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const IMAGE_TYPES = Object.freeze({
  'image/jpeg': { extension: 'jpg', format: 'jpeg' },
  'image/png': { extension: 'png', format: 'png' },
  'image/webp': { extension: 'webp', format: 'webp' },
});

function imageType(mimeType) {
  return IMAGE_TYPES[mimeType] || null;
}

async function verifyImageBuffer(body, mimeType) {
  const expected = imageType(mimeType);
  if (!expected) throw new ValidationError('Unsupported image type');
  if (!Buffer.isBuffer(body) || body.length < 1 || body.length > MAX_IMAGE_BYTES) {
    throw new ValidationError('Uploaded image size is invalid');
  }
  let image;
  try {
    image = await sharp(body, { failOn: 'error', limitInputPixels: 40_000_000 }).metadata();
  } catch {
    throw new ValidationError('Uploaded image content is invalid');
  }
  if (image.format !== expected.format) {
    throw new ValidationError('Uploaded image content does not match its type');
  }
  return image;
}

function isPublicMediaObjectKey(value) {
  if (typeof value !== 'string') return false;
  const uuidPattern = '[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}';
  return new RegExp(
    `^(?:(?:listing-photos|avatars)/[a-z0-9_-]+/${uuidPattern}/${uuidPattern}|listing-photos/[a-z0-9_-]+/${uuidPattern}/${uuidPattern}/thumbnail|updates/[a-z0-9_-]+/${uuidPattern}/${uuidPattern}|updates/[a-z0-9_-]+/migrated/[a-z0-9_-]{1,128}/\\d+)\\.(?:jpg|jpeg|png|webp|gif|avif)$`,
    'i'
  ).test(value);
}

module.exports = {
  MAX_IMAGE_BYTES,
  imageType,
  verifyImageBuffer,
  isPublicMediaObjectKey,
};
