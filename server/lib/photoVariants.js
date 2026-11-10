'use strict';

const sharp = require('sharp');

// Smaller copies of stored photos, kept beside the original in R2
// (`<original key>.w<width>.webp`): made in the background when a public
// photo is saved or published (scheduleVariants), and otherwise on first
// request (ensureVariant). Pages ask for the width
// they show (an avatar, a card) instead of downloading the full upload, which
// is up to 2000 px on its long side. Deleting the original deletes its copies
// (see mediaStorageService.deleteR2Object / deleteR2Objects).

const PHOTO_WIDTHS = Object.freeze([192, 480, 800, 1200]);
const VARIANT_PATTERN = /\.w\d+\.webp$/;
const IMAGE_KEY_PATTERN = /\.(jpe?g|png|webp|gif)$/i;

/** The requested width when it is one of the sizes made; null otherwise. */
function parseVariantWidth(value) {
  const width = Number(value);
  return PHOTO_WIDTHS.includes(width) ? width : null;
}

const variantKey = (key, width) => `${key}.w${width}.webp`;
const isVariantKey = (key) => VARIANT_PATTERN.test(String(key || ''));

/** Every copy an image key can have (none for non-images or copies). */
function variantKeysFor(key) {
  if (typeof key !== 'string' || !IMAGE_KEY_PATTERN.test(key) || isVariantKey(key)) return [];
  return PHOTO_WIDTHS.map((width) => variantKey(key, width));
}

async function resizeToWebp(buffer, width) {
  return sharp(buffer).rotate().resize({ width, withoutEnlargement: true }).webp({ quality: 78, effort: 4 }).toBuffer();
}

const pending = new Map();

// Copies this process has seen in R2, so a photo request does not ask R2 again
// (a HEAD request each time) for a copy it already knows exists. Kept for an
// hour: copies are only removed with their original, whose photo request then
// fails its own check first.
const KNOWN_TTL_MS = 60 * 60 * 1000;
const KNOWN_LIMIT = 20000;
const known = new Map();

function rememberVariant(target, now) {
  known.delete(target);
  known.set(target, now + KNOWN_TTL_MS);
  if (known.size > KNOWN_LIMIT) known.delete(known.keys().next().value);
}

/** For tests. */
function forgetKnownVariants() {
  known.clear();
}

/**
 * The key of the `width` copy of `key`, making and storing it first if it
 * does not exist yet. Concurrent requests for the same copy share one job.
 * `storage` is mediaStorageService (injected for tests).
 */
function ensureVariant(storage, key, width, resize = resizeToWebp, now = Date.now) {
  const target = variantKey(key, width);
  const knownUntil = known.get(target);
  if (knownUntil && knownUntil > now()) return Promise.resolve(target);
  const existing = pending.get(target);
  if (existing) return existing;
  const job = (async () => {
    const metadata = await storage.getR2ObjectMetadata(target);
    if (!metadata.exists) {
      const original = await storage.downloadR2Object(key);
      const resized = await resize(original, width);
      await storage.uploadR2Object(target, resized, 'image/webp');
    }
    rememberVariant(target, now());
    return target;
  })().finally(() => pending.delete(target));
  pending.set(target, job);
  return job;
}

// ---------- Copies made ahead of the first view ----------

// The sizes pages ask for, by category (client/components/resolveStoredPhotoUrl.ts
// and the Discover feeds): listing photos in every feed size plus the 192 px
// blurred backdrop; avatars small, and 480 on public profiles. Banners and
// update images are shown full size, so they get none.
const UPLOAD_WIDTHS = Object.freeze({
  'listing-photos': Object.freeze([192, 480, 800, 1200]),
  avatars: Object.freeze([192, 480]),
});

/** The widths made ahead for a category (empty when none are). */
function uploadWidthsFor(category) {
  return UPLOAD_WIDTHS[category] || [];
}

/**
 * Makes every missing copy of `key` in `widths`, downloading the original
 * once (ensureVariant downloads it once per width). Copies already in R2, or
 * being made by a photo request, are left alone. Returns the widths made.
 */
async function ensureVariants(storage, key, widths, resize = resizeToWebp, now = Date.now) {
  if (!IMAGE_KEY_PATTERN.test(key) || isVariantKey(key)) return [];
  const missing = [];
  for (const width of widths) {
    const target = variantKey(key, width);
    const knownUntil = known.get(target);
    if ((knownUntil && knownUntil > now()) || pending.has(target)) continue;
    const metadata = await storage.getR2ObjectMetadata(target);
    if (metadata.exists) rememberVariant(target, now());
    else missing.push(width);
  }
  if (!missing.length) return [];
  const original = await storage.downloadR2Object(key);
  const made = [];
  for (const width of missing) {
    const target = variantKey(key, width);
    if (pending.has(target)) continue;
    const job = (async () => {
      const resized = await resize(original, width);
      await storage.uploadR2Object(target, resized, 'image/webp');
      rememberVariant(target, now());
      return target;
    })().finally(() => pending.delete(target));
    pending.set(target, job);
    await job;
    made.push(width);
  }
  return made;
}

// Uploads and publications queue their copies here, one photo at a time, so
// the request that saved the photo is not held up and resizing (CPU heavy)
// never runs many at once. A photo already queued is not queued twice; when
// the queue is full, the copies are made on first view instead.
const QUEUE_LIMIT = 500;
const queued = new Set();
let queueTail = Promise.resolve();

/**
 * Queues the copies of a just-saved public photo. Never throws; a failure is
 * logged and the copy is made on its first view, as before. Resolves when
 * this photo's copies are done (for tests and scripts).
 */
function scheduleVariants(storage, category, key, options = {}) {
  const widths = uploadWidthsFor(category);
  if (!widths.length || typeof key !== 'string' || !key) return Promise.resolve([]);
  if (queued.has(key) || queued.size >= QUEUE_LIMIT) return Promise.resolve([]);
  queued.add(key);
  const run = queueTail.then(() => ensureVariants(storage, key, widths, options.resize, options.now))
    .catch((error) => {
      console.warn(`Photo copies for ${key} will be made on first view instead:`, error && error.message ? error.message : error);
      return [];
    })
    .finally(() => queued.delete(key));
  queueTail = run;
  return run;
}

const HOUR = 60 * 60;

/**
 * Signing inputs that give the same URL for everyone within the same hour, so
 * browsers can reuse both the redirect and the image: signed at the start of
 * the hour, valid for three (always at least two hours left). The redirect
 * can be held by the server (one minute), the CDN and then the browser, one
 * after another, so the URL must outlive all three together.
 */
function stableSigning(now = Date.now()) {
  const bucketStart = Math.floor(now / 1000 / HOUR) * HOUR;
  return { signingDate: new Date(bucketStart * 1000), expiresIn: 3 * HOUR };
}

/** How long a browser keeps the redirect to a stable URL. */
const STABLE_REDIRECT_MAX_AGE = 50 * 60;

/** How long Vercel's CDN keeps it (shared by every visitor). */
const CDN_REDIRECT_MAX_AGE = 30 * 60;

/** How long this server reuses an answer before checking the photo again. */
const SERVER_REDIRECT_TTL_SECONDS = 60;

module.exports = {
  PHOTO_WIDTHS,
  parseVariantWidth,
  variantKey,
  isVariantKey,
  variantKeysFor,
  ensureVariant,
  ensureVariants,
  scheduleVariants,
  uploadWidthsFor,
  UPLOAD_WIDTHS,
  forgetKnownVariants,
  stableSigning,
  STABLE_REDIRECT_MAX_AGE,
  CDN_REDIRECT_MAX_AGE,
  SERVER_REDIRECT_TTL_SECONDS,
  resizeToWebp,
};
