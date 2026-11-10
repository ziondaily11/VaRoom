'use strict';

process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'test-service-role-key';
process.env.R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID || 'test-account';
process.env.R2_BUCKET_NAME = process.env.R2_BUCKET_NAME || 'test-bucket';
process.env.R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID || 'test-access-key';
process.env.R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY || 'test-secret';

const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const sharp = require('sharp');
const mediaStorageService = require('../lib/mediaStorageService');
const photoRoutes = require('../routes/photoRoutes');
const variants = require('../lib/photoVariants');

const ENV = mediaStorageService.ENVIRONMENT;
const avatarKey = `photos/${ENV}/avatars/22222222-2222-4222-8222-222222222222/33333333-3333-4333-8333-333333333333/original.jpg`;

test('only the sizes pages use are accepted, and copies sit beside the original', () => {
  assert.equal(variants.parseVariantWidth('192'), 192);
  assert.equal(variants.parseVariantWidth('800'), 800);
  for (const bad of ['193', '0', '-192', '192px', '', undefined, '1e3']) assert.equal(variants.parseVariantWidth(bad), null, String(bad));
  assert.equal(variants.variantKey(avatarKey, 192), `${avatarKey}.w192.webp`);
  assert.deepEqual(variants.variantKeysFor(avatarKey), variants.PHOTO_WIDTHS.map((width) => `${avatarKey}.w${width}.webp`));
  assert.deepEqual(variants.variantKeysFor(`${avatarKey}.w192.webp`), [], 'a copy has no copies');
  assert.deepEqual(variants.variantKeysFor('chat-attachments/x/file.pdf'), [], 'documents have none');
});

test('stable signing gives the same inputs all hour and at least two hours of validity', () => {
  const start = Date.UTC(2026, 10, 5, 10, 0, 0);
  const early = variants.stableSigning(start + 60 * 1000);
  const late = variants.stableSigning(start + 59 * 60 * 1000);
  assert.equal(early.signingDate.getTime(), start);
  assert.equal(late.signingDate.getTime(), start);
  assert.equal(early.expiresIn, 10800);
  // Server, CDN and browser may hold the redirect one after another; the URL signed
  // at the end of an hour still has two hours left and must outlive all three.
  const held = variants.SERVER_REDIRECT_TTL_SECONDS + variants.CDN_REDIRECT_MAX_AGE + variants.STABLE_REDIRECT_MAX_AGE;
  assert.ok(held < early.expiresIn - 3600, 'the cached redirect never outlives the URL');
  assert.notEqual(variants.stableSigning(start + 61 * 60 * 1000).signingDate.getTime(), start, 'the next hour signs anew');
});

test('a stable URL is byte-identical within the hour and asks the browser to cache the image', async () => {
  const base = Date.UTC(2026, 10, 5, 10, 0, 0);
  const first = await mediaStorageService.generateStableR2DownloadUrl(avatarKey, undefined, base + 5 * 60 * 1000);
  const second = await mediaStorageService.generateStableR2DownloadUrl(avatarKey, undefined, base + 55 * 60 * 1000);
  assert.equal(first, second);
  assert.match(first, /response-cache-control=public%2C%20max-age%3D3600/);
  assert.match(first, /X-Amz-Expires=10800/);
  const nextHour = await mediaStorageService.generateStableR2DownloadUrl(avatarKey, undefined, base + 65 * 60 * 1000);
  assert.notEqual(first, nextHour);
});

test('a copy is made once, stored as webp, and reused; concurrent requests share the work', async () => {
  const objects = new Map();
  const jpeg = await sharp({ create: { width: 1600, height: 1200, channels: 3, background: '#c41e3a' } }).jpeg().toBuffer();
  objects.set(avatarKey, jpeg);
  let downloads = 0;
  const storage = {
    getR2ObjectMetadata: async (key) => ({ exists: objects.has(key) }),
    downloadR2Object: async (key) => { downloads += 1; return objects.get(key); },
    uploadR2Object: async (key, body, type) => { objects.set(key, { body, type }); },
  };
  const [a, b] = await Promise.all([variants.ensureVariant(storage, avatarKey, 192), variants.ensureVariant(storage, avatarKey, 192)]);
  assert.equal(a, `${avatarKey}.w192.webp`);
  assert.equal(b, a);
  assert.equal(downloads, 1);
  const stored = objects.get(a);
  assert.equal(stored.type, 'image/webp');
  const meta = await sharp(stored.body).metadata();
  assert.equal(meta.format, 'webp');
  assert.equal(meta.width, 192);
  assert.ok(stored.body.length < jpeg.length);
  await variants.ensureVariant(storage, avatarKey, 192);
  assert.equal(downloads, 1, 'an existing copy is not made again');
});

test('a small original is never enlarged', async () => {
  const small = await sharp({ create: { width: 120, height: 90, channels: 3, background: '#000' } }).png().toBuffer();
  const out = await variants.resizeToWebp(small, 800);
  assert.equal((await sharp(out).metadata()).width, 120);
});

test('deleting a photo deletes its copies; other files are deleted alone', async () => {
  const sent = [];
  const { S3Client } = require('@aws-sdk/client-s3');
  const realSend = S3Client.prototype.send;
  S3Client.prototype.send = async function send(command) { sent.push(command); return {}; };
  try {
    await mediaStorageService.deleteR2Object(avatarKey);
    assert.equal(sent[0].constructor.name, 'DeleteObjectCommand');
    assert.equal(sent[0].input.Key, avatarKey);
    assert.deepEqual(sent[1].input.Delete.Objects.map((o) => o.Key), variants.variantKeysFor(avatarKey));

    sent.length = 0;
    await mediaStorageService.deleteR2Object('chat-attachments/production/u/c/a/file.pdf');
    assert.equal(sent.length, 1);

    sent.length = 0;
    await mediaStorageService.deleteR2Objects([avatarKey, 'videos/x/original.mp4']);
    const keys = sent.flatMap((command) => command.input.Delete.Objects.map((o) => o.Key));
    assert.deepEqual(keys.sort(), [avatarKey, 'videos/x/original.mp4', ...variants.variantKeysFor(avatarKey)].sort());
  } finally {
    S3Client.prototype.send = realSend;
  }
});

async function withRoute(overrides, run) {
  photoRoutes.photoRedirectCache.clear();
  variants.forgetKnownVariants();
  const saved = {};
  for (const [name, fn] of Object.entries(overrides)) { saved[name] = mediaStorageService[name]; mediaStorageService[name] = fn; }
  const app = express();
  app.use(photoRoutes);
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const get = (path) => fetch(`http://127.0.0.1:${server.address().port}${path}`, { redirect: 'manual' });
  try { await run(get); } finally {
    await new Promise((resolve) => server.close(resolve));
    Object.assign(mediaStorageService, saved);
  }
}

test('public photos redirect to a stable, cacheable URL; ?w= serves the copy; a bad width is ignored', async () => {
  const signed = [];
  await withRoute({
    generateStableR2DownloadUrl: async (key) => { signed.push(key); return `https://r2.invalid/${key}`; },
    getR2ObjectMetadata: async () => ({ exists: true }),
  }, async (get) => {
    const full = await get(`/photos/avatars/${avatarKey}`);
    assert.equal(full.status, 302);
    assert.equal(full.headers.get('cache-control'), `public, max-age=${variants.STABLE_REDIRECT_MAX_AGE}`);
    assert.equal(full.headers.get('location'), `https://r2.invalid/${avatarKey}`);

    const small = await get(`/photos/avatars/${avatarKey}?w=192`);
    assert.equal(small.headers.get('location'), `https://r2.invalid/${avatarKey}.w192.webp`);

    const odd = await get(`/photos/avatars/${avatarKey}?w=193`);
    assert.equal(odd.headers.get('location'), `https://r2.invalid/${avatarKey}`);
  });
  assert.equal(signed.length, 2, 'the ignored width is the full photo, answered from the server cache');
});

test('when a copy cannot be made the original is served', async () => {
  await withRoute({
    generateStableR2DownloadUrl: async (key) => `https://r2.invalid/${key}`,
    getR2ObjectMetadata: async () => ({ exists: false }),
    downloadR2Object: async () => Buffer.from('not an image'),
    uploadR2Object: async () => { throw new Error('should not upload'); },
  }, async (get) => {
    const originalWarn = console.warn;
    console.warn = () => {};
    try {
      const response = await get(`/photos/avatars/${avatarKey}?w=480`);
      assert.equal(response.status, 302);
      assert.equal(response.headers.get('location'), `https://r2.invalid/${avatarKey}`);
    } finally { console.warn = originalWarn; }
  });
});
