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

test('revalidation leaves cached content available until fresh data arrives', async () => {
  const { api } = createFeedCache();
  const key = 'host:account-a:all:all:';
  await api.fetchPage(key, 0, async () => [{ id: 'listing-old', title: 'Previously available' }]);

  let finishRefresh;
  const revalidation = api.revalidate(key, () => new Promise((resolve) => { finishRefresh = resolve; }));
  await Promise.resolve();
  assert.equal(api.snapshot(key).items[0].title, 'Previously available');
  finishRefresh([{ id: 'listing-new', title: 'Refreshed' }]);
  await revalidation;
  assert.equal(api.snapshot(key).items[0].title, 'Previously available');
  assert.equal(api.snapshot(key).items.some((item) => item.id === 'listing-new'), true);
});
