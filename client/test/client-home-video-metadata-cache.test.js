const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  fetchClientHomeVideoMetadata,
  readClientHomeVideoMetadata,
  writeClientHomeVideoMetadata,
} = require('../lib/clientHomeVideoMetadataCache');

const source = fs.readFileSync(path.join(__dirname, '..', 'pages', 'client-home.tsx'), 'utf8');

function createStorage() {
  const entries = new Map();
  return {
    getItem(key) { return entries.get(key) || null; },
    setItem(key, value) { entries.set(key, String(value)); },
    entries,
  };
}

test('video metadata is reused only for the matching account and stores no playback URL', () => {
  const storage = createStorage();
  assert.equal(writeClientHomeVideoMetadata(storage, 'account-a', {
    'listing-1': { mediaId: 'media-1', width: 1080, height: 1920 },
    'listing-2': { mediaId: null },
  }), true);
  assert.deepEqual(readClientHomeVideoMetadata(storage, 'account-a', ['listing-1', 'listing-2']), {
    'listing-1': { mediaId: 'media-1', width: 1080, height: 1920 },
    'listing-2': { mediaId: null, width: null, height: null },
  });
  assert.deepEqual(readClientHomeVideoMetadata(storage, 'account-b', ['listing-1']), {});
  const stored = Array.from(storage.entries.values()).join('');
  assert.doesNotMatch(stored, /https?:|playbackUrl|signedUrl/);
});

test('expired or malformed metadata is ignored', () => {
  const storage = createStorage();
  const key = 'varoom:client-home:video-metadata:v1:account-expiry';
  storage.setItem(key, JSON.stringify({
    accountId: 'account-expiry',
    entries: {
      old: { metadata: { mediaId: 'media-old' }, updatedAt: Date.now() - 6 * 60 * 1000 },
      invalid: { metadata: { playbackUrl: 'https://example.test/video' }, updatedAt: Date.now() },
    },
  }));
  assert.deepEqual(readClientHomeVideoMetadata(storage, 'account-expiry', ['old', 'invalid']), {});
});

test('concurrent metadata discovery is deduplicated and failed discovery is not cached', async () => {
  const storage = createStorage();
  let release;
  let calls = 0;
  const loader = async () => {
    calls += 1;
    return new Promise((resolve) => { release = resolve; });
  };
  const first = fetchClientHomeVideoMetadata(storage, 'account-dedupe', ['listing-d'], loader);
  const second = fetchClientHomeVideoMetadata(storage, 'account-dedupe', ['listing-d'], loader);
  await Promise.resolve();
  assert.equal(calls, 1);
  release({ 'listing-d': { mediaId: 'media-d', width: 1920, height: 1080 } });
  assert.deepEqual(await first, await second);
  assert.deepEqual(readClientHomeVideoMetadata(storage, 'account-dedupe', ['listing-d'])['listing-d'], {
    mediaId: 'media-d',
    width: 1920,
    height: 1080,
  });

  await assert.rejects(fetchClientHomeVideoMetadata(storage, 'account-failure', ['listing-f'], async () => {
    throw new Error('discovery failed');
  }), /discovery failed/);
  assert.deepEqual(readClientHomeVideoMetadata(storage, 'account-failure', ['listing-f']), {});
});

test('Client Home reuses metadata but resolves a fresh playback URL for each mounted video', () => {
  assert.match(source, /fetchClientHomeVideoMetadata\(\s*getSessionStorageSafe\(\),\s*accountId,\s*batch/);
  assert.match(source, /\/api\/media\/\$\{encodeURIComponent\(mediaId\)\}\/playback/);
  assert.match(source, /resolvedSessionUserId\.current === accountId/);
  assert.match(source, /authEpoch\.current === requestEpoch/);
  assert.doesNotMatch(fs.readFileSync(path.join(__dirname, '..', 'lib', 'clientHomeVideoMetadataCache.js'), 'utf8'), /playbackUrl|signedUrl/);
});
