const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { loadTs } = require('./helpers/loadTs');

const root = path.join(__dirname, '..');
const at = loadTs(path.join(root, 'lib', 'hostHome', 'attention.ts'), { mocks: { '../bookings/clientBookings': { PENDING_EXPIRY_MS: 48 * 3600 * 1000 } } });
const trip = loadTs(path.join(root, 'lib', 'clientHome', 'nextTrip.ts'));
const billing = () => loadTs(path.join(root, 'lib', 'billing', 'hostBilling.ts'));

const NOW = Date.parse('2026-11-17T12:00:00Z');
const DAY = 24 * 3600 * 1000;
const listing = (over = {}) => ({ id: 'l1', title: 'Loft', availability_status: 'available', paid_listing_until: null, ...over });
const noRequests = { rows: [], count: 0 };
const view = (over = {}) => at.attentionView({ listings: [listing()], requests: noRequests, chats: 0, subscribed: true, upgradeSnoozed: false, now: NOW, ...over });

// ---------- Host: Needs your attention ----------

test('the host card waits for listings and requests, then puts urgent work first', () => {
  assert.equal(view({ listings: null }).kind, 'loading');
  assert.equal(view({ requests: null }).kind, 'loading');
  assert.equal(view({ listings: [] }).kind, 'first-listing');
  const request = { id: 'b1', created_at: '', start_date: null, end_date: null, listing: null, client: null };
  const busy = view({ requests: { rows: [request], count: 4 }, chats: 2, subscribed: false });
  assert.equal(busy.kind, 'actions', 'requests and chats come before the plans card');
  assert.equal(busy.requestCount, 4);
  assert.equal(busy.chats, 2);
  assert.equal(view({ chats: 1 }).kind, 'actions');
});

test('paid listings ending within five days are flagged, soonest first', () => {
  const rows = [
    listing({ id: 'a', paid_listing_until: new Date(NOW + 4 * DAY).toISOString() }),
    listing({ id: 'b', paid_listing_until: new Date(NOW + 1 * DAY).toISOString() }),
    listing({ id: 'c', paid_listing_until: new Date(NOW + 9 * DAY).toISOString() }),
    listing({ id: 'd', paid_listing_until: new Date(NOW - 1 * DAY).toISOString() }),
  ];
  assert.deepEqual(at.expiringListings(rows, NOW).map((row) => [row.id, row.days]), [['b', 1], ['a', 4]]);
  assert.equal(view({ listings: rows }).kind, 'actions');
});

test('the plans card shows only to hosts without a plan, when nothing is waiting and it is not snoozed', () => {
  assert.equal(view({ subscribed: false }).kind, 'upgrade');
  assert.equal(view({ subscribed: false, upgradeSnoozed: true }).kind, 'caught-up');
  assert.equal(view({ subscribed: null }).kind, 'caught-up', 'unknown plan state never shows the plans card');
  const done = view({ listings: [listing(), listing({ id: 'l2', availability_status: 'paused' })] });
  assert.deepEqual(done, { kind: 'caught-up', live: 1 });
  assert.equal(view({ listings: 'error' }).kind, 'caught-up', 'a failed listings load is not "list your first space"');
});

test('"Not now" hides the plans card for a week, per account', () => {
  const store = new Map();
  const storage = { getItem: (key) => (store.has(key) ? store.get(key) : null), setItem: (key, value) => store.set(key, value) };
  assert.equal(at.isUpgradeSnoozed(storage, 'u1', NOW), false);
  at.snoozeUpgrade(storage, 'u1', NOW);
  assert.equal(at.isUpgradeSnoozed(storage, 'u1', NOW + 6 * DAY), true);
  assert.equal(at.isUpgradeSnoozed(storage, 'u1', NOW + 8 * DAY), false, 'back after a week');
  assert.equal(at.isUpgradeSnoozed(storage, 'u2', NOW), false, 'another account is unaffected');
  assert.equal(at.isUpgradeSnoozed(null, 'u1', NOW), false);
});

test('booking requests: one counted request for the newest three still within 48 hours', async () => {
  const calls = [];
  const builder = {
    select(columns, options) { calls.push(['select', columns, options]); return builder; },
    eq(column, value) { calls.push(['eq', column, value]); return builder; },
    gt(column, value) { calls.push(['gt', column, value]); return builder; },
    order(column, options) { calls.push(['order', column, options]); return builder; },
    limit: async (n) => {
      calls.push(['limit', n]);
      return { data: [{ id: 'b1', created_at: 'x', start_date: null, end_date: null, listing: [{ title: 'Loft' }], client: { full_name: 'Ann' } }], count: 5, error: null };
    },
  };
  const client = { from(table) { assert.equal(table, 'bookings'); return builder; } };
  const result = await at.fetchPendingRequests(client, 'h1', NOW);
  assert.equal(result.count, 5);
  assert.deepEqual(result.rows[0].listing, { title: 'Loft' });
  assert.deepEqual(calls.find((call) => call[0] === 'select')[2], { count: 'exact' });
  assert.ok(calls.some((call) => call[0] === 'eq' && call[1] === 'host_id' && call[2] === 'h1'));
  assert.ok(calls.some((call) => call[0] === 'eq' && call[1] === 'status' && call[2] === 'pending'));
  assert.deepEqual(calls.find((call) => call[0] === 'gt'), ['gt', 'created_at', new Date(NOW - 48 * 3600 * 1000).toISOString()]);
  assert.deepEqual(calls.at(-1), ['limit', 3]);
});

test('plan state: one entitlements request, remembered per account, reused from Settings, cleared on sign-out', async () => {
  const hb = billing();
  const urls = [];
  const fetchFn = async (url) => { urls.push(url); return { ok: true, json: async () => ({ entitlements: { active: false } }) }; };
  assert.equal(hb.peekPlanActive('u1', NOW), null);
  assert.equal(await hb.loadPlanActive('u1', 'tok', { fetchFn, now: NOW }), false);
  assert.equal(await hb.loadPlanActive('u1', 'tok', { fetchFn, now: NOW + 1000 }), false);
  assert.deepEqual(urls, ['/api/billing/entitlements'], 'asked once');
  assert.equal(hb.peekPlanActive('u2', NOW), null, 'never another account');
  hb.clearHostBillingCache();
  assert.equal(hb.peekPlanActive('u1', NOW), null, 'cleared on sign-out and after a payment');
});

// ---------- Client: Your next trip ----------

const booking = (over = {}) => ({ id: 'k1', status: 'approved', start_date: '2026-11-20', end_date: '2026-11-22', guests: 2, total_price: 100, title: 'Loft', location: 'Nairobi', photo: null, ...over });
const saved = (id) => ({ id, title: id, location_text: null, category: 'airbnb', availability_status: 'available', listing_photos: [], listing_booking_details: null });

test('the client card shows the next approved or pending stay first', () => {
  assert.equal(trip.nextTripView(null, null).kind, 'loading');
  const shown = trip.nextTripView([booking({ id: 'x', status: 'declined' }), booking({ id: 'y', status: 'pending' })], null);
  assert.equal(shown.kind, 'trip');
  assert.equal(shown.booking.id, 'y', 'a declined stay is not a trip');
});

test('without a trip it shows up to four saved listings, else a way to the Marketplace', () => {
  assert.equal(trip.nextTripView([], null).kind, 'loading', 'waits for the saved listings');
  const preview = trip.nextTripView([], ['a', 'b', 'c', 'd', 'e'].map(saved));
  assert.equal(preview.kind, 'saved');
  assert.deepEqual(preview.listings.map((row) => row.id), ['a', 'b', 'c', 'd']);
  assert.equal(trip.nextTripView([booking({ status: 'cancelled' })], []).kind, 'explore');
});

test('trip countdown wording', () => {
  const now = new Date(2026, 10, 17, 15, 0);
  assert.equal(trip.startsIn('2026-11-17', now), 'Today');
  assert.equal(trip.startsIn('2026-11-18', now), 'Tomorrow');
  assert.equal(trip.startsIn('2026-11-21', now), 'In 4 days');
  assert.equal(trip.startsIn('2026-11-10', now), '');
  assert.equal(trip.startsIn(null, now), '');
});
