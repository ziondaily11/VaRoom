const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadTs } = require('./helpers/loadTs');

const root = path.join(__dirname, '..');
const mkt = loadTs(path.join(root, 'lib', 'marketplace', 'marketplace.ts'));
const bookmarks = loadTs(path.join(root, 'lib', 'bookmarks', 'bookmarks.ts'));
const video = loadTs(path.join(root, 'lib', 'media', 'listingVideo.ts'));
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');

const listing = (over = {}) => ({
  id: 'l1', title: 'Garden Loft', location_text: 'Kilimani', category: 'airbnb', verified: true, created_at: '2026-10-01T00:00:00Z',
  host_id: 'h1', listing_photos: [], listing_booking_details: [{ price_amount: 4500, price_unit: 'night', amenities: ['wifi', 'POOL', 'unknown', 'parking', 'tv', 'gym'] }],
  ...over,
});

// Records the PostgREST calls; awaiting the chain resolves `result`.
function fakeClient(result) {
  const calls = [];
  const builder = new Proxy({}, {
    get(_, prop) {
      if (prop === 'then') return (resolve) => resolve(result);
      return (...args) => { calls.push([prop, ...args]); return builder; };
    },
  });
  return { calls, from(table) { calls.push(['from', table]); return builder; } };
}

test('the search starts from the URL; unknown categories fall back to all', () => {
  assert.deepEqual({ ...mkt.searchFromQuery({ q: 'Kilimani', category: 'Hotel', guests: '4' }) }, { q: 'Kilimani', category: 'hotel', guests: '4' });
  assert.equal(mkt.searchFromQuery({ category: 'castles' }).category, 'all');
  assert.equal(mkt.searchFromQuery({}).q, '');
});

test('only publicly listed spaces: active, available, within any paid term; search and category filter the query', async () => {
  const client = fakeClient({ data: [listing()], error: null });
  const now = new Date('2026-11-03T12:00:00Z');
  const page = await mkt.fetchListingPage(client, { q: 'Rose (Ave), 50%', category: 'hotel', guests: '' }, 12, now);
  assert.equal(page.listings.length, 1);
  assert.equal(page.hasMore, false);
  const calls = client.calls;
  assert.deepEqual(calls.find((c) => c[0] === 'range'), ['range', 12, 23]);
  assert.ok(calls.some((c) => c[0] === 'eq' && c[1] === 'moderation_status' && c[2] === 'active'));
  assert.ok(calls.some((c) => c[0] === 'eq' && c[1] === 'availability_status' && c[2] === 'available'));
  assert.ok(calls.some((c) => c[0] === 'or' && c[1] === 'paid_listing_until.is.null,paid_listing_until.gt.2026-11-03T12:00:00.000Z'));
  assert.ok(calls.some((c) => c[0] === 'eq' && c[1] === 'category' && c[2] === 'hotel'));
  const search = calls.filter((c) => c[0] === 'or')[1][1];
  assert.equal(search, 'title.ilike.%Rose  Ave   50%,location_text.ilike.%Rose  Ave   50%,category.ilike.%Rose  Ave   50%', 'characters that break the filter are removed');
  assert.deepEqual(calls.find((c) => c[0] === 'select'), ['select', mkt.MARKETPLACE_SELECT], 'no exact count is requested');
});

test('guests from a link filter the embedded details and the rows', async () => {
  const rows = [listing({ id: 'a', listing_booking_details: [{ max_guests: 2 }] }), listing({ id: 'b', listing_booking_details: [{ max_guests: 6 }] }), listing({ id: 'c', listing_booking_details: [{}] })];
  const client = fakeClient({ data: rows, error: null });
  const page = await mkt.fetchListingPage(client, { q: '', category: 'all', guests: '4' }, 0);
  assert.deepEqual(page.listings.map((l) => l.id), ['b', 'c']);
  assert.equal(page.rows, 3, 'the next page starts after every returned row');
  assert.ok(client.calls.some((c) => c[0] === 'gte' && c[1] === 'listing_booking_details.max_guests' && c[2] === 4));
  await assert.rejects(mkt.fetchListingPage(fakeClient({ data: null, error: { message: 'down' } }), { q: '', category: 'all', guests: '' }, 0));
});

test('card rules: price, sale price, title and location clean-up, category tag', () => {
  assert.deepEqual({ ...mkt.formatPrice([{ price_amount: '4500', price_unit: null }], 'airbnb') }, { amount: 4500, unit: 'night' });
  assert.deepEqual({ ...mkt.formatPrice({ listing_purpose: 'sale', sale_price_amount: 9000000, sale_price_mode: 'starting' }, 'property') }, { amount: 9000000, unit: '', isSale: true, isStarting: true });
  assert.equal(mkt.formatPrice([{}], 'hotel'), null);
  assert.equal(mkt.normalizeListingTitle('  test '), 'Property');
  assert.equal(mkt.normalizeListingTitle('...'), 'Property');
  assert.equal(mkt.normalizeListingTitle('Sea  View'), 'Sea View');
  assert.equal(mkt.sanitizeLocationText('Location to be added'), '');
  assert.equal(mkt.cardLocation(listing({ location_text: null, listing_booking_details: [{ location_text: ' Westlands ' }] })), 'Westlands');
  assert.equal(mkt.categoryLabel('venue'), 'Event Venues');
  assert.equal(mkt.categoryTone('hotel'), 'amber');
  assert.equal(mkt.categoryTone('castle'), 'teal', 'unknown categories fall back to one tone');
  const rooms = (category, details) => mkt.propertyRooms(listing({ category, listing_booking_details: [details] }));
  assert.deepEqual(rooms('property', { size_or_type: '3 bedrooms', bathrooms: 2 }), { beds: '3', baths: 2 });
  assert.deepEqual(rooms('property', { size_or_type: 'Studio', bathrooms: 0 }), { beds: 'Studio', baths: null });
  assert.deepEqual(rooms('property', { size_or_type: 'Penthouse' }), { beds: null, baths: null });
  assert.deepEqual(rooms('airbnb', { size_or_type: '2 bedrooms', bathrooms: 1 }), { beds: null, baths: null }, 'property cards only');
});

test('newest first; a looking-soon client sees their categories first only in the default view', () => {
  const items = [
    listing({ id: 'old-hotel', category: 'hotel', created_at: '2026-01-01T00:00:00Z' }),
    listing({ id: 'new-office', category: 'office', created_at: '2026-10-01T00:00:00Z' }),
    listing({ id: 'new-office', category: 'office', created_at: '2026-10-01T00:00:00Z' }),
  ];
  const preferred = mkt.preferredCategories({ role: 'client', looking_timeline: 'soon', interested_categories: ['Hotel', 'castle'] });
  assert.deepEqual(preferred, ['hotel']);
  assert.deepEqual(mkt.orderListings(items, { q: '', category: 'all', guests: '' }, preferred).map((l) => l.id), ['old-hotel', 'new-office'], 'deduplicated, preferred first');
  assert.deepEqual(mkt.orderListings(items, { q: 'x', category: 'all', guests: '' }, preferred).map((l) => l.id), ['new-office', 'old-hotel'], 'a search ranks by date');
  assert.deepEqual(mkt.preferredCategories({ role: 'host', looking_timeline: 'soon', interested_categories: ['hotel'] }), []);
});

test('recent pages are reused for two minutes', () => {
  const search = { q: '', category: 'all', guests: '' };
  const page = { listings: [listing()], rows: 1, hasMore: false };
  mkt.setCachedPage(search, 0, page, 1000);
  assert.equal(mkt.getCachedPage(search, 0, 1000 + 119000), page);
  assert.equal(mkt.getCachedPage(search, 0, 1000 + 121000), null);
  assert.equal(mkt.getCachedPage({ ...search, category: 'hotel' }, 0, 1000), null);
});

test('bookmarks: loaded once per account, shared, optimistic with rollback, cleared on sign-out', async () => {
  bookmarks.clearBookmarks();
  let reads = 0;
  const writes = [];
  let failWrites = false;
  const client = {
    from() {
      const chain = {
        select() { return chain; },
        eq() { return chain; },
        delete() { writes.push('delete'); return chain; },
        insert() { writes.push('insert'); return Promise.resolve({ error: failWrites ? { message: 'denied' } : null }); },
        then(resolve) { if (writes[writes.length - 1] === 'delete') { resolve({ error: failWrites ? { message: 'denied' } : null }); return; } reads += 1; resolve({ data: [{ listing_id: 'a' }], error: null }); },
      };
      return chain;
    },
  };
  const seen = [];
  const stop = bookmarks.subscribeBookmarks((owner, ids) => seen.push([owner, [...ids].sort().join(',')]));
  const [first, second] = await Promise.all([bookmarks.loadBookmarks(client, 'u1'), bookmarks.loadBookmarks(client, 'u1')]);
  assert.equal(reads, 1, 'one request for concurrent callers');
  assert.deepEqual([...first], ['a']);
  assert.deepEqual([...second], ['a']);
  assert.equal(await bookmarks.toggleBookmark(client, 'u1', 'b'), true);
  assert.deepEqual([...bookmarks.peekBookmarks('u1')].sort(), ['a', 'b']);
  failWrites = true;
  await assert.rejects(bookmarks.toggleBookmark(client, 'u1', 'c'));
  assert.deepEqual([...bookmarks.peekBookmarks('u1')].sort(), ['a', 'b'], 'a failed save is rolled back');
  assert.deepEqual(seen.map((s) => s[1]), ['a', 'a,b', 'a,b,c', 'a,b']);
  assert.equal(bookmarks.peekBookmarks('u2'), null, 'another account never sees them');
  bookmarks.clearBookmarks();
  assert.equal(bookmarks.peekBookmarks('u1'), null);
  stop();
  assert.match(read('lib', 'auth', 'clearUserData.ts'), /clearBookmarks\(\);/);
});

test('listing videos: one request per listing, kept under the 5-minute URL lifetime', async () => {
  video.clearListingVideos();
  let calls = 0;
  const fetchFn = async (url) => {
    calls += 1;
    if (url.endsWith('/media')) return { ok: true, json: async () => ({ media: [{ id: 'm1', type: 'video' }] }) };
    return { ok: true, json: async () => ({ url: 'https://v/1.mp4', thumbnailUrl: null }) };
  };
  const [a, b] = await Promise.all([video.loadListingVideo('l1', null, fetchFn), video.loadListingVideo('l1', null, fetchFn)]);
  assert.equal(a.videoUrl, 'https://v/1.mp4');
  assert.equal(b, a);
  assert.equal(calls, 2, 'media + playback once');
  await video.loadListingVideo('l1', null, fetchFn);
  assert.equal(calls, 2, 'cached');
  assert.ok(video.VIDEO_TTL_MS < 5 * 60 * 1000);
  assert.equal(await video.loadListingVideo('l2', null, async () => { throw new Error('offline'); }), null);
});

test('page: legacy markup and wording; the shared shell sidebar; the hidden filters are gone; legacy file retired', () => {
  const page = read('pages', 'marketplace.tsx');
  for (const text of ['Search by location, property name, or keyword...', 'Search properties, locations...', 'No listings match yet', 'Unable to load listings', 'Load more', 'Marketplace — VaRoom']) {
    assert.ok(page.includes(text), text);
  }
  assert.match(page, /router\.push\(userId \? href : loginUrl\(href\)\)/, 'visitors sign in first, then return to the listing');
  assert.match(page, /\.appNavigation = true;/);
  assert.doesNotMatch(page, /price-min|verified-only|filters-reset/);
  assert.equal(fs.existsSync(path.join(root, 'components', 'marketplace', 'MarketplaceNav.tsx')), false, 'the role sidebar comes from the shared shell');
  assert.doesNotMatch(page, /desktop-sidebar|RoleSidebarLinks|MarketplaceBottomNav/);
  assert.doesNotMatch(read('components', 'marketplace', 'marketplaceStyles.ts'), /\.filters\b|\.filter-rail|\.price-inputs/);
  assert.equal(fs.existsSync(path.join(root, 'legacy-pages', 'marketplace.html')), false);
  assert.match(read('next.config.js'), /source: '\/marketplace\.html',\s*destination: '\/marketplace'/);
  const server = fs.readFileSync(path.join(root, '..', 'server', 'server.js'), 'utf8');
  assert.match(server, /app\.get\(\['\/marketplace', '\/marketplace\.html', '\/legacy-pages\/marketplace\.html'\]/);
  assert.equal(fs.existsSync(path.join(root, 'public', 'js', 'skeleton-loader.js')), false, 'retired with Host Home (nothing called it)');
});
