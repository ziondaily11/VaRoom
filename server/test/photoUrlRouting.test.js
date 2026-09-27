'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function patchedStorage(fetchImpl = () => { throw new Error('Unexpected network request'); }) {
  const legacyCalls = [];
  const legacyUploadCalls = [];
  const client = {
    auth: { getSession: async () => ({ data: { session: { access_token: 'test-token' } } }) },
    storage: {
      from(bucket) {
        return {
          getPublicUrl(key) {
            legacyCalls.push({ bucket, key });
            return { data: { publicUrl: `https://supabase.example/${bucket}/${key}` } };
          },
          upload(key) {
            legacyUploadCalls.push({ bucket, key });
            return { data: { path: key }, error: null };
          },
        };
      },
    },
  };
  const window = { supabaseClient: client };
  const source = fs.readFileSync(
    path.resolve(__dirname, '../../client/public/js/supabase-client.js'),
    'utf8',
  );
  vm.runInNewContext(source, { window, fetch: fetchImpl });
  return { client, legacyCalls, legacyUploadCalls };
}

test('builds a photo API URL for migrated listing keys', () => {
  const { client, legacyCalls } = patchedStorage();
  const result = client.storage.from('listing-photos').getPublicUrl(
    'listing-photos/production/listing-id/media-id.jpg',
  );

  assert.equal(
    result.data.publicUrl,
    '/api/photos/listing-photos/listing-photos/production/listing-id/media-id.jpg',
  );
  assert.deepEqual(legacyCalls, []);
});

test('keeps legacy Supabase listing paths on Supabase public URLs', () => {
  const { client, legacyCalls } = patchedStorage();
  const result = client.storage.from('listing-photos').getPublicUrl('user-id/listing-id/photo.jpg');

  assert.equal(
    result.data.publicUrl,
    'https://supabase.example/listing-photos/user-id/listing-id/photo.jpg',
  );
  assert.deepEqual(legacyCalls, [{ bucket: 'listing-photos', key: 'user-id/listing-id/photo.jpg' }]);
});

test('leaves photo uploads on the legacy Supabase flow until a hardened R2 upload path is verified', async () => {
  const calls = [];
  const fetch = async (url, options) => {
    calls.push({ url, options });
    if (url === '/api/photos/upload-init') {
      throw new Error('Unexpected R2 upload init call');
    }
    throw new Error(`Unexpected URL: ${url}`);
  };
  const { client, legacyUploadCalls } = patchedStorage(fetch);
  const result = await client.storage.from('listing-photos').upload(
    'user-id/listing-id/photo.jpg',
    { name: 'photo.jpg', type: 'image/jpeg', size: 100 },
  );

  assert.deepEqual(result, { data: { path: 'user-id/listing-id/photo.jpg' }, error: null });
  assert.deepEqual(calls, []);
  assert.deepEqual(legacyUploadCalls, [{ bucket: 'listing-photos', key: 'user-id/listing-id/photo.jpg' }]);
});

test('leaves unsupported photo uploads on the legacy path for now', async () => {
  const { client, legacyUploadCalls } = patchedStorage();
  const result = await client.storage.from('listing-photos').upload(
    'user-id/listing-id/photo.heic',
    { name: 'photo.heic', type: 'image/heic', size: 100 },
  );

  assert.deepEqual(result, { data: { path: 'user-id/listing-id/photo.heic' }, error: null });
  assert.deepEqual(legacyUploadCalls, [{ bucket: 'listing-photos', key: 'user-id/listing-id/photo.heic' }]);
});

test('leaves storage uploads outside photo categories unchanged', async () => {
  const { client, legacyUploadCalls } = patchedStorage();
  const result = await client.storage.from('chat-attachments').upload(
    'conversation-id/document.pdf',
    { name: 'document.pdf', type: 'application/pdf' },
  );

  assert.deepEqual(result, { data: { path: 'conversation-id/document.pdf' }, error: null });
  assert.deepEqual(legacyUploadCalls, [{ bucket: 'chat-attachments', key: 'conversation-id/document.pdf' }]);
});
