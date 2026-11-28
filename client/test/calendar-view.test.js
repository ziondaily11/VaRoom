const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { loadTs } = require('./helpers/loadTs');

const root = path.join(__dirname, '..');
const view = loadTs(path.join(root, 'lib', 'calendar', 'calendarView.ts'));

const palm = { id: 'A', title: 'Palm View', price_unit: 'night' };
const hall = { id: 'V', title: 'Hall', price_unit: 'day' };
const data = {
  listings: [palm, hall], closed: [], prices: [],
  bookings: [
    { id: 'b1', listing_id: 'A', status: 'approved', start_date: '2026-12-01', end_date: '2026-12-04', guest: 'Wanjiku' },
    { id: 'b2', listing_id: 'A', status: 'pending', start_date: '2026-12-04', end_date: '2026-12-06', guest: 'Otieno' },
    { id: 'b3', listing_id: 'V', status: 'approved', start_date: '2026-12-05', end_date: '2026-12-05', guest: 'Achieng' },
  ],
  events: [
    { id: 'e1', listing_id: 'A', start_date: '2026-12-10', end_date: '2026-12-10', title: 'Deep clean', blocks: false, viewing: false, source: 'host', color: 'purple' },
    { id: 'e2', listing_id: 'A', start_date: '2026-12-12', end_date: '2026-12-13', title: 'Airbnb.com · Reserved', blocks: true, viewing: false, source: 'ical', color: 'orange' },
    { id: 'e3', listing_id: null, start_date: '2026-12-02', end_date: '2026-12-02', title: 'Pay KPLC', blocks: false, viewing: false, source: 'host', color: null },
  ],
  leases: [], outcomes: [],
  tables: [{ id: 't1', listing_id: 'dining', date: '2026-12-03', time: '19:30', client_name: 'Kamau', guest_count: 4 }],
};

test('every entry becomes one kind of item: stays with half-day ends, filters and places applied', () => {
  const items = view.buildItems(data, [palm, hall], true, view.ALL_SHOWN);
  const brief = items.map((i) => [i.key, i.kind, i.start, i.end, i.halfStart, i.halfEnd]);
  assert.deepEqual(brief, [
    ['bb1', 'booking', '2026-12-01', '2026-12-04', true, true],
    ['ee3:2026-12-02', 'note', '2026-12-02', '2026-12-02', false, false],
    ['tt1', 'table', '2026-12-03', '2026-12-03', false, false],
    ['bb2', 'request', '2026-12-04', '2026-12-06', true, true],
    ['bb3', 'booking', '2026-12-05', '2026-12-05', false, false],
    ['ee1:2026-12-10', 'note', '2026-12-10', '2026-12-10', false, false],
    ['ee2:2026-12-12', 'other', '2026-12-12', '2026-12-13', false, false],
  ], 'a nightly stay runs check-in to check-out with half-day ends; a day hire and events cover whole days');
  assert.equal(items.find((i) => i.kind === 'other').color, null, 'other sites take the place colour, not the event colour');
  const onlyPalm = view.buildItems(data, [palm], false, view.ALL_SHOWN);
  assert.ok(!onlyPalm.some((i) => i.kind === 'table'), 'a restaurant\'s tables show only when every place is shown');
  assert.ok(!onlyPalm.some((i) => i.listingId === 'V'));
  assert.ok(onlyPalm.some((i) => i.title === 'Pay KPLC'), 'events not tied to a place always show');
  const noNotes = view.buildItems(data, [palm, hall], true, new Set(['bookings', 'requests', 'offline', 'other', 'viewings', 'closed']));
  assert.ok(!noNotes.some((i) => i.kind === 'note'));
  assert.deepEqual(view.itemsOn(items, '2026-12-04').map((i) => i.kind), ['booking', 'request'], 'a changeover day shows both stays');
  assert.deepEqual(view.upcoming(items, '2026-12-05', 2).map((i) => i.kind), ['booking', 'note']);
});

test('the month: weeks of 7, stay bars in lanes, half-day ends, cut at week edges', () => {
  const days = Array.from({ length: 31 }, (_, i) => `2026-12-${String(i + 1).padStart(2, '0')}`);
  const weeks = view.monthWeeks(days, 2); // 1 Dec 2026 is a Tuesday
  assert.equal(weeks.length, 5);
  assert.deepEqual(weeks[0].slice(0, 3), [null, null, '2026-12-01']);
  assert.equal(weeks[4].filter(Boolean).length, 5, '27 to 31 December');
  const items = view.buildItems(data, [palm, hall], true, view.ALL_SHOWN);
  const { segments } = view.layoutWeek(weeks[0], items, 3);
  const stay = segments.find((s) => s.item.key === 'bb1');
  const next = segments.find((s) => s.item.key === 'bb2');
  assert.deepEqual([stay.from, stay.to, stay.halfStart, stay.halfEnd], [2, 5, true, true]);
  assert.equal(next.lane, stay.lane, 'the next guest checking in on the check-out day shares the lane');
  assert.equal(next.cutRight, true, 'carries on into next week');
  const second = view.layoutWeek(weeks[1], items, 3).segments.find((s) => s.item.key === 'bb2');
  assert.deepEqual([second.from, second.cutLeft, second.halfStart, second.halfEnd], [0, true, false, true]);
  const crowded = view.layoutWeek(weeks[1], Array.from({ length: 5 }, (_, i) => ({ ...items[0], key: `x${i}`, start: '2026-12-08', end: '2026-12-08', halfStart: false, halfEnd: false })), 3);
  assert.equal(crowded.segments.length, 3);
  assert.equal(crowded.hidden[2], 2, '+2 on that day');
  assert.deepEqual({ ...view.barBox({ from: 2, to: 5, halfStart: true, halfEnd: true }) }, { left: `${(2.5 / 7) * 100}%`, width: `${(3 / 7) * 100}%` });
  assert.equal(view.placeColor(0), view.PLACE_COLORS[0]);
  assert.equal(view.placeColor(view.PLACE_COLORS.length), view.PLACE_COLORS[0], 'colours repeat in order');
});

test('the chosen view is remembered per host on this device', () => {
  const store = new Map();
  global.window = { localStorage: { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) } };
  try {
    assert.equal(view.savedMode('h1'), null, 'nothing chosen yet: the default decides');
    view.saveMode('h1', 'week');
    assert.equal(view.savedMode('h1'), 'week');
    assert.equal(view.savedMode('h2'), null);
    store.set('varoom:calendar:view:v1:h3', 'nonsense');
    assert.equal(view.savedMode('h3'), null);
  } finally {
    delete global.window;
  }
});

test('week and day: Sunday weeks across months, the grid hours, side by side when overlapping', () => {
  assert.deepEqual(view.weekDays('2026-12-02'), ['2026-11-29', '2026-11-30', '2026-12-01', '2026-12-02', '2026-12-03', '2026-12-04', '2026-12-05']);
  assert.deepEqual({ ...view.visibleRange('week', '2026-12-02') }, { from: '2026-11-29', to: '2026-12-05' });
  assert.deepEqual({ ...view.visibleRange('month', '2026-02-14') }, { from: '2026-02-01', to: '2026-02-28' });
  assert.deepEqual({ ...view.visibleRange('day', '2026-12-02') }, { from: '2026-12-02', to: '2026-12-02' });
  assert.deepEqual(view.monthsOf('2026-11-29', '2026-12-05').map((m) => ({ ...m })), [{ year: 2026, month: 10 }, { year: 2026, month: 11 }]);
  assert.deepEqual(view.monthsOf('2026-12-27', '2027-01-02').map((m) => ({ ...m })), [{ year: 2026, month: 11 }, { year: 2027, month: 0 }]);
  assert.deepEqual({ ...view.timeSpan({ time: '10:00–13:30' }) }, { from: 600, to: 810 });
  assert.deepEqual({ ...view.timeSpan({ time: '19:30' }) }, { from: 1170, to: 1230 }, 'a table reservation takes an hour');
  assert.equal(view.timeSpan({ time: null }), null);
  const at = (key, time) => ({ key, time, start: '2026-12-02', end: '2026-12-02' });
  const placed = view.layoutTimes([at('a', '10:00–12:00'), at('b', '11:00–13:00'), at('c', '12:00–13:00'), at('d', '15:00–16:00')]);
  const by = Object.fromEntries(placed.map((p) => [p.item.key, [p.col, p.cols]]));
  assert.deepEqual(by, { a: [0, 2], b: [1, 2], c: [0, 2], d: [0, 1] }, 'overlaps share the width; a later free slot is reused');
  assert.deepEqual({ ...view.gridHours([at('x', '05:30–06:00')]) }, { start: 5, end: 24 });
  assert.deepEqual({ ...view.gridHours([]) }, { start: 6, end: 24 });
  const { timed, allDay } = view.splitTimed([at('t', '10:00–11:00'), { key: 's', time: null, start: '2026-12-01', end: '2026-12-03' }]);
  assert.deepEqual([timed.map((i) => i.key), allDay.map((i) => i.key)], [['t'], ['s']]);
});

test('a week across two months is merged once; the first view suits the host', () => {
  const nov = { listings: [palm], bookings: [{ id: 'b1' }, { id: 'b2' }], closed: [], events: [{ id: 'e1', start_date: '2026-11-30' }], tables: [], leases: [], outcomes: [], prices: [] };
  const dec = { listings: [palm], bookings: [{ id: 'b2' }, { id: 'b3' }], closed: [], events: [{ id: 'e1', start_date: '2026-11-30' }, { id: 'e1', start_date: '2026-12-07' }], tables: [], leases: [], outcomes: [], prices: [] };
  const merged = view.mergeData([nov, dec]);
  assert.deepEqual(merged.bookings.map((b) => b.id), ['b1', 'b2', 'b3']);
  assert.equal(merged.events.length, 2, 'a weekly event\'s two dates both stay');
  assert.equal(view.mergeData([nov]), nov);
  assert.equal(view.defaultMode([palm], false), 'month');
  assert.equal(view.defaultMode([{ ...palm, category: 'venue' }], false), 'week');
  assert.equal(view.defaultMode([{ id: 'P', planner: true }], false), 'day');
  assert.equal(view.defaultMode([palm], true), 'day', 'phones start on Day');
});

test('the page offers Day, Week and Month; ‹ › step by the view; the grid marks now', () => {
  const fs = require('node:fs');
  const page = fs.readFileSync(path.join(root, 'components', 'calendar', 'HostCalendar.tsx'), 'utf8');
  assert.match(page, /const modes: CalendarMode\[\] = stays\.length > 1 \? \['day', 'week', 'month', 'timeline'\] : \['day', 'week', 'month'\];/);
  assert.match(page, /\(chosenMode === 'day' \? 1 : 7\) \* 86400000/, 'a day or a week at a time');
  assert.match(page, /const chosenMode: CalendarMode = mode \?\? defaultMode\(listingsSeen, phone\);/);
  assert.match(page, /Promise\.all\(months\.map\(\(m\) => loadMonth\(client, hostId, m\.year, m\.month, force\)\)\)\.then\(mergeData\)/, 'a week across two months loads both');
  const grid = fs.readFileSync(path.join(root, 'components', 'calendar', 'TimeGrid.tsx'), 'utf8');
  assert.match(grid, /<div className="vc-now" style=\{\{ top: top\(now\) \}\}/);
  assert.match(grid, /window\.setInterval\(\(\) => setNow\(read\(\)\), 60000\)/, 'the line moves each minute, and the timer is cleared');
  assert.match(grid, /return \(\) => window\.clearInterval\(timer\);/);
});

test('search: guests, titles, places, clients and notes; coming first; a weekly note once', () => {
  const items = view.buildItems(data, [palm, hall], true, view.ALL_SHOWN);
  const titleOf = (id) => ({ A: 'Palm View', V: 'Hall' })[id];
  const keys = (q, today = '2026-12-03') => view.searchItems(items, titleOf, q, today).map((i) => i.key);
  assert.deepEqual(keys('wanj'), ['bb1']);
  assert.deepEqual(keys('hall'), ['bb3'], 'by place');
  assert.deepEqual(keys('kamau'), ['tt1'], 'a table by its client');
  assert.deepEqual(keys('palm'), ['bb1', 'bb2', 'ee1:2026-12-10', 'ee2:2026-12-12'], 'coming ones, soonest first');
  assert.deepEqual(keys('palm', '2026-12-11'), ['ee2:2026-12-12', 'ee1:2026-12-10', 'bb2', 'bb1'], 'then past ones, latest first');
  assert.deepEqual(keys('palm view deep'), ['ee1:2026-12-10'], 'every word must match');
  assert.deepEqual(keys('w'), [], 'two letters at least');
  const weekly = [{ ...items[0], key: 'ex:2026-12-08', kind: 'note', title: 'Gym', start: '2026-12-08', end: '2026-12-08', source: { type: 'event', value: { notes: null, client_name: null } } },
    { ...items[0], key: 'ex:2026-12-15', kind: 'note', title: 'Gym', start: '2026-12-15', end: '2026-12-15', source: { type: 'event', value: { notes: null, client_name: null } } }];
  assert.deepEqual(view.searchItems(weekly, titleOf, 'gym', '2026-12-03').map((i) => i.key), ['ex:2026-12-08']);
});

test('timeline bars use the month\'s width; part 3 wiring (search, strip, dots, thin scrollbars)', () => {
  const fs = require('node:fs');
  assert.deepEqual({ ...view.barBox({ from: 0, to: 1, halfStart: true, halfEnd: true }, 31) }, { left: `${(0.5 / 31) * 100}%`, width: `${(1 / 31) * 100}%` });
  const days = Array.from({ length: 31 }, (_, i) => `2026-12-${String(i + 1).padStart(2, '0')}`);
  const { hidden } = view.layoutWeek(days, [], 2);
  assert.equal(hidden.length, 31);
  const read = (...p) => fs.readFileSync(path.join(root, ...p), 'utf8');
  const page = read('components', 'calendar', 'HostCalendar.tsx');
  assert.match(page, /const opened = query\.trim\(\)\.length >= 2 \? cachedMonths\(hostId\) : \[\];/, 'search makes no new requests');
  assert.match(page, /chosenMode === 'day' \? 'week' : chosenMode/, 'Day loads its week, for the strip');
  assert.match(read('components', 'calendar', 'MonthView.tsx'), /<span className="vc-cell-dots" aria-hidden="true">/);
  const css = read('components', 'calendar', 'calendarStyles.ts');
  assert.match(css, /\.vc,\.vc \*\{scrollbar-width:thin;scrollbar-color:transparent transparent\}/);
  assert.match(css, /\.vc \.vc-month-grid \.vc-bar\{display:none\}/, 'phones: dots, not bars');
  assert.match(css, /\.vc \.vc-drawer\{width:100%;height:auto;max-height:88vh;border-radius:22px 22px 0 0/, 'phones: settings as a sheet');
});

test('every plan lists the calendar; tablet week, phone + button and motion are wired', () => {
  const fs = require('node:fs');
  const pricing = loadTs(path.join(root, 'lib', 'billing', 'pricing.ts'));
  const cards = [...pricing.DEFAULT_PLAN_CARDS, ...pricing.LISTING_TIER_CARDS, ...Object.values(pricing.NICHE_PLAN_CARDS).flat()];
  assert.ok(cards.length >= 15);
  assert.ok(cards.every((card) => card.features.includes(pricing.CALENDAR_FEATURE)), 'every plan includes the calendar');
  const read = (...p) => fs.readFileSync(path.join(root, ...p), 'utf8').replace(/\r\n/g, '\n');
  const css = read('components', 'calendar', 'calendarStyles.ts');
  assert.match(css, /@media \(min-width:761px\) and \(max-width:1023px\)\{\n  \.vc \.vc-tg:not\(\.is-day\)\{overflow-x:auto\}/, 'tablets: Week scrolls sideways');
  assert.match(css, /\.vc \.vc-add\{display:none\}/, 'phones: the header add is replaced by the + button');
  assert.match(css, /\.vc \.vc-drawer-backdrop\.is-closing \.vc-drawer\{animation:vc-drawer-out var\(--motion-quick\) var\(--ease-in\) both\}/, 'drawers have an exit');
  assert.match(css, /@media \(prefers-reduced-motion:reduce\)\{\n  \.vc \.vc-side/, 'reduced motion handled');
  assert.doesNotMatch(css, /transition:all/);
  const page = read('components', 'calendar', 'HostCalendar.tsx');
  assert.match(page, /const shownForm = usePresentValue\(form, 220\);/);
  assert.match(page, /if \(!by \|\| !viewRef\.current\?\.animate \|\| prefersReducedMotion\(\)\) return;/, 'the slide skips reduced motion');
  assert.match(page, /className="vc-fab vc-only-phone" aria-label="Add to calendar"/);
  assert.match(read('components', 'calendar', 'CalendarHeader.tsx'), /<button key=\{m\} type="button" role="tab" aria-selected=\{mode === m\}/);
});

test('the right column can be hidden (remembered); an empty hour opens the add card there, beside the click', () => {
  const fs = require('node:fs');
  const store = new Map();
  global.window = { localStorage: { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v), removeItem: (k) => store.delete(k) } };
  try {
    assert.equal(view.savedWide(), false);
    view.saveWide(true);
    assert.equal(view.savedWide(), true);
    view.saveWide(false);
    assert.equal(view.savedWide(), false);
  } finally { delete global.window; }
  const read = (...p) => fs.readFileSync(path.join(root, ...p), 'utf8').replace(/\r\n/g, '\n');
  const page = read('components', 'calendar', 'HostCalendar.tsx');
  assert.match(page, /const toggleWide = \(\) => \{ setWide\(!wide\); saveWide\(!wide\); setPanelOpen\(false\); \};/);
  assert.match(page, /onAddAt: data && !range \? \(day: string, time: string, anchor: \{ x: number; y: number \} \| null\) => setForm\(\{ event: null, day, time, anchor \}\) : undefined,/);
  const grid = read('components', 'calendar', 'TimeGrid.tsx');
  assert.match(grid, /hours\.start \* 60 \+ Math\.floor\(y \/ \(HOUR_PX \/ 2\)\) \* 30/, 'the half hour under the pointer');
  assert.match(grid, /if \(!e\.detail\) \{ onAddAt\(day, '09:00', null\); return; \}/, 'from the keyboard: 09:00, centred');
  const form = read('components', 'calendar', 'EventForm.tsx');
  assert.match(form, /const \[startTime, setStartTime\] = useState\(event\?\.start_time \|\| time \|\| '09:00'\);/);
  assert.match(form, /if \(!anchor \|\| !card\.current \|\| window\.innerWidth <= 760\) return;/, 'phones keep the bottom sheet');
  const css = read('components', 'calendar', 'calendarStyles.ts');
  assert.match(css, /\.vc \.vc-shell\.is-wide\{grid-template-columns:264px minmax\(0,1fr\)\}/);
  assert.match(css, /\.vc \.vc-shell\.is-wide \.vc-details\.is-open\{transform:none;transition:transform var\(--motion-standard\) var\(--ease-out\)\}/);
});

test('venue events: the guest picks a type; the calendar shows the event and the booker, a day hire over its hours', () => {
  const fs = require('node:fs');
  const types = loadTs(path.join(root, 'lib', 'booking', 'eventTypes.ts'));
  const sql = fs.readFileSync(path.join(root, '..', 'server', 'migrations', '20261129_000097_booking_event_types.sql'), 'utf8');
  types.EVENT_TYPES.forEach((t) => assert.ok(sql.includes(`'${t.value}'`), `${t.value} is allowed by the database`));
  assert.equal(types.eventLabel('traditional'), 'Traditional ceremony');
  assert.equal(types.eventLabel('other'), 'Event');
  assert.equal(types.eventLabel('rave'), null);

  const hall = { id: 'V', title: 'Garden Hall', category: 'venue', price_unit: 'day', hire_start: '09:00', hire_end: '23:00' };
  const venueData = { ...data, listings: [hall], tables: [], events: [{ id: 'e9', listing_id: 'V', start_date: '2026-12-12', end_date: '2026-12-12', title: 'Phone booking', blocks: true, viewing: false, source: 'host', color: null }],
    bookings: [{ id: 'w1', listing_id: 'V', status: 'pending', start_date: '2026-12-05', end_date: '2026-12-05', guest: 'Divine Venues', event_type: 'wedding', event_notes: 'DJ till 10pm' },
      { id: 'w2', listing_id: 'V', status: 'approved', start_date: '2026-12-06', end_date: '2026-12-07', guest: 'Kamau', event_type: null }] };
  const items = view.buildItems(venueData, [hall], true, view.ALL_SHOWN);
  const by = Object.fromEntries(items.map((i) => [i.key, i]));
  assert.equal(by.bw1.title, 'Wedding · Divine Venues');
  assert.equal(by.bw2.title, 'Kamau');
  assert.equal(by.bw1.block, '09:00–23:00', 'a one-day hire fills the hire hours');
  assert.equal(by.bw2.block, null, 'two days stay a bar');
  assert.equal(by['ee9:2026-12-12'].block, '09:00–23:00', 'an offline day booking too');
  assert.deepEqual({ ...view.timeSpan(by.bw1) }, { from: 540, to: 1380 });
  assert.deepEqual(view.splitTimed(items).timed.map((i) => i.key).sort(), ['bw1', 'ee9:2026-12-12']);
  assert.equal(view.buildItems(venueData, [{ ...hall, hire_start: null, hire_end: null }], true, view.ALL_SHOWN)[0].block, '08:00–22:00');
  assert.deepEqual(view.searchItems(items, () => 'Garden Hall', 'dj', '2026-12-01').map((i) => i.key), ['bw1'], 'the guest\'s note is searchable');

  const bl = loadTs(path.join(root, 'lib', 'booking', 'bookingListing.ts'));
  const kind = { isShortStay: true, isHourly: false, details: { price_unit: 'day' } };
  const choice = { start: '2026-12-05', end: '2026-12-05', hours: 0, leaseStart: '', leaseMonths: 0, eventType: 'graduation', eventNotes: '  Family of 40  ' };
  const venuePayload = bl.bookingPayload({ id: 'V', host_id: 'H', category: 'venue' }, kind, 'C', 100, choice);
  assert.deepEqual([venuePayload.event_type, venuePayload.event_notes], ['graduation', 'Family of 40']);
  const stayPayload = bl.bookingPayload({ id: 'A', host_id: 'H', category: 'airbnb' }, kind, 'C', 100, choice);
  assert.equal('event_type' in stayPayload, false, 'other listings send none');

  const format = loadTs(path.join(root, 'lib', 'bookings', 'format.ts'));
  assert.deepEqual(format.detailRows({ event_type: 'wedding', hours: null, start_date: '2026-12-05', end_date: '2026-12-05', price_unit: 'day' })[0], { label: 'Event', value: 'Wedding', icon: 'calendar' });
  const read = (...p) => fs.readFileSync(path.join(root, ...p), 'utf8').replace(/\r\n/g, '\n');
  const widget = read('components', 'booking', 'BookingWidget.tsx');
  assert.match(widget, /if \(isVenue && !eventType\) \{ setResult\(\{ text: 'Choose the type of event\.', error: true \}\); return; \}/);
  assert.match(widget, /<select id="event-type" required value=\{eventType\}/);
  assert.match(read('lib', 'bookings', 'hostBookings.ts'), /guest_count,event_type,event_notes,total_price/);
  assert.match(read('components', 'bookings', 'HostBookingsView.tsx'), /\{booking\.event_notes && <p className="host-detail-note">“\{booking\.event_notes\}”<\/p>\}/);
  assert.match(read('components', 'calendar', 'TimeGrid.tsx'), /title: source\.type === 'booking' \? source\.value\.host_title \|\| \(event \? source\.value\.guest \|\| 'Guest' : item\.title\) : item\.title,/, 'cards: the event as the tag, the host\'s title or the booker as the title');
  assert.match(read('components', 'calendar', 'calendarStyles.ts'), /\.vc \.vc-block\{container-type:size;justify-content:flex-start\}/);
});

test('the host\'s own title, notes and colour on a VaRoom booking; cards show the photo, then the name', async () => {
  const fs = require('node:fs');
  const hall = { id: 'V', title: 'Lush Secret Garden', category: 'venue', price_unit: 'day' };
  const d = { ...data, listings: [hall], tables: [], events: [{ id: 'e1', listing_id: 'V', start_date: '2026-12-05', end_date: '2026-12-05', title: 'KU graduation', blocks: true, viewing: false, source: 'host', color: null, client_name: 'Kenyatta University', guest_count: 300 }],
    bookings: [{ id: 'w1', listing_id: 'V', status: 'approved', start_date: '2026-12-06', end_date: '2026-12-06', guest: 'Divine Venues', event_type: 'wedding', host_title: 'Kamau & Njeri wedding', host_notes: 'Decor by Zawadi', host_color: 'green' }] };
  const items = view.buildItems(d, [hall], true, view.ALL_SHOWN);
  const w = items.find((i) => i.key === 'bw1');
  assert.deepEqual([w.title, w.color], ['Kamau & Njeri wedding', 'green'], 'the host\'s title and colour win');
  assert.deepEqual(view.searchItems(items, () => 'Lush', 'zawadi', '2026-12-01').map((i) => i.key), ['bw1'], 'the host\'s notes are searchable');
  assert.deepEqual(view.searchItems(items, () => 'Lush', 'divine', '2026-12-01').map((i) => i.key), ['bw1'], 'and the booker, under the host\'s title');

  const cal = loadTs(path.join(root, 'lib', 'calendar', 'hostCalendar.ts'));
  const calls = [];
  const fake = { from: (table) => ({
    upsert: async (row, options) => { calls.push(['upsert', table, row.title, row.notes, row.color, options.onConflict]); return { error: null }; },
    delete: () => ({ eq: async (column, value) => { calls.push(['delete', table, column, value]); return { error: null }; } }),
  }) };
  await cal.saveBookingNote(fake, 'H', 'w1', { title: '  Kamau wedding ', notes: '', color: null });
  await cal.saveBookingNote(fake, 'H', 'w1', { title: ' ', notes: ' ', color: null });
  assert.deepEqual(calls, [['upsert', 'booking_host_notes', 'Kamau wedding', null, null, 'booking_id'], ['delete', 'booking_host_notes', 'booking_id', 'w1']], 'all empty: removed');

  const grid = fs.readFileSync(path.join(root, 'components', 'calendar', 'TimeGrid.tsx'), 'utf8');
  assert.match(grid, /who: \[name, guests \? plural\(guests, 'guest'\) : null, listing\?\.title\]\.filter\(Boolean\)\.join\(' · '\),/, 'the name first, the place last');
  assert.match(grid, /const name = source\.type === 'booking' \? source\.value\.guest : source\.type === 'event' \|\| source\.type === 'table' \? source\.value\.client_name : null;/, 'offline and VaRoom bookings alike');
  assert.equal((grid.match(/\{card\.name && <Face name=\{card\.name\} src=\{card\.avatar\} \/>\}<span>\{card\.who\}<\/span>/g) || []).length, 2, 'hour cards and Day cards');
  assert.match(fs.readFileSync(path.join(root, 'components', 'calendar', 'DetailsPanel.tsx'), 'utf8'), /onClick=\{\(\) => props\.onEditBooking\(b\)\}/);
});
