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
    assert.equal(view.savedMode('h1'), 'month');
    view.saveMode('h1', 'timeline');
    assert.equal(view.savedMode('h1'), 'timeline');
    assert.equal(view.savedMode('h2'), 'month');
  } finally {
    delete global.window;
  }
});
