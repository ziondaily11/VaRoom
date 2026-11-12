const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadTs } = require('./helpers/loadTs');

const root = path.join(__dirname, '..');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');
const bl = loadTs(path.join(root, 'lib', 'booking', 'bookingListing.ts'));
const bd = loadTs(path.join(root, 'lib', 'settings', 'bookingDefaults.ts'));

test('booking window: minimum notice and how far ahead limit the days a guest can pick', () => {
  const today = new Date(2026, 10, 10);
  assert.deepEqual({ ...bl.bookingWindow({}, today) }, { first: '2026-11-10', last: null });
  assert.deepEqual({ ...bl.bookingWindow({ min_notice_days: 2, max_advance_days: 30 }, today) }, { first: '2026-11-12', last: '2026-12-10' });
  const dates = { open: new Set(['2026-11-10', '2026-11-12', '2026-12-10', '2026-12-11']), unavailable: new Set() };
  const windowed = bl.windowedCalendar(dates, { first: '2026-11-12', last: '2026-12-10' });
  assert.deepEqual(Array.from(windowed.open), ['2026-11-12', '2026-12-10']);
});

test('stay length, instant book and the guest-facing errors', () => {
  assert.equal(bl.stayProblem({ min_stay_nights: 2 }, 1), 'The minimum stay is 2 nights.');
  assert.equal(bl.stayProblem({ max_stay_nights: 5 }, 6), 'The maximum stay is 5 nights.');
  assert.equal(bl.stayProblem({ min_stay_nights: 2, max_stay_nights: 5 }, 3), null);
  assert.equal(bl.isInstantBooking({ isShortStay: true, isHourly: false, details: { instant_book: true } }), true);
  assert.equal(bl.isInstantBooking({ isShortStay: true, isHourly: true, details: { instant_book: true } }), false, 'hours stay requests');
  assert.equal(bl.bookingFailureText('booking_rule: The minimum stay is 2 night(s).'), 'The minimum stay is 2 night(s).');
  assert.equal(bl.bookingFailureText('network down'), 'Something went wrong: network down');
  const note = bl.bookingNotification({ id: 'L1', host_id: 'H1', title: 'Palm View' }, 'B1', { id: 'G1', name: 'Amina', email: null }, true);
  assert.equal(note.title, 'New booking');
  assert.equal(note.message, '"Amina" booked "Palm View".');
});

test('host booking defaults: normalised, checked, and turned into the wizard fields', () => {
  assert.deepEqual({ ...bd.normaliseBookingDefaults(null) }, { ...bd.EMPTY_BOOKING_DEFAULTS });
  const defaults = bd.normaliseBookingDefaults({ instant_book: true, min_notice_days: 1, max_advance_days: '90', min_stay_nights: 2, max_stay_nights: 0, checkin_time: '14:00', checkout_time: 'noon', cancellation_policy: 'odd' });
  assert.deepEqual({ ...defaults }, {
    instant_book: true, min_notice_days: 1, max_advance_days: 90, min_stay_nights: 2, max_stay_nights: null,
    checkin_time: '14:00', checkout_time: null, cancellation_policy: 'moderate',
  });
  assert.equal(bd.bookingDefaultsProblem({ ...defaults, min_stay_nights: 5, max_stay_nights: 3 }), 'The maximum stay must be at least the minimum stay.');
  assert.deepEqual({ ...bd.bookingDefaultFields(defaults) }, {
    'instant-book': true, 'min-notice': '1', 'max-advance': '90', 'cancellation-policy': 'moderate', 'min-stay': '2', 'checkin-time': '14:00',
  });
});

test('wiring: Settings → Bookings for hosts, new listings start from the defaults, listings save their rules', () => {
  assert.match(read('components', 'settings', 'SettingsSections.tsx'), /isHost \? \[CATEGORIES\[0\], PLANS_CATEGORY, BOOKINGS_CATEGORY, \.\.\.CATEGORIES\.slice\(1\)\]/);
  assert.match(read('pages', 'settings.tsx'), /view === 'bookings' && role === 'host'/);
  assert.match(read('lib', 'listWizard', 'startup.ts'), /if \(!params\.edit && !form && SHORT_STAY\.includes\(niche\)\)/);
  const publish = read('lib', 'listWizard', 'publish.ts');
  assert.match(publish, /details\.instant_book = checked\(fields, 'instant-book'\);/);
  assert.match(publish, /fields\['instant-book'\] = details\.instant_book === true;/);
  const widget = read('components', 'booking', 'BookingWidget.tsx');
  assert.match(widget, /windowedCalendar\(calendar, bookable\)/);
  assert.match(widget, /successText=\{instant \? 'Booked' : 'Reservation request sent'\}/);
});
