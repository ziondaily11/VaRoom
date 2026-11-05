const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadTs } = require('./helpers/loadTs');

const root = path.join(__dirname, '..');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');
const hh = loadTs(path.join(root, 'lib', 'hostHome', 'hostHome.ts'));
const media = loadTs(path.join(root, 'lib', 'hostHome', 'mediaStage.ts'));

test('feed: the same cache keys and scroll keys; ?view= picks Home, Saved or My Listings', () => {
  assert.equal(hh.feedKey('U1', false, 'all', 'Mombasa'), 'host:U1:all:all:mombasa');
  assert.equal(hh.feedKey('U1', true, 'hotel', ''), 'host:U1:mine:hotel:');
  assert.equal(hh.scrollKey('host:U1:all:all:'), 'varoom:listings:scroll:host:U1:all:all:');
  assert.equal(hh.viewFromQuery('saved'), 'saved');
  assert.equal(hh.viewFromQuery('my-listings'), 'my-listings');
  assert.equal(hh.viewFromQuery('anything'), 'home');
  assert.deepEqual(hh.CATEGORY_TABS.map((tab) => tab.label), ['All', 'Airbnbs', 'Hotels', 'Event Venues', 'Offices', 'Shops', 'Property']);
});

test('search: location and @username matches merge once each, newest first', () => {
  const a = { id: 'a', created_at: '2026-11-01T00:00:00Z' };
  const b = { id: 'b', created_at: '2026-11-03T00:00:00Z' };
  const c = { id: 'c', created_at: '2026-11-02T00:00:00Z' };
  assert.deepEqual(hh.mergeSearchResults([a, b], [b, c], 12).map((listing) => listing.id), ['b', 'c', 'a']);
  assert.deepEqual(hh.mergeSearchResults([a, b], [c], 2).map((listing) => listing.id), ['b', 'c']);
});

test('feed queries: own listings, or active and available ones; the category filter', async () => {
  const calls = [];
  const builder = () => {
    const ops = [];
    calls.push(ops);
    const chain = new Proxy({}, {
      get(_t, prop) {
        if (prop === 'then') return (resolve) => resolve({ data: [], error: null });
        return (...args) => { ops.push([prop, ...args]); return chain; };
      },
    });
    return chain;
  };
  const client = { from: () => builder() };
  await hh.feedFetcher(client, 'U1', false, 'hotel', '')(12, 12);
  const ops = calls[0].filter(([op]) => op === 'eq' || op === 'range');
  assert.deepEqual(ops, [['eq', 'moderation_status', 'active'], ['eq', 'availability_status', 'available'], ['eq', 'category', 'hotel'], ['range', 12, 23]]);
  calls.length = 0;
  await hh.feedFetcher(client, 'U1', true, 'all', '')(0, 12);
  assert.deepEqual(calls[0].filter(([op]) => op === 'eq'), [['eq', 'host_id', 'U1']]);
  assert.deepEqual(await hh.feedFetcher(client, 'U1', false, 'all', 'x')(12, 12), { data: [], hasMore: false }, 'a search has one page');
});

test('listings at a glance: up to four tiles, "Add listing" below four; drafts without photos', () => {
  const listings = (n) => Array.from({ length: n }, (_, i) => ({ id: String(i), listing_photos: [{ storage_path: 'p' }], category: 'hotel' }));
  assert.deepEqual({ count: hh.glanceTiles(listings(2)).tiles.length, add: hh.glanceTiles(listings(2)).showAdd }, { count: 2, add: true });
  assert.deepEqual({ count: hh.glanceTiles(listings(3)).tiles.length, add: hh.glanceTiles(listings(3)).showAdd }, { count: 3, add: true });
  assert.deepEqual({ count: hh.glanceTiles(listings(6)).tiles.length, add: hh.glanceTiles(listings(6)).showAdd }, { count: 4, add: false });
  assert.equal(hh.glanceSub({ listing_photos: [], category: 'hotel' }), 'Draft · no photos');
  assert.equal(hh.glanceSub({ listing_photos: [{}], category: 'venue' }), 'Event venue');
  assert.equal(hh.glanceSub({ listing_photos: [{}], category: 'castle' }), 'castle');
});

test('time ago, news labels and update photos are unchanged', () => {
  const now = Date.parse('2026-11-03T12:00:00Z');
  assert.equal(hh.timeAgo('2026-11-03T11:59:40Z', now), 'just now');
  assert.equal(hh.timeAgo('2026-11-03T11:15:00Z', now), '45m ago');
  assert.equal(hh.timeAgo('2026-11-03T02:00:00Z', now), '10h ago');
  assert.equal(hh.timeAgo('2026-10-30T12:00:00Z', now), '4d ago');
  assert.equal(hh.newsSource({ source: { name: '  Daily  ' } }), 'Daily');
  assert.equal(hh.newsSource({}), '');
  assert.equal(hh.newsDate('nonsense'), 'Recently');
  assert.deepEqual(hh.updatePhotos({ image_urls: [], image_url: 'a.jpg' }), ['a.jpg']);
  assert.deepEqual(hh.updatePhotos({ image_urls: ['b.jpg'], image_url: 'a.jpg' }), ['b.jpg']);
});

test('card media keeps its proportions under the same caps', () => {
  const fallback = media.fallbackFrame(600, false);
  assert.deepEqual({ ...fallback }, { height: 310.5, width: 414 });
  assert.deepEqual({ ...media.fitFrame(1000, 500, 600, 460, fallback) }, { height: 300, width: 600 });
  assert.deepEqual({ ...media.fitFrame(500, 1000, 600, 460, fallback) }, { height: 460, width: 230 });
  assert.equal(media.fitFrame(0, 0, 600, 460, fallback), fallback, 'unknown size uses 4:3');
});

test('page: native in the host shell; identity from AuthProvider; legacy page and scripts retired', () => {
  const page = read('pages', 'host-home.tsx');
  assert.match(page, /useAuth\(\)/);
  assert.doesNotMatch(page, /auth\.getSession|window\.location\.href/);
  assert.match(page, /getListingFeedCache\(\)/);
  assert.match(page, /viewFromQuery\(router\.query\.view\)/);
  assert.doesNotMatch(page, /from\('messages'\)|from\('conversations'\)\.select/, 'no badge-only notification queries');
  assert.match(read('components', 'hostHome', 'HostRail.tsx'), /<div className="update-body">\{update\.body\}<\/div>/, 'updates are text');
  for (const file of ['legacy-pages/host-home.html', 'public/js/host-listing-controls.js', 'public/js/property-news-api.js', 'public/js/skeleton-loader.js', 'lib/legacyPageLifecycle.js']) {
    assert.equal(fs.existsSync(path.join(root, file)), false, file);
  }
  assert.match(read('next.config.js'), /source: '\/host-home\.html',\s*destination: '\/host-home'/);
  const server = fs.readFileSync(path.join(root, '..', 'server', 'server.js'), 'utf8');
  assert.match(server, /app\.get\(\['\/host-home', '\/host-home\.html', '\/legacy-pages\/host-home\.html'\]/);
  assert.doesNotMatch(server, /'\/host-home': 'host-home\.html'/);
});

test('owner menu: a delete whose media cleanup failed still removes the listing', () => {
  assert.match(read('components', 'listings', 'HostListingMenu.tsx'), /error\.code === 'LISTING_DELETED_MEDIA_CLEANUP_FAILED'\) \{\s*publishListingDeleted\(listing\.id\);\s*onDeleted\?\.\(listing\.id\);/);
});

test('a video is framed by its own size once loaded, not a stored size of another shape', () => {
  const sized = loadTs(path.join(root, 'lib', 'hostHome', 'mediaStage.ts'), {
    globals: { getComputedStyle: () => ({ getPropertyValue: () => '0' }), HTMLElement: class {} },
  });
  const props = {};
  const video = { videoWidth: 0, videoHeight: 0, poster: '', getAttribute: () => null, closest: () => null, style: {} };
  const stage = {
    parentElement: { clientWidth: 600 },
    matches: (selector) => selector === '.card-video',
    querySelector: () => video,
    querySelectorAll: () => [],
    // Stored as landscape (the unrotated encoding).
    getAttribute: (name) => ({ 'data-media-width': '1920', 'data-media-height': '1080' }[name] || null),
    style: { setProperty: (name, value) => { props[name] = value; } },
  };
  video.closest = () => null;
  sized.sizeStage(stage, false);
  assert.equal(props['--discover-media-height'], '338px', 'before loading, the stored size is used');
  video.videoWidth = 1080;
  video.videoHeight = 1920;
  sized.sizeStage(stage, false);
  assert.equal(props['--discover-media-height'], '460px', 'the real portrait video is capped at 460px tall');
  assert.equal(video.style.width, '259px', 'and keeps its own proportions');
  assert.equal(video.style.height, 'auto');
  const styles = fs.readFileSync(path.join(root, 'components', 'hostHome', 'hostHomeStyles.ts'), 'utf8');
  assert.doesNotMatch(styles, /card-video[^}]*object-fit:initial/, 'feed videos are never drawn stretched');
});

test('home shell: a home route draws its shell while the role loads', () => {
  const layout = loadTs(path.join(root, 'lib', 'accountRoleLayout.ts'));
  assert.equal(layout.homeShellHint('/host-home'), 'host');
  assert.equal(layout.homeShellHint('/client-home'), 'client');
  for (const route of ['/bookings', '/profile', '/analytics', '/', '/chats']) assert.equal(layout.homeShellHint(route), null, route);
});

test('Property News Refresh: a link in both rail and phone cards that shows the spinner while it reloads', () => {
  const page = fs.readFileSync(path.join(root, 'pages', 'host-home.tsx'), 'utf8');
  const rail = fs.readFileSync(path.join(root, 'components', 'hostHome', 'HostRail.tsx'), 'utf8');
  assert.match(rail, /className="property-news-refresh"/);
  assert.match(rail, /<NewsRefreshButton onRefresh=\{onRefreshNews\} busy=\{newsRefreshing\} \/>/);
  assert.match(page, /<NewsRefreshButton onRefresh=\{refreshNews\} busy=\{newsRefreshing\} \/>/);
  assert.match(page, /news=\{newsRefreshing \? null : news\}/, 'the list shows its loader while refreshing');
  assert.match(page, /reloadNews\.current = \(\) => loadNews\(true\);/);
});

test('scroll position: saved from the last position seen, since the scroll area is detached on unmount', () => {
  const page = fs.readFileSync(path.join(root, 'pages', 'host-home.tsx'), 'utf8');
  assert.match(page, /if \(area && area\.isConnected\) position\.current = /);
  assert.match(page, /JSON\.stringify\(readPosition\(\)\)/);
  assert.match(page, /if \(!settled && \+\+frames < 40\) restoring\.current = requestAnimationFrame\(restore\);/);
});
