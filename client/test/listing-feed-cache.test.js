const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'listing-feed-cache.js'), 'utf8');

function createFeedCache(storage) {
  const values = storage || new Map();
  const sessionStorage = {
    get length() { return values.size; },
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); },
    key(index) { return Array.from(values.keys())[index] || null; },
  };
  const window = { sessionStorage };
  vm.runInNewContext(source, { window, Date, Math, Object, Array, Promise, String, Number });
  return { api: window.VaRoomListingFeedCache, storage: values };
}

test('feed snapshot restores across a script re-entry without fetching again', async () => {
  const storage = new Map();
  const firstEntry = createFeedCache(storage);
  const key = 'client:account-a:home:all:hotel:';
  await firstEntry.api.fetchPage(key, 0, async () => [{ id: 'listing-a', title: 'Cached listing' }]);

  const returnedEntry = createFeedCache(storage);
  let requests = 0;
  const snapshot = returnedEntry.api.snapshot(key);
  if (!snapshot.hasCachedPage) {
    await returnedEntry.api.fetchPage(key, 0, async () => { requests += 1; return []; });
  }

  assert.equal(snapshot.items[0].title, 'Cached listing');
  assert.equal(requests, 0);
});

test('host, client, account and filter dimensions remain isolated', async () => {
  const { api } = createFeedCache();
  await api.fetchPage('host:account-a:all:all:', 0, async () => [{ id: 'host-listing' }]);
  await api.fetchPage('client:account-a:home:all:hotel:', 0, async () => [{ id: 'hotel-listing' }]);
  await api.fetchPage('client:account-b:home:all:hotel:', 0, async () => [{ id: 'other-account-listing' }]);

  assert.deepEqual(Array.from(api.snapshot('host:account-a:all:all:').items, (item) => item.id), ['host-listing']);
  assert.deepEqual(Array.from(api.snapshot('client:account-a:home:all:hotel:').items, (item) => item.id), ['hotel-listing']);
  assert.deepEqual(Array.from(api.snapshot('client:account-b:home:all:hotel:').items, (item) => item.id), ['other-account-listing']);
  assert.equal(api.snapshot('client:account-a:home:all:office:').hasCachedPage, false);
});

test('revalidation leaves cached content available until fresh data arrives, then replaces stale first-page listings', async () => {
  const { api } = createFeedCache();
  const key = 'host:account-a:all:all:';
  await api.fetchPage(key, 0, async () => [
    { id: 'listing-old', title: 'Previously available' },
    { id: 'listing-stable', title: 'Existing listing' },
  ]);

  let finishRefresh;
  const revalidation = api.revalidate(key, () => new Promise((resolve) => { finishRefresh = resolve; }));
  await Promise.resolve();
  assert.deepEqual(
    new Set(Array.from(api.snapshot(key).items, (item) => item.id)),
    new Set(['listing-old', 'listing-stable']),
  );
  finishRefresh([
    { id: 'listing-stable', title: 'Updated listing' },
    { id: 'listing-new', title: 'Fresh listing' },
    { id: 'listing-new', title: 'Duplicate response item' },
  ]);
  await revalidation;
  const refreshed = api.snapshot(key).items;
  assert.deepEqual(Array.from(refreshed, (item) => item.id), ['listing-stable', 'listing-new']);
  assert.equal(refreshed[0].title, 'Updated listing');
});

test('revalidation that shortens the feed removes stale later pages and updates pagination', async () => {
  const { api } = createFeedCache();
  const key = 'client:account-a:home:all:hotel:';
  await api.fetchPage(key, 0, async () => Array.from({ length: 12 }, (_, index) => ({ id: `page-one-${index}` })));
  await api.prefetchNext(key, async () => Array.from({ length: 12 }, (_, index) => ({ id: `page-two-${index}` })));
  assert.equal(api.snapshot(key).nextOffset, 24);

  const result = await api.revalidate(key, async () => [{ id: 'remaining-listing' }]);
  assert.deepEqual(Array.from(result.items, (item) => item.id), ['remaining-listing']);
  assert.equal(result.hasMore, false);
  assert.equal(result.nextOffset, null);
});

test('unchanged listing identities keep their existing order when revalidated', async () => {
  const { api } = createFeedCache();
  const key = 'client:account-a:home:all:hotel:';
  const listings = Array.from({ length: 5 }, (_, index) => ({ id: `listing-${index}`, title: `Old ${index}` }));
  await api.fetchPage(key, 0, async () => listings);
  const before = Array.from(api.snapshot(key).items, (item) => item.id);

  const refreshed = await api.revalidate(key, async () => listings.map((item) => ({ ...item, title: 'Fresh' })));
  assert.deepEqual(Array.from(refreshed.items, (item) => item.id), before);
  assert.ok(refreshed.items.every((item) => item.title === 'Fresh'));
});

test('invalid cache pages fall back to a normal first-page request', async () => {
  const key = 'client:account-a:home:all:hotel:';
  const storage = new Map([[
    `varoom:listings:feed:v1:${encodeURIComponent(key)}`,
    JSON.stringify({
      version: 2,
      updatedAt: Date.now(),
      pages: { 0: [{ title: 'Missing listing identity' }] },
      itemOrder: [],
      endOffset: null,
    }),
  ]]);
  const { api } = createFeedCache(storage);
  assert.equal(api.snapshot(key).hasCachedPage, false);
  let requests = 0;
  const result = await api.fetchPage(key, 0, async () => {
    requests += 1;
    return [{ id: 'valid-listing' }];
  });
  assert.equal(requests, 1);
  assert.deepEqual(Array.from(result.items, (item) => item.id), ['valid-listing']);
});

test('pagination offsets remain unique and contiguous after cache restoration', async () => {
  const { api } = createFeedCache();
  const key = 'client:account-a:marketplace:all::';
  await api.fetchPage(key, 0, async () => [
    ...Array.from({ length: 11 }, (_, index) => ({ id: `listing-${index}` })),
    { id: 'shared-listing' },
  ]);
  const secondPage = await api.prefetchNext(key, async (offset, limit) => {
    assert.equal(offset, 12);
    assert.equal(limit, 12);
    return [{ id: 'shared-listing' }, ...Array.from({ length: 11 }, (_, index) => ({ id: `next-${index}` }))];
  });
  assert.equal(new Set(secondPage.items.map((item) => item.id)).size, secondPage.items.length);
  assert.equal(secondPage.nextOffset, 24);
});
