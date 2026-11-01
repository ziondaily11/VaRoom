const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { loadTs } = require('./helpers/loadTs');

const root = path.join(__dirname, '..');

function memoryStorage() {
  const map = new Map();
  return {
    get length() { return map.size; },
    key: (i) => Array.from(map.keys())[i] ?? null,
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
    keys: () => Array.from(map.keys()),
  };
}

function loadCore() {
  return loadTs(path.join(root, 'lib', 'cache', 'createCache.ts'), { globals: { window: undefined } });
}

test('entries are fresh within the TTL, stale after it, and dropped after maxAge', () => {
  const { createCache } = loadCore();
  let clock = 0;
  const storage = memoryStorage();
  const cache = createCache({ namespace: 't:', ttlMs: 100, maxAgeMs: 1000, getStorage: () => storage, now: () => clock });

  cache.write('a', { n: 1 });
  assert.equal(cache.read('a').isFresh, true);
  clock = 500;
  assert.deepEqual([cache.read('a').value, cache.read('a').isFresh], [{ n: 1 }, false]);
  clock = 1500;
  assert.equal(cache.read('a'), null);
  assert.equal(storage.keys().length, 0, 'expired entries leave storage too');
});

test('storage persists entries across cache instances using encoded keys', () => {
  const { createCache } = loadCore();
  const storage = memoryStorage();
  createCache({ namespace: 'p:', ttlMs: 1000, getStorage: () => storage }).write('account:u1:x', 7);
  assert.deepEqual(storage.keys(), ['p:' + encodeURIComponent('account:u1:x')]);
  const reloaded = createCache({ namespace: 'p:', ttlMs: 1000, getStorage: () => storage });
  assert.equal(reloaded.read('account:u1:x').value, 7);
  reloaded.invalidate('account:u1:');
  assert.equal(storage.keys().length, 0, 'prefix invalidation matches decoded keys');
});

test('maxEntries evicts the least recently used entry', () => {
  const { createCache } = loadCore();
  const storage = memoryStorage();
  const cache = createCache({ namespace: 'l:', ttlMs: 1000, maxEntries: 2, getStorage: () => storage });
  cache.write('a', 1);
  cache.write('b', 2);
  cache.read('a');
  cache.write('c', 3);
  assert.equal(cache.read('b'), null);
  assert.equal(cache.read('a').value, 1);
  assert.equal(cache.read('c').value, 3);
  assert.equal(storage.keys().length, 2);
});

test('invalid values are neither written nor returned', () => {
  const { createCache } = loadCore();
  const storage = memoryStorage();
  const cache = createCache({ namespace: 'v:', ttlMs: 1000, getStorage: () => storage, validate: (value) => Array.isArray(value) });
  assert.equal(cache.write('x', { not: 'array' }), false);
  assert.equal(cache.read('x'), null);
  storage.setItem('v:y', JSON.stringify({ value: 'corrupt', updatedAt: Date.now() }));
  assert.equal(cache.read('y'), null);
});

test('load shares one in-flight request, serves fresh entries, and never caches failures', async () => {
  const { createCache } = loadCore();
  const cache = createCache({ namespace: 'd:', ttlMs: 1000, storage: 'memory' });
  let calls = 0;
  const loader = async () => { calls += 1; return { calls }; };

  const [a, b] = await Promise.all([cache.load('k', loader), cache.load('k', loader)]);
  assert.equal(calls, 1);
  assert.equal(a, b);
  await cache.load('k', loader);
  assert.equal(calls, 1, 'fresh entry served without loading');
  await cache.load('k', loader, { force: true });
  assert.equal(calls, 2, 'force loads again');

  await assert.rejects(cache.load('bad', async () => { throw new Error('boom'); }), /boom/);
  assert.equal(cache.read('bad'), null);
});

test('a clear during a load keeps the late result out of the cache; abort rejects the caller', async () => {
  const { createCache } = loadCore();
  const cache = createCache({ namespace: 'c:', ttlMs: 1000, storage: 'memory' });
  let release;
  const pending = cache.load('k', () => new Promise((resolve) => { release = resolve; }));
  await Promise.resolve();
  cache.clear();
  release('late');
  assert.equal(await pending, 'late');
  assert.equal(cache.read('k'), null);

  const controller = new AbortController();
  const aborted = cache.load('slow', () => new Promise(() => {}), { signal: controller.signal });
  controller.abort();
  await assert.rejects(aborted, { name: 'AbortError' });
});

test('clearUserScopedCaches clears only user-scoped caches', () => {
  const { createCache, clearUserScopedCaches } = loadCore();
  const privateCache = createCache({ namespace: 'u:', ttlMs: 1000, storage: 'memory', userScoped: true });
  const publicCache = createCache({ namespace: 'g:', ttlMs: 1000, storage: 'memory' });
  privateCache.write('x', 1);
  publicCache.write('x', 1);
  clearUserScopedCaches();
  assert.equal(privateCache.read('x'), null);
  assert.equal(publicCache.read('x').value, 1);
});

test('a full storage quota does not throw and memory still serves the entry', () => {
  const { createCache } = loadCore();
  const full = { ...memoryStorage(), setItem() { throw new Error('QuotaExceededError'); }, getItem: () => null };
  const cache = createCache({ namespace: 'q:', ttlMs: 1000, getStorage: () => full });
  assert.doesNotThrow(() => cache.write('x', 1));
  assert.equal(cache.read('x').value, 1);
});

test('Client Home news preview and the Property News list no longer overwrite each other', () => {
  const news = loadTs(path.join(root, 'lib', 'propertyNewsCache.ts'), { globals: { window: undefined } });
  news.setCachedNewsList([{ id: 1, title: 'a' }, { id: 2, title: 'b' }, { id: 3, title: 'c' }]);
  news.setCachedNewsPreview([{ id: 9, title: 'preview' }]);
  assert.equal(news.getCachedNewsList().items.length, 3);
  assert.equal(news.getCachedNewsPreview().items.length, 1);
});

test('the article details cache keeps at most 100 articles', () => {
  const news = loadTs(path.join(root, 'lib', 'propertyNewsCache.ts'), { globals: { window: undefined } });
  for (let i = 0; i < 120; i += 1) news.setCachedArticle(i, { id: i, title: `t${i}`, body: 'full' });
  assert.equal(news.getCachedArticle(0), null, 'oldest articles evicted');
  assert.equal(news.getCachedArticle(119).title, 't119');
});

test('cache namespaces are unique and sign-out covers the encoded data-cache keys', () => {
  const { CACHE_NAMESPACES, USER_SCOPED_SESSION_PREFIXES } = loadTs(path.join(root, 'lib', 'cache', 'namespaces.ts'));
  const values = Object.values(CACHE_NAMESPACES);
  assert.equal(new Set(values).size, values.length);
  const encodedKey = 'varoom:data-cache:v1:' + encodeURIComponent('account:u1:bookings');
  assert.ok(USER_SCOPED_SESSION_PREFIXES.some((prefix) => encodedKey.startsWith(prefix)));
});
