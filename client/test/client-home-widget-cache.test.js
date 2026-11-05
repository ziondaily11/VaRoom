'use strict';

// Client Home sidebar widgets (destinations, VaRoom Updates, recommendations)
// and the Property News panel: cache-first display, background refresh and
// failure handling (lib/clientHomeWidgetCache.ts, lib/clientHome/news.ts).

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadTs } = require('./helpers/loadTs');

const quietConsole = { warn() {}, error() {}, log() {} };
const loadWidgetCache = () => loadTs(path.join(__dirname, '..', 'lib', 'clientHomeWidgetCache.ts'), { globals: { window: undefined, console: quietConsole } });
const {
  fetchClientHomeWidget,
  readClientHomeWidgetCache,
  writeClientHomeWidgetCache,
} = loadWidgetCache();

const source = fs.readFileSync(path.join(__dirname, '..', 'pages', 'client-home.tsx'), 'utf8');
const flush = () => new Promise((resolve) => setImmediate(resolve));

test('public destination, update, and recommendation snapshots are reusable', () => {
  assert.equal(writeClientHomeWidgetCache('destinations', { Nairobi: 12, Mombasa: null }), true);
  assert.deepEqual(readClientHomeWidgetCache('destinations'), {
    value: { Nairobi: 12, Mombasa: null },
    isFresh: true,
  });
  assert.equal(writeClientHomeWidgetCache('updates', []), true);
  assert.deepEqual(readClientHomeWidgetCache('updates').value, []);
  assert.equal(writeClientHomeWidgetCache('recommended', [{ id: 'listing-1' }]), true);
  assert.equal(readClientHomeWidgetCache('recommended').value[0].id, 'listing-1');
});

test('invalid widget responses and failed requests are never cached as successful empty data', async () => {
  assert.equal(writeClientHomeWidgetCache('updates', { data: [] }), false);
  assert.equal(writeClientHomeWidgetCache('destinations', { Nairobi: -1 }), false);
  assert.equal(writeClientHomeWidgetCache('destinations', {}), false);
  await assert.rejects(fetchClientHomeWidget('updates-error-test', async () => {
    throw new Error('request failed');
  }), /request failed/);
  assert.equal(readClientHomeWidgetCache('updates-error-test'), null);
});

test('stale widget data remains eligible for immediate display while marked for revalidation', () => {
  const originalNow = Date.now;
  try {
    Date.now = () => 1_000_000;
    writeClientHomeWidgetCache('updates', [{ id: 'update-stale', body: 'Cached update' }]);
    Date.now = () => 1_000_000 + 6 * 60 * 1000;
    const snapshot = readClientHomeWidgetCache('updates');
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

// --- hydrateClientHomeWidget ---------------------------------------------

function widgetView(active = () => true) {
  const events = [];
  return {
    events,
    view: {
      isActive: active,
      setValue: (value) => events.push(['value', value]),
      setLoading: (loading) => events.push(['loading', loading]),
      setFailed: (failed) => events.push(['failed', failed]),
    },
  };
}

function withNow(time, fn) {
  const originalNow = Date.now;
  Date.now = () => time;
  try { return fn(); } finally { Date.now = originalNow; }
}

const update = (id) => ({ id, body: `Update ${id}` });

test('a fresh cached widget renders before any request and is not refetched', async () => {
  const widgets = loadWidgetCache();
  widgets.writeClientHomeWidgetCache('updates', [update('cached')]);
  const { events, view } = widgetView();
  let loaderCreated = false;
  widgets.hydrateClientHomeWidget('updates', view, () => { loaderCreated = true; return async () => []; }, 'failed:');
  await flush();
  assert.deepEqual(events, [['value', [update('cached')]], ['loading', false], ['failed', false]]);
  assert.equal(loaderCreated, false);
});

test('a stale cached widget renders immediately and is replaced by the refreshed value', async () => {
  const widgets = loadWidgetCache();
  withNow(1_000, () => widgets.writeClientHomeWidgetCache('updates', [update('old')]));
  const { events, view } = widgetView();
  await withNow(1_000 + 6 * 60 * 1000, async () => {
    widgets.hydrateClientHomeWidget('updates', view, () => async () => [update('new')], 'failed:');
    assert.deepEqual(events[0], ['value', [update('old')]], 'cached value shown synchronously');
    await flush();
  });
  assert.deepEqual(events.slice(3), [['value', [update('new')]], ['failed', false], ['loading', false]]);
  assert.deepEqual(widgets.readClientHomeWidgetCache('updates').value, [update('new')]);
});

test('without a cache the widget loads, and a failure settles as failed without caching', async () => {
  const widgets = loadWidgetCache();
  const { events, view } = widgetView();
  widgets.hydrateClientHomeWidget('destinations', view, () => async () => { throw new Error('offline'); }, 'failed:');
  assert.deepEqual(events.slice(0, 2), [['loading', true], ['failed', false]]);
  await flush();
  assert.deepEqual(events.slice(2), [['failed', true], ['loading', false]]);
  assert.equal(widgets.readClientHomeWidgetCache('destinations'), null);
});

test('a failed refresh keeps the cached widget value and only flags the failure', async () => {
  const widgets = loadWidgetCache();
  withNow(1_000, () => widgets.writeClientHomeWidgetCache('destinations', { Nairobi: 4 }));
  const { events, view } = widgetView();
  await withNow(1_000 + 6 * 60 * 1000, async () => {
    widgets.hydrateClientHomeWidget('destinations', view, () => async () => { throw new Error('offline'); }, 'failed:');
    await flush();
  });
  assert.deepEqual(events.filter(([kind]) => kind === 'value'), [['value', { Nairobi: 4 }]]);
  assert.deepEqual(events.at(-2), ['failed', true]);
  assert.deepEqual(events.at(-1), ['loading', false]);
});

test('an unavailable data source settles the widget as failed', () => {
  const widgets = loadWidgetCache();
  const { events, view } = widgetView();
  widgets.hydrateClientHomeWidget('updates', view, () => null, 'failed:');
  assert.deepEqual(events, [['loading', true], ['failed', false], ['failed', true], ['loading', false]]);
});

test('a result arriving after the consumer unmounts is cached but not applied', async () => {
  const widgets = loadWidgetCache();
  let active = true;
  const { events, view } = widgetView(() => active);
  widgets.hydrateClientHomeWidget('updates', view, () => async () => [update('late')], 'failed:');
  active = false;
  await flush();
  assert.deepEqual(events, [['loading', true], ['failed', false]]);
  assert.deepEqual(widgets.readClientHomeWidgetCache('updates').value, [update('late')]);
});

// --- Property News --------------------------------------------------------

function loadNews({ cached = null, fetchImpl }) {
  const cache = { preview: cached, writes: [], used: new Set() };
  const propertyNewsCache = new Proxy({
    getCachedNewsPreview: () => cache.preview,
    setCachedNewsPreview: (items) => { cache.writes.push(items); },
  }, { get(target, name) { cache.used.add(name); return target[name]; } });
  const requests = [];
  const fetch = async (url, init) => {
    requests.push({ url, init });
    return fetchImpl(url, init);
  };
  const { loadClientHomeNews } = loadTs(path.join(__dirname, '..', 'lib', 'clientHome', 'news.ts'), {
    mocks: { '../propertyNewsCache': propertyNewsCache },
    globals: { fetch, console: quietConsole },
  });
  const events = [];
  let accountId = 'u1';
  const context = (overrides = {}) => ({
    accountId: 'u1',
    currentAccountId: () => accountId,
    requestVersion: shared.requestVersion,
    abortController: shared.abortController,
    setNews: (items) => events.push(['news', items]),
    setNewsFailed: (failed) => events.push(['failed', failed]),
    setNewsLoading: (loading) => events.push(['loading', loading]),
    ...overrides,
  });
  const shared = { requestVersion: { current: 0 }, abortController: { current: null } };
  return { loadClientHomeNews, context, events, requests, cache, shared, switchAccount: (id) => { accountId = id; } };
}

const article = (id) => ({ id, title: `Article ${id}` });
const ok = (body) => ({ ok: true, status: 200, json: async () => body });

test('fresh cached Property News renders without a request; Refresh forces an uncached request', async () => {
  const harness = loadNews({ cached: { items: [article(1)], isFresh: true }, fetchImpl: async () => ok([article(2)]) });
  await harness.loadClientHomeNews(false, harness.context());
  assert.deepEqual(harness.events, [['news', [article(1)]], ['failed', false], ['loading', false]]);
  assert.equal(harness.requests.length, 0);

  harness.events.length = 0;
  await harness.loadClientHomeNews(true, harness.context());
  assert.deepEqual(harness.events[0], ['loading', true], 'Refresh shows the spinner first');
  assert.equal(harness.requests.length, 1);
  assert.equal(harness.requests[0].url, '/api/news/latest?limit=5');
  assert.equal(harness.requests[0].init.cache, 'no-store');
  assert.deepEqual(harness.cache.writes, [[article(2)]]);
  assert.deepEqual(harness.events.slice(-3), [['news', [article(2)]], ['failed', false], ['loading', false]]);
});

test('stale or missing Property News is requested with normal HTTP caching', async () => {
  const harness = loadNews({ fetchImpl: async () => ok([article('a')]) });
  await harness.loadClientHomeNews(false, harness.context());
  assert.deepEqual(harness.events[0], ['loading', true]);
  assert.equal(harness.requests[0].init.cache, 'default');
  assert.deepEqual(harness.events.slice(1), [['news', [article('a')]], ['failed', false], ['loading', false]]);
});

test('Property News failures and invalid responses keep the visible articles', async () => {
  for (const fetchImpl of [
    async () => ({ ok: false, status: 503, json: async () => [] }),
    async () => ok({ items: [] }),
    async () => ok([{ title: 'no id' }]),
    async () => { throw new Error('offline'); },
  ]) {
    const harness = loadNews({ cached: { items: [article(1)], isFresh: false }, fetchImpl });
    await harness.loadClientHomeNews(false, harness.context());
    assert.deepEqual(harness.events.filter(([kind]) => kind === 'news'), [['news', [article(1)]]], 'only the cached articles are shown');
    assert.deepEqual(harness.events.slice(-2), [['failed', true], ['loading', false]]);
    assert.deepEqual(harness.cache.writes, []);
  }
});

test('a Property News response for a previous account or an older request is ignored', async () => {
  let release;
  const harness = loadNews({ fetchImpl: () => new Promise((resolve) => { release = () => resolve(ok([article('late')])); }) });
  const pending = harness.loadClientHomeNews(false, harness.context());
  await flush();
  harness.switchAccount('u2');
  release();
  await pending;
  assert.deepEqual(harness.events, [['loading', true]], 'no news, failure or loading change for the old account');
  assert.deepEqual(harness.cache.writes, []);

  const second = loadNews({ fetchImpl: () => new Promise((resolve) => { release = () => resolve(ok([article('old')])); }) });
  const older = second.loadClientHomeNews(false, second.context());
  await flush();
  second.shared.requestVersion.current += 1; // a newer request or unmount
  release();
  await older;
  assert.deepEqual(second.cache.writes, []);
});

test('a new Property News request aborts the previous one, whose failure is then ignored', async () => {
  const signals = [];
  const harness = loadNews({
    fetchImpl: (_url, init) => {
      signals.push(init.signal);
      if (signals.length === 1) {
        return new Promise((_resolve, reject) => init.signal.addEventListener('abort', () => reject(new Error('aborted'))));
      }
      return Promise.resolve(ok([article('latest')]));
    },
  });
  const first = harness.loadClientHomeNews(false, harness.context());
  await flush();
  await harness.loadClientHomeNews(true, harness.context());
  await first;
  assert.equal(signals[0].aborted, true);
  assert.equal(harness.events.some(([kind, value]) => kind === 'failed' && value === true), false);
  assert.deepEqual(harness.cache.writes, [[article('latest')]]);
});

test('explicit Refresh only updates this browser\'s Property News preview cache', async () => {
  const harness = loadNews({ cached: { items: [article(1)], isFresh: true }, fetchImpl: async () => ok([article(2)]) });
  await harness.loadClientHomeNews(true, harness.context());
  assert.deepEqual([...harness.cache.used].filter((name) => typeof name === 'string').sort(), ['getCachedNewsPreview', 'setCachedNewsPreview']);
});

// Wiring and rendering kept as source checks.

test('sidebar panels hydrate before paint and refresh per account without waiting for bookmarks', () => {
  assert.match(source, /useIsomorphicLayoutEffect\(\(\) => \{\s*const cachedDestinations = readClientHomeWidgetCache[\s\S]*?getCachedNewsPreview\(\)/);
  const effectStart = source.indexOf("hydrateClientHomeWidget<Record<string, number | null>>('destinations'");
  const effect = source.slice(source.lastIndexOf('useEffect(() => {', effectStart), source.indexOf('}, [user?.id]);', effectStart));
  assert.match(effect, /if \(!user\?\.id\) return \(\) => \{ active = false; \};/);
  assert.match(effect, /hydrateClientHomeWidget<Update\[\]>\('updates'/);
  assert.doesNotMatch(effect, /\bready\b/);
  assert.match(source, /const loadNews = useCallback\(\(force = false\) => loadClientHomeNews\(force, \{[\s\S]*?currentAccountId: \(\) => resolvedSessionUserId\.current/);
  assert.match(source, /onClick=\{\(\) => \{ void loadNews\(true\); \}\}>Refresh/);
});

test('sidebar panels have terminal loading, empty, and error rendering branches', () => {
  const updatesStart = source.indexOf('function UpdateList(');
  const updatesList = source.slice(updatesStart, source.indexOf('\nfunction ', updatesStart + 10));
  const newsStart = source.indexOf('function PropertyNewsList(');
  const newsList = source.slice(newsStart, source.indexOf('\nfunction ', newsStart + 10));
  assert.match(updatesList, /if \(loading\) return <WidgetLoader/);
  assert.match(updatesList, /items\.length === 0[\s\S]*failed \? 'VaRoom Updates could not be loaded\.'/);
  assert.match(updatesList, /VaRoom Updates could not be refreshed\./);
  assert.match(newsList, /if \(loading\) return <div[^>]*Loading Property News/);
  assert.match(newsList, /items\.length === 0[\s\S]*failed \? 'Property News could not be loaded\.'/);
  assert.match(newsList, /Property News could not be refreshed\./);
  assert.match(source, /destinationsFailed && <p className=\{styles\.widgetMessage\} role="status">Destination counts could not be refreshed\./);
});

test('a failed Refresh brings back the articles already shown, with the notice', async () => {
  const harness = loadNews({ cached: { items: [article(1)], isFresh: true }, fetchImpl: async () => { throw new Error('offline'); } });
  await harness.loadClientHomeNews(true, harness.context({ minimumRefreshMs: 5 }));
  assert.deepEqual(harness.events, [['loading', true], ['failed', true], ['loading', false]]);
});
