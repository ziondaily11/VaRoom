'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { planCoverageEnd } = require('../lib/listingLive');

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

test('Airbnb, Hotel and Venue listings publish only with a running plan, online until it ends', () => {
  const branch = routes.slice(routes.indexOf("const changes = { availability_status: req.body.status };"), routes.indexOf("} else if (req.body.status === 'draft')"));
  assert.match(branch, /planEnd = await planCoverageEnd\(supabaseAdmin, user\.id, listing\.category\)/);
  assert.match(branch, /if \(!planEnd\) return res\.status\(402\)\.json\(\{ error: 'Choose a plan to put this listing online\.', code: 'PLAN_REQUIRED' \}\);/);
  assert.match(branch, /changes\.live_until = planEnd;/);
  // Checked before any media is promoted, so a refusal changes nothing.
  assert.ok(branch.indexOf('PLAN_REQUIRED') < branch.indexOf('promoteListingMedia('));
});

test('plan coverage: the running plan of this niche (or an older plan), never an ended one', async () => {
  const calls = [];
  const fake = (row) => ({ from(table) {
    const query = new Proxy({}, { get: (_target, name) => (name === 'maybeSingle'
      ? async () => ({ data: row, error: null })
      : (...args) => { calls.push([table, name, ...args]); return query; }) });
    return query;
  } });
  const now = new Date('2026-11-26T10:00:00.000Z');
  assert.equal(await planCoverageEnd(fake({ current_period_end: '2026-12-26T10:00:00.000Z' }), 'host-1', 'hotel', now), '2026-12-26T10:00:00.000Z');
  assert.deepEqual(calls.filter(([, name]) => ['eq', 'in', 'gt'].includes(name)).map((call) => call.slice(1)), [
    ['eq', 'host_id', 'host-1'],
    ['in', 'status', ['active', 'past_due', 'cancel_requested']],
    ['in', 'niche', ['hotel', 'legacy']],
    ['gt', 'current_period_end', '2026-11-26T10:00:00.000Z'],
  ]);
  assert.equal(await planCoverageEnd(fake(null), 'host-1', 'airbnb', now), null);
  assert.equal(await planCoverageEnd(fake({ current_period_end: 'x' }), 'host-1', 'unknown', now), null, 'no plan covers an unknown category');
});

test('Elie recommends only online listings', () => {
  const elie = fs.readFileSync(path.join(__dirname, '..', '..', 'chatbot', 'main.py'), 'utf8');
  assert.equal((elie.match(/"live_until": f"gt\.\{datetime\.now\(timezone\.utc\)\.isoformat\(\)\}"/g) || []).length, 2, 'its search and its other-listings suggestions');
});
