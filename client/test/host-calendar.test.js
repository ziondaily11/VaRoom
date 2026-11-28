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
  assert.match(read('components', 'listings', 'HostListingMenu.tsx'), /\{item\('Open calendar', \(\) => \{ void router\.push\(`\/calendar\?listing=/);
  assert.match(read('lib', 'auth', 'clearUserData.ts'), /clearCalendarCache\(\);/, 'cleared on sign-out and account switch');
  assert.match(read('components', 'bookings', 'HostBookingsView.tsx'), /respondToBooking\(booking\.id, decision\);\s+clearCalendarCache\(hostId\);/);
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
  assert.match(read('components', 'calendar', 'DetailsPanel.tsx'), /\{!row\.weekly && \(/, 'a weekly closed day is changed in "Closed every week", not by Reopen');
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
  assert.match(read('lib', 'calendar', 'calendarView.ts'), /items\.push\(\{ key: `t\$\{t\.id\}`, kind: 'table'/, 'table reservations show on their day');
  for (const select of [read('lib', 'bookings', 'hostBookings.ts'), read('lib', 'bookings', 'clientBookings.ts')]) assert.match(select, /hours,start_time,end_time,/);
});

test('sync: the calendar link lists closed and full days, and taken hours, as "Not available" only', async () => {
  const ex = loadTs(path.join(root, 'lib', 'calendar', 'icalExport.ts'));
  const now = new Date('2026-11-28T22:30:00Z'); // already 29 Nov in Nairobi
  assert.equal(ex.nairobiToday(now), '2026-11-29');
  const open = ['2026-11-29', '2026-11-30', '2026-12-03', '2026-12-04', '2026-12-05'];
  const source = { title: 'Palm View', ahead: 6, calendar: { open, booked: [{ night: '2026-12-04', left: 0 }, { night: '2026-12-05', left: 1 }], slots: [{ day: '2026-11-30', from: 600, to: 780 }, { day: '2026-12-01', from: 0, to: 60 }] } };
  assert.deepEqual(ex.unavailableDays(source, '2026-11-29'), ['2026-12-01', '2026-12-02', '2026-12-04']);
  assert.deepEqual(ex.dayRanges(['2026-12-01', '2026-12-02', '2026-12-04']), [['2026-12-01', '2026-12-03'], ['2026-12-04', '2026-12-05']]);
  const ics = ex.buildIcs(source, now);
  assert.match(ics, /^BEGIN:VCALENDAR\r\n/);
  assert.match(ics, /DTSTART;VALUE=DATE:20261201\r\nDTEND;VALUE=DATE:20261203\r\n/);
  assert.match(ics, /DTSTART:20261130T070000Z\r\nDTEND:20261130T100000Z\r\n/, '10:00–13:00 in Nairobi, in UTC');
  assert.doesNotMatch(ics, /DTSTART:20261130T210000Z/, 'no hours on a day that is blocked anyway');
  assert.equal((ics.match(/BEGIN:VEVENT/g) || []).length, 3);
  assert.ok(ics.split('\r\n').every((line) => Buffer.byteLength(line) <= 75), 'lines folded');
  const long = ex.buildIcs({ ...source, title: 'Ñ'.repeat(60) }, now);
  assert.ok(long.split('\r\n').every((line) => Buffer.byteLength(line) <= 75));
  assert.ok(ex.buildIcs({ ...source, title: 'A, B; C' }, now).includes(String.raw`X-WR-CALNAME:VaRoom · A\, B\; C`), 'commas and semicolons escaped');
});

test('sync: the link route answers only a 64-character secret, with dates only and a 5-minute edge cache', async () => {
  const handler = loadTs(path.join(root, 'pages', 'api', 'calendar', '[token].ts')).default;
  const call = async (token, method = 'GET', rpc = { title: 'Palm View', ahead: 2, calendar: { open: [], booked: [] } }) => {
    const sent = { headers: {} };
    const res = { setHeader: (k, v) => { sent.headers[k] = v; }, status: (code) => { sent.status = code; return res; }, end: () => res, send: (body) => { sent.body = body; return res; } };
    const realFetch = global.fetch;
    global.fetch = async (url, init) => { sent.rpc = [url, JSON.parse(init.body)]; return { ok: true, json: async () => rpc }; };
    try { await handler({ method, query: { token } }, res); } finally { global.fetch = realFetch; }
    return sent;
  };
  assert.equal((await call('abc.ics')).status, 404);
  assert.equal((await call('a'.repeat(64) + '.ics', 'POST')).status, 405);
  const ok = await call('a'.repeat(64) + '.ics');
  assert.equal(ok.status, 200);
  assert.match(ok.rpc[0], /\/rest\/v1\/rpc\/listing_ical$/);
  assert.deepEqual(ok.rpc[1], { p_token: 'a'.repeat(64) });
  assert.equal(ok.headers['Content-Type'], 'text/calendar; charset=utf-8');
  assert.match(ok.headers['Cache-Control'], /s-maxage=300/);
  assert.match(ok.body, /SUMMARY:Not available \(VaRoom\)/);
  assert.equal((await call('b'.repeat(64), 'GET', null)).status, 404, 'unknown or reset link');
});

test('sync: links are checked before adding; "Sync now" goes to the server; imported days are read-only', async () => {
  assert.equal(cal.feedProblem('', 'https://a.com/x.ics', []), 'Name the site, e.g. Airbnb.com.');
  assert.match(cal.feedProblem('Airbnb.com', 'http://a.com/x.ics', []), /https calendar link/);
  assert.equal(cal.feedProblem('Airbnb.com', 'https://a.com/x.ics', [{ url: 'https://a.com/x.ics' }]), 'That link is already added.');
  assert.equal(cal.feedProblem('Airbnb.com', 'https://a.com/y.ics', [1, 2, 3, 4, 5].map((n) => ({ url: `https://a.com/${n}` }))), 'A listing can have up to 5 links.');
  assert.equal(cal.feedProblem('Airbnb.com', 'https://www.airbnb.com/calendar/ical/123.ics?s=abc', []), null);
  assert.equal(cal.exportUrl('https://varoom.co.ke', 'f'.repeat(64)), `https://varoom.co.ke/api/calendar/${'f'.repeat(64)}.ics`);
  const calls = [];
  await cal.syncNow('feed-1', async (p, o) => { calls.push([p, o]); return { ok: true, count: 2, clashes: [] }; });
  assert.deepEqual(calls, [['/api/calendar/feeds/feed-1/sync', { method: 'POST' }]]);
  const page = read('components', 'calendar', 'HostCalendar.tsx');
  assert.match(read('components', 'calendar', 'DetailsPanel.tsx'), /\{e\.source === 'ical'\s+\? <p className="vc-muted">Change it on that site/, 'no Edit for imported days');
  assert.match(read('components', 'calendar', 'MonthView.tsx'), /\{state\?\.clash && day >= today && <span className="is-clash">Double booked<\/span>\}/);
});

test('the planner: property, office and shop hosts see viewings, move-ins, lease ends and outcomes', () => {
  const data = {
    listings: [], bookings: [], closed: [], tables: [],
    events: [{ viewing: true, listing_id: 'P', start_date: '2026-12-03' }, { viewing: false, listing_id: 'P', start_date: '2026-12-04' }, { viewing: true, listing_id: 'X', start_date: '2026-12-05' }],
    leases: [
      { listing_id: 'P', status: 'approved', start: '2026-12-10', end: '2027-12-10' },
      { listing_id: 'P', status: 'approved', start: '2025-12-20', end: '2026-12-20' },
      { listing_id: 'P', status: 'pending', start: '2026-12-15', end: '2027-06-15' },
    ],
    outcomes: [],
  };
  assert.deepEqual({ ...cal.plannerSummary(data, new Set(['P']), '2026-12-01', '2026-12-31') }, { viewings: 1, moveIns: 1, leaseEnds: 1, requests: 1 });
  const page = read('components', 'calendar', 'HostCalendar.tsx');
  assert.match(page, /const stays = useMemo\(\(\) => shown\.filter\(\(l\) => !l\.planner\), \[shown\]\);/);
  assert.match(page, /const notices: Notice\[\] = stays\.flatMap/, 'no "closed" or "sold" nags for planner listings');
  assert.match(read('components', 'calendar', 'CalendarSidebar.tsx'), /\{!listing\.planner && \(\s+<button type="button" className="vc-gear"/, 'place settings (prices, availability, sync) are for stays only');
  assert.match(read('components', 'calendar', 'DetailsPanel.tsx'), /<Link href="\/bookings">\{l\.status === 'pending' \? 'Answer in Bookings' : 'Open in Bookings'\}<\/Link>/, 'lease requests are answered in Bookings (with its Mark as rented prompt)');
  const form = read('components', 'calendar', 'EventForm.tsx');
  assert.match(form, /const choices = blocks \? stayListings : listings;/, 'offline bookings only on stays');
  assert.match(form, /\{!plannerOnly && \(/, 'planner hosts get Viewing and Note only');
  assert.match(form, /client_name: blocks \|\| viewing \? text\(clientName\) : null/);
});

test('reminders and double bookings open the Calendar; the setting covers them', () => {
  const notes = loadTs(path.join(root, 'lib', 'notificationsCache.ts'), { mocks: {} });
  assert.equal(notes.notificationTarget({ type: 'calendar_reminder', related_entity_type: 'listing', related_entity_id: 'L1' }, 'host'), '/calendar?listing=L1');
  assert.equal(notes.notificationTarget({ type: 'calendar_reminder', related_entity_type: null, related_entity_id: null }, 'host'), '/calendar');
  assert.equal(notes.notificationTarget({ type: 'booking_clash', related_entity_type: 'listing', related_entity_id: 'L2' }, 'host'), '/calendar?listing=L2');
  assert.equal(notes.detailsFor('calendar_reminder').tag, 'Calendar');
  assert.equal(notes.detailsFor('booking_clash').title, 'Possible double booking');
  assert.match(read('lib', 'settings', 'settings.ts'), /label: 'Reminders', desc: 'The evening before check-ins, move-ins, viewings and events; 60 days before a lease ends; 6 hours before an unanswered request expires\.'/);
});

test('prices by date and cleaning days on the booking page: as the database works them out', async () => {
  const bl = loadTs(path.join(root, 'lib', 'booking', 'bookingListing.ts'));
  const dates = { open: new Set(['2026-12-04', '2026-12-05', '2026-12-06', '2026-12-07', '2026-12-08']), unavailable: new Set(['2026-12-09']), roomsLeft: new Map(), slots: new Map(), prices: new Map([['2026-12-04', 6500], ['2026-12-05', 6500]]) };
  const details = { price_amount: 5000 };
  // Thu 3 Dec → Mon 7 Dec: 5000 + 6500 + 6500 + 5000 + cleaning 1000.
  const stay = bl.stayLine(details, { ...dates, open: new Set([...dates.open, '2026-12-03']) }, '2026-12-03', '2026-12-07', false, 'night', 1000);
  assert.deepEqual({ ...stay }, { quantity: 4, label: '4 nights · prices vary by date', base: 23000, fee: 1000, total: 24000 });
  assert.equal(bl.stayLine(details, dates, '2026-12-06', '2026-12-08', false, 'night', null).label, '2 nights', 'no special price: no note');
  assert.equal(bl.stayLine(details, dates, '2026-12-05', '2026-12-06', true, 'day', null).base, 11500, 'by the day: both ends');
  assert.equal(bl.dayPrice(details, dates, '2026-12-05'), 6500);
  assert.equal(bl.dayPrice(details, null, '2026-12-05'), 5000);
  // A stay whose cleaning day would fall on someone else's night is refused.
  assert.equal(bl.turnoverFree(dates, '2026-12-08', 1), true);
  assert.equal(bl.turnoverFree(dates, '2026-12-08', 2), false);
  assert.deepEqual({ ...bl.pickStayDay(dates, '2026-12-06', null, '2026-12-09', false, 1) }, { start: '2026-12-09', end: null, blocked: true }, 'check-out 9th needs the 9th free for cleaning');
  assert.deepEqual({ ...bl.pickStayDay(dates, '2026-12-06', null, '2026-12-08', false, 1) }, { start: '2026-12-06', end: '2026-12-08', blocked: false });
  const parsed = await bl.fetchCalendar({ rpc: async () => ({ data: { open: [], booked: [], prices: [{ day: '2026-12-25', price: '9000' }] }, error: null }) }, 'L1');
  assert.deepEqual([...parsed.prices], [['2026-12-25', 9000]]);
  const widget = read('components', 'booking', 'BookingWidget.tsx');
  assert.match(widget, /const turnover = isHotel \? 0 : Math\.max\(0, Number\(details\.turnover_days\) \|\| 0\);/);
  assert.match(widget, /pickStayDay\(dates, start, end, day, isDaily, turnover\)/);
});

test('prices on the host calendar: special dates beat the weekend, which beats the normal price', async () => {
  const listing = { id: 'A', price: 5000, weekend_price: 6500, price_unit: 'night' };
  const prices = [{ listing_id: 'A', start_date: '2026-12-24', end_date: '2026-12-26', price: '9000', label: 'Christmas' }];
  assert.deepEqual({ ...cal.priceOn(listing, prices, '2026-12-25') }, { price: 9000, label: 'Christmas', special: true });
  assert.deepEqual({ ...cal.priceOn(listing, prices, '2026-12-04') }, { price: 6500, label: 'Weekend', special: true }, 'a Friday night');
  assert.deepEqual({ ...cal.priceOn(listing, prices, '2026-12-06') }, { price: 5000, label: null, special: false }, 'a Sunday night');
  assert.equal(cal.priceOn({ ...listing, price_unit: 'day' }, [], '2026-12-06').label, 'Weekend', 'venues by the day: Sunday is weekend');
  assert.equal(cal.parsePrice('6,500'), 6500);
  assert.equal(cal.parsePrice('abc'), null);
  assert.equal(cal.parsePrice('0'), null);
  const calls = [];
  const client = { rpc: async (name, args) => { calls.push([name, args]); return { error: null }; } };
  await cal.setWeekendPrice(client, 'A', 6500);
  await cal.setDatePrice(client, 'A', '2026-12-24', '2026-12-26', 9000, 'Christmas');
  await cal.setTurnover(client, 'A', 1);
  assert.deepEqual(calls, [
    ['calendar_set_weekend_price', { p_listing: 'A', p_price: 6500 }],
    ['calendar_set_price', { p_listing: 'A', p_from: '2026-12-24', p_to: '2026-12-26', p_price: 9000, p_label: 'Christmas' }],
    ['calendar_set_turnover', { p_listing: 'A', p_days: 1 }],
  ]);
  assert.match(read('components', 'calendar', 'MonthView.tsx'), /\{state\?\.cleaning && day >= today && <span>Cleaning<\/span>\}/);
});

test('Place settings → Rules: a place takes only its own rules; saving clears the others and checks the stay lengths', async () => {
  assert.deepEqual({ ...cal.ruleFields({ category: 'airbnb', price_unit: 'night' }) }, { instant: true, nights: true, times: true });
  assert.deepEqual({ ...cal.ruleFields({ category: 'venue', price_unit: 'day' }) }, { instant: true, nights: false, times: false });
  assert.deepEqual({ ...cal.ruleFields({ category: 'venue', price_unit: 'hour' }) }, { instant: false, nights: false, times: false });
  const writes = [];
  const fake = (row, updated = [{ listing_id: 'L' }]) => ({ from: (table) => {
    const chain = { select: () => chain, eq: () => chain, maybeSingle: async () => ({ data: row, error: null }),
      update: (value) => { writes.push([table, value]); return { eq: () => ({ select: async () => ({ data: updated, error: null }) }) }; } };
    return chain;
  } });
  const loaded = await cal.loadPlaceRules(fake({ instant_book: true, min_notice_days: 2, max_advance_days: 365, min_stay_nights: 2, max_stay_nights: null, checkin_time: '14:00:00', checkout_time: '10:00' }), 'L');
  assert.deepEqual({ ...loaded }, { instant_book: true, min_notice_days: 2, max_advance_days: 365, min_stay_nights: 2, max_stay_nights: null, checkin_time: '14:00', checkout_time: '10:00' }, 'a time column reads as HH:MM');
  const hall = { id: 'L', category: 'venue', price_unit: 'hour' };
  await cal.savePlaceRules(fake(null), hall, { ...loaded });
  assert.deepEqual(writes.at(-1), ['listing_booking_details', { instant_book: false, min_notice_days: 2, max_advance_days: 365, min_stay_nights: null, max_stay_nights: null, checkin_time: null, checkout_time: null }]);
  await assert.rejects(cal.savePlaceRules(fake(null), { id: 'L', category: 'airbnb', price_unit: 'night' }, { ...loaded, min_stay_nights: 5, max_stay_nights: 3 }), /calendar: The maximum stay must be at least the minimum stay\./);
  await assert.rejects(cal.savePlaceRules(fake(null, []), hall, loaded), /no booking details yet/);
});

test('hotel dining: the tables reserved at a time, and the status changed through the server', async () => {
  const t = (id, time, tables, listing = 'D') => ({ id, listing_id: listing, date: '2026-12-03', time, table_count: tables });
  const all = [t('a', '19:30', 2), t('b', '19:30', 4), t('c', '20:00', 3), t('d', '19:30', 5, 'E')];
  assert.equal(cal.tablesAt(all, all[0]), 6, '6 of the restaurant\'s tables at 19:30');
  const calls = [];
  await cal.setTableStatus('h1', 'r1', 'contacted', async (pathName, options) => { calls.push([pathName, options]); return { reservation: { id: 'r1', status: 'contacted' } }; });
  assert.deepEqual(calls, [['/api/host/table-reservations/r1', { method: 'PATCH', body: { status: 'contacted' }, headers: { 'X-VaRoom-Host': 'h1' } }]]);
  const panel = read('components', 'calendar', 'DetailsPanel.tsx');
  assert.match(panel, /\$\{slot\.reserved\} of \$\{slot\.total\} tables reserved/);
  assert.match(panel, /const TABLE_STATUSES: Array<\[TableBooking\['status'\], string\]> = \[\['requested', 'New'\], \['contacted', 'Contacted'\], \['closed', 'Closed'\]\];/);
  assert.match(read('components', 'calendar', 'PlaceSettings.tsx'), /\{tab === 'rules' && <BookingRules client=\{client\} listing=\{listing\}/);
});
