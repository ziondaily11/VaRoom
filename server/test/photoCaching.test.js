'use strict';

// Photo serving at scale: Vercel's CDN may keep public photo redirects, this
// server keeps its answers for a minute and remembers which copies exist, and
// photo requests neither share one rate-limit allowance nor count against it.

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
const supabaseAdmin = require('../lib/supabaseClient');
const mediaStorageService = require('../lib/mediaStorageService');
const photoRoutes = require('../routes/photoRoutes');
const variants = require('../lib/photoVariants');
const { createPhotoRedirectCache } = require('../lib/photoRedirectCache');
const { visitorIp, isRateLimitExempt } = require('../lib/rateLimitKey');

const ENV = mediaStorageService.ENVIRONMENT;
const listingId = '11111111-1111-4111-8111-111111111111';
const hostId = '22222222-2222-4222-8222-222222222222';
const photoKey = `listing-photos/${ENV}/${listingId}/front.jpg`;
const legacyKey = `${listingId}/legacy-front.jpg`;

// The listing-photos route with the database, R2 and Supabase storage faked.
async function withPhotoServer({ publicationState = 'published', deactivated = false } = {}, run) {
  photoRoutes.photoRedirectCache.clear();
  variants.forgetKnownVariants();
  const counts = { photoLookups: 0, listingLookups: 0, heads: 0, signed: 0, legacySigned: [] };
  const state = { publicationState, deactivated };
  const saved = {
    from: supabaseAdmin.from,
    storageFrom: supabaseAdmin.storage.from,
    getUser: supabaseAdmin.auth.getUser,
    stable: mediaStorageService.generateStableR2DownloadUrl,
    head: mediaStorageService.getR2ObjectMetadata,
    private: mediaStorageService.generateR2DownloadAuthorization,
  };
  supabaseAdmin.auth.getUser = async () => ({ data: { user: { id: '33333333-3333-4333-8333-333333333333' } }, error: null });
  supabaseAdmin.from = (table) => {
    const query = {
      select() { return query; },
      eq() { return query; },
      maybeSingle: async () => {
        if (table === 'listing_photos') {
          counts.photoLookups += 1;
          return { data: { listing_id: listingId, storage_path: 'x' }, error: null };
        }
        counts.listingLookups += 1;
        return {
          data: {
            id: listingId, host_id: hostId, publication_state: state.publicationState, availability_status: 'available',
            created_at: new Date().toISOString(), host: { deactivated_at: state.deactivated ? new Date().toISOString() : null },
          },
          error: null,
        };
      },
    };
    return query;
  };
  supabaseAdmin.storage.from = () => ({
    createSignedUrl: async (key, seconds) => { counts.legacySigned.push(seconds); return { data: { signedUrl: `https://supabase.invalid/${key}` }, error: null }; },
  });
  mediaStorageService.generateStableR2DownloadUrl = async (key) => { counts.signed += 1; return `https://r2.invalid/${key}`; };
  mediaStorageService.getR2ObjectMetadata = async () => { counts.heads += 1; return { exists: true }; };
  mediaStorageService.generateR2DownloadAuthorization = async () => ({ url: 'https://r2.invalid/private' });

  const app = express();
  app.use(photoRoutes);
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const get = (key, { width, token } = {}) => fetch(
    `http://127.0.0.1:${server.address().port}/photos/listing-photos/${key}${width ? `?w=${width}` : ''}`,
    { headers: token ? { Authorization: `Bearer ${token}` } : {}, redirect: 'manual' },
  );
  try {
    await run({ get, counts, state });
  } finally {
    await new Promise((resolve) => server.close(resolve));
    supabaseAdmin.from = saved.from;
    supabaseAdmin.storage.from = saved.storageFrom;
    supabaseAdmin.auth.getUser = saved.getUser;
    mediaStorageService.generateStableR2DownloadUrl = saved.stable;
    mediaStorageService.getR2ObjectMetadata = saved.head;
    mediaStorageService.generateR2DownloadAuthorization = saved.private;
    photoRoutes.photoRedirectCache.clear();
  }
}

// ---------- A: what the CDN may keep ----------

test('public photo redirects may be kept by Vercel\'s CDN; the browser lifetime is unchanged', async () => {
  await withPhotoServer({}, async ({ get }) => {
    const response = await get(photoKey, { width: 800 });
    assert.equal(response.status, 302);
    assert.equal(response.headers.get('location'), `https://r2.invalid/${photoKey}.w800.webp`);
    assert.equal(response.headers.get('cache-control'), `public, max-age=${variants.STABLE_REDIRECT_MAX_AGE}`);
    assert.equal(response.headers.get('vercel-cdn-cache-control'), `max-age=${variants.CDN_REDIRECT_MAX_AGE}`);
  });
});

test('private photos and older Supabase photos are never kept by the CDN', async () => {
  await withPhotoServer({ publicationState: 'published' }, async ({ get, counts }) => {
    const legacy = await get(legacyKey);
    assert.equal(legacy.status, 302);
    assert.equal(legacy.headers.get('cache-control'), 'public, max-age=300');
    assert.equal(legacy.headers.get('vercel-cdn-cache-control'), 'no-store');
    assert.deepEqual(counts.legacySigned, [900], 'the signed URL outlives the browser\'s 5 minutes');
  });
  await withPhotoServer({ publicationState: 'draft' }, async ({ get }) => {
    const draft = await get(photoKey);
    assert.equal(draft.status, 404, 'a draft is not served to anonymous visitors');
    assert.equal(draft.headers.get('cache-control'), null, 'and the 404 carries nothing a cache would keep');
  });
});

test('a redirect held by server, CDN and browser in turn never outlives its signed URL', () => {
  const signedAtEndOfHour = variants.stableSigning(Date.UTC(2026, 10, 10, 10, 59, 59));
  const remaining = signedAtEndOfHour.expiresIn - 3600;
  const held = variants.SERVER_REDIRECT_TTL_SECONDS + variants.CDN_REDIRECT_MAX_AGE + variants.STABLE_REDIRECT_MAX_AGE;
  assert.ok(held < remaining, `${held}s held, ${remaining}s left`);
});

test('client/vercel.json lets the CDN keep photo redirects only, not the rest of /api', () => {
  const vercel = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'client', 'vercel.json'), 'utf8'));
  const caching = vercel.headers.filter((rule) => rule.headers.some((header) => header.key === 'x-vercel-enable-rewrite-caching'));
  assert.deepEqual(caching.map((rule) => rule.source), ['/api/photos/:path*']);
  assert.equal(caching[0].headers.find((header) => header.key === 'x-vercel-enable-rewrite-caching').value, '1');
});

// ---------- B: this server's minute of answers ----------

test('repeat requests for a public photo skip the database, R2 and signing for a minute', async () => {
  await withPhotoServer({}, async ({ get, counts }) => {
    const first = await get(photoKey, { width: 480 });
    const second = await get(photoKey, { width: 480 });
    assert.equal(second.headers.get('location'), first.headers.get('location'));
    assert.equal(second.headers.get('vercel-cdn-cache-control'), `max-age=${variants.CDN_REDIRECT_MAX_AGE}`);
    assert.deepEqual([counts.photoLookups, counts.listingLookups, counts.heads, counts.signed], [1, 1, 1, 1]);
    await get(photoKey, { width: 1200 });
    assert.equal(counts.signed, 2, 'each width is its own answer');
  });
});

test('requests with credentials, private photos and failed copies are not answered from the cache', async () => {
  await withPhotoServer({}, async ({ get, counts }) => {
    await get(photoKey);
    await get(photoKey, { token: 'someone' });
    assert.equal(counts.listingLookups, 2, 'a request with a token is checked in full');
  });
  await withPhotoServer({ publicationState: 'draft' }, async ({ get }) => {
    await get(photoKey);
    assert.equal(photoRoutes.photoRedirectCache.size(), 0);
  });
  await withPhotoServer({}, async ({ get }) => {
    mediaStorageService.getR2ObjectMetadata = async () => { throw new Error('R2 down'); };
    const warn = console.warn;
    console.warn = () => {};
    try {
      const response = await get(photoKey, { width: 192 });
      assert.equal(response.headers.get('location'), `https://r2.invalid/${photoKey}`, 'the original instead');
    } finally {
      console.warn = warn;
    }
    assert.equal(photoRoutes.photoRedirectCache.size(), 0, 'the copy is tried again next time');
  });
});

test('a cached answer lasts its minute, then the photo is checked again', () => {
  let time = 0;
  const cache = createPhotoRedirectCache({ ttlMs: 60000, limit: 2, now: () => time });
  cache.set('listing-photos', 'a', 480, 'u1');
  assert.equal(cache.get('listing-photos', 'a', 480), 'u1');
  assert.equal(cache.get('listing-photos', 'a', 800), null);
  assert.equal(cache.get('avatars', 'a', 480), null);
  time = 60000;
  assert.equal(cache.get('listing-photos', 'a', 480), null, 'an unpublished listing is seen within the minute');
  cache.set('c', 'k1', null, 'x');
  cache.set('c', 'k2', null, 'y');
  cache.set('c', 'k3', null, 'z');
  assert.equal(cache.size(), 2, 'bounded');
  assert.equal(cache.get('c', 'k1', null), null, 'the oldest goes first');
});

test('a copy known to exist is not looked up in R2 again for an hour', async () => {
  variants.forgetKnownVariants();
  let time = 0;
  let heads = 0;
  const storage = { getR2ObjectMetadata: async () => { heads += 1; return { exists: true }; } };
  const key = `${photoKey}.unique-${Date.now()}`;
  await variants.ensureVariant(storage, key, 480, undefined, () => time);
  await variants.ensureVariant(storage, key, 480, undefined, () => time);
  assert.equal(heads, 1);
  time = 60 * 60 * 1000;
  await variants.ensureVariant(storage, key, 480, undefined, () => time);
  assert.equal(heads, 2);
  variants.forgetKnownVariants();
});

// ---------- C: rate limiting per visitor ----------

const request = (headers = {}, extra = {}) => ({ headers, ip: '10.0.0.1', method: 'GET', path: '/listings', ...extra });

test('the limit counts each visitor (Vercel\'s x-real-ip), not the proxy in front of the server', () => {
  assert.equal(visitorIp(request({ 'x-real-ip': '197.248.1.2' }), ''), '197.248.1.2');
  assert.equal(visitorIp(request({ 'x-real-ip': ' 197.248.1.2 ' }), ''), '197.248.1.2');
  assert.equal(visitorIp(request({}), ''), '10.0.0.1', 'without the header: the connection');
  assert.equal(visitorIp(request({ 'x-real-ip': 'x'.repeat(65) }), ''), '10.0.0.1', 'an implausible value is ignored');
});

test('with an origin secret configured, x-real-ip is trusted only on requests from Vercel', () => {
  const secret = 'a'.repeat(64);
  assert.equal(visitorIp(request({ 'x-real-ip': '197.248.1.2', 'x-origin-secret': secret }), secret), '197.248.1.2');
  assert.equal(visitorIp(request({ 'x-real-ip': '197.248.1.2', 'x-origin-secret': 'wrong' }), secret), '10.0.0.1');
  assert.equal(visitorIp(request({ 'x-real-ip': '197.248.1.2' }), secret), '10.0.0.1');
});

test('photo GETs are not counted; everything else still is', () => {
  assert.equal(isRateLimitExempt(request({}, { path: '/photos/listing-photos/a.jpg' })), true);
  assert.equal(isRateLimitExempt(request({}, { method: 'HEAD', path: '/photos/avatars/a.jpg' })), true);
  assert.equal(isRateLimitExempt(request({}, { method: 'POST', path: '/photos/upload' })), false, 'uploads are counted');
  assert.equal(isRateLimitExempt(request({}, { path: '/listings' })), false);
  assert.equal(isRateLimitExempt(request({}, { path: '/chat/photos/x' })), false);
});

test('server.js keys the /api limit on the visitor and skips photo requests', () => {
  const server = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  const limiter = server.slice(server.indexOf('const apiRequestTracker = new Map();'), server.indexOf("ERROR_CODES.RATE_LIMITED);"));
  assert.match(limiter, /if \(isRateLimitExempt\(req\)\) return next\(\);/);
  assert.match(limiter, /const key = visitorIp\(req\);/);
  assert.doesNotMatch(limiter, /const key = req\.ip/);
});
