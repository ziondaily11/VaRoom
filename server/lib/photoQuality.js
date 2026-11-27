'use strict';

// The server's check of an uploaded listing photo: the same measures and
// limits as the browser's (client/lib/listWizard/photoQuality.ts), so a photo
// that got past the browser some other way is still refused when it is too
// small or too blurry. Notes about soft, dark or odd-shaped photos are the
// browser's alone; the server only refuses clear failures.

const sharp = require('sharp');

const MIN_LONG_SIDE = 1000;
const BLURRY = 30;
const MEASURE_SIDE = 512;

function sharpness(gray, width, height) {
  let sum = 0;
  let sumSq = 0;
  let n = 0;
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const i = y * width + x;
      const v = gray[i - width] + gray[i + width] + gray[i - 1] + gray[i + 1] - 4 * gray[i];
      sum += v;
      sumSq += v * v;
      n += 1;
    }
  }
  if (!n) return 0;
  const mean = sum / n;
  return sumSq / n - mean * mean;
}

/** Why an uploaded listing photo is refused, or null when it is fine. */
async function photoProblem(bytes) {
  let image;
  try { image = sharp(bytes, { failOn: 'error' }).rotate(); } catch { return 'This file is not a photo we can read.'; }
  let metadata;
  try { metadata = await image.metadata(); } catch { return 'This file is not a photo we can read.'; }
  const width = metadata.autoOrient ? metadata.autoOrient.width : metadata.width;
  const height = metadata.autoOrient ? metadata.autoOrient.height : metadata.height;
  if (!width || !height) return 'This file is not a photo we can read.';
  if (Math.max(width, height) < MIN_LONG_SIDE) {
    return `This photo is too small (${width}×${height}). Use a photo at least ${MIN_LONG_SIDE} pixels on its longest side.`;
  }
  const { data, info } = await image.resize(MEASURE_SIDE, MEASURE_SIDE, { fit: 'inside' }).greyscale().raw().toBuffer({ resolveWithObject: true });
  if (sharpness(data, info.width, info.height) < BLURRY) return 'This photo is too blurry. Try a sharper photo.';
  return null;
}

module.exports = { MIN_LONG_SIDE, BLURRY, sharpness, photoProblem };
