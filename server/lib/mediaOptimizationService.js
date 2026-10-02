const fs = require('fs/promises');
const os = require('os');
const path = require('path');
const sharp = require('sharp');
const { execFile } = require('child_process');
const { promisify } = require('util');
const ffmpegPath = require('ffmpeg-static');
const mediaStorageService = require('./mediaStorageService');

const execFileAsync = promisify(execFile);
const IMAGE_MAX_SIDE = 2000;

function normalizeMimeType(mimeType) {
  return String(mimeType || '').toLowerCase();
}

function shouldResizeImage(width, height) {
  return width > IMAGE_MAX_SIDE || height > IMAGE_MAX_SIDE;
}

function resizeDimensionsForImage(width, height) {
  if (!width || !height) return { width, height };
  if (!shouldResizeImage(width, height)) {
    return { width, height };
  }

  const scale = Math.min(1, IMAGE_MAX_SIDE / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

async function optimizeImageBuffer(buffer, mimeType) {
  const normalizedType = normalizeMimeType(mimeType);
  if (!buffer || buffer.length === 0) {
    return { optimized: false, mimeType: normalizedType, buffer };
  }

  const supportedKinds = new Set(['image/jpeg', 'image/png', 'image/webp']);
  if (!supportedKinds.has(normalizedType)) {
    return { optimized: false, mimeType: normalizedType, buffer };
  }

  const metadata = await sharp(buffer).metadata();
  const width = metadata.width || 0;
  const height = metadata.height || 0;

  if (!width || !height) {
    return { optimized: false, mimeType: normalizedType, buffer };
  }

  const targetDimensions = resizeDimensionsForImage(width, height);
  const shouldResize = targetDimensions.width !== width || targetDimensions.height !== height;

  let pipeline = sharp(buffer).rotate();
  if (shouldResize) {
    pipeline = pipeline.resize({
      width: targetDimensions.width,
      height: targetDimensions.height,
      fit: 'inside',
      withoutEnlargement: true,
    });
  }

  let optimizedBuffer;
  if (normalizedType === 'image/jpeg') {
    optimizedBuffer = await pipeline.jpeg({ quality: 78, mozjpeg: true, progressive: true }).toBuffer();
    return {
      optimized: optimizedBuffer.length < buffer.length,
      mimeType: 'image/jpeg',
      buffer: optimizedBuffer,
    };
  }

  if (normalizedType === 'image/png') {
    optimizedBuffer = await pipeline.png({ compressionLevel: 9, quality: 80, effort: 10, palette: true }).toBuffer();
    return {
      optimized: optimizedBuffer.length < buffer.length,
      mimeType: 'image/png',
      buffer: optimizedBuffer,
    };
  }

  optimizedBuffer = await pipeline.webp({ quality: 78, effort: 6 }).toBuffer();
  return {
    optimized: optimizedBuffer.length < buffer.length,
    mimeType: 'image/webp',
    buffer: optimizedBuffer,
  };
}

async function optimizeVideoBuffer(buffer, mimeType) {
  const normalizedType = normalizeMimeType(mimeType);
  if (!buffer || buffer.length === 0 || !normalizedType.startsWith('video/')) {
    return { optimized: false, mimeType: normalizedType, buffer };
  }

  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'varoom-media-'));
  const inputExt = normalizedType === 'video/quicktime' ? '.mov' : normalizedType === 'video/webm' ? '.webm' : '.mp4';
  const inputPath = path.join(tempDir, `input${inputExt}`);
  const outputPath = path.join(tempDir, 'optimized.mp4');

  try {
    await fs.writeFile(inputPath, buffer);
    const { stderr } = await execFileAsync(ffmpegPath, [
      '-hide_banner',
      '-i', inputPath,
      '-map', '0:v:0',
      '-c', 'copy',
      '-f', 'null',
      '-',
    ], { windowsHide: true, maxBuffer: 512 * 1024 * 1024 });
    const durationMatch = stderr.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
    if (!durationMatch) {
      throw new Error('Unable to determine video duration from media metadata');
    }
    const durationSeconds = Number(durationMatch[1]) * 3600 +
      Number(durationMatch[2]) * 60 +
      Number(durationMatch[3]);
    if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
      throw new Error('Video has an invalid duration');
    }

    await execFileAsync(ffmpegPath, [
      '-hide_banner',
      '-loglevel', 'error',
      '-y',
      '-i', inputPath,
      '-vf', "scale='if(gt(iw,ih),min(1920,iw),-2)':'if(gt(iw,ih),-2,min(1920,ih))':force_original_aspect_ratio=decrease",
      '-c:v', 'libx264',
      '-preset', 'medium',
      '-crf', '28',
      '-pix_fmt', 'yuv420p',
      '-c:a', 'aac',
      '-movflags', '+faststart',
      '-max_muxing_queue_size', '9999',
      outputPath,
    ], { windowsHide: true, maxBuffer: 512 * 1024 * 1024 });

    const optimizedBuffer = await fs.readFile(outputPath);
    return {
      optimized: optimizedBuffer.length < buffer.length,
      mimeType: 'video/mp4',
      buffer: optimizedBuffer.length < buffer.length ? optimizedBuffer : buffer,
      durationSeconds,
    };
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

async function optimizeStoredMediaObject(objectKey, mimeType, fileName = '') {
  if (!objectKey || !mimeType) {
    return { optimized: false, objectKey, mimeType, originalSize: 0, optimizedSize: 0, outputContentType: mimeType || null };
  }

  const originalBuffer = await mediaStorageService.downloadR2Object(objectKey);
  const normalizedType = normalizeMimeType(mimeType);

  let result;
  if (normalizedType.startsWith('image/')) {
    result = await optimizeImageBuffer(originalBuffer, normalizedType);
  } else if (normalizedType.startsWith('video/')) {
    result = await optimizeVideoBuffer(originalBuffer, normalizedType);
  } else {
    return {
      optimized: false,
      objectKey,
      mimeType: normalizedType,
      originalSize: originalBuffer.length,
      optimizedSize: originalBuffer.length,
      outputContentType: normalizedType,
      reason: 'unsupported-media-type',
    };
  }

  if (!result.optimized || !result.buffer || result.buffer.length === 0) {
    return {
      optimized: false,
      objectKey,
      mimeType: normalizedType,
      originalSize: originalBuffer.length,
      optimizedSize: originalBuffer.length,
      outputContentType: normalizedType,
      reason: 'no-size-gain',
      durationSeconds: result.durationSeconds,
    };
  }

  await mediaStorageService.uploadR2Object(objectKey, result.buffer, result.mimeType);

  return {
    optimized: true,
    objectKey,
    mimeType: normalizedType,
    originalSize: originalBuffer.length,
    optimizedSize: result.buffer.length,
    outputContentType: result.mimeType,
    bytesSaved: originalBuffer.length - result.buffer.length,
    durationSeconds: result.durationSeconds,
  };
}

module.exports = {
  optimizeImageBuffer,
  optimizeVideoBuffer,
  optimizeStoredMediaObject,
};
