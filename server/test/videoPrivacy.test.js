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
const supabaseAdmin = require('../lib/supabaseClient');
const mediaStorageService = require('../lib/mediaStorageService');
const { decideListingMediaAccess } = require('../lib/listingMediaAccess');
const videoRoutes = require('../routes/videoRoutes');

const listingId = '11111111-1111-4111-8111-111111111111';
const mediaId = '22222222-2222-4222-8222-222222222222';
const ownerId = '33333333-3333-4333-8333-333333333333';
const otherId = '44444444-4444-4444-8444-444444444444';

async function withVideoServer({ state = 'draft', availability = 'draft', createdAt, visibility = 'restricted' }, run) {
  const listing = {
    id: listingId,
    host_id: ownerId,
    publication_state: state,
    availability_status: availability,
    created_at: createdAt || new Date().toISOString(),
  };
  const media = {
    id: mediaId,
    property_id: listingId,
    media_type: 'video',
    status: 'ready',
    visibility,
    storage_key: 'drafts/videos/production/owner/listing/media/original.mp4',
    thumbnail_key: 'drafts/videos/production/owner/listing/media/thumbnail.jpg',
    deleted_at: null,
    mime_type: 'video/mp4',
    original_filename: 'private.mp4',
  };
  const originalFrom = supabaseAdmin.from;
  const originalGetUser = supabaseAdmin.auth.getUser;
  const originalPlayback = mediaStorageService.generateR2PlaybackUrl;
  const originalDownload = mediaStorageService.generateR2DownloadAuthorization;
  const issued = [];

  supabaseAdmin.auth.getUser = async (token) => ({
    data: { user: { id: token === 'owner-token' ? ownerId : otherId } },
    error: null,
  });
  supabaseAdmin.from = (table) => {
    const query = {
      select() { return this; },
      eq() { return this; },
      is() { return this; },
      order() { return this; },
      single: async () => ({ data: table === 'listings' ? listing : media, error: null }),
      maybeSingle: async () => ({ data: table === 'listings' ? listing : media, error: null }),
      then(resolve, reject) {
        return Promise.resolve({ data: table === 'property_media' ? [media] : [], error: null }).then(resolve, reject);
      },
    };
    return query;
  };
  mediaStorageService.generateR2PlaybackUrl = async () => {
    issued.push('playback');
    return { url: 'https://signed.invalid/video', expiresAt: new Date().toISOString() };
  };
  mediaStorageService.generateR2DownloadAuthorization = async () => {
    issued.push('thumbnail');
    return { url: 'https://signed.invalid/thumbnail', expiresAt: new Date().toISOString() };
  };

  const app = express();
  app.use(videoRoutes);
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const send = async (path, token) => fetch(`http://127.0.0.1:${server.address().port}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  try {
    await run({ send, issued });
  } finally {
    await new Promise((resolve) => server.close(resolve));
    supabaseAdmin.from = originalFrom;
    supabaseAdmin.auth.getUser = originalGetUser;
    mediaStorageService.generateR2PlaybackUrl = originalPlayback;
    mediaStorageService.generateR2DownloadAuthorization = originalDownload;
  }
}

test('denies anonymous draft media list, playback, and thumbnail without signing URLs', async () => {
  await withVideoServer({}, async ({ send, issued }) => {
    const responses = await Promise.all([
      send(`/properties/${listingId}/media`),
      send(`/media/${mediaId}/playback`),
      send(`/media/${mediaId}/thumbnail`),
    ]);
    for (const response of responses) {
      assert.equal(response.status, 404);
      const body = await response.text();
      assert.doesNotMatch(body, /signed\.invalid|storage_key|thumbnail_key/);
    }
    assert.deepEqual(issued, []);
  });
});

test('denies authenticated non-owners and permits the owner to access eligible draft media', async () => {
  await withVideoServer({}, async ({ send, issued }) => {
    const denied = await send(`/media/${mediaId}/playback`, 'other-token');
    assert.equal(denied.status, 404);
    assert.deepEqual(issued, []);

    const allowed = await send(`/properties/${listingId}/media`, 'owner-token');
    assert.equal(allowed.status, 200);
    const body = await allowed.json();
    assert.equal(body.media.length, 1);
    assert.equal(body.media[0].thumbnailUrl, 'https://signed.invalid/thumbnail');
    assert.deepEqual(issued, ['thumbnail']);
  });
});

test('denies failed, payment-pending, discarded, and expired drafts to non-owners', async () => {
  for (const state of ['failed', 'payment_pending', 'discarded']) {
    await withVideoServer({ state }, async ({ send, issued }) => {
      const response = await send(`/media/${mediaId}/playback`);
      assert.equal(response.status, 404);
      assert.deepEqual(issued, []);
    });
  }
  await withVideoServer({
    state: 'draft',
    createdAt: new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toISOString(),
  }, async ({ send, issued }) => {
    assert.equal((await send(`/media/${mediaId}/playback`, 'owner-token')).status, 404);
    assert.deepEqual(issued, []);
  });
});

test('published paused listings retain public media semantics', async () => {
  for (const availability of ['available', 'paused', 'booked', 'unavailable']) {
    await withVideoServer({ state: 'published', availability, visibility: 'public' }, async ({ send, issued }) => {
      const response = await send(`/media/${mediaId}/playback`);
      assert.equal(response.status, 200);
      assert.deepEqual(issued, ['playback', 'thumbnail']);
    });
  }
});

test('five-day policy denies at the exact expiry boundary', () => {
  const createdAt = Date.parse('2026-10-01T00:00:00.000Z');
  const listing = { publication_state: 'draft', host_id: ownerId, created_at: new Date(createdAt).toISOString() };
  assert.equal(decideListingMediaAccess(listing, ownerId, createdAt + 5 * 86400000 - 1).allowed, true);
  assert.equal(decideListingMediaAccess(listing, ownerId, createdAt + 5 * 86400000).allowed, false);
});
