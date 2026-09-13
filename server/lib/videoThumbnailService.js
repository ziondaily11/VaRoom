const fs = require('fs/promises');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');
const ffmpegPath = require('ffmpeg-static');
const mediaStorageService = require('./mediaStorageService');

const execFileAsync = promisify(execFile);

function thumbnailKeyFor(videoKey) {
  return videoKey.replace(/\/original\.[^/.]+$/i, '/thumbnail.jpg');
}

async function generateVideoThumbnail(videoKey) {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'varoom-video-'));
  const inputPath = path.join(tempDir, 'input');
  const outputPath = path.join(tempDir, 'thumbnail.jpg');
  const thumbnailKey = thumbnailKeyFor(videoKey);

  try {
    const video = await mediaStorageService.downloadR2Object(videoKey);
    await fs.writeFile(inputPath, video);
    await execFileAsync(ffmpegPath, [
      '-hide_banner', '-loglevel', 'error', '-y',
      '-i', inputPath,
      '-vf', 'scale=min(1280\\,iw):-2',
      '-frames:v', '1',
      '-q:v', '3',
      outputPath,
    ], { windowsHide: true, maxBuffer: 1024 * 1024 });
    const thumbnail = await fs.readFile(outputPath);
    await mediaStorageService.uploadR2Object(thumbnailKey, thumbnail, 'image/jpeg');
    return thumbnailKey;
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

module.exports = { generateVideoThumbnail, thumbnailKeyFor };
