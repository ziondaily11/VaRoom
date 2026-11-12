const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { loadTs } = require('./helpers/loadTs');

const lib = (...parts) => path.join(__dirname, '..', 'lib', ...parts);
const api = loadTs(lib('analytics', 'analyticsApi.ts'), { mocks: { '@supabase/supabase-js': {} } });
const niche = loadTs(lib('analytics', 'niche.ts'));
const format = loadTs(lib('analytics', 'format.ts'));
const events = loadTs(lib('analytics', 'listingEvents.ts'), { mocks: { '@supabase/supabase-js': {} } });
const layout = loadTs(lib('accountRoleLayout.ts'));

function period(overrides = {}) {
  return {
    views: 0, unique_viewers: 0, contact_whatsapp: 0, contact_phone: 0, contact_email: 0, shares: 0,
    enquiries: 0, likes: 0, saves: 0, requests: 0, by_status: [], approved: 0, approved_value: 0,
    average_value: null, completed: 0, nights: 0, stays: 0, stay_value: 0, hours: 0, hourly_bookings: 0,
    lease_requests: 0, lease_approved: 0, lease_months: 0, lease_monthly_value: null, lead_days: null,
    booking_response_minutes: null, booking_responses: 0, occupied_days: 0, capacity_days: 0,
    chat_threads: 0, chat_replied: 0, chat_replied_within_hour: 0, chat_response_minutes: null,
    ...overrides,
  };
}

function overview(niche, portfolio = {}, current = {}, previous = {}) {
  return {
    access: true,
    niche,
    portfolio: { listings: 1, published: 1, categories: [niche], has_stays: false, has_dining: false, has_rent: false, has_sale: false, has_hourly: false, ...portfolio },
    tracking_since: null,
    current: period(current),
    previous: period(previous),
    trend: [{ bucket: '2026-11-01', views: 2, contacts: 1, enquiries: 1, requests: 1, approved: 1, approved_value: 5000 }],
    listings: [{ listing_id: 'l1', title: 'Sea view', category: niche, listing_purpose: null, publication_state: 'published', availability_status: 'available', views: 2, contacts: 1, enquiries: 1, likes: 0, saves: 0, requests: 1, approved: 1, approved_value: 5000 }],
    dining: null,
    reviews: { average: 4.4, count: 5, in_period: 2, distribution: { 1: 0, 2: 0, 3: 0, 4: 3, 5: 2 } },
  };
}

test('a host without a live plan gets only the locked result', () => {
  assert.deepEqual(api.parseOverview({ access: false, niche: 'hotel' }), { access: false, niche: 'hotel' });
  assert.deepEqual(api.parseOverview({ access: false, niche: 'something-else' }), { access: false, niche: null });
});

test('the overview parses numbers the database returns as strings and rejects bad shapes', () => {
  const parsed = api.parseOverview(overview('airbnb', { has_stays: true }, { approved_value: '434458', nights: 81, stay_value: '434458', lead_days: '2.5' }));
  assert.equal(parsed.access, true);
  assert.equal(parsed.current.approvedValue, 434458);
  assert.equal(parsed.current.leadDays, 2.5);
  assert.equal(parsed.reviews.distribution[4], 3);
  assert.equal(parsed.listings[0].approvedValue, 5000);
  assert.throws(() => api.parseOverview({ ...overview('airbnb'), current: period({ views: 'many' }) }), /invalid number/);
  assert.throws(() => api.parseOverview({ ...overview('hotel'), dining: { total: 1, guests: 1, tables: 1, by_status: [], by_weekday: [1, 2] } }), /weekday/);
});

const view = (raw) => niche.buildNicheView(api.parseOverview(raw));
const keys = (kpis) => kpis.map((k) => k.key);

test('each niche gets its own headline metrics', () => {
  assert.deepEqual(keys(view(overview('airbnb', { has_stays: true })).headline), ['value', 'nights', 'occupancy', 'nightly']);
  assert.deepEqual(keys(view(overview('venue', { has_stays: true })).headline), ['value', 'daysBooked', 'utilisation', 'average']);
  assert.deepEqual(keys(view(overview('property', { has_rent: true })).headline), ['enquiries', 'leaseRequests', 'leaseApproved', 'monthlyRent']);
  assert.deepEqual(keys(view(overview('office')).headline), ['enquiries', 'leaseRequests', 'leaseApproved', 'leaseValue']);
  assert.deepEqual(keys(view(overview(null)).headline), ['requests', 'approved', 'value', 'average']);
});

test('the portfolio refines the niche: restaurant-only hotels, homes for sale, hourly venues', () => {
  const dining = view({ ...overview('hotel', { has_dining: true, has_stays: false }), dining: { total: 2, previous_total: 0, guests: 4, tables: 2, occasions: 1, by_status: [], by_weekday: [0, 0, 0, 1, 1, 0, 0], by_hour: [] } });
  assert.equal(dining.mode, 'dining');
  assert.equal(dining.showDining, true);
  assert.equal(view(overview('hotel', { has_dining: true, has_stays: true })).mode, 'stays');

  const sale = view(overview('property', { has_sale: true, has_rent: false }));
  assert.equal(sale.mode, 'sale');
  assert.equal(sale.showStatusBar, false);
  assert.deepEqual(sale.funnel.map((s) => s.key), ['views', 'viewers', 'contact']);
  assert.equal(view(overview('property', { has_sale: true, has_rent: true })).mode, 'leases');

  assert.ok(keys(view(overview('venue', { has_hourly: true })).secondary).includes('hours'));
  assert.ok(!keys(view(overview('venue', { has_hourly: false })).secondary).includes('hours'));
});

test('derived metrics: occupancy, nightly rate, stay length, cancellation', () => {
  const v = view(overview('airbnb', { has_stays: true }, {
    nights: 81, stays: 20, stay_value: 434458, occupied_days: 58, capacity_days: 433,
    requests: 20, by_status: [{ status: 'approved', count: 18 }, { status: 'cancelled', count: 2 }],
  }));
  const kpi = (key) => [...v.headline, ...v.secondary].find((k) => k.key === key);
  assert.equal(kpi('occupancy').value, 58 / 433);
  assert.equal(kpi('nightly').value, 434458 / 81);
  assert.equal(kpi('stayLength').value, 81 / 20);
  assert.equal(kpi('cancellation').value, 0.1);
  assert.equal(kpi('cancellation').better, 'down');
  // No capacity (nothing listed) is unknown, not 0%.
  assert.equal(niche.ratio(0, 0), null);
});

test('change against the previous period', () => {
  assert.equal(niche.change(10, 0), 'new');
  assert.equal(niche.change(0, 0), 0);
  assert.equal(niche.change(15, 10), 0.5);
  assert.equal(niche.change(null, 10), null);
});

test('tracking coverage note follows when listing views started', () => {
  assert.equal(niche.trackingCovers(null, '2026-10-06'), false);
  assert.equal(niche.trackingCovers('2026-11-04T10:00:00+00:00', '2026-10-06'), false);
  assert.equal(niche.trackingCovers('2026-09-01T10:00:00+00:00', '2026-10-06'), true);
});

test('formatting', () => {
  assert.equal(format.formatMetric(null, 'kes'), 'None yet');
  assert.equal(format.formatMetric(0.25, 'percent'), '25%');
  assert.equal(format.formatMetric(4.69, 'duration'), '5 min');
  assert.equal(format.formatMetric(661, 'duration'), '11 hours');
  assert.equal(format.formatMetric(2857, 'duration'), '47.6 hours');
  assert.equal(format.formatMetric(2900, 'duration'), '2 days');
  assert.equal(format.formatMetric(1, 'nights'), '1 night');
  assert.equal(format.formatMetric(4.05, 'nights'), '4.1 nights');
  assert.equal(format.rangeFor('30d', new Date('2026-11-04T09:00:00Z')).from, '2026-10-06');
  assert.equal(format.rangeFor('30d', new Date('2026-11-04T22:30:00Z')).to, '2026-11-05', 'ranges follow Nairobi time');
});

test('CSV export quotes values and neutralises spreadsheet formulas in titles', () => {
  const v = view(overview('airbnb', { has_stays: true }));
  const rows = [{ listingId: 'a', title: '=HYPERLINK("x")', views: 1, contacts: 0, enquiries: 0, likes: 0, saves: 0, requests: 0, approved: 0, approvedValue: 0 }];
  const csv = format.analyticsCsv({ from: '2026-10-06', to: '2026-11-04' }, v.headline, v.listingColumns, rows);
  assert.match(csv, /^VaRoom analytics,2026-10-06 to 2026-11-04/);
  assert.match(csv, /"'=HYPERLINK\(""x""\)",1,0,0,0,0/);
});

test('listing events are not resent within the repeat window', () => {
  const log = new Map();
  assert.equal(events.shouldSend('l1', 'view', 0, log), true);
  assert.equal(events.shouldSend('l1', 'view', 10 * 60 * 1000, log), false);
  assert.equal(events.shouldSend('l1', 'contact_phone', 10 * 60 * 1000, log), true);
  assert.equal(events.shouldSend('l1', 'view', 31 * 60 * 1000, log), true);
});

test('analytics and marketplace keep the persistent shell as an icon-only rail', () => {
  assert.equal(layout.usesIconRail('/analytics', '/analytics?listing=x'), true);
  assert.equal(layout.usesIconRail('/marketplace', '/marketplace?category=hotel'), true);
  assert.equal(layout.usesIconRail('/host-home', '/host-home'), false);
  const app = fs.readFileSync(path.join(__dirname, '..', 'pages', '_app.tsx'), 'utf8');
  assert.match(app, /rail=\{usesIconRail\(path, asPath\)\}/);
  const styles = fs.readFileSync(path.join(__dirname, '..', 'components', 'shell', 'shellStyles.ts'), 'utf8');
  assert.match(styles, /\.shell-rail-layout \{ grid-template-columns: 76px/);
  assert.match(styles, /favicon\/favicon-96\.png/, 'the rail shows the favicon where the full sidebar has the wordmark');
});

test('the analytics page uses the shared session and never the v1 analytics functions', () => {
  const page = fs.readFileSync(path.join(__dirname, '..', 'pages', 'analytics.tsx'), 'utf8');
  assert.match(page, /useAuth\(\)/);
  assert.doesNotMatch(page, /auth\.getSession/);
  const apiSource = fs.readFileSync(lib('analytics', 'analyticsApi.ts'), 'utf8');
  assert.match(apiSource, /host_analytics_overview/);
  assert.doesNotMatch(apiSource, /host_booking_summary|host_listing_ranking|host_review_summary/);
});

test('the listing filter grows from its trigger, staggers rows by 30ms and shrinks back', () => {
  const picker = fs.readFileSync(path.join(__dirname, '..', 'components', 'analytics', 'ListingPicker.tsx'), 'utf8');
  const css = fs.readFileSync(path.join(__dirname, '..', 'components', 'analytics', 'analyticsStyles.ts'), 'utf8');
  assert.match(picker, /ROW_STAGGER_MS = 30/);
  assert.match(css, /\[data-state="open"\]\{animation:va-menu-in 200ms/);
  assert.match(css, /\[data-state="closing"\]\{animation:va-menu-out 150ms/);
  assert.match(css, /transform-origin:var\(--origin-x/);
  assert.match(css, /prefers-reduced-motion:reduce\)\{\.va-menu/);
});
