const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadTs } = require('./helpers/loadTs');

const root = path.join(__dirname, '..');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');
const cal = loadTs(path.join(root, 'lib', 'calendar', 'hostCalendar.ts'));

const night = { id: 'A', title: 'Palm View', category: 'airbnb', price_unit: 'night', units: null, availability_status: 'available', live_until: null };
const hotel = { id: 'H', title: 'Rooms', category: 'hotel', price_unit: 'night', units: 3, availability_status: 'available', live_until: null };
const venue = { id: 'V', title: 'Hall', category: 'venue', price_unit: 'day', units: null, availability_status: 'available', live_until: null };
const booking = (listing_id, start_date, end_date, status = 'approved', total_price = 0) => ({ id: `${listing_id}${start_date}`, listing_id, start_date, end_date, status, total_price });

test('a booking takes its nights (not the check-out day), a venue its days, an hourly booking its date', () => {
  const stay = booking('A', '2026-12-01', '2026-12-03');
  assert.deepEqual(['2026-12-01', '2026-12-02', '2026-12-03'].map((d) => cal.covers(stay, night, d)), [true, true, false]);
  const hire = booking('V', '2026-12-01', '2026-12-02');
  assert.deepEqual(['2026-12-01', '2026-12-02', '2026-12-03'].map((d) => cal.covers(hire, venue, d)), [true, true, false]);
  const hourly = booking('V', '2026-12-05', null);
  assert.equal(cal.covers(hourly, venue, '2026-12-05'), true);
  assert.equal(cal.covers(hourly, venue, '2026-12-06'), false);
});

test('closed ranges, open-ended ones too; listings guests can\'t book at all', () => {
  const closed = [{ listing_id: 'A', start_date: '2026-12-10', end_date: '2026-12-12' }, { listing_id: 'A', start_date: '2027-01-01', end_date: null }];
  assert.deepEqual(['2026-12-09', '2026-12-10', '2026-12-12', '2026-12-13', '2027-06-01'].map((d) => cal.isClosed(closed, 'A', d)), [false, true, true, false, true]);
  assert.equal(cal.isClosed(closed, 'B', '2026-12-10'), false, 'per listing');
  assert.equal(cal.listingOff(night), null);
  assert.equal(cal.listingOff({ ...night, availability_status: 'paused' }), 'is paused');
  assert.equal(cal.listingOff({ ...night, live_until: '2020-01-01T00:00:00Z' }), 'is offline (its plan or term has ended)');
  assert.deepEqual(cal.daysBetweenInclusive('2026-12-30', '2027-01-02'), ['2026-12-30', '2026-12-31', '2027-01-01', '2027-01-02']);
  assert.deepEqual({ ...cal.monthRange(2027, 1) }, { from: '2027-02-01', to: '2027-02-28' });
  assert.equal(cal.hasCalendar('venue'), true);
  assert.equal(cal.hasCalendar('property'), false);
});

test('month summary: booked nights, occupancy of open nights (hotel rooms count), money and requests', () => {
  const days = cal.daysBetweenInclusive('2026-12-01', '2026-12-10');
  const data = {
    listings: [night, hotel],
    bookings: [booking('A', '2026-11-30', '2026-12-03', 'approved', 9000), booking('H', '2026-12-05', '2026-12-07', 'approved', 4000), booking('A', '2026-12-08', '2026-12-09', 'pending', 5000)],
    closed: [],
  };
  const closedAt = (id, day) => id === 'A' && day >= '2026-12-06';
  const summary = cal.monthSummary(data, [night, hotel], days, closedAt);
  assert.equal(summary.nightsBooked, 4, 'Dec 1-2 on A, Dec 5-6 on H (requests don\'t count)');
  assert.equal(summary.occupancy, 4 / (5 + 30), 'A open 5 nights; H 3 rooms × 10');
  assert.equal(summary.earned, 4000, 'approved bookings that start this month');
  assert.equal(summary.requests, 1);
});

test('months load once, are shared while loading, kept per account, and cleared', async () => {
  const calls = [];
  const client = { rpc: (name, args) => { calls.push([name, args]); return Promise.resolve({ data: { listings: [night], bookings: [], closed: [] }, error: null }); } };
  const [a, b] = await Promise.all([cal.loadMonth(client, 'h1', 2026, 11), cal.loadMonth(client, 'h1', 2026, 11)]);
  assert.equal(a, b);
  assert.deepEqual(calls, [['host_calendar', { p_host: 'h1', p_from: '2026-12-01', p_to: '2026-12-31' }]]);
  await cal.loadMonth(client, 'h1', 2026, 11);
  assert.equal(calls.length, 1, 'fresh: from memory');
  assert.ok(cal.cachedMonth('h1', 2026, 11));
  assert.equal(cal.cachedMonth('h2', 2026, 11), null, 'another account has its own');
  await cal.loadMonth(client, 'h1', 2026, 11, true);
  assert.equal(calls.length, 2, 'forced');
  cal.clearCalendarCache('h1');
  assert.equal(cal.cachedMonth('h1', 2026, 11), null);
  const failing = { rpc: () => Promise.resolve({ data: null, error: { message: 'down' } }) };
  await assert.rejects(cal.loadMonth(failing, 'h1', 2026, 11), { message: 'down' });
  const sets = [];
  await cal.setClosed({ rpc: (name, args) => { sets.push([name, args]); return Promise.resolve({ error: null }); } }, 'A', '2026-12-10', null, true);
  assert.deepEqual(sets, [['calendar_set_closed', { p_listing: 'A', p_from: '2026-12-10', p_to: null, p_closed: true }]]);
});

test('the Calendar page sits in the host shell, the sidebar and the listing menu', () => {
  assert.match(read('lib', 'accountRoleLayout.ts'), /matches\('\/calendar'\)/);
  assert.match(read('lib', 'accountRoleLayout.ts'), /\['\/analytics', '\/calendar', '\/marketplace'/, 'icon rail');
  assert.match(read('lib', 'navigation', 'activeNav.ts'), /return 'calendar';/);
  assert.match(read('lib', 'navigation', 'startPage.ts'), /'\/calendar',/);
  assert.match(read('lib', 'navigation', 'appLinks.ts'), /'\/calendar',/);
  assert.match(read('components', 'shell', 'HostSidebar.tsx'), /<PinnableRow page="\/calendar" label="Calendar" href="\/calendar"/);
  assert.match(read('components', 'listings', 'HostListingMenu.tsx'), /hasCalendar\(listing\.category\) && item\('Open calendar'/);
  assert.match(read('lib', 'auth', 'clearUserData.ts'), /clearCalendarCache\(\);/, 'cleared on sign-out and account switch');
  assert.match(read('components', 'bookings', 'HostBookingsView.tsx'), /respondToBooking\(client, \{ booking, userId: hostId, decision \}\);\s+clearCalendarCache\(hostId\);/);
  const page = read('components', 'calendar', 'HostCalendar.tsx');
  assert.match(page, /clearCalendarCache\(hostId\);\s+clearHostBookings\(\);/, 'approving here refreshes Bookings too');
  assert.match(read('pages', 'calendar.tsx'), /<HostCalendar key=\{hostId\}/, 'keyed by account');
  // The listing wizard no longer keeps opened days: Calendar is the one place for dates.
  assert.doesNotMatch(read('pages', 'list.tsx'), /from\('availability'\)/);
  assert.match(read('pages', 'list.tsx'), /<Link href=\{`\/calendar\?listing=\$\{encodeURIComponent\(editListingId\)\}`\}>Open the calendar<\/Link>/);
});

test('the planner: events take their days inclusively, weekly closed days, readable refusals, saving', async () => {
  const event = { start_date: '2026-12-05', end_date: '2026-12-06' };
  assert.deepEqual(['2026-12-04', '2026-12-05', '2026-12-06', '2026-12-07'].map((d) => cal.eventOn(event, d)), [false, true, true, false]);
  assert.equal(cal.weekday('2026-12-06'), 0, 'a Sunday');
  assert.equal(cal.closedWeekly({ ...night, closed_weekdays: [0] }, '2026-12-06'), true);
  assert.equal(cal.closedWeekly({ ...night, closed_weekdays: [0] }, '2026-12-07'), false);
  assert.equal(cal.calendarErrorText({ message: 'calendar: Those days are already booked.' }, 'x'), 'Those days are already booked.');
  assert.equal(cal.calendarErrorText({ message: 'new row violates check constraint "calendar_entries_shape"' }, 'x').startsWith('Check the dates'), true);
  assert.equal(cal.calendarErrorText({ message: 'network down' }, 'Try again.'), 'Try again.');
  // Offline bookings count as booked nights; their money is apart.
  const days = cal.daysBetweenInclusive('2026-12-01', '2026-12-10');
  const data = { listings: [night, hotel], bookings: [], closed: [], events: [
    { id: 'e1', listing_id: 'H', blocks: true, units: 2, amount: 30000, start_date: '2026-12-03', end_date: '2026-12-04' },
    { id: 'e2', listing_id: null, blocks: false, units: 1, amount: null, start_date: '2026-12-03', end_date: '2026-12-03' },
  ] };
  const summary = cal.monthSummary(data, [night, hotel], days, () => false);
  assert.equal(summary.nightsBooked, 4, '2 rooms × 2 nights');
  assert.equal(summary.offline, 30000);
  assert.equal(summary.earned, 0);
  const calls = [];
  const table = { insert: (row) => { calls.push(['insert', row]); return Promise.resolve({ error: null }); },
    update: (row) => { calls.push(['update', row]); return { eq: (c, v) => { calls.push(['eq', c, v]); return { eq: (c2, v2) => { calls.push(['eq', c2, v2]); return Promise.resolve({ error: null }); } }; } }; },
    delete: () => ({ eq: (c, v) => { calls.push(['delete', c, v]); return { eq: () => Promise.resolve({ error: null }) }; } }) };
  const client = { from: (name) => { calls.push(['from', name]); return table; }, rpc: (name, args) => { calls.push([name, args]); return Promise.resolve({ error: null }); } };
  await cal.saveEvent(client, 'h1', { title: 'Wedding', blocks: true, listing_id: 'V' });
  assert.deepEqual(calls.slice(0, 2), [['from', 'calendar_entries'], ['insert', { title: 'Wedding', blocks: true, listing_id: 'V', kind: 'event', host_id: 'h1' }]]);
  await cal.saveEvent(client, 'h1', { title: 'Wedding 2' }, 'ev1');
  assert.deepEqual(calls.slice(3, 6), [['update', { title: 'Wedding 2', kind: 'event', host_id: 'h1' }], ['eq', 'id', 'ev1'], ['eq', 'kind', 'event']]);
  await cal.setWeekdays(client, 'A', [0, 6]);
  assert.deepEqual(calls[calls.length - 1], ['calendar_set_weekdays', { p_listing: 'A', p_days: [0, 6] }]);
  const page = read('components', 'calendar', 'HostCalendar.tsx');
  assert.match(page, /\{selected >= today && !weekly && \(/, 'a weekly closed day is changed in "Closed every week", not by Reopen');
  assert.match(read('components', 'calendar', 'EventForm.tsx'), /const lastDay = stay \? previousDay\(end\) : end;/, 'a stay entered by check-out is stored as its nights');
});

test('venues by the hour: start times within hire hours, free of taken times; times shown everywhere', async () => {
  const bl = loadTs(path.join(root, 'lib', 'booking', 'bookingListing.ts'));
  const format = loadTs(path.join(root, 'lib', 'bookings', 'format.ts'));
  const dates = { open: new Set(), unavailable: new Set(), roomsLeft: new Map(), slots: new Map([['2026-12-05', [[570, 750]]]]) };
  const times = bl.startTimes({ hire_start: '08:00:00', hire_end: '14:00:00' }, dates, '2026-12-05', 2);
  assert.equal(times[0].value, '08:00');
  assert.equal(times[times.length - 1].value, '12:00', 'the last start that ends by closing');
  assert.equal(times[times.length - 1].until, '14:00');
  assert.deepEqual(times.filter((t) => !t.free).map((t) => t.value), ['08:00', '08:30', '09:00', '09:30', '10:00', '10:30', '11:00', '11:30', '12:00'].filter((v) => {
    const at = Number(v.slice(0, 2)) * 60 + Number(v.slice(3)); return at < 750 && 570 < at + 120;
  }));
  assert.equal(bl.startTimes({}, dates, '2026-12-06', 1).length, 47, 'any time of day: 00:00 to 23:00, every half hour');
  assert.equal(bl.startTimes({}, dates, '2026-12-06', 1).at(-1).until, '24:00');
  assert.deepEqual(bl.startTimes({}, dates, null, 2), []);
  const calls = [];
  const parsed = await bl.fetchCalendar({ rpc: async (name, args) => { calls.push(name); return { data: { open: [], booked: [], slots: [{ day: '2026-12-05', from: 570, to: 750 }, { day: '2026-12-05', from: 900, to: 960 }] }, error: null }; } }, 'L1');
  assert.deepEqual(parsed.slots.get('2026-12-05'), [[570, 750], [900, 960]]);
  const kind = { isShortStay: true, isHourly: true, details: { price_unit: 'hour' } };
  const payload = bl.bookingPayload({ id: 'L1', host_id: 'H1' }, kind, 'C1', 6000, { start: '2026-12-05', end: null, hours: 3, startTime: '10:00', leaseStart: '', leaseMonths: 0 });
  assert.equal(payload.start_time, '10:00');
  assert.equal(payload.hours, 3);
  const booking = { start_date: '2026-12-05', hours: 3, start_time: '10:00:00', end_time: '13:00:00' };
  assert.match(format.describeDates(booking), /· 10:00–13:00$/);
  assert.equal(format.describeDates({ ...booking, start_time: null, end_time: null }).endsWith('3 hours'), true, 'older bookings without times');
  const widget = read('components', 'booking', 'BookingWidget.tsx');
  assert.match(widget, /<select id="start-time"/);
  assert.match(widget, /if \(start && startTime && count > 0\) line = priceLine/, 'no price until a start time is chosen');
  const sets = [];
  await cal.setHours({ rpc: async (name, args) => { sets.push([name, args]); return { error: null }; } }, 'V', '08:00', '20:00', 30);
  assert.deepEqual(sets, [['calendar_set_hours', { p_listing: 'V', p_start: '08:00', p_end: '20:00', p_buffer: 30 }]]);
  assert.equal(cal.minutesOf('24:00', 0), 1440);
  const page = read('components', 'calendar', 'HostCalendar.tsx');
  assert.match(page, /preset: \{ title: 'Rooms closed', listingId: l\.id, color: 'purple' \}/, 'hotels close rooms as an offline booking of N rooms');
  assert.match(page, /tone: 'table', label: `\$\{t\.time\} Table/, 'table reservations show on their day');
  for (const select of [read('lib', 'bookings', 'hostBookings.ts'), read('lib', 'bookings', 'clientBookings.ts')]) assert.match(select, /hours,start_time,end_time,/);
});
