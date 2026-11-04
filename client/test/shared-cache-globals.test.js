const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { loadTs } = require('./helpers/loadTs');

const root = path.join(__dirname, '..');

function memoryStorage(values = new Map()) {
  return {
    values,
    get length() { return values.size; },
    key: (i) => Array.from(values.keys())[i] ?? null,
    getItem: (k) => (values.has(k) ? values.get(k) : null),
    setItem: (k, v) => values.set(k, String(v)),
    removeItem: (k) => values.delete(k),
  };
}


function tsDataCache(storage, now) {
  const { createDataCache } = loadTs(path.join(root, 'lib', 'cache', 'dataCache.ts'), { globals: { window: undefined } });
  return createDataCache({ getStorage: () => storage, now });
}

for (const [name, create] of [['lib/cache/dataCache.ts', (s) => tsDataCache(s)]]) {
  test(`[${name}] VaRoomDataCache serves within the TTL, shares in-flight loads and never caches error results`, async () => {
    const cache = create(memoryStorage());
    let calls = 0;
    const loader = async () => { calls += 1; return { data: calls }; };
    const [a, b] = await Promise.all([cache.get('account:u1:bookings', loader), cache.get('account:u1:bookings', loader)]);
    assert.deepEqual([a, b, calls], [{ data: 1 }, { data: 1 }, 1]);
    assert.deepEqual(await cache.get('account:u1:bookings', loader), { data: 1 });
    assert.equal(calls, 1);
    assert.deepEqual(await cache.get('account:u1:bookings', loader, { ttl: -1 }), { data: 2 }, 'a per-call TTL forces a reload');

    const failing = async () => ({ error: { message: 'boom' } });
    assert.deepEqual(await cache.get('account:u1:x', failing), { error: { message: 'boom' } });
    let reloads = 0;
    await cache.get('account:u1:x', async () => { reloads += 1; return { data: 'ok' }; });
    assert.equal(reloads, 1, 'the error result was not cached');
  });

  test(`[${name}] VaRoomDataCache.invalidate removes matching encoded keys only`, async () => {
    const storage = memoryStorage();
    const cache = create(storage);
    await cache.get('account:u1:a', async () => 1);
    await cache.get('account:u2:a', async () => 2);
    await cache.get('public:listings', async () => 3);
    cache.invalidate('account:u1:');
    const keys = Array.from(storage.values.keys()).map((key) => decodeURIComponent(key.slice('varoom:data-cache:v1:'.length))).sort();
    assert.deepEqual(keys, ['account:u2:a', 'public:listings']);
  });
}

test('chat prefetch cooldown survives a hard page load (sessionStorage stamp)', async () => {
  const sessionStorage = memoryStorage();
  const load = () => loadTs(path.join(root, 'lib', 'chatCache.ts'), { globals: { sessionStorage, window: undefined } });

  const firstPage = load();
  const started = firstPage.prefetch('user-1');
  assert.ok(sessionStorage.getItem('varoom:chat:prefetch:v1:user-1'), 'attempt recorded when it starts');
  firstPage.cancelPrefetch();
  await started;

  // A fresh module instance (as after a hard load) skips within the cooldown.
  const afterReload = load();
  const result = await afterReload.prefetch('user-1');
  assert.deepEqual(result, { success: true, skipped: true, reason: 'cooldown-active' });

  // Another account is unaffected by user-1's stamp.
  const other = afterReload.prefetch('user-2');
  assert.notEqual((await Promise.race([other, Promise.resolve('pending')])).reason, 'cooldown-active');
  afterReload.cancelPrefetch();
});

test('no page loads public/js copies of the bundled caches (the legacy catch-all is retired)', () => {
  for (const file of ['varoom-data-cache.js', 'listing-feed-cache.js', 'varoom-account-profile-cache.js']) {
    assert.equal(fs.existsSync(path.join(root, 'public', 'js', file)), false, `${file} is retired (E2)`);
  }
  assert.equal(fs.existsSync(path.join(root, 'pages', '[...slug].js')), false);
  const listingFeed = fs.readFileSync(path.join(root, 'lib', 'listingFeedCache.ts'), 'utf8');
  assert.doesNotMatch(listingFeed, /createElement\('script'\)/, 'Client Home no longer injects the feed cache script');
});
