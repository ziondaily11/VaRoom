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
const photoRoutes = require('../routes/photoRoutes');

const listingId = '11111111-1111-4111-8111-111111111111';
const ownerId = '22222222-2222-4222-8222-222222222222';
const mediaKey = `drafts/photos/${process.env.NODE_ENV || 'development'}/${ownerId}/${listingId}/photo/original.jpg`;

async function withPhotoServer(run) {
  const originalFrom = supabaseAdmin.from;
  const originalStorageFrom = supabaseAdmin.storage.from;
  const originalGetUser = supabaseAdmin.auth.getUser;
  const originalDownload = mediaStorageService.generateR2DownloadAuthorization;
  const issued = [];
  supabaseAdmin.auth.getUser = async (token) => ({
    data: { user: { id: token === 'owner-token' ? ownerId : '33333333-3333-4333-8333-333333333333' } },
    error: null,
  });
  supabaseAdmin.from = (table) => {
    const query = {
      select() { return this; },
      eq() { return this; },
      maybeSingle: async () => table === 'listing_photos'
        ? { data: { listing_id: listingId, storage_path: mediaKey }, error: null }
        : {
          data: {
            id: listingId,
            host_id: ownerId,
            publication_state: 'draft',
            availability_status: 'draft',
            created_at: new Date().toISOString(),
          },
          error: null,
        },
    };
    return query;
  };
  supabaseAdmin.storage.from = () => ({
    createSignedUrl: async () => ({ data: { signedUrl: 'https://signed.invalid/legacy-photo' }, error: null }),
  });
  mediaStorageService.generateR2DownloadAuthorization = async () => {
    issued.push(true);
    return { url: 'https://signed.invalid/draft-photo' };
  };

  const app = express();
  app.use(photoRoutes);
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const send = (token) => fetch(
    `http://127.0.0.1:${server.address().port}/photos/listing-photos/${mediaKey}`,
    { headers: token ? { Authorization: `Bearer ${token}` } : {}, redirect: 'manual' },
  );
  try {
    await run({ send, issued });
  } finally {
    await new Promise((resolve) => server.close(resolve));
    supabaseAdmin.from = originalFrom;
    supabaseAdmin.storage.from = originalStorageFrom;
    supabaseAdmin.auth.getUser = originalGetUser;
    mediaStorageService.generateR2DownloadAuthorization = originalDownload;
  }
}

test('draft photo URL reveals neither a signed link nor metadata to anonymous/non-owner viewers', async () => {
  await withPhotoServer(async ({ send, issued }) => {
    const anonymous = await send();
    assert.equal(anonymous.status, 404);
    const nonOwner = await send('other-token');
    assert.equal(nonOwner.status, 404);
    assert.deepEqual(issued, []);
  });
});

test('draft owner receives only a short-lived authorized redirect with private caching', async () => {
  await withPhotoServer(async ({ send, issued }) => {
    const response = await send('owner-token');
    assert.equal(response.status, 302);
    assert.equal(response.headers.get('location'), 'https://signed.invalid/draft-photo');
    assert.equal(response.headers.get('cache-control'), 'private, no-store');
    assert.deepEqual(issued, [true]);
  });
});
