const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadTs } = require('./helpers/loadTs');

const root = path.join(__dirname, '..');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');
const json = (status, body) => ({ ok: status < 300, status, json: async () => body });

// A recording PostgREST stand-in: every call on a table is kept; awaiting the
// chain (or maybeSingle) answers from `answers[table]`.
function fakeClient(answers) {
  const calls = [];
  return {
    calls,
    from(table) {
      const entry = { table, ops: [] };
      calls.push(entry);
      const answer = () => (typeof answers[table] === 'function' ? answers[table](entry) : answers[table] || { data: [], error: null });
      const chain = new Proxy({}, {
        get(_target, prop) {
          if (prop === 'then') return (resolve, reject) => Promise.resolve(answer()).then(resolve, reject);
          if (prop === 'maybeSingle') return async () => answer();
          return (...args) => { entry.ops.push([prop, ...args]); return chain; };
        },
      });
      return chain;
    },
  };
}

// ---------- Video playback ----------

test('video: muted unless this session chose sound; time format', () => {
  const vp = loadTs(path.join(root, 'lib', 'media', 'videoPlayback.ts'));
  const store = (value) => ({ getItem: () => value, setItem() {} });
  assert.equal(vp.readMuted(store(null)), true);
  assert.equal(vp.readMuted(store('false')), false);
  assert.equal(vp.readMuted({ getItem() { throw new Error('blocked'); } }), true);
  const saved = {};
  vp.writeMuted({ setItem: (k, v) => { saved[k] = v; } }, false);
  assert.deepEqual(saved, { 'varoom-video-muted': 'false' });
  assert.equal(vp.formatTime(0), '0:00');
  assert.equal(vp.formatTime(75.9), '1:15');
  assert.equal(vp.formatTime(NaN), '0:00');
});

test('video: one plays at a time; the viewer lists visible page videos in page order', () => {
  const vp = loadTs(path.join(root, 'lib', 'media', 'videoPlayback.ts'), { globals: { document: undefined } });
  vp.resetPlayers();
  const video = (paused = false) => ({ paused, pause() { this.paused = true; } });
  const element = (order, visible = true) => ({ order, isConnected: true, getClientRects: () => (visible ? [1] : []), compareDocumentPosition(other) { return other.order > this.order ? 4 : 2; } });
  const a = vp.registerPlayer({ element: element(2), video: video(), src: 'a', poster: null, details: null, inViewer: false });
  const b = vp.registerPlayer({ element: element(1), video: video(), src: 'b', poster: null, details: null, inViewer: false });
  vp.registerPlayer({ element: element(3, false), video: video(), src: 'hidden', poster: null, details: null, inViewer: false });
  vp.registerPlayer({ element: element(4), video: video(), src: 'slide', poster: null, details: null, inViewer: true });
  vp.stopOthers(a.video);
  assert.equal(a.video.paused, false);
  assert.equal(b.video.paused, true);
  assert.deepEqual(vp.viewerEntries().map((entry) => entry.src), ['b', 'a'], 'hidden cards and viewer slides are left out');
  vp.unregisterPlayer(b.id);
  assert.deepEqual(vp.viewerEntries().map((entry) => entry.src), ['a']);
});

test('video player: controls stop the click (no listing navigation), viewer falls back to an overlay', () => {
  const player = read('components', 'media', 'VideoPlayer.tsx');
  assert.match(player, /const stop = \(event: React\.SyntheticEvent\) => \{ event\.preventDefault\(\); event\.stopPropagation\(\); \}/);
  assert.match(player, /className="varoom-video-controls" aria-label="Video controls" onClick=\{stop\}/);
  assert.match(player, /stays as an overlay/);
  assert.match(player, /rootMargin: '160px 0px', threshold: 0\.1/);
  for (const text of ['Tap play to start', 'Video unavailable', 'Retry', 'Close fullscreen video viewer', 'varoomautoplayblocked', 'varoomvideoplaying']) assert.ok(player.includes(text), text);
  const lf = (text) => text.split('\r\n').join('\n');
  assert.equal(lf(read('components', 'media', 'videoPlayerStyles.ts')).includes(lf(read('public', 'js', 'varoom-video-player.css')).trim()), true, 'styles copied unchanged');
});

// ---------- Host listing actions ----------

function actionsWithDocument() {
  const events = [];
  const cacheCalls = [];
  const document = { dispatchEvent: (event) => events.push([event.type, event.detail]) };
  const window = { VaRoomListingFeedCache: { updateListing: (...a) => cacheCalls.push(['update', ...a]), removeListing: (...a) => cacheCalls.push(['remove', ...a]), invalidateAll: () => cacheCalls.push(['invalidate']) } };
  class CustomEvent { constructor(type, init) { this.type = type; this.detail = init && init.detail; } }
  const actions = loadTs(path.join(root, 'lib', 'listings', 'hostListingActions.ts'), { globals: { document, window, CustomEvent } });
  return { actions, events, cacheCalls };
}

test('listing menu: legacy wording for edit, delete and the confirmation', () => {
  const { actions } = actionsWithDocument();
  assert.equal(actions.editLabel({ id: '1', availability_status: 'available' }), 'Edit listing');
  assert.equal(actions.editLabel({ id: '1', listing_draft_id: 'd' }), 'Continue Listing');
  assert.equal(actions.editHref({ id: '1', listing_draft_id: 'd 1' }), '/list?draft=d%201');
  assert.equal(actions.editHref({ id: 'x' }), '/list?edit=x');
  assert.equal(actions.deleteLabel({ id: '1', availability_status: 'draft' }), 'Delete draft permanently');
  assert.deepEqual({ ...actions.deleteConfirmText({ id: '1', availability_status: 'draft', title: 'Loft' }) }, { title: 'Delete draft listing?', body: 'This permanently removes "Loft" and its listing media from VaRoom, including Discover and all profiles. This cannot be undone.' });
  assert.equal(actions.deleteConfirmText({ id: '1' }).body, 'This is permanent. The listing, its photos, and discovery record will be removed.');
  assert.deepEqual(actions.STATUS_ACTIONS.map((a) => a.label), ['Make available', 'Mark booked', 'Mark unavailable', 'Pause listing', 'Save as draft']);
  assert.equal(actions.listingShareUrl('https://varoom.co.ke', 'a b'), 'https://varoom.co.ke/booking?listing=a%20b');
});

test('listing status: optimistic, confirmed by the server, rolled back with its message; one change at a time', async () => {
  const { actions, events, cacheCalls } = actionsWithDocument();
  let sent;
  const ok = await actions.changeListingStatus('tok', { id: 'L1', availability_status: 'available' }, 'paused', async (url, init) => { sent = { url, init }; return json(200, { listing: { availability_status: 'paused' } }); });
  assert.deepEqual({ ...ok }, { status: 'paused', error: null });
  assert.equal(sent.url, '/api/listings/L1/status');
  assert.deepEqual([sent.init.method, JSON.parse(sent.init.body), sent.init.headers.Authorization], ['PATCH', { status: 'paused' }, 'Bearer tok']);
  assert.deepEqual(events.map((e) => e[1].patch.availability_status), ['paused', 'paused']);
  assert.deepEqual(cacheCalls[0], ['update', 'L1', { availability_status: 'paused' }]);

  events.length = 0;
  const refused = await actions.changeListingStatus('tok', { id: 'L1', availability_status: 'paused' }, 'available', async () => json(402, { error: 'Pay to publish this listing', code: 'LISTING_PAYMENT_REQUIRED' }));
  assert.deepEqual({ ...refused }, { status: 'paused', error: 'Could not save listing status: Pay to publish this listing' });
  assert.deepEqual(events.map((e) => e[1].patch.availability_status), ['available', 'paused'], 'shown, then rolled back');

  let release;
  const slow = actions.changeListingStatus('tok', { id: 'L2' }, 'booked', () => new Promise((resolve) => { release = () => resolve(json(200, {})); }));
  assert.equal(await actions.changeListingStatus('tok', { id: 'L2' }, 'paused', async () => json(200, {})), null, 'ignored while one is saving');
  release();
  assert.equal((await slow).status, 'booked');
  assert.equal((await actions.changeListingStatus(null, { id: 'L3' }, 'paused')).error, 'Could not save listing status: Please sign in again.');
});

test('listing duplicate and delete go to the listings API; deletion updates caches and pages', async () => {
  const { actions, events, cacheCalls } = actionsWithDocument();
  const sent = [];
  const fetchFn = async (url, init) => { sent.push([init.method, url]); return json(200, {}); };
  await actions.duplicateListing('t', 'L1', fetchFn);
  await actions.deleteListing('t', 'L1', fetchFn);
  assert.deepEqual(sent, [['POST', '/api/listings/L1/duplicate'], ['DELETE', '/api/listings/L1']]);
  actions.publishListingDeleted('L1');
  actions.invalidateListingFeeds();
  assert.deepEqual(events.at(-1), ['varoom:listing-deleted', { id: 'L1' }]);
  assert.deepEqual(cacheCalls.slice(-2), [['remove', 'L1'], ['invalidate']]);
  await assert.rejects(actions.deleteListing('t', 'L1', async () => json(409, { error: 'Media is still being finalised', code: 'MEDIA_FINALIZATION_IN_PROGRESS' })), (error) => error.code === 'MEDIA_FINALIZATION_IN_PROGRESS' && /finalised/.test(error.message));
  const menu = read('components', 'listings', 'HostListingMenu.tsx');
  for (const text of ['Manage listing', 'Change listing status', 'Share listing', 'Copy listing link', 'View bookings', 'View analytics', 'Duplicate listing', 'Keep listing', 'Delete permanently', 'Saving...', 'Listing link copied', 'Listing duplicated', 'Draft listing permanently deleted', 'Listing deleted']) assert.ok(menu.includes(text), text);
});

// ---------- Host profile data ----------

test('host listings: owner sees all; visitors only active and available; bounded; first photo and price', async () => {
  const hp = loadTs(path.join(root, 'lib', 'profile', 'hostProfile.ts'));
  const row = { id: 'L1', title: 'Loft', category: 'airbnb', location_text: 'Nairobi', availability_status: 'available', publication_state: 'published', created_at: '2026-10-01', listing_photos: [{ storage_path: null }, { storage_path: 'a/b.jpg' }], listing_booking_details: [{ price_amount: '4000', price_unit: 'night' }] };
  const client = fakeClient({ listings: { data: [row], error: null } });
  const [listing] = await hp.fetchHostListings(client, 'H1', false);
  assert.deepEqual({ ...listing }, { id: 'L1', title: 'Loft', category: 'airbnb', location_text: 'Nairobi', availability_status: 'available', publication_state: 'published', created_at: '2026-10-01', photo: 'a/b.jpg', price_amount: 4000, price_unit: 'night' });
  const visitorOps = client.calls[0].ops;
  assert.deepEqual(visitorOps.filter((op) => op[0] === 'eq'), [['eq', 'host_id', 'H1'], ['eq', 'moderation_status', 'active'], ['eq', 'availability_status', 'available']]);
  assert.deepEqual(visitorOps.find((op) => op[0] === 'limit'), ['limit', 200]);
  await hp.fetchHostListings(client, 'H1', true);
  assert.deepEqual(client.calls[1].ops.filter((op) => op[0] === 'eq'), [['eq', 'host_id', 'H1']], 'the owner sees every listing');
  assert.equal(hp.toProfileListing({ id: 'x', listing_booking_details: null, listing_photos: [] }).price_amount, null);
});

test('host profile: by id or username, hosts only; categories with their listings; reviews; drafts', async () => {
  const hp = loadTs(path.join(root, 'lib', 'profile', 'hostProfile.ts'));
  const client = fakeClient({
    profiles: { data: { id: 'H1', role: 'host' }, error: null },
    profile_categories: { data: [{ id: 'C1', name: 'Beach', sort_order: 0 }, { id: 'C2', name: 'City', sort_order: 1 }], error: null },
    profile_category_listings: { data: [{ category_id: 'C1', listing_id: 'L1' }, { category_id: 'C1', listing_id: 'L2' }], error: null },
  });
  await hp.fetchHostProfile(client, { username: 'amazingstays' });
  assert.deepEqual(client.calls[0].ops.filter((op) => op[0] === 'eq' || op[0] === 'ilike'), [['eq', 'role', 'host'], ['ilike', 'username', 'amazingstays']], 'usernames match ignoring case');
  const categories = await hp.fetchProfileCategories(client, 'H1');
  assert.deepEqual(categories.map((c) => [c.name, c.listingIds]), [['Beach', ['L1', 'L2']], ['City', []]]);
  const reviews = await hp.fetchHostReviews('H1', async (url) => { assert.equal(url, '/api/hosts/H1/reviews'); return json(200, { reviews: [{ id: 'r', rating: 5 }], summary: { average_rating: 5, review_count: 1, distribution: [{ star: 5, count: 1 }] } }); });
  assert.equal(reviews.summary.review_count, 1);
  const drafts = await hp.fetchListingDrafts('tok', async (url, init) => {
    assert.equal(init.headers.Authorization, 'Bearer tok');
    return json(200, { drafts: [{ id: 'D1', listing_id: 'L9', category: 'airbnb', form_data: { fields: { title: 'Draft loft' } }, media_metadata: [{ name: 'a.jpg' }, {}] }] });
  });
  assert.deepEqual({ ...drafts[0], mediaNames: [...drafts[0].mediaNames] }, { id: 'D1', listing_id: 'L9', category: 'airbnb', title: 'Draft loft', mediaNames: ['a.jpg'] });
  assert.deepEqual(await hp.fetchListingDrafts(null), [], 'no session, no request');
});

test('host profile cache: loads once, shared while loading, kept apart per viewer, invalidated by part', async () => {
  const hp = loadTs(path.join(root, 'lib', 'profile', 'hostProfile.ts'));
  let reads = 0;
  const client = fakeClient({ listings: async () => { reads += 1; await new Promise((r) => setTimeout(r, 5)); return { data: [{ id: `L${reads}` }], error: null }; } });
  const [a, b] = await Promise.all([hp.loadHostListings(client, 'V1', 'H1', false), hp.loadHostListings(client, 'V1', 'H1', false)]);
  assert.equal(a, b);
  await hp.loadHostListings(client, 'V1', 'H1', false);
  assert.equal(reads, 1, 'fresh: reused');
  await hp.loadHostListings(client, 'V2', 'H1', false);
  await hp.loadHostListings(client, 'H1', 'H1', true);
  assert.equal(reads, 3, 'another viewer and the owner view load separately');
  assert.equal(hp.peek('V1', 'H1', 'listings')[0].id, 'L1');
  hp.invalidateHostProfile('V1', 'H1', 'listings');
  assert.equal(hp.peek('V1', 'H1', 'listings'), null);
  assert.equal(hp.peek('V2', 'H1', 'listings').length, 1, 'only that viewer and part');
  hp.clearHostProfileCache();
  assert.equal(hp.peek('V2', 'H1', 'listings'), null);
});
