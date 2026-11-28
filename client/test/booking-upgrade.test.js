// The Booking page upgrade: guest count, readable and DST-safe dates, the
// accessible calendar, the Room / Table switch, the phone bar, the scoped
// stylesheet, the table sheet, and the booking details for every status.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadTs } = require('./helpers/loadTs');

const root = path.join(__dirname, '..');
const repo = path.join(root, '..');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');
const bl = loadTs(path.join(root, 'lib', 'booking', 'bookingListing.ts'));
const policy = loadTs(path.join(root, 'lib', 'booking', 'bookingPolicy.ts'));
const format = loadTs(path.join(root, 'lib', 'bookings', 'format.ts'));
const host = loadTs(path.join(root, 'lib', 'bookings', 'hostBookings.ts'));

const listing = (overrides = {}, details = {}) => Object.assign({
  id: 'L1', title: 'Palm View', host_id: 'H1', category: 'airbnb', listing_purpose: null, availability_status: 'available',
  paid_listing_until: null, supports_stay: null, supports_table_reservation: null, host: { full_name: 'Ann' },
  listing_booking_details: [Object.assign({ price_amount: 1000, price_unit: 'night', max_guests: 3 }, details)],
}, overrides);
const choice = (extra = {}) => Object.assign({ start: '2026-12-01', end: '2026-12-03', hours: 1, leaseStart: '2026-12-01', leaseMonths: 6 }, extra);

test('guest count: saved for stays, capped at the listing maximum, never for leases', () => {
  const stay = listing();
  const kind = bl.bookingKind(stay);
  assert.equal(bl.bookingPayload(stay, kind, 'U1', 2000, choice({ guests: 2 })).guest_count, 2);
  assert.equal(bl.bookingPayload(stay, kind, 'U1', 2000, choice({ guests: 9 })).guest_count, 3, 'never above max_guests');
  assert.equal('guest_count' in bl.bookingPayload(stay, kind, 'U1', 2000, choice()), false);
  const office = listing({ category: 'office' }, { price_unit: 'month' });
  assert.equal('guest_count' in bl.bookingPayload(office, bl.bookingKind(office), 'U1', 1, choice({ guests: 2 })), false);
  assert.equal(bl.guestLimit({ max_guests: 4 }), 4);
  assert.equal(bl.guestLimit({ max_guests: null }), 20, 'no maximum set: up to 20 in the stepper');
  assert.equal(bl.guestLimit({ max_guests: 5000 }), 1000, 'the database allows up to 1000');
});

test('guest count: the migration adds the column and checks it against max_guests', () => {
  const sql = fs.readFileSync(path.join(repo, 'server', 'migrations', '20261121_000077_booking_guest_count.sql'), 'utf8');
  assert.match(sql, /add column if not exists guest_count integer\s+check \(guest_count is null or \(guest_count >= 1 and guest_count <= 1000\)\)/);
  assert.match(sql, /raise exception 'booking_rule: This place takes up to % guest\(s\)\.', guest_limit;/);
  assert.match(sql, /before insert on public\.bookings/);
  assert.match(sql, /-- Rollback:/);
  // The page reads it back for hosts and guests, and shows it.
  assert.match(read('lib', 'bookings', 'hostBookings.ts'), /lease_months,guest_count,total_price/);
  assert.match(read('lib', 'bookings', 'clientBookings.ts'), /lease_months,guest_count,total_price/);
  assert.equal(host.guestCountText({ guest_count: 1 }), '1 guest');
  assert.equal(host.guestCountText({ guest_count: 3 }), '3 guests');
  assert.equal(host.guestCountText({ guest_count: null }), '');
  const rows = format.detailRows({ start_date: '2026-12-01', end_date: '2026-12-03', guest_count: 2 });
  assert.deepEqual(rows[rows.length - 1], { label: 'Guests', value: '2 guests', icon: 'guests' });
  assert.match(read('components', 'bookings', 'HostBookingsView.tsx'), /\{guests && <span><MetaIcon name="guests" \/>\{guests\}<\/span>\}/);
});

test('dates: stepping days never depends on summer time; labels people can read', () => {
  assert.equal(bl.nextDay('2026-12-31'), '2027-01-01');
  assert.equal(bl.nextDay('2027-03-28'), '2027-03-29', 'the European clock change night');
  assert.equal(bl.nightsBetween('2027-03-27', '2027-03-30'), 3);
  assert.equal(bl.dayLabel('2026-11-20'), 'Fri 20 Nov');
  assert.equal(bl.dayLabel('2026-11-20', true), 'Fri 20 Nov 2026');
  assert.equal(bl.todayString(new Date(2026, 0, 5)), '2026-01-05');
  const source = read('lib', 'booking', 'bookingListing.ts');
  assert.doesNotMatch(source, /day\.setDate\(day\.getDate\(\) \+ 1\)/, 'no local-time day stepping');
});

test('calendar: every day is a labelled button; no past months; closed days are disabled unless they can be the check-out', () => {
  const calendar = read('components', 'booking', 'BookingCalendar.tsx');
  assert.match(calendar, /<button\s+key=\{state\.day\}\s+type="button"/);
  assert.match(calendar, /disabled=\{!state\.open && !state\.checkout\}/);
  assert.match(calendar, /aria-label=\{`\$\{dayLabel\(state\.day, true\)\}, \$\{why\(state\)\}`\}/);
  assert.match(calendar, /const canGoBack = monthIndex\(view\) > monthIndex\(first\);/);
  assert.match(calendar, /disabled=\{!canGoBack\}/);
  assert.doesNotMatch(calendar, /onClick=\{open \? /, 'no clickable divs');
  const widget = read('components', 'booking', 'BookingWidget.tsx');
  assert.doesNotMatch(widget, /window\.alert|ReservationChoice|choose-reservation-btn/);
  assert.match(widget, /<div className="mode-switch" role="tablist" aria-label="What to reserve"/);
  assert.match(widget, /guests: isShortStay \? guests : undefined/);
  assert.match(widget, /<Link href=\{ownBookingHref\(null, profile\?\.role === 'host'\)\} className="sent-link">View my bookings<\/Link>/);
  assert.doesNotMatch(widget, /<select id="guests-input"/, 'the old Guests box that was never saved is gone');
  assert.doesNotMatch(widget, /leasePicked/, 'the move-in date starts filled in, so the price shows at once');
});

test('policy: an empty "No property policies provided." section is left out', () => {
  const none = policy.listingPolicy('property', {}, [], true);
  assert.equal(none.none, true);
  assert.equal(policy.listingPolicy('property', {}, [], false).none, false, 'still loading or failed: say so');
  assert.match(read('components', 'booking', 'PolicySections.tsx'), /if \(policy\.none && !loading\) return null;/);
});

test('page: scoped styles, no Google Fonts, no pop-ups, phone bar, table sheet', () => {
  const styles = read('components', 'booking', 'bookingStyles.ts').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  for (const rule of styles.match(/^\s*[^@\s}][^{};]*\{/gm) || []) {
    if (/^\s*(from|to|\d+%)/.test(rule)) continue;
    assert.match(rule, /booking-page/, `unscoped rule: ${rule.trim()}`);
  }
  assert.doesNotMatch(styles, /:root|^\s*(html|body)\s*\{/m);
  const page = read('pages', 'booking.tsx');
  assert.doesNotMatch(page, /fonts\.googleapis|window\.alert/);
  assert.match(page, /<div className="page-shell booking-page">/);
  assert.match(page, /<PhoneBookingBar listing=\{listing\} kind=\{kind\} \/>/);
  const bar = read('components', 'booking', 'PhoneBookingBar.tsx');
  assert.match(bar, /new IntersectionObserver/);
  assert.match(bar, /observer\.disconnect\(\)/);
  const sheet = read('components', 'booking', 'ReservationDialogs.tsx');
  assert.match(sheet, /role="dialog" aria-modal="true"/);
  assert.match(sheet, /if \(event\.key === 'Escape'\) onClose\(\);/);
  assert.match(sheet, /min=\{todayString\(\)\}/, 'today where the guest is, not in UTC');
});

test('booking details: one layout for every status; the phone page has a plain top bar', () => {
  const page = read('pages', 'booking-approved.tsx');
  assert.doesNotMatch(page, /fonts\.googleapis|ba-logo/);
  assert.match(page, /const showBackButton = state\.kind === 'status';/);
  const styles = read('components', 'bookings', 'bookingsStyles.ts');
  assert.doesNotMatch(styles, /has-varoom-mobile-nav/, 'no room kept for a bottom bar');
  assert.match(styles, /\.booking-approved-page \.ba-main\{[^}]*padding:16px 16px calc\(28px \+ env\(safe-area-inset-bottom\)\); \}/);
});
