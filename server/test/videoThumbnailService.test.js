process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'test-key';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs/promises');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');
const sharp = require('sharp');
const ffmpegPath = require('ffmpeg-static');
const mediaStorageService = require('../lib/mediaStorageService');
const { generateVideoThumbnail } = require('../lib/videoThumbnailService');

const execFileAsync = promisify(execFile);

test('creates a compact 4:3 video thumbnail using the existing R2 storage service', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'varoom-chat-video-test-'));
  const videoPath = path.join(tempDir, 'sample.mp4');
  const originalDownload = mediaStorageService.downloadR2Object;
  const originalUpload = mediaStorageService.uploadR2Object;
  let uploaded;

  try {
    await execFileAsync(ffmpegPath, [
      '-hide_banner', '-loglevel', 'error', '-y',
      '-f', 'lavfi', '-i', 'color=c=blue:s=640x480:d=1',
      '-an', '-c:v', 'mpeg4', '-pix_fmt', 'yuv420p', videoPath,
    ], { windowsHide: true, timeout: 20_000 });
    const video = await fs.readFile(videoPath);
    mediaStorageService.downloadR2Object = async () => video;
    mediaStorageService.uploadR2Object = async (key, body, mimeType) => {
      uploaded = { key, body, mimeType };
      return { objectKey: key };
    };

    const thumbnailKey = await generateVideoThumbnail(
      'chat-attachments/test/conversation/user/attachment/original.mp4',
      { width: 480, height: 360, timeoutMs: 20_000 }
    );
    const metadata = await sharp(uploaded.body).metadata();

    assert.equal(thumbnailKey, 'chat-attachments/test/conversation/user/attachment/thumbnail.jpg');
    assert.equal(uploaded.key, thumbnailKey);
    assert.equal(uploaded.mimeType, 'image/jpeg');
    assert.equal(metadata.width, 480);
    assert.equal(metadata.height, 360);
  } finally {
    mediaStorageService.downloadR2Object = originalDownload;
    mediaStorageService.uploadR2Object = originalUpload;
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});
