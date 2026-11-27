'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// Event venues are hired by the hour or by the day (client/lib/listWizard/copy.ts).
const migration = fs.readFileSync(path.join(__dirname, '..', 'migrations', '20261127_000085_venue_day_pricing.sql'), 'utf8');

test('a booking on a venue priced per day may start and end on the same day; nightly stays still need a check-out after check-in', () => {
  assert.match(migration, /select d\.instant_book, d\.min_notice_days, d\.max_advance_days, d\.min_stay_nights, d\.max_stay_nights, d\.price_unit/);
  // The listing's unit decides, never the unit the browser sent.
  assert.match(migration, /daily := has_rules and rules\.price_unit = 'day';/);
  assert.doesNotMatch(migration, /new\.price_unit/);
  assert.match(migration, /if daily and new\.end_date < new\.start_date then\s*raise exception 'booking_rule: The last day can''t be before the first day\.';/);
  assert.match(migration, /if not daily and new\.end_date <= new\.start_date then\s*raise exception 'booking_rule: Check-out must be after check-in\.';/);
  // The rest of the rules are unchanged: overlaps include both ends, so two hires never share a day.
  assert.match(migration, /and b\.start_date <= new\.end_date and b\.end_date >= new\.start_date/);
  assert.match(migration, /perform pg_advisory_xact_lock\(hashtext\('varoom-booking:' \|\| new\.listing_id::text\)\);/);
});

test('venue listings priced per night move to per day', () => {
  assert.match(migration, /update public\.listing_booking_details d\s*set price_unit = 'day'\s*from public\.listings l\s*where l\.id = d\.listing_id and l\.category = 'venue' and d\.price_unit = 'night';/);
  const routes = fs.readFileSync(path.join(__dirname, '..', 'routes', 'listingRoutes.js'), 'utf8');
  assert.match(routes, /enumValue\(value, key, \['hour', 'day', 'week', 'night', 'month', 'year', 'sq_ft', 'm2', 'desk', 'turnover'\]\)/, 'the listing API already accepts day');
});
