const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  fetchClientHomeWidget,
  readClientHomeWidgetCache,
  writeClientHomeWidgetCache,
} = require('../lib/clientHomeWidgetCache');

const source = fs.readFileSync(path.join(__dirname, '..', 'pages', 'client-home.tsx'), 'utf8');

function createStorage() {
  const entries = new Map();
  return {
    getItem(key) { return entries.get(key) || null; },
    setItem(key, value) { entries.set(key, String(value)); },
  };
}

test('public destination, update, and recommendation snapshots are reusable from session storage', () => {
  const storage = createStorage();
  assert.equal(writeClientHomeWidgetCache(storage, 'destinations', { Nairobi: 12, Mombasa: null }), true);
  assert.deepEqual(readClientHomeWidgetCache(storage, 'destinations'), {
    value: { Nairobi: 12, Mombasa: null },
    isFresh: true,
  });
  assert.equal(writeClientHomeWidgetCache(storage, 'updates', []), true);
  assert.deepEqual(readClientHomeWidgetCache(storage, 'updates').value, []);
  assert.equal(writeClientHomeWidgetCache(storage, 'recommended', [{ id: 'listing-1' }]), true);
  assert.equal(readClientHomeWidgetCache(storage, 'recommended').value[0].id, 'listing-1');
});

test('invalid widget responses and failed requests are never cached as successful empty data', async () => {
  const storage = createStorage();
  assert.equal(writeClientHomeWidgetCache(storage, 'updates', { data: [] }), false);
  assert.equal(writeClientHomeWidgetCache(storage, 'destinations', { Nairobi: -1 }), false);
  assert.equal(writeClientHomeWidgetCache(storage, 'destinations', {}), false);
  await assert.rejects(fetchClientHomeWidget('updates-error-test', async () => {
    throw new Error('request failed');
  }), /request failed/);
  assert.equal(readClientHomeWidgetCache(storage, 'updates-error-test'), null);
});

test('stale widget data remains eligible for immediate display while marked for revalidation', () => {
  const storage = createStorage();
  const originalNow = Date.now;
  try {
    Date.now = () => 1_000_000;
    writeClientHomeWidgetCache(storage, 'updates', [{ id: 'update-stale', body: 'Cached update' }]);
    Date.now = () => 1_000_000 + 6 * 60 * 1000;
    const snapshot = readClientHomeWidgetCache(storage, 'updates');
    assert.equal(snapshot.value[0].id, 'update-stale');
    assert.equal(snapshot.isFresh, false);
  } finally {
    Date.now = originalNow;
  }
});

test('simultaneous consumers share an in-flight public widget request', async () => {
  let release;
  let calls = 0;
  const loader = () => {
    calls += 1;
    return new Promise((resolve) => { release = resolve; });
  };
  const first = fetchClientHomeWidget('updates-dedupe-test', loader);
  const second = fetchClientHomeWidget('updates-dedupe-test', loader);
  await Promise.resolve();
  assert.equal(calls, 1);
  release([]);
  assert.deepEqual(await first, []);
  assert.deepEqual(await second, []);
});

test('sidebar panels hydrate cache before requests and do not wait for bookmarks', () => {
  const widgetStart = source.indexOf("readClientHomeWidgetCache(storage, 'destinations')");
  const widgetFetch = source.indexOf("fetchClientHomeWidget('destinations'", widgetStart);
  const updatesStart = source.indexOf("readClientHomeWidgetCache(storage, 'updates')");
  const updatesFetch = source.indexOf("fetchClientHomeWidget('updates'", updatesStart);
  assert.ok(widgetStart >= 0 && widgetFetch > widgetStart);
  assert.ok(updatesStart >= 0 && updatesFetch > updatesStart);
  assert.match(source, /if \(!user\?\.id\) return \(\) => \{ active = false; \};/);
  assert.doesNotMatch(source.slice(widgetStart, source.indexOf('useEffect(() => {', widgetStart)), /if \(!ready\)/);
  assert.match(source, /if \(active\) setDestinationsLoading\(false\)/);
  assert.match(source, /if \(active\) setUpdatesLoading\(false\)/);
  assert.match(source, /Destination counts could not be refreshed\./);
  assert.match(source, /VaRoom Updates could not be refreshed\./);
  assert.match(source, /Property News could not be refreshed\./);
});

test('sidebar panels have terminal loading, empty, and error rendering branches', () => {
  const updatesStart = source.indexOf('function UpdateList(');
  const updatesEnd = source.indexOf('\nfunction ', updatesStart + 10);
  const updatesList = source.slice(updatesStart, updatesEnd);
  const newsStart = source.indexOf('function PropertyNewsList(');
  const newsEnd = source.indexOf('\nfunction ', newsStart + 10);
  const newsList = source.slice(newsStart, newsEnd);
  assert.match(updatesList, /if \(loading\) return <WidgetLoader/);
  assert.match(updatesList, /items\.length === 0[\s\S]*failed \? 'VaRoom Updates could not be loaded\.'/);
  assert.match(updatesList, /VaRoom Updates could not be refreshed\./);
  assert.match(newsList, /if \(loading\) return <div[^>]*Loading Property News/);
  assert.match(newsList, /items\.length === 0[\s\S]*failed \? 'Property News could not be loaded\.'/);
  assert.match(newsList, /Property News could not be refreshed\./);
  assert.match(source, /destinationsFailed && <p className=\{styles\.widgetMessage\} role="status"/);
});

test('Property News reuses its existing list cache while explicit Refresh forces a request', () => {
  assert.match(source, /const cachedNews = getCachedNewsList\(\)/);
  assert.match(source, /const cached = getCachedNewsList\(\)/);
  assert.match(source, /setCachedNewsList\(result as PropertyNewsItem\[\]\)/);
  assert.match(source, /onClick=\{\(\) => \{ void loadNews\(true\); \}\}>Refresh/);
  assert.match(source, /if \(cached\.isFresh && !force\) return/);
  assert.match(source, /requestVersion !== newsRequestVersion\.current \|\| resolvedSessionUserId\.current !== accountId/);
  assert.match(source, /useIsomorphicLayoutEffect\(\(\) => \{[\s\S]*?readClientHomeWidgetCache\(storage, 'destinations'\)[\s\S]*?getCachedNewsList\(\)/);
});
