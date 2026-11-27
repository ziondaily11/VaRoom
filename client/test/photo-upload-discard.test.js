const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { loadTs } = require('./helpers/loadTs');

const root = path.join(__dirname, '..');
const KEY = 'drafts/photos/production/host-1/listing-1/p1/original.jpg';

// fetch answers by URL; every call is recorded.
function fakeFetch(answers) {
  const calls = [];
  const fetch = async (url, init = {}) => {
    calls.push({ url, body: typeof init.body === 'string' ? JSON.parse(init.body) : null });
    const [status, body] = answers[url] || [200, {}];
    return { ok: status < 400, status, json: async () => body };
  };
  return { fetch, calls };
}

const session = { auth: { getSession: async () => ({ data: { session: { access_token: 't' } } }) } };
const photo = { name: 'room.jpg', type: 'image/jpeg', size: 100 };

function patchedBucket(fetch) {
  const { installR2PhotoStorage } = loadTs(path.join(root, 'lib', 'supabase', 'r2PhotoStorage.ts'), { globals: { fetch } });
  const client = { ...session, storage: { from: () => ({ getPublicUrl: () => ({ data: {} }) }) } };
  installR2PhotoStorage(client);
  return client.storage.from('listing-photos');
}

test('a photo upload that fails after it was reserved is discarded at once, so it does not hold up publishing', async () => {
  for (const failing of ['https://r2/put', '/api/photos/upload-complete']) {
    const { fetch, calls } = fakeFetch({ '/api/photos/upload-init': [200, { key: KEY, uploadUrl: 'https://r2/put' }], [failing]: [500, {}] });
    const { error } = await patchedBucket(fetch).upload('host-1/listing-1/1_0_room.jpg', photo);
    assert.ok(error, failing);
    assert.deepEqual(calls.at(-1), { url: '/api/photos/upload-discard', body: { category: 'listing-photos', key: KEY } });
  }
});

test('a photo that uploads, or is never reserved, is not discarded', async () => {
  const ok = fakeFetch({ '/api/photos/upload-init': [200, { key: KEY, uploadUrl: 'https://r2/put' }], '/api/photos/upload-complete': [200, { key: KEY }] });
  assert.equal((await patchedBucket(ok.fetch).upload('host-1/listing-1/1_0_room.jpg', photo)).data.path, KEY);
  const refused = fakeFetch({ '/api/photos/upload-init': [403, { error: 'suspended' }] });
  assert.match((await patchedBucket(refused.fetch).upload('host-1/listing-1/1_0_room.jpg', photo)).error.message, /suspended/);
  for (const { calls } of [ok, refused]) assert.equal(calls.some((call) => call.url === '/api/photos/upload-discard'), false);
});

test('an uploaded listing photo whose row cannot be saved is discarded', async () => {
  const { fetch, calls } = fakeFetch({});
  const api = loadTs(path.join(root, 'lib', 'listWizard', 'api.ts'), {
    mocks: { './photoQuality': { PHOTO_RULES: { maxMedia: 8, maxVideos: 2 }, shrinkPhoto: async (file) => file } },
    globals: { fetch, window: { createImageBitmap: async () => ({ width: 1200, height: 800, close() {} }) } },
  });
  const client = {
    ...session,
    storage: { from: () => ({ upload: async () => ({ data: { path: KEY }, error: null }) }) },
    from: () => ({ insert: async () => ({ error: new Error('row refused') }) }),
  };
  await assert.rejects(api.uploadListingPhoto(client, 'host-1', photo, 'listing-1', 0), /row refused/);
  assert.deepEqual(calls, [{ url: '/api/photos/upload-discard', body: { category: 'listing-photos', key: KEY } }]);
});
