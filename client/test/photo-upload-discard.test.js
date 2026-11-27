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

function wizardApi(fetch) {
  return loadTs(path.join(root, 'lib', 'listWizard', 'api.ts'), {
    mocks: { './photoQuality': { PHOTO_RULES: { maxMedia: 8, maxVideos: 2 }, shrinkPhoto: async (file) => ({ ...file, name: 'shrunk.jpg' }) } },
    globals: { fetch, window: { createImageBitmap: async () => ({ width: 1200, height: 800, close() {} }) } },
  });
}

test('each photo row carries the picked file, so the same photo is saved once per listing', async () => {
  const { fetch, calls } = fakeFetch({});
  const api = wizardApi(fetch);
  const picked = { name: 'room.jpg', type: 'image/jpeg', size: 100, lastModified: 7 };
  assert.equal(api.photoFingerprint(picked), 'room.jpg|100|7', 'the picked file, not the shrunk copy');
  const inserted = [];
  const client = (rowError) => ({
    ...session,
    storage: { from: () => ({ upload: async () => ({ data: { path: KEY }, error: null }) }) },
    from: () => ({ insert: async (row) => { inserted.push(row); return { error: rowError }; } }),
  });
  await api.uploadListingPhoto(client(null), 'host-1', picked, 'listing-1', 0);
  assert.equal(inserted[0].source_fingerprint, 'room.jpg|100|7');
  assert.equal(calls.length, 0);
  // Already on the listing (an earlier attempt saved it): the new copy is removed, and that is not a failure.
  await api.uploadListingPhoto(client({ code: '23505', message: 'duplicate key' }), 'host-1', picked, 'listing-1', 0);
  assert.deepEqual(calls, [{ url: '/api/photos/upload-discard', body: { category: 'listing-photos', key: KEY } }]);
});

test('publishing skips photos the listing already has, after a reload or a reopened draft', async () => {
  const api = wizardApi(fakeFetch({}).fetch);
  const rows = (answer) => ({ from: () => ({ select: () => ({ eq: async () => answer }) }) });
  assert.deepEqual([...await api.listingPhotoFingerprints(rows({ data: [{ source_fingerprint: 'a|1|1' }, { source_fingerprint: null }], error: null }), 'listing-1')], ['a|1|1']);
  assert.equal((await api.listingPhotoFingerprints(rows({ data: null, error: { message: 'down' } }), 'listing-1')).size, 0, 'unreadable: upload, the database refuses a repeat');
  const page = require('node:fs').readFileSync(path.join(root, 'pages', 'list.tsx'), 'utf8');
  assert.match(page, /const onListing = await listingPhotoFingerprints\(client, listingId\);\s*files\.forEach\(\(file\) => \{ if \(!isVideoFile\(file\) && onListing\.has\(photoFingerprint\(file\)\)\) uploadedMedia\.current\.add\(file\); \}\);\s*const \{ uploadedCount, failedCount \} = await uploadPendingMedia\(/);
});
