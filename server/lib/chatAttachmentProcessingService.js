const sharp = require('sharp');

const MAX_IMAGE_DIMENSION = 2560;
const MAX_IMAGE_PIXELS = 50_000_000;
const THUMBNAIL_WIDTH = 480;
const THUMBNAIL_HEIGHT = 360;

const MIME_EXTENSIONS = {
  'image/jpeg': ['jpg', 'jpeg'],
  'image/png': ['png'],
  'image/webp': ['webp'],
  'image/gif': ['gif'],
  'application/pdf': ['pdf'],
  'text/plain': ['txt'],
  'text/csv': ['csv'],
  'application/zip': ['zip'],
  'application/msword': ['doc'],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['docx'],
  'application/vnd.ms-excel': ['xls'],
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['xlsx'],
  'application/vnd.ms-powerpoint': ['ppt'],
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': ['pptx'],
  'audio/webm': ['webm'],
  'audio/ogg': ['ogg'],
  'audio/mpeg': ['mp3'],
  'audio/mp4': ['m4a', 'mp4'],
  'video/mp4': ['mp4'],
  'video/webm': ['webm'],
};

const IMAGE_FORMATS = {
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
};

function extensionOf(filename) {
  const match = String(filename).toLowerCase().match(/\.([a-z0-9]{1,12})$/);
  return match ? match[1] : '';
}

function validateUploadMetadata(filename, mimeType, originalMimeType, fileSize, originalFileSize, kind, maxFileSize, optimizationFailed) {
  const extension = extensionOf(filename);
  const originalExtensions = MIME_EXTENSIONS[originalMimeType];
  if (!extension || !originalExtensions || !originalExtensions.includes(extension)
    || !MIME_EXTENSIONS[mimeType]) {
    throw new Error('Unsupported attachment type');
  }
  if (!Number.isSafeInteger(fileSize) || fileSize < 1 || fileSize > maxFileSize
    || !Number.isSafeInteger(originalFileSize) || originalFileSize < 1 || originalFileSize > maxFileSize) {
    throw new Error('Attachment size is invalid');
  }
  if (kind === 'photo' && (!mimeType.startsWith('image/') || !originalMimeType.startsWith('image/'))) {
    throw new Error('Photo attachments must be images');
  }
  if (kind === 'voice' && (!mimeType.startsWith('audio/') || !originalMimeType.startsWith('audio/'))) {
    throw new Error('Voice attachments must be audio');
  }
  if (mimeType !== originalMimeType
    && !(mimeType.startsWith('image/') && originalMimeType.startsWith('image/'))) {
    throw new Error('Only images can be optimized before upload');
  }
  if (!['photo', 'file', 'voice'].includes(kind)) {
    throw new Error('Unsupported attachment kind');
  }
  if (optimizationFailed !== undefined && typeof optimizationFailed !== 'boolean') {
    throw new Error('Optimization status is invalid');
  }
}

function startsWith(buffer, bytes, offset = 0) {
  return buffer.length >= offset + bytes.length
    && bytes.every((byte, index) => buffer[offset + index] === byte);
}

function signatureMatches(buffer, mimeType) {
  switch (mimeType) {
    case 'image/jpeg':
      return startsWith(buffer, [0xff, 0xd8, 0xff]);
    case 'image/png':
      return startsWith(buffer, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    case 'image/webp':
      return buffer.length >= 12
        && buffer.toString('ascii', 0, 4) === 'RIFF'
        && buffer.toString('ascii', 8, 12) === 'WEBP';
    case 'image/gif':
      return ['GIF87a', 'GIF89a'].includes(buffer.toString('ascii', 0, 6));
    case 'application/pdf': {
      const header = buffer.subarray(0, 1024).toString('ascii');
      const trailer = buffer.subarray(Math.max(0, buffer.length - 2048)).toString('ascii');
      return /%PDF-\d\.\d/.test(header) && trailer.includes('%%EOF');
    }
    case 'application/zip':
    case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
    case 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':
    case 'application/vnd.openxmlformats-officedocument.presentationml.presentation':
      return startsWith(buffer, [0x50, 0x4b, 0x03, 0x04])
        || startsWith(buffer, [0x50, 0x4b, 0x05, 0x06])
        || startsWith(buffer, [0x50, 0x4b, 0x07, 0x08]);
    case 'application/msword':
    case 'application/vnd.ms-excel':
    case 'application/vnd.ms-powerpoint':
      return startsWith(buffer, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
    case 'video/mp4':
    case 'audio/mp4':
      return buffer.length >= 12 && buffer.toString('ascii', 4, 8) === 'ftyp';
    case 'video/webm':
    case 'audio/webm':
      return startsWith(buffer, [0x1a, 0x45, 0xdf, 0xa3]);
    case 'audio/ogg':
      return buffer.toString('ascii', 0, 4) === 'OggS';
    case 'audio/mpeg':
      return buffer.toString('ascii', 0, 3) === 'ID3'
        || (buffer.length >= 2 && buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0);
    case 'text/plain':
    case 'text/csv': {
      try {
        const text = new TextDecoder('utf-8', { fatal: true }).decode(buffer);
        return !text.includes('\0') && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(text);
      } catch {
        return false;
      }
    }
    default:
      return false;
  }
}

function validateFileSignature(buffer, mimeType) {
  if (!Buffer.isBuffer(buffer) || !buffer.length || !signatureMatches(buffer, mimeType)) {
    throw new Error('Attachment content does not match its declared file type');
  }
}

function orientedDimensions(metadata) {
  if ([5, 6, 7, 8].includes(metadata.orientation)) {
    return { width: metadata.height, height: metadata.width };
  }
  return { width: metadata.width, height: metadata.height };
}

async function inspectImage(buffer, mimeType) {
  validateFileSignature(buffer, mimeType);
  let metadata;
  try {
    metadata = await sharp(buffer, { limitInputPixels: MAX_IMAGE_PIXELS, failOn: 'error' }).metadata();
  } catch {
    throw new Error('Image content is invalid or unsupported');
  }
  if (IMAGE_FORMATS[metadata.format] !== mimeType || !metadata.width || !metadata.height) {
    throw new Error('Image content does not match its declared file type');
  }
  return { metadata, ...orientedDimensions(metadata) };
}

async function createImageThumbnail(buffer) {
  return sharp(buffer, { limitInputPixels: MAX_IMAGE_PIXELS, failOn: 'error' })
    .rotate()
    .resize(THUMBNAIL_WIDTH, THUMBNAIL_HEIGHT, { fit: 'cover' })
    .webp({ quality: 78, effort: 4 })
    .toBuffer();
}

async function optimizeImage(buffer, mimeType, imageInfo) {
  const { metadata, width, height } = imageInfo;
  const shouldResize = width > MAX_IMAGE_DIMENSION || height > MAX_IMAGE_DIMENSION;
  const shouldCompress = mimeType === 'image/jpeg' && buffer.length > 1_500_000;
  const shouldLosslesslyOptimize = mimeType === 'image/png' && buffer.length > 2_000_000;
  const shouldOptimizeWebp = mimeType === 'image/webp' && shouldResize;
  if (metadata.format === 'gif' || (!shouldResize && !shouldCompress && !shouldLosslesslyOptimize && !shouldOptimizeWebp)) {
    return {
      buffer: null,
      mimeType,
      width,
      height,
      optimizationStatus: 'unchanged',
    };
  }

  try {
    let pipeline = sharp(buffer, { limitInputPixels: MAX_IMAGE_PIXELS, failOn: 'error' }).rotate();
    if (shouldResize) {
      pipeline = pipeline.resize({
        width: MAX_IMAGE_DIMENSION,
        height: MAX_IMAGE_DIMENSION,
        fit: 'inside',
        withoutEnlargement: true,
      });
    }

    let output;
    let outputMimeType;
    if (mimeType === 'image/jpeg') {
      output = await pipeline.webp({ quality: 88, effort: 4, smartSubsample: true }).toBuffer();
      outputMimeType = 'image/webp';
    } else if (mimeType === 'image/png' || mimeType === 'image/webp') {
      output = await pipeline.webp({ lossless: true, effort: 4 }).toBuffer();
      outputMimeType = 'image/webp';
    } else {
      return {
        buffer: null,
        mimeType,
        width,
        height,
        optimizationStatus: 'unchanged',
      };
    }
    const outputMetadata = await sharp(output, { failOn: 'error' }).metadata();
    if (output.length >= buffer.length && !shouldResize) {
      return {
        buffer: null,
        mimeType,
        width,
        height,
        optimizationStatus: 'unchanged',
      };
    }
    return {
      buffer: output,
      mimeType: outputMimeType,
      width: outputMetadata.width,
      height: outputMetadata.height,
      optimizationStatus: 'optimized',
    };
  } catch {
    return {
      buffer: null,
      mimeType,
      width,
      height,
      optimizationStatus: 'failed',
    };
  }
}

function optimizedObjectKey(originalKey) {
  return originalKey.replace(/\/(?:original|optimized)\.[^/.]+$/i, '/optimized.webp');
}

function thumbnailObjectKey(originalKey) {
  return originalKey.replace(/\/(?:original|optimized)\.[^/.]+$/i, '/thumbnail.webp');
}

module.exports = {
  MAX_IMAGE_DIMENSION,
  THUMBNAIL_WIDTH,
  THUMBNAIL_HEIGHT,
  extensionOf,
  validateUploadMetadata,
  validateFileSignature,
  inspectImage,
  createImageThumbnail,
  optimizeImage,
  optimizedObjectKey,
  thumbnailObjectKey,
};
