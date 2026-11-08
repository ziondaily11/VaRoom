// The Discover feeds' performance system (lib/discover): keyset pages from the
// shared listing-feed cache, the rendering window's decisions, progressive
// media, the scroll anchor search, and the phone viewer's retained videos.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadTs } = require('./helpers/loadTs');

const root = path.join(__dirname, '..');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');
const cursor = loadTs(path.join(root, 'lib', 'discover', 'feedCursor.ts'));
const media = loadTs(path.join(root, 'lib', 'discover', 'feedMedia.ts'));
const feedWindow = loadTs(path.join(root, 'lib', 'discover', 'feedWindow.ts'));

// ---------- Keyset pages ----------

test('the cursor continues after the last listing shown, newest first, with quoted values', () => {
  const filter = cursor.feedCursorFilter({ id: 'b7a0-uuid', created_at: '2026-11-01T10:00:00.123+00:00' });
  assert.equal(filter, 'created_at.lt."2026-11-01T10:00:00.123+00:00",and(created_at.eq."2026-11-01T10:00:00.123+00:00",id.lt."b7a0-uuid")');
  assert.equal(cursor.feedCursorFilter(null), null);
  assert.equal(cursor.feedCursorFilter({ id: 'x' }), null, 'no created_at: offset instead');
  assert.doesNotMatch(cursor.feedCursorFilter({ id: 'a"b', created_at: 't"' }), /a"b|t""/, 'quotes cannot break out of a value');
});

function recordingQuery() {
  const ops = [];
  const query = new Proxy({}, { get: (_t, prop) => (...args) => { ops.push([prop, ...args]); return query; } });
  return { query, ops };
}

test('a page after the first uses the cursor when the previous row is known, the offset otherwise', () => {
  const after = { id: 'L12', created_at: '2026-11-01T10:00:00+00:00' };
  let q = recordingQuery();
  cursor.pageAfter(q.query, 12, 12, after);
  assert.deepEqual(q.ops.map(([op]) => op), ['or', 'limit']);
  assert.deepEqual(q.ops[1], ['limit', 12]);
  q = recordingQuery();
  cursor.pageAfter(q.query, 0, 12, after);
  assert.deepEqual(q.ops, [['range', 0, 11]], 'the first page is always the newest');
  q = recordingQuery();
  cursor.pageAfter(q.query, 24, 12, null);
  assert.deepEqual(q.ops, [['range', 24, 35]], 'older cache entries still page by offset');
});

test('Host home asks for rows after the last loaded listing', async () => {
  const hh = loadTs(path.join(root, 'lib', 'hostHome', 'hostHome.ts'));
  const ops = [];
  const chain = new Proxy({}, {
    get(_t, prop) {
      if (prop === 'then') return (resolve) => resolve({ data: [], error: null });
      return (...args) => { ops.push([prop, ...args]); return chain; };
    },
  });
  await hh.feedFetcher({ from: () => chain }, 'U1', false, 'all', '')(12, 12, { id: 'L12', created_at: '2026-11-01T10:00:00+00:00' });
  assert.ok(ops.some(([op, filter]) => op === 'or' && /created_at\.lt\./.test(filter)));
  assert.ok(ops.some(([op, count]) => op === 'limit' && count === 12));
  assert.ok(!ops.some(([op]) => op === 'range'));
});

test('the feed cache hands each page fetcher the last listing of the page before (as the server sent it)', async () => {
  const { createListingFeedCache } = loadTs(path.join(root, 'lib', 'listingFeedCache.ts'), { globals: { window: undefined } });
  const cache = createListingFeedCache({ getStorage: () => null, random: () => 0 });
  const rows = Array.from({ length: 30 }, (_, index) => ({ id: `L${index}`, created_at: `2026-10-${String(30 - index).padStart(2, '0')}` }));
  const seen = [];
  const fetcher = async (offset, limit, after) => {
    seen.push([offset, after && after.id]);
    const start = after ? rows.findIndex((row) => row.id === after.id) + 1 : offset;
    return { data: rows.slice(start, start + limit) };
  };
  await cache.fetchPage('k', 0, fetcher);
  await cache.prefetchNext('k', fetcher);
  const last = await cache.prefetchNext('k', fetcher);
  assert.deepEqual(seen, [[0, null], [12, 'L11'], [24, 'L23']]);
  assert.equal(last.items.length, 30);
  assert.equal(new Set(last.items.map((row) => row.id)).size, 30, 'no listing twice');
  assert.equal(last.hasMore, false);
});

test('both feeds page through the cursor', () => {
  assert.match(read('pages', 'client-home.tsx'), /pageAfter\(listingQuery\(\)\.order\('created_at', \{ ascending: false \}\)\.order\('id', \{ ascending: false \}\), offset, limit, after\)/);
  assert.match(read('lib', 'hostHome', 'hostHome.ts'), /pageAfter\(withFilters\(listings\(\)\)/);
});

// ---------- The rendering window ----------

test('cards are mounted near the screen; before the observer reports, only the first few', () => {
  assert.equal(feedWindow.isWindowMounted(undefined, 0, 3), true);
  assert.equal(feedWindow.isWindowMounted(undefined, 3, 3), false);
  assert.equal(feedWindow.isWindowMounted(true, 50, 3), true);
  assert.equal(feedWindow.isWindowMounted(false, 0, 3), false);
});

test('unmounted cards keep their measured height at the same width, else an estimate', () => {
  feedWindow.resetMeasuredHeights();
  feedWindow.rememberHeight('L1', 600.4, 712.6);
  assert.equal(feedWindow.placeholderHeight('L1', 600, 640), 713);
  assert.equal(feedWindow.placeholderHeight('L1', 0, 640), 713, 'width not measured yet: the known height');
  assert.equal(feedWindow.placeholderHeight('L1', 380, 640), 640, 'another width: the estimate');
  assert.equal(feedWindow.placeholderHeight('unknown', 600, 655), 655);
  feedWindow.rememberHeight('L2', 600, 0);
  assert.equal(feedWindow.placeholderHeight('L2', 600, 640), 640, 'zero heights are not kept');
});

test('cards stay mounted about one and a half screens beyond the visible area', () => {
  assert.equal(feedWindow.windowMargin(null, 800), 1200);
  assert.equal(feedWindow.windowMargin({ clientHeight: 900 }, 300), 1350, 'the feed column on wide screens');
  assert.equal(feedWindow.windowMargin(null, 400), 800, 'at least 800px');
});

test('both feeds render every listing through the window and drop their per-card observers', () => {
  const client = read('pages', 'client-home.tsx');
  const host = read('pages', 'host-home.tsx');
  for (const source of [client, host]) {
    assert.match(source, /useFeedScrollRoot\(/);
    assert.match(source, /useFeedWindow\(\{ root: scrollRoot, onNear: onCardNear \}\)/);
    assert.match(source, /feedWindow\.itemProps\(listing\.id, index\)/);
    assert.match(source, /useLoadMore\(\{/);
    assert.doesNotMatch(source, /new IntersectionObserver/);
    assert.doesNotMatch(source, /getBoundingClientRect\(\)\.top (<|<=) window\.innerHeight/, 'no layout read per scroll event');
  }
  assert.match(host, /canLoad: \(\) => lastScroll\.current >= 0 && lastScroll\.current > lastLoadScroll\.current/, 'Host home still waits for the reader to scroll');
});

test('one observer per feed, recreated only with the scroll root, and disconnected on unmount', () => {
  const source = read('lib', 'discover', 'feedWindow.ts');
  assert.equal((source.match(/new IntersectionObserver\(/g) || []).length, 2, 'the cards and the sentinel');
  assert.match(source, /\}, \[root, supported, schedule\]\);/);
  assert.match(source, /return \(\) => \{ observer\.disconnect\(\); intersection\.current = null; \};/);
  assert.match(source, /return \(\) => \{ observer\.disconnect\(\); near\.current = false; \};/);
  assert.match(source, /requestAnimationFrame\(/, 'window changes apply once per frame');
});

test('Client Home asks for like summaries once per listing, not for the whole feed on every page', () => {
  const source = read('pages', 'client-home.tsx');
  assert.match(source, /filter\(\(id\) => !requestedLikeIds\.current\.has\(id\)\)/);
  assert.match(source, /requestedLikeIds\.current\.clear\(\);/, 'reset with the account');
});

// ---------- Progressive media ----------

test('feed photos offer the 480/800/1200 copies; other hosts get none', () => {
  assert.equal(
    media.feedPhotoSrcSet('/api/photos/listing-photos/a/b.jpg?w=1200'),
    '/api/photos/listing-photos/a/b.jpg?w=480 480w, /api/photos/listing-photos/a/b.jpg?w=800 800w, /api/photos/listing-photos/a/b.jpg?w=1200 1200w',
  );
  assert.equal(media.feedPhotoSrcSet('https://x.supabase.co/storage/v1/object/public/a.jpg'), undefined);
  assert.equal(media.previewPhotoUrl('/api/photos/listing-photos/a.jpg?w=1200'), '/api/photos/listing-photos/a.jpg?w=192');
  assert.equal(media.previewPhotoUrl('https://elsewhere/a.jpg'), 'https://elsewhere/a.jpg');
});

test('a carousel loads the shown photo and its neighbours; the first card is fetched first', () => {
  assert.deepEqual([0, 1, 2, 3].map((index) => media.isSlideNear(index, 1)), [true, true, true, false]);
  assert.deepEqual(media.feedImageHints(true), { loading: 'eager', decoding: 'async', fetchpriority: 'high' });
  assert.deepEqual(media.feedImageHints(false), { loading: 'lazy', decoding: 'async' });
});

test('Client Home no longer paints every slide full size as a CSS backdrop', () => {
  const source = read('pages', 'client-home.tsx');
  assert.match(source, /style=\{near \? \{ backgroundImage: safeCssUrl\(previewPhotoUrl\(photo\.url\)\) \} : undefined\}/);
  assert.doesNotMatch(source, /backgroundImage: safeCssUrl\(photo\.url\)/);
  assert.match(source, /\{near && <img/);
});

test('Host home slides keep their <img> for sizing but only near ones have a source', () => {
  const card = read('components', 'hostHome', 'FeedCard.tsx');
  assert.match(card, /src=\{near \? photo\.url : undefined\}/);
  assert.match(card, /image\.complete && image\.getAttribute\('src'\)/, 'an <img> without a source is not counted as loaded');
  assert.match(card, /retainKey=\{listing\.id\}/);
  assert.doesNotMatch(card, /import VideoPlayer from/, 'the player loads on demand');
});

// ---------- Scroll anchor ----------

test('the saved scroll anchor is found by binary search, with the same result as a scan', () => {
  const { captureScrollPosition } = loadTs(path.join(root, 'lib', 'clientHomeScroll.ts'));
  let measured = 0;
  const cards = Array.from({ length: 2000 }, (_, index) => ({
    dataset: { media: `L${index}` },
    getBoundingClientRect() { measured += 1; const top = index * 500 - 600000; return { top, bottom: top + 500 }; },
  }));
  const feed = { scrollTop: 600000, clientHeight: 700, getBoundingClientRect: () => ({ top: 100, bottom: 800 }), querySelectorAll: () => cards };
  const position = captureScrollPosition({ matchMedia: () => ({ matches: false }), innerHeight: 900, scrollY: 0 }, feed);
  assert.equal(position.anchorId, 'L1200');
  assert.equal(position.anchorOffset, -100);
  assert.ok(measured < 40, `measured ${measured} cards`);
  const none = captureScrollPosition({ matchMedia: () => ({ matches: false }), innerHeight: 900, scrollY: 0 }, { ...feed, querySelectorAll: () => [] });
  assert.equal(none.anchorId, null);
});

// ---------- Phone viewer ----------

test('an unmounted feed video stays in the phone viewer, in feed order, until the feed changes', async () => {
  const playback = loadTs(path.join(root, 'lib', 'media', 'videoPlayback.ts'), { globals: { window: { setTimeout: (fn) => fn() } } });
  playback.resetPlayers();
  const element = () => ({ isConnected: true, getClientRects: () => [{}], compareDocumentPosition: () => 4 });
  const first = playback.registerPlayer({ element: element(), video: null, src: 'a', poster: null, details: null, inViewer: false, retainKey: 'L1', order: 0 });
  const second = playback.registerPlayer({ element: element(), video: null, src: 'b', poster: null, details: null, inViewer: false, retainKey: 'L2', order: 1 });
  playback.retainPlayer(first.id);
  assert.deepEqual(playback.viewerEntries().map((entry) => entry.src), ['a', 'b']);
  const again = playback.registerPlayer({ element: element(), video: null, src: 'a2', poster: null, details: null, inViewer: false, retainKey: 'L1', order: 0 });
  assert.deepEqual(playback.viewerEntries().map((entry) => entry.src), ['a2', 'b'], 'a returning card replaces its kept entry');
  playback.retainPlayer(again.id);
  playback.retainPlayer(second.id);
  playback.releaseRetainedPlayers();
  assert.deepEqual(playback.viewerEntries(), []);
  const plain = playback.registerPlayer({ element: element(), video: null, src: 'p', poster: null, details: null, inViewer: false });
  playback.retainPlayer(plain.id);
  assert.deepEqual(playback.viewerEntries(), [], 'players outside a windowed feed unregister as before');
});

// ---------- Popular destinations ----------

test('destination counts come from the shared server answer, one request instead of five queries', async () => {
  const destinations = loadTs(path.join(root, 'lib', 'clientHome', 'destinations.ts'));
  assert.deepEqual(
    destinations.parseDestinationCounts({ counts: { Nairobi: 12, Mombasa: 0, Diani: -1, Kisumu: '3' } }, ['Nairobi', 'Mombasa', 'Diani', 'Kisumu', 'Nakuru']),
    { Nairobi: 12, Mombasa: 0, Diani: null, Kisumu: null, Nakuru: null },
  );
  assert.throws(() => destinations.parseDestinationCounts({ counts: [] }, ['Nairobi']), /invalid response/);
  const calls = [];
  const fetchFn = async (url) => { calls.push(url); return { ok: true, json: async () => ({ counts: { Nairobi: 4 } }) }; };
  assert.deepEqual(await destinations.fetchDestinationCounts(['Nairobi'], fetchFn), { Nairobi: 4 });
  assert.deepEqual(calls, ['/api/destination-counts']);
  await assert.rejects(destinations.fetchDestinationCounts(['Nairobi'], async () => ({ ok: false, status: 500 })), /500/);
  const page = read('pages', 'client-home.tsx');
  assert.match(page, /fetchDestinationCounts\(destinations\.map\(\(\{ city \}\) => city\)\)/);
  assert.doesNotMatch(page, /\.ilike\('location_text', `%\$\{city\}%`\)/);
});
