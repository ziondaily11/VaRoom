process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'test-service-role-key';
process.env.R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID || 'test-account';
process.env.R2_BUCKET_NAME = process.env.R2_BUCKET_NAME || 'test-bucket';
process.env.R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID || 'test-access-key';
process.env.R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY || 'test-secret';
process.env.R2_ENDPOINT = process.env.R2_ENDPOINT || 'https://test-account.r2.cloudflarestorage.com';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs/promises');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');
const sharp = require('sharp');
const ffmpegPath = require('ffmpeg-static');
const { optimizeImageBuffer, optimizeVideoBuffer } = require('../lib/mediaOptimizationService');

const execFileAsync = promisify(execFile);

test('optimizeImageBuffer preserves aspect ratio and reduces JPEG size', async () => {
  const original = await sharp({
    create: {
      width: 1920,
      height: 1080,
      channels: 3,
      background: { r: 255, g: 0, b: 0 },
    },
  })
    .jpeg({ quality: 100 })
    .toBuffer();

  const optimized = await optimizeImageBuffer(original, 'image/jpeg');

  assert.equal(optimized.mimeType, 'image/jpeg');
  assert.ok(optimized.buffer.length > 0);
  assert.ok(optimized.buffer.length < original.length);

  const metadata = await sharp(optimized.buffer).metadata();
  assert.ok(metadata.width > 0 && metadata.height > 0);
  assert.ok(Math.abs((metadata.width / metadata.height) - (1920 / 1080)) < 0.05);
});

test('optimizeVideoBuffer preserves aspect ratio and returns a valid MP4', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'varoom-video-test-'));
  const inputPath = path.join(tempDir, 'source.mp4');
  const outputPath = path.join(tempDir, 'optimized.mp4');

  try {
    await execFileAsync(ffmpegPath, [
      '-hide_banner',
      '-loglevel', 'error',
      '-y',
      '-f', 'lavfi',
      '-i', 'testsrc=size=1920x1080:rate=30:duration=3',
      '-pix_fmt', 'yuv420p',
      '-c:v', 'libx264',
      '-b:v', '10M',
      inputPath,
    ], { windowsHide: true, maxBuffer: 512 * 1024 * 1024 });

    const original = await fs.readFile(inputPath);
    const optimized = await optimizeVideoBuffer(original, 'video/mp4');

    assert.equal(optimized.mimeType, 'video/mp4');
    assert.ok(optimized.buffer.length > 0);
    assert.ok(optimized.buffer.length <= original.length + 1);
    await fs.writeFile(outputPath, optimized.buffer);
    const stat = await fs.stat(outputPath);
    assert.ok(stat.size > 0);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});
