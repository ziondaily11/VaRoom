const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadTs } = require('./helpers/loadTs');

const root = path.join(__dirname, '..');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');
const bl = loadTs(path.join(root, 'lib', 'booking', 'bookingListing.ts'));
const commercial = loadTs(path.join(root, 'lib', 'booking', 'commercial.ts'));
const likes = loadTs(path.join(root, 'lib', 'listings', 'listingLikes.ts'), { mocks: { react: {} } });

const listing = (overrides = {}) => Object.assign({
  id: 'L1', title: 'Palm View', host_id: 'H1', category: 'airbnb', listing_purpose: null, availability_status: 'available',
  paid_listing_until: null, live_until: '2999-01-01T00:00:00Z', supports_stay: null, supports_table_reservation: null, host: { full_name: 'Ann' },
  listing_booking_details: [{ price_amount: 1000, price_unit: 'night' }],
}, overrides);

test('which widget: nightly, hourly, rentals, property purposes, hotels taking tables', () => {
  const nightly = bl.bookingKind(listing());
  assert.equal(nightly.isShortStay, true);
  assert.equal(nightly.isHourly, false);
  assert.equal(bl.bookingKind(listing({ listing_booking_details: { price_unit: 'hour', price_amount: 5 } })).isHourly, true);
  const office = bl.bookingKind(listing({ category: 'office', listing_booking_details: [{ office_shop_details: { space: {} } }] }));
  assert.equal(office.usesRentalBooking, true);
  assert.ok(office.officeShop);
  const sale = bl.bookingKind(listing({ category: 'property', listing_purpose: 'sale' }));
  assert.equal(sale.isPropertySaleOnly, true);
  assert.equal(sale.usesRentalBooking, false);
  assert.equal(bl.bookingKind(listing({ category: 'property' })).propertyPurpose, 'rent', 'rent by default');
  const both = bl.bookingKind(listing({ category: 'hotel', supports_table_reservation: true }));
  assert.equal(both.supportsBoth, true);
  const tablesOnly = bl.bookingKind(listing({ category: 'hotel', supports_stay: false, supports_table_reservation: true }));
  assert.equal(tablesOnly.supportsStay, false);
  assert.equal(tablesOnly.supportsTableReservation, true);
});

test('availability: unavailable, or offline (an ended Silver / Gold term or plan), blocks booking', () => {
  assert.equal(bl.bookingKind(listing({ availability_status: 'fully_booked' })).availabilityMessage, 'This listing is currently fully booked and cannot accept new bookings.');
  assert.equal(bl.bookingKind(listing({ paid_listing_until: '2020-01-01T00:00:00Z', live_until: '2020-01-01T00:00:00Z' })).availabilityMessage, 'This listing’s 30-day paid listing period has ended.');
  // A plan listing whose host's plan ended.
  assert.equal(bl.bookingKind(listing({ live_until: '2020-01-01T00:00:00Z' })).availabilityMessage, 'This listing is offline right now and cannot accept new bookings.');
  assert.equal(bl.bookingKind(listing({ live_until: null })).listingUnavailable, true, 'never online');
  // Its own status wins over offline.
  assert.equal(bl.bookingKind(listing({ availability_status: 'paused', live_until: '2020-01-01T00:00:00Z' })).availabilityMessage, 'This listing is currently paused and cannot accept new bookings.');
  assert.equal(bl.bookingKind(listing()).listingUnavailable, false);
});

test('page errors, in the order the page always checked; the owner sees their own listing', () => {
  assert.equal(bl.bookingPageError({ listing: null, diningConfig: null }), "Couldn't load that listing.");
  assert.equal(bl.bookingPageError({ listing: listing(), diningConfig: null }), null, 'no longer blocked for its owner');
  assert.equal(bl.isOwnListing(listing(), 'H1'), true);
  assert.equal(bl.isOwnListing(listing(), 'U1'), false);
  assert.equal(bl.isOwnListing(listing(), null), false);
  assert.equal(bl.bookingPageError({ listing: listing({ listing_booking_details: [] }), diningConfig: null }), 'This listing has no booking details set up yet.');
  assert.equal(bl.bookingPageError({ listing: listing({ category: 'hotel', supports_stay: false, supports_table_reservation: true }), diningConfig: null }), 'This hotel has not finished setting up table reservations yet.');
});

test('property options: the purpose, limited to the options with a price', () => {
  const kindOf = (purpose, details) => ({ isProperty: true, propertyPurpose: purpose, details });
  assert.deepEqual([...bl.propertyOptions(kindOf('both', { sale_price_amount: 9000000, price_amount: 60000 }))], ['sale', 'rent']);
  assert.deepEqual([...bl.propertyOptions(kindOf('both', { sale_price_amount: 9000000, price_amount: null }))], ['sale'], 'no rent price: rent is not shown');
  assert.deepEqual([...bl.propertyOptions(kindOf('both', { sale_price_amount: null, price_amount: 60000 }))], ['rent']);
  assert.deepEqual([...bl.propertyOptions(kindOf('sale', { sale_price_amount: 9000000, price_amount: 60000 }))], ['sale'], 'only what the host offers');
  assert.deepEqual([...bl.propertyOptions(kindOf('rent', { price_amount: 0 }))], ['rent']);
  assert.deepEqual([...bl.propertyOptions(kindOf('both', {}))], ['sale', 'rent'], 'no price at all: the purpose decides');
  assert.deepEqual([...bl.propertyOptions({ isProperty: false, propertyPurpose: null, details: {} })], []);
});

test('calendar: booked days are blocked; a range must be open from check-in to check-out', () => {
  const booked = bl.bookedDays([{ start_date: '2026-11-10', end_date: '2026-11-12' }, { start_date: null, end_date: '2026-11-20' }]);
  assert.deepEqual([...booked], ['2026-11-10', '2026-11-11', '2026-11-12']);
  const dates = { open: new Set(['2026-11-08', '2026-11-09', '2026-11-10', '2026-11-13']), unavailable: booked };
  assert.equal(bl.isOpenDay(dates, '2026-11-10'), false);
  assert.deepEqual({ ...bl.pickStayDay(dates, null, null, '2026-11-08') }, { start: '2026-11-08', end: null, blocked: false });
  assert.deepEqual({ ...bl.pickStayDay(dates, '2026-11-08', null, '2026-11-09') }, { start: '2026-11-08', end: '2026-11-09', blocked: false });
  assert.deepEqual({ ...bl.pickStayDay(dates, '2026-11-08', null, '2026-11-13') }, { start: '2026-11-13', end: null, blocked: true }, 'closed days in between restart at the tapped day');
  assert.deepEqual({ ...bl.pickStayDay(dates, '2026-11-09', null, '2026-11-08') }, { start: '2026-11-08', end: null, blocked: false });
  assert.equal(bl.nightsBetween('2026-11-08', '2026-11-11'), 3);
  assert.deepEqual({ ...bl.shiftMonth(2026, 11, 1) }, { year: 2027, month: 0 });
  const month = bl.calendarMonth(2026, 10);
  assert.equal(month.title, 'November 2026');
  assert.equal(month.days.length, 30);
  assert.equal(month.days[0], '2026-11-01');
});

test('prices and the booking payload are unchanged', () => {
  assert.deepEqual({ ...bl.priceLine(12000, 2, '2 nights', 1500) }, { quantity: 2, label: '2 nights', base: 24000, fee: 1500, total: 25500 });
  assert.equal(bl.ksh(1234567), 'KSh 1,234,567');
  const nightly = listing();
  assert.deepEqual(bl.bookingPayload(nightly, bl.bookingKind(nightly), 'C1', 2000, { start: '2026-11-08', end: '2026-11-10', hours: 1, leaseStart: '', leaseMonths: 1 }),
    { listing_id: 'L1', host_id: 'H1', client_id: 'C1', price_unit: 'night', total_price: 2000, start_date: '2026-11-08', end_date: '2026-11-10' });
  const rental = listing({ category: 'office', listing_booking_details: [{ price_amount: 5, price_unit: 'month', office_shop_details: {} }] });
  assert.deepEqual(bl.bookingPayload(rental, bl.bookingKind(rental), 'C1', 30, { start: null, end: null, hours: NaN, leaseStart: '2026-12-01', leaseMonths: 6 }),
    { listing_id: 'L1', host_id: 'H1', client_id: 'C1', price_unit: 'month', total_price: 30, lease_start_date: '2026-12-01', lease_months: 6 });
});

test('booking notifications come from the database, not the page', () => {
  assert.equal(bl.bookingNotification, undefined);
  assert.doesNotMatch(read('pages', 'booking.tsx'), /VaRoomNotificationAPI/);
  const sql = fs.readFileSync(path.join(root, '..', 'server', 'migrations', '20261112_000064_notification_preferences.sql'), 'utf8');
  assert.match(sql, /body := format\('"%s" requested to book "%s"\.', coalesce\(guest_name, 'A guest'\), listing_title\);/, 'the host is told the guest\'s name');
  assert.match(sql, /replace\(kind, '_', '-'\) \|\| ':' \|\| new\.id/, 'the event keys the pages used, so repeats are ignored');
});

test('commercial details: labels unchanged; unset service charge and utilities are left out (they read "null")', () => {
  const details = commercial.commercialDetails({ category: 'office', city: 'Nairobi', neighborhood: 'Westlands', address_visibility: 'after_inquiry' }, {
    space: { area: 1200, area_unit: 'sqft', capacity: 20 }, costs: { tax: 'added' }, pricing: { basis: 'per_area', amount: 150, area_period: 'month' },
  });
  assert.deepEqual(details.location.map((item) => item.label), ['City / county', 'Neighbourhood']);
  assert.equal(details.addressAfterInquiry, true);
  assert.deepEqual(details.space.find((item) => item.label === 'Area'), { label: 'Area', value: '1,200 sq ft' });
  assert.deepEqual(details.costs, [{ label: 'VAT / tax', value: 'Added on top' }]);
  assert.deepEqual(details.pricing.map((item) => item.value), ['Per area', 'KSh 150', 'Per month']);
});

test('likes: the shown count follows an unsaved tap; summaries are validated', () => {
  assert.equal(likes.shownCount(4, false, true), 5);
  assert.equal(likes.shownCount(0, true, false), 0);
  assert.equal(likes.isValidLikeSummary({ like_count: '3', liked_by_current_user: true }), true);
  assert.equal(likes.isValidLikeSummary({ like_count: -1, liked_by_current_user: true }), false);
});

test('page: native, identity from AuthProvider, listing cached per account, the legacy page retired', () => {
  const page = read('pages', 'booking.tsx');
  assert.match(page, /useAuth\(\)/);
  assert.doesNotMatch(page, /auth\.getSession|from\('profiles'\)\.select\('role/, 'no session or profile requests of its own');
  assert.match(page, /peekListingBundle\(userId, listingId\)/);
  assert.match(page, /\.appNavigation = true/);
  assert.match(read('lib', 'booking', 'bookingListing.ts'), /userScoped: true/);
  for (const file of ['legacy-pages/booking.html', 'public/js/booking-policy.js']) assert.equal(fs.existsSync(path.join(root, file)), false, file);
  assert.match(read('next.config.js'), /source: '\/booking\.html',\s*destination: '\/booking'/);
  const server = fs.readFileSync(path.join(root, '..', 'server', 'server.js'), 'utf8');
  assert.match(server, /app\.get\(\['\/booking', '\/booking\.html', '\/legacy-pages\/booking\.html'\]/);
  assert.doesNotMatch(server, /'\/booking': 'booking\.html'/);
});

test('a listing whose host profile comes back empty still shows ("Host"), instead of crashing the page', async () => {
  const fake = (row) => ({ from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: row, error: null }) }) }) }) });
  const loaded = await bl.fetchBookingListing(fake(listing({ host: null })), 'L1');
  assert.deepEqual({ ...loaded.host }, { full_name: null, verified: null, avatar_url: null, username: null });
  const withProfile = await bl.fetchBookingListing(fake(listing()), 'L1');
  assert.equal(withProfile.host.full_name, 'Ann');
  assert.equal(await bl.fetchBookingListing(fake(null), 'L1'), null);
});

test('booking sits in the account shell with the icon rail, like Marketplace; its own sidebar is gone', () => {
  const layout = loadTs(path.join(root, 'lib', 'accountRoleLayout.ts'));
  assert.equal(layout.getAccountLayout('/booking', '/booking?listing=L1', 'host'), 'host');
  assert.equal(layout.getAccountLayout('/booking', '/booking?listing=L1', 'client'), 'client');
  assert.equal(layout.usesIconRail('/booking', '/booking?listing=L1'), true);
  assert.equal(layout.usesIconRail('/bookings', '/bookings'), false, 'Bookings keeps the full sidebar');
  const nav = loadTs(path.join(root, 'lib', 'navigation', 'activeNav.ts'));
  assert.equal(nav.hostActiveNav('/booking', '/booking?listing=L1', ''), 'marketplace');
  assert.equal(nav.clientActiveNav('/booking', '/booking?listing=L1'), 'marketplace');
  assert.equal(nav.hostActiveNav('/bookings', '/bookings', ''), 'bookings');
  assert.equal(fs.existsSync(path.join(root, 'components', 'booking', 'BookingSidebar.tsx')), false);
  const styles = fs.readFileSync(path.join(root, 'components', 'booking', 'bookingStyles.ts'), 'utf8');
  assert.doesNotMatch(styles, /\n\s*header\s*[{,]|\n\s*\*\{|\n\s*\.logo\{/, 'no page-wide rules that reach the shared sidebar');
});

test('the owner sees the page with notes instead of the actions', () => {
  const page = fs.readFileSync(path.join(root, 'pages', 'booking.tsx'), 'utf8');
  assert.match(page, /const isOwner = Boolean\(listing && isOwnListing\(listing, userId\)\);/);
  assert.match(page, /if \(isOwner\) return MESSAGES\.ownListing\(listing\);/, 'a booking is never sent for the owner');
  const widget = fs.readFileSync(path.join(root, 'components', 'booking', 'BookingWidget.tsx'), 'utf8');
  assert.match(widget, /isOwner \? <OwnerNote listing=\{listing\} \/>/);
  assert.match(widget, /if \(submitting\.current \|\| isOwner \|\| !line\) return;/);
  const details = fs.readFileSync(path.join(root, 'components', 'booking', 'ListingDetails.tsx'), 'utf8');
  assert.match(details, /\{MESSAGES\.ownContact\}/);
  assert.equal(bl.MESSAGES.ownContact, 'This is your own contact. Guests use these buttons to reach you.');
});

test('reviews: properties, offices and shops show nothing until one exists; other listings invite the first', () => {
  assert.equal(bl.reviewsOptional({ isProperty: true, isOfficeShop: false }), true);
  assert.equal(bl.reviewsOptional({ isProperty: false, isOfficeShop: true }), true);
  assert.equal(bl.reviewsOptional({ isProperty: false, isOfficeShop: false }), false);
  const result = (n, error = null) => ({ reviews: Array.from({ length: n }, (_, i) => ({ id: String(i) })), summary: { review_count: n, average_rating: n ? 4.5 : null }, error });
  assert.equal(bl.reviewCount(null), 0, 'loading');
  assert.equal(bl.reviewCount(result(0)), 0);
  assert.equal(bl.reviewCount(result(3)), 3);
  assert.equal(bl.reviewCount(result(2, 'Reviews are temporarily unavailable.')), 0);
  const details = fs.readFileSync(path.join(root, 'components', 'booking', 'ListingDetails.tsx'), 'utf8');
  assert.match(details, /const showReviews = !reviewsOptional\(kind\) \|\| count > 0;/);
  assert.match(details, /\{rating && count > 0 && <div className="rating-row">/, 'no "No reviews yet" under the photos');
  assert.match(details, /: <ReviewsEmpty isHotel=\{isHotel\} \/>/);
  assert.doesNotMatch(details, /see-all-link|host-phone|Loading reviews…<\/span>/, 'no dead link, no phone line, no loading text in the rating row');
  assert.match(details, /<Link className="host-avatar host-avatar-link" href=\{hostProfile\}/, 'the photo opens the profile too');
  assert.match(details, /<Link className="host-name" href=\{hostProfile\}>/);
  const widget = fs.readFileSync(path.join(root, 'components', 'booking', 'BookingWidget.tsx'), 'utf8');
  assert.match(widget, /rating && !reviewsOptional\(kind\) && <span className="new-badge">/);
});

test('each listing type has its own action: rent, buy, lease, reserve or book', () => {
  const { listingAction } = loadTs(path.join(root, 'lib', 'listings', 'listingAction.ts'));
  const property = (listing_purpose, details) => ({ category: 'property', listing_purpose, listing_booking_details: details });
  assert.equal(listingAction(property('rent')), 'Rent');
  assert.equal(listingAction(property('sale')), 'Buy');
  assert.equal(listingAction(property('both')), 'Rent or buy');
  assert.equal(listingAction(property(null, [{ listing_purpose: 'sale' }])), 'Buy', 'older properties keep the purpose in the details');
  assert.equal(listingAction(property(null, null)), 'Rent', 'the same default as the booking widget');
  assert.equal(listingAction({ category: 'office' }), 'Lease');
  assert.equal(listingAction({ category: 'shop' }), 'Rent');
  assert.equal(listingAction({ category: 'hotel', supports_stay: false, supports_table_reservation: true }), 'Reserve');
  assert.equal(listingAction({ category: 'hotel', supports_stay: true, supports_table_reservation: true }), 'Book');
  ['airbnb', 'venue', 'hotel'].forEach((category) => assert.equal(listingAction({ category }), 'Book'));
  assert.equal(bl.MESSAGES.ownListing(property('sale')), 'This is your own listing. Guests buy it here.');
  assert.equal(bl.MESSAGES.ownListing({ category: 'airbnb' }), 'This is your own listing. Guests book it here.');
});
