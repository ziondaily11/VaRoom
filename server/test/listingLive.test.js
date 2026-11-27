'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { planAllowance, listingCap } = require('../lib/listingLive');

// Listings are online only while paid for (listings.live_until): Silver / Gold
// for 30 days from publishing; Airbnb, Hotel and Venue while the host's plan runs.

const migration = fs.readFileSync(path.join(__dirname, '..', 'migrations', '20261126_000082_listing_live_until.sql'), 'utf8');
const routes = fs.readFileSync(path.join(__dirname, '..', 'routes', 'listingRoutes.js'), 'utf8');

test('the public sees a listing, its photos and booking details only while it is online; booking needs it online', () => {
  for (const policy of ['listings_published_public_select', 'listing_photos_published_select', 'listing_booking_details_published_select']) {
    const block = migration.slice(migration.indexOf(`create policy "${policy}"`), migration.indexOf(';', migration.indexOf(`create policy "${policy}"`)));
    assert.match(block, /live_until > now\(\)/, policy);
  }
  const booking = migration.slice(migration.indexOf('create policy "Clients can create a booking request"'));
  assert.match(booking.slice(0, booking.indexOf(';')), /l\.id = bookings\.listing_id and l\.host_id = bookings\.host_id[\s\S]*l\.live_until > now\(\)/);
});

test('publishing sets how long a listing stays online, and only the server can change it', () => {
  // Silver / Gold: 30 days from publishing, counted from now.
  assert.match(migration, /listing_tier = v_credit\.listing_tier, paid_listing_until = now\(\) \+ interval '30 days',\s*live_until = now\(\) \+ interval '30 days', live_since = now\(\)/);
  // A running term keeps its own end; an older monthly plan runs to its period end.
  assert.match(migration, /live_until = v_listing\.paid_listing_until, live_since = case when v_listing\.live_until > now\(\)/);
  assert.match(migration, /live_until = coalesce\(v_subscription\.current_period_end, now\(\) \+ interval '30 days'\)/);
  // The browser can never set them: inserts start offline, updates keep the server's values.
  assert.match(migration, /new\.live_until := null;\s*new\.live_since := null;/);
  assert.match(migration, /new\.live_until := old\.live_until;\s*new\.live_since := old\.live_since;/);
  // Applied immediately: only a running term or plan keeps a listing online.
  assert.match(migration, /set live_until = paid_listing_until\s*where live_until is null and paid_listing_until is not null and paid_listing_until > now\(\);/);
  assert.match(migration, /where status in \('active', 'past_due', 'cancel_requested'\) and current_period_end > now\(\)/);
});

test('Airbnb, Hotel and Venue listings publish only with a running plan, within its listing cap, online until it ends', () => {
  const branch = routes.slice(routes.indexOf("const changes = { availability_status: req.body.status };"), routes.indexOf("} else if (req.body.status === 'draft')"));
  assert.match(branch, /plan = await planAllowance\(supabaseAdmin, user\.id, listing\.category, \{ exceptId: req\.params\.id \}\)/);
  assert.match(branch, /if \(!plan\) return res\.status\(402\)\.json\(\{ error: 'Choose a plan to put this listing online\.', code: 'PLAN_REQUIRED' \}\);/);
  assert.match(branch, /if \(plan\.limit && plan\.used >= plan\.limit\) \{\s*return res\.status\(409\)\.json\(\{ error: `Your \$\{plan\.planName\} plan includes \$\{plan\.limit\} listing/);
  assert.match(branch, /code: 'LISTING_LIMIT_REACHED'/);
  assert.match(branch, /changes\.live_until = plan\.end;/);
  // Checked before any media is promoted, so a refusal changes nothing.
  assert.ok(branch.indexOf('LISTING_LIMIT_REACHED') < branch.indexOf('promoteListingMedia('));
});

// A fake Supabase: host_subscriptions answers `plan`; listings counts `online`.
function fakeDb(plan, online = 0) {
  const calls = [];
  return {
    calls,
    from(table) {
      const query = new Proxy({}, { get: (_target, name) => {
        if (name === 'maybeSingle') return async () => ({ data: plan, error: null });
        if (name === 'then') return table === 'listings' ? (resolve) => resolve({ count: online, error: null }) : undefined;
        return (...args) => { calls.push([table, name, ...args]); return query; };
      } });
      return query;
    },
  };
}

test('plan allowance: the running plan of this niche (or an older plan), its cap and the listings online now', async () => {
  const now = new Date('2026-11-26T10:00:00.000Z');
  const hotel = fakeDb({ plan_id: 'hotel_standard', niche: 'hotel', current_period_end: '2026-12-26T10:00:00.000Z', listing_allowance_limit: null, billing_plans: { display_name: 'Hotel', features: {} } });
  assert.deepEqual(await planAllowance(hotel, 'host-1', 'hotel', { now }),
    { planId: 'hotel_standard', planName: 'Hotel', end: '2026-12-26T10:00:00.000Z', limit: null, used: 0 }, 'Hotel plans have no listing cap');
  assert.deepEqual(hotel.calls.filter(([, name]) => ['eq', 'in', 'gt'].includes(name)).map((call) => call.slice(1)), [
    ['eq', 'host_id', 'host-1'],
    ['in', 'status', ['active', 'past_due', 'cancel_requested']],
    ['in', 'niche', ['hotel', 'legacy']],
    ['gt', 'current_period_end', '2026-11-26T10:00:00.000Z'],
  ]);
  assert.equal(hotel.calls.some(([table]) => table === 'listings'), false, 'nothing to count without a cap');

  const starter = fakeDb({ plan_id: 'airbnb_starter', niche: 'airbnb', current_period_end: '2026-12-26T10:00:00.000Z', listing_allowance_limit: null, billing_plans: { display_name: 'Starter', features: { max_active_listings: 2 } } }, 2);
  assert.deepEqual(await planAllowance(starter, 'host-1', 'airbnb', { now, exceptId: 'listing-9' }),
    { planId: 'airbnb_starter', planName: 'Starter', end: '2026-12-26T10:00:00.000Z', limit: 2, used: 2 });
  // Online now: published, not paused, inside its paid time; the listing being republished doesn't count.
  assert.deepEqual(starter.calls.filter(([table, name]) => table === 'listings' && name !== 'select').map((call) => call.slice(1)), [
    ['eq', 'host_id', 'host-1'],
    ['in', 'category', ['airbnb']],
    ['eq', 'publication_state', 'published'],
    ['eq', 'availability_status', 'available'],
    ['gt', 'live_until', '2026-11-26T10:00:00.000Z'],
    ['neq', 'id', 'listing-9'],
  ]);
  // An upgrade's carried-over places (listing_allowance_limit) count over the plan's own number.
  assert.equal(listingCap({ listing_allowance_limit: 7, billing_plans: { features: { max_active_listings: 6 } } }), 7);
  assert.equal(listingCap({ listing_allowance_limit: null, billing_plans: { features: {} } }), null);

  assert.equal(await planAllowance(fakeDb(null), 'host-1', 'airbnb', { now }), null);
  assert.equal(await planAllowance(fakeDb({ current_period_end: 'x' }), 'host-1', 'unknown', { now }), null, 'no plan covers an unknown category');
});

test('Airbnb and Venue plans cap their listings online; Hotel and older plans do not', () => {
  const caps = fs.readFileSync(path.join(__dirname, '..', 'migrations', '20261127_000084_plan_listing_caps.sql'), 'utf8');
  const values = [...caps.matchAll(/\('(\w+)', (\d+)\)/g)].map((match) => [match[1], Number(match[2])]);
  assert.deepEqual(values, [['airbnb_starter', 2], ['airbnb_pro', 6], ['airbnb_business', 15], ['venue_basic', 2], ['venue_pro', 5], ['venue_premium', 12]]);
  // The cards say the same numbers.
  const cards = fs.readFileSync(path.join(__dirname, '..', '..', 'client', 'lib', 'billing', 'pricing.ts'), 'utf8');
  for (const [id, count] of values) {
    const line = cards.slice(cards.indexOf(`nicheCard('${id}'`), cards.indexOf('\n', cards.indexOf(`nicheCard('${id}'`) + 1) + 200);
    assert.match(line, new RegExp(`Up to ${count} (active listings|bookable spaces)`), id);
  }
  const billing = fs.readFileSync(path.join(__dirname, '..', 'routes', 'billingRoutes.js'), 'utf8');
  // An upgrade carries over the unused places of the plan's own listings (it once counted shops and offices for every niche).
  assert.match(billing, /\.is\('paid_listing_until', null\)\.in\('category', categoriesCovered\(niche\)\)/);
  // The wizard learns the cap, the listings online and the plan to upgrade from.
  assert.match(billing, /allowed: plan\.used < plan\.limit, limit: plan\.limit, activeCount: plan\.used, planId: plan\.planId/);
});

test('Elie recommends only online listings', () => {
  const elie = fs.readFileSync(path.join(__dirname, '..', '..', 'chatbot', 'main.py'), 'utf8');
  assert.equal((elie.match(/"live_until": f"gt\.\{datetime\.now\(timezone\.utc\)\.isoformat\(\)\}"/g) || []).length, 2, 'its search and its other-listings suggestions');
});
