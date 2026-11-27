const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadTs } = require('./helpers/loadTs');

// Host controls by niche (docs/host-controls/OUTCOME_CONTROLS_PLAN.md):
// mark sold / rented / leased, relist, under offer, and what other pages do
// with those listings.

const root = path.join(__dirname, '..');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');
const action = loadTs(path.join(root, 'lib', 'listings', 'listingAction.ts'));
const json = (status, body) => ({ ok: status < 400, status, json: async () => body });
const menu = (globals = {}) => loadTs(path.join(root, 'lib', 'listings', 'hostListingActions.ts'), { globals: { document: undefined, window: undefined, navigator: undefined, CustomEvent: undefined, ...globals } });

const property = (purpose, units, extra = {}) => ({ id: 'L1', category: 'property', listing_purpose: purpose, availability_status: 'available', listing_booking_details: [{ units_available: units }], ...extra });
const labels = (listing) => menu().statusControls(listing).map((control) => control.label);

test('each niche is marked its own way; stays have no outcome', () => {
  assert.deepEqual([...action.listingOutcomes(property('rent'))], ['rented']);
  assert.deepEqual([...action.listingOutcomes(property('sale'))], ['sold']);
  assert.deepEqual([...action.listingOutcomes(property('both'))], ['rented', 'sold']);
  assert.deepEqual([...action.listingOutcomes(property(null, null, { listing_booking_details: { listing_purpose: 'sale' } }))], ['sold'], 'older properties: purpose in the details');
  assert.deepEqual([...action.listingOutcomes({ category: 'office' })], ['leased']);
  assert.deepEqual([...action.listingOutcomes({ category: 'shop' })], ['rented']);
  for (const category of ['airbnb', 'hotel', 'venue']) assert.deepEqual([...action.listingOutcomes({ category })], [], category);
  assert.equal(action.unitsLeft(property('rent', 5)), 5);
  assert.equal(action.unitsLeft(property('rent', null)), 1);
  assert.equal(action.unitsLeft({ category: 'office', listing_booking_details: { units_available: 9 } }), 1, 'offices and shops go as a whole');
  assert.deepEqual(['sold', 'rented', 'leased', 'paused', 'available'].map(action.isMarkedStatus), [true, true, true, false, false]);
  assert.deepEqual(['sold', 'rented', 'leased', 'paused', null].map(action.statusLabel), ['Sold', 'Rented', 'Leased', 'Paused', 'Available']);
});

test('the menu: Pause / Make available, the niche\'s Mark as…, Under offer for sales, Relist once marked', () => {
  assert.deepEqual(labels(property('rent')), ['Pause listing', 'Mark as rented…']);
  assert.deepEqual(labels(property('sale')), ['Pause listing', 'Mark as sold…', 'Mark under offer']);
  assert.deepEqual(labels(property('both', 4, { under_offer: true })), ['Pause listing', 'Mark units as rented…', 'Mark units as sold…', 'Remove under offer']);
  assert.deepEqual(labels({ id: 'O', category: 'office', availability_status: 'paused' }), ['Make available', 'Mark as leased…']);
  assert.deepEqual(labels({ id: 'S', category: 'shop', availability_status: 'available' }), ['Pause listing', 'Mark as rented…']);
  assert.deepEqual(labels({ id: 'A', category: 'airbnb', availability_status: 'available' }), ['Pause listing']);
  assert.deepEqual(labels({ id: 'H', category: 'hotel', availability_status: 'booked' }), ['Make available'], 'the retired statuses come back with Make available');
  assert.deepEqual(labels(property('rent', 1, { availability_status: 'draft' })), ['Make available'], 'a draft is not on the market');
  for (const status of ['sold', 'rented', 'leased']) assert.deepEqual(labels(property('both', 3, { availability_status: status })), ['Relist…'], status);

  const m = menu();
  assert.equal(m.requestsLabel(property('rent')), 'View rental requests');
  assert.equal(m.requestsLabel(property('both')), 'View rental requests');
  assert.equal(m.requestsLabel(property('sale')), null, 'buyers come through chat');
  assert.equal(m.requestsLabel({ category: 'office' }), 'View lease requests');
  assert.equal(m.requestsLabel({ category: 'shop' }), 'View rental requests');
  for (const category of ['airbnb', 'hotel', 'venue']) assert.equal(m.requestsLabel({ category }), 'View bookings');

  const source = read('components', 'listings', 'HostListingMenu.tsx');
  for (const gone of ['Mark booked', 'Mark unavailable', 'Save as draft', 'Copy listing link']) assert.ok(!source.includes(gone), gone);
});

test('units: the patch keeps the shape the listing was read in', () => {
  const m = menu();
  assert.deepEqual(JSON.parse(JSON.stringify(m.unitsPatch(property('rent', 5), 3))), { listing_booking_details: [{ units_available: 3 }] });
  assert.deepEqual(JSON.parse(JSON.stringify(m.unitsPatch(property('rent', 5, { listing_booking_details: { price_amount: 1, units_available: 5 } }), 2))), { listing_booking_details: { price_amount: 1, units_available: 2 } });
  assert.deepEqual({ ...m.unitsPatch({ id: 'O', category: 'office' }, 1) }, {});
});

test('Share: the share sheet on touch screens, the clipboard on computers', () => {
  const share = () => Promise.resolve();
  const at = (coarse) => menu({ window: { matchMedia: () => ({ matches: coarse }) }, navigator: { share } }).sharesWithSheet();
  assert.equal(at(true), true);
  assert.equal(at(false), false, 'Windows has navigator.share too; a computer copies instead');
  assert.equal(menu({ window: { matchMedia: () => ({ matches: true }) }, navigator: {} }).sharesWithSheet(), false);
});

test('mark, undo, relist and under offer call the listings API', async () => {
  const m = menu();
  const sent = [];
  const fetchFn = async (url, init) => { sent.push([init.method, url, JSON.parse(init.body || '{}'), init.headers.Authorization]); return json(200, { outcome: { id: 'o1' }, listing: { availability_status: 'available', under_offer: true } }); };
  await m.markListing('t', 'L1', { outcome: 'sold', units: 2, agreedAmount: 12000000 }, fetchFn);
  await m.markListing('t', 'L1', { outcome: 'rented', bookingId: 'b1' }, fetchFn);
  await m.undoOutcome('t', 'L1', 'o1', fetchFn);
  assert.equal(await m.relistListing('t', 'L1', 3, fetchFn), 'available');
  await m.relistListing('t', 'L2', null, fetchFn);
  assert.equal(await m.setUnderOffer('t', 'L1', true, fetchFn), true);
  assert.deepEqual(sent, [
    ['POST', '/api/listings/L1/outcomes', { outcome: 'sold', units: 2, agreed_amount: 12000000 }, 'Bearer t'],
    ['POST', '/api/listings/L1/outcomes', { outcome: 'rented', units: 1, booking_id: 'b1' }, 'Bearer t'],
    ['POST', '/api/listings/L1/outcomes/o1/void', {}, 'Bearer t'],
    ['POST', '/api/listings/L1/relist', { units: 3 }, 'Bearer t'],
    ['POST', '/api/listings/L2/relist', {}, 'Bearer t'],
    ['PATCH', '/api/listings/L1/under-offer', { under_offer: true }, 'Bearer t'],
  ]);
  await assert.rejects(m.markListing('t', 'L1', { outcome: 'sold' }, async () => json(422, { error: 'This listing cannot be marked that way.', code: 'OUTCOME_NOT_ALLOWED' })),
    (error) => error.code === 'OUTCOME_NOT_ALLOWED' && /cannot be marked/.test(error.message));
});

test('approving a rental on a live listing offers to mark one unit; never for stays, sales or listings off the market', () => {
  const hb = loadTs(path.join(root, 'lib', 'bookings', 'hostBookings.ts'));
  const lease = (listing) => ({ lease_months: 12, listing: { id: 'L1', availability_status: 'available', ...listing } });
  assert.deepEqual({ ...hb.markAfterApproval(lease({ category: 'property', listing_purpose: 'rent', listing_booking_details: [{ units_available: 4 }] })) }, { outcome: 'rented', units: 4 });
  assert.deepEqual({ ...hb.markAfterApproval(lease({ category: 'property', listing_purpose: 'both' })) }, { outcome: 'rented', units: 1 });
  assert.deepEqual({ ...hb.markAfterApproval(lease({ category: 'office' })) }, { outcome: 'leased', units: 1 });
  assert.deepEqual({ ...hb.markAfterApproval(lease({ category: 'shop' })) }, { outcome: 'rented', units: 1 });
  assert.equal(hb.markAfterApproval({ lease_months: null, listing: { id: 'L1', category: 'airbnb', availability_status: 'available' } }), null, 'a stay');
  assert.equal(hb.markAfterApproval(lease({ category: 'property', listing_purpose: 'sale' })), null);
  assert.equal(hb.markAfterApproval(lease({ category: 'property', availability_status: 'rented' })), null);
  assert.equal(hb.markAfterApproval(lease({ category: 'property', availability_status: 'paused' })), null);
  assert.match(hb.HOST_BOOKINGS_SELECT, /listing:listings\(id,title,location_text,category,listing_purpose,availability_status,listing_photos\(storage_path\),listing_booking_details\(units_available,listing_purpose\)\)/);
  const view = read('components', 'bookings', 'HostBookingsView.tsx');
  assert.match(view, /const offer = decision === 'approve' \? markAfterApproval\(booking\) : null;/);
  assert.match(view, /cancelLabel="Not now"/);
  assert.match(view, /bookingId: ask\.booking\.id/, 'linked to the request, so it is counted once');
});

test('a marked listing: off the market everywhere, no expiry warning, and editing never puts it back online', () => {
  const att = loadTs(path.join(root, 'lib', 'hostHome', 'attention.ts'));
  const soon = new Date(Date.now() + 2 * 86400000).toISOString();
  const expiring = att.expiringListings([
    { id: 'a', title: 'Live', availability_status: 'available', paid_listing_until: soon },
    { id: 'b', title: 'Sold', availability_status: 'sold', paid_listing_until: soon },
    { id: 'c', title: 'Leased', availability_status: 'leased', paid_listing_until: soon },
  ]);
  assert.deepEqual(expiring.map((listing) => listing.id), ['a']);

  const publish = loadTs(path.join(root, 'lib', 'listWizard', 'publish.ts'), { mocks: { '../supabase/client': {}, '../cache/createCache': {} } });
  const base = { category: 'property', editMode: true, paymentVerified: false, hasActiveNichePlan: true, hasCurrentListingFee: false, hasListingCredit: true, listingIsPaused: true, listingNeedsPublication: false };
  assert.equal(publish.shouldActivate(base), true, 'a paused listing with a plan comes back online on save');
  assert.equal(publish.shouldActivate({ ...base, listingIsMarked: true }), false, 'a sold one does not: Relist does');
  assert.equal(publish.needsListingPayment({ ...base, hasActiveNichePlan: false, hasListingCredit: false, listingIsMarked: true }), false, 'and editing it asks for no payment');
  assert.match(read('lib', 'listWizard', 'startup.ts'), /flags\.listingIsMarked = \['sold', 'rented', 'leased'\]\.includes\(String\(found\.availability_status\)\);/);

  const pp = loadTs(path.join(root, 'lib', 'profile', 'profilePage.ts'));
  const future = new Date(Date.now() + 86400000).toISOString();
  assert.equal(pp.listingStatus('sold', future).label, 'Sold');
  assert.equal(pp.listingStatus('leased', future).label, 'Leased');
  assert.equal(pp.listingStatus('available', future, Date.now(), true).label, 'Under offer');
  assert.equal(pp.listingStatus('available', future).label, 'Available');

  const bl = loadTs(path.join(root, 'lib', 'booking', 'bookingListing.ts'));
  const sold = bl.bookingKind({ category: 'property', listing_purpose: 'sale', availability_status: 'sold', live_until: future, listing_booking_details: [{}] });
  assert.equal(sold.listingUnavailable, true);
  assert.equal(sold.availabilityMessage, 'This listing has been sold.');
});

test('Under offer shows on the feeds, the marketplace and saved cards, and the booking card', () => {
  assert.match(read('lib', 'hostHome', 'hostHome.ts'), /supports_table_reservation,under_offer,verified,.*listing_booking_details\(price_amount,price_unit,listing_purpose,units_available\)/);
  assert.match(read('pages', 'client-home.tsx'), /supports_table_reservation,under_offer,verified,/);
  assert.match(read('lib', 'marketplace', 'marketplace.ts'), /listing_purpose,under_offer,verified,/);
  assert.match(read('lib', 'bookmarks', 'bookmarks.ts'), /availability_status,under_offer,/);
  assert.match(read('lib', 'profile', 'hostProfile.ts'), /listing_purpose,under_offer,verified,/);
  assert.match(read('lib', 'booking', 'bookingListing.ts'), /listing_purpose,under_offer,verified,/);
  assert.match(read('components', 'hostHome', 'FeedCard.tsx'), /: listing\.under_offer && <div className="listing-status-banner" data-listing-status="">Under offer<\/div>/);
  assert.match(read('pages', 'client-home.tsx'), /: listing\.under_offer && <div className=\{styles\.statusBanner\}>Under offer<\/div>/);
  assert.match(read('components', 'marketplace', 'MarketplaceCard.tsx'), /const flag = isMarkedStatus\(listing\.availability_status\) \? statusLabel\(listing\.availability_status\) : listing\.under_offer \? 'Under offer' : null;/);
  assert.match(read('components', 'booking', 'BookingWidget.tsx'), /showsSale && listing\.under_offer && !listingUnavailable && <p className="form-note"><strong>Under offer\.<\/strong>/);
});
