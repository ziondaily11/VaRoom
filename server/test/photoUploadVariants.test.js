'use strict';

// Photo size copies made ahead of the first view: when a public photo is
// saved, when a draft listing's photos are published, and by the backfill
// script for older photos — one photo at a time, the original downloaded once.

process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'test-service-role-key';
process.env.R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID || 'test-account';
process.env.R2_BUCKET_NAME = process.env.R2_BUCKET_NAME || 'test-bucket';
process.env.R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID || 'test-access-key';
process.env.R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY || 'test-secret';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const express = require('express');
const sharp = require('sharp');
const supabaseAdmin = require('../lib/supabaseClient');
const mediaStorageService = require('../lib/mediaStorageService');
const mediaOptimizationService = require('../lib/mediaOptimizationService');
const variants = require('../lib/photoVariants');
const { promoteListingMedia } = require('../lib/listingMediaPromotion');
const { isNewR2PhotoObjectKey } = require('../lib/photoStorageKeys');

const ENV = mediaStorageService.ENVIRONMENT;
const userId = '22222222-2222-4222-8222-222222222222';
let photoCounter = 0;
const nextKey = (category = 'listing-photos') => `photos/${ENV}/${category}/${userId}/${String(++photoCounter).padStart(8, '0')}-photo/original.jpg`;

let jpegPromise = null;
const jpeg = () => (jpegPromise = jpegPromise || sharp({ create: { width: 1600, height: 1200, channels: 3, background: '#2a6f97' } }).jpeg().toBuffer());

/** R2 in memory: which copies exist, how often the original was downloaded, what was uploaded. */
async function fakeStorage(existing = []) {
  const original = await jpeg();
  const objects = new Set(existing);
  const log = { heads: [], downloads: 0, uploads: [] };
  return {
    log,
    getR2ObjectMetadata: async (key) => { log.heads.push(key); return { exists: objects.has(key) }; },
    downloadR2Object: async () => { log.downloads += 1; return original; },
    uploadR2Object: async (key, body, type) => { objects.add(key); log.uploads.push({ key, type, width: (await sharp(body).metadata()).width }); },
  };
}

test('sizes are made ahead only where pages use them', () => {
  assert.deepEqual(variants.uploadWidthsFor('listing-photos'), [192, 480, 800, 1200]);
  assert.deepEqual(variants.uploadWidthsFor('avatars'), [192, 480]);
  assert.deepEqual(variants.uploadWidthsFor('profile-banners'), [], 'banners are shown full size');
  assert.deepEqual(variants.uploadWidthsFor('update-images'), []);
  for (const width of variants.UPLOAD_WIDTHS['listing-photos']) assert.ok(variants.PHOTO_WIDTHS.includes(width), 'only sizes /api/photos serves');
});

test('every missing size is made from one download of the original; existing ones are skipped', async () => {
  variants.forgetKnownVariants();
  const key = nextKey();
  const storage = await fakeStorage([variants.variantKey(key, 800)]);
  const made = await variants.ensureVariants(storage, key, [192, 480, 800, 1200]);
  assert.deepEqual(made, [192, 480, 1200]);
  assert.equal(storage.log.downloads, 1, 'the original once, not once per size');
  assert.deepEqual(storage.log.uploads.map((upload) => upload.key), [192, 480, 1200].map((width) => variants.variantKey(key, width)));
  assert.ok(storage.log.uploads.every((upload) => upload.type === 'image/webp'));
  assert.deepEqual(storage.log.uploads.map((upload) => upload.width), [192, 480, 1200]);

  storage.log.heads.length = 0;
  assert.deepEqual(await variants.ensureVariants(storage, key, [192, 480, 800, 1200]), [], 'nothing left to make');
  assert.deepEqual(storage.log.heads, [], 'and copies already known are not looked up again');

  const none = await fakeStorage();
  assert.deepEqual(await variants.ensureVariants(none, `${key}.w192.webp`, [192]), [], 'a copy has no copies');
  assert.deepEqual(await variants.ensureVariants(none, 'photos/x/listing-photos/u/p/file.pdf', [192]), [], 'only images');
  assert.equal(none.log.downloads, 0);
});

test('the queue makes one photo\'s copies at a time, once per photo, and never throws', async () => {
  variants.forgetKnownVariants();
  let running = 0;
  let most = 0;
  const original = await jpeg();
  const storage = {
    getR2ObjectMetadata: async () => ({ exists: false }),
    downloadR2Object: async () => { running += 1; most = Math.max(most, running); await new Promise((resolve) => setTimeout(resolve, 5)); running -= 1; return original; },
    uploadR2Object: async () => {},
  };
  const resize = async () => Buffer.from('copy');
  const [a, b] = [nextKey(), nextKey()];
  const runs = [
    variants.scheduleVariants(storage, 'listing-photos', a, { resize }),
    variants.scheduleVariants(storage, 'listing-photos', a, { resize }),
    variants.scheduleVariants(storage, 'listing-photos', b, { resize }),
  ];
  const results = await Promise.all(runs);
  assert.deepEqual(results[0], [192, 480, 800, 1200]);
  assert.deepEqual(results[1], [], 'a photo already queued is not queued twice');
  assert.deepEqual(results[2], [192, 480, 800, 1200]);
  assert.equal(most, 1, 'one at a time');

  assert.deepEqual(await variants.scheduleVariants(storage, 'profile-banners', nextKey('profile-banners')), [], 'nothing for banners');
  const failing = { getR2ObjectMetadata: async () => { throw new Error('R2 down'); } };
  const warn = console.warn;
  const warnings = [];
  console.warn = (...args) => warnings.push(args.join(' '));
  try {
    assert.deepEqual(await variants.scheduleVariants(failing, 'avatars', nextKey('avatars')), []);
  } finally {
    console.warn = warn;
  }
  assert.match(warnings[0], /made on first view instead/);
});

test('a completed public upload gets its copies in the background; the response does not wait', async () => {
  variants.forgetKnownVariants();
  const key = nextKey('avatars');
  const storage = await fakeStorage();
  const saved = {
    getUser: supabaseAdmin.auth.getUser,
    from: supabaseAdmin.from,
    verify: mediaStorageService.verifyR2ObjectExists,
    head: mediaStorageService.getR2ObjectMetadata,
    download: mediaStorageService.downloadR2Object,
    upload: mediaStorageService.uploadR2Object,
    optimize: mediaOptimizationService.optimizeStoredMediaObject,
  };
  supabaseAdmin.auth.getUser = async () => ({ data: { user: { id: userId } }, error: null });
  mediaStorageService.verifyR2ObjectExists = async () => true;
  mediaStorageService.getR2ObjectMetadata = async (objectKey) => (objectKey === key
    ? { exists: true, contentType: 'image/jpeg', contentLength: 1000 }
    : storage.getR2ObjectMetadata(objectKey));
  mediaStorageService.downloadR2Object = storage.downloadR2Object;
  mediaStorageService.uploadR2Object = storage.uploadR2Object;
  mediaOptimizationService.optimizeStoredMediaObject = async () => ({ optimized: false });

  delete require.cache[require.resolve('../routes/photoRoutes')];
  const app = express();
  app.use(express.json());
  app.use(require('../routes/photoRoutes'));
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/photos/upload-complete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token' },
      body: JSON.stringify({ category: 'avatars', key }),
    });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).key, key);
    const deadline = Date.now() + 5000;
    while (storage.log.uploads.length < 2 && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 20));
    assert.deepEqual(storage.log.uploads.map((upload) => upload.key), [variants.variantKey(key, 192), variants.variantKey(key, 480)]);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    supabaseAdmin.auth.getUser = saved.getUser;
    supabaseAdmin.from = saved.from;
    Object.assign(mediaStorageService, {
      verifyR2ObjectExists: saved.verify, getR2ObjectMetadata: saved.head, downloadR2Object: saved.download, uploadR2Object: saved.upload,
    });
    mediaOptimizationService.optimizeStoredMediaObject = saved.optimize;
  }
});

test('draft photos get no copies at upload (private, served whole); they get them when published', async () => {
  const draftKey = `drafts/photos/${ENV}/${userId}/11111111-1111-4111-8111-111111111111/photo-id/original.jpg`;
  assert.equal(isNewR2PhotoObjectKey('listing-photos', draftKey, ENV), false);
  const routes = fs.readFileSync(path.join(__dirname, '..', 'routes', 'photoRoutes.js'), 'utf8');
  assert.match(routes, /if \(isNewR2PhotoObjectKey\(category, key, mediaStorageService\.ENVIRONMENT\)\) \{\s*void scheduleVariants\(mediaStorageService, category, key\);/);

  const listingId = '11111111-1111-4111-8111-111111111111';
  const photos = [{ storage_path: draftKey }];
  const scheduled = [];
  const supabase = {
    from(table) {
      const query = {
        select() { return query; },
        eq() { return query; },
        is() { return query; },
        upsert: async () => ({ error: null }),
        update(changes) {
          return {
            eq() { return this; },
            select() { return this; },
            maybeSingle: async () => { photos[0].storage_path = changes.storage_path; return { data: { storage_path: changes.storage_path }, error: null }; },
          };
        },
        then(resolve, reject) {
          const data = table === 'listing_photos' ? photos : [];
          return Promise.resolve({ data, error: null }).then(resolve, reject);
        },
      };
      return query;
    },
  };
  await promoteListingMedia(listingId, {
    supabaseAdmin: supabase,
    hostId: userId,
    mediaStorageService: { copyR2Object: async () => {} },
    scheduleVariants: (storage, category, key) => { scheduled.push([category, key]); return Promise.resolve([]); },
  });
  assert.deepEqual(scheduled, [['listing-photos', `photos/${ENV}/listing-photos/${userId}/photo-id/original.jpg`]]);
});

test('the backfill script changes nothing unless asked, skips drafts, and uses the same copy maker', () => {
  const script = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'backfill-photo-variants.js'), 'utf8');
  assert.match(script, /const apply = process\.argv\.includes\('--apply'\);/);
  assert.match(script, /if \(!apply\) \{[\s\S]*?Nothing was changed\.[\s\S]*?return;/);
  assert.match(script, /!key\.startsWith\('drafts\/'\)/);
  assert.match(script, /ensureVariants\(mediaStorageService, key, uploadWidthsFor\(category\)\)/);
  assert.doesNotMatch(script, /\.(update|insert|upsert|delete)\(/, 'the database is only read');
});
