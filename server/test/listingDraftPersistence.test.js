'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..', '..');
// The native listing wizard's draft, checkout and publish behaviour is tested
// in client/test/list-wizard-*.test.js (drafts, flows, startup, page). These
// checks pin the server contracts those flows depend on.
const clientFile = (file) => fs.readFileSync(path.join(root, 'client', file), 'utf8');
// The native profile (legacy profile.html is retired).
const profilePage = ['lib/profile/hostProfile.ts', 'pages/profile.tsx', 'components/profile/HostListings.tsx'].map(clientFile).join('\n');
const listingRoutes = fs.readFileSync(path.join(root, 'server', 'routes', 'listingRoutes.js'), 'utf8');
const migration = fs.readFileSync(path.join(__dirname, '..', 'migrations', '20261021_000044_private_listing_drafts_and_publication_rls.sql'), 'utf8');

test('the pricing page returns a Go Pro checkout to the listing wizard with its reference', () => {
  // The wizard restores the saved listing from this return (client/test/list-wizard-startup.test.js).
  assert.match(clientFile('pages/pricing.tsx'), /subscription=return&reference=\$\{encodeURIComponent\(reference\)\}/);
});

test('My Profile displays private saved drafts and Continue Listing opens their explicit draft id', () => {
  assert.match(profilePage, /fetchFn\('\/api\/listing-drafts'/);
  assert.match(profilePage, /publication_state,created_at/);
  assert.match(profilePage, /rows\.filter\(\(listing\) => listing\.publication_state === 'published'\)/);
  assert.match(profilePage, /drafts\.filter\(\(draft\) => !draft\.listing_id \|\| !listed\.has\(draft\.listing_id\)\)/);
  assert.match(profilePage, /\/list\?draft=/);
  assert.match(profilePage, /Continue Listing →/);
});

test('draft API routes authenticate the host, enforce owner scoping, and persist the canonical category', () => {
  assert.match(listingRoutes, /router\.get\('\/listing-drafts'/);
  assert.match(listingRoutes, /router\.get\('\/listing-drafts\/:id'/);
  assert.match(listingRoutes, /router\.put\('\/listing-drafts\/:id'/);
  assert.match(listingRoutes, /\.eq\('host_id', user\.id\)/);
  assert.match(listingRoutes, /category,\s*form_data: req\.body\.form_data/);
  assert.match(listingRoutes, /listing\.category !== category/);
  assert.match(listingRoutes, /category = req\.body\.category === undefined \? hostNiche : enumValue\(req\.body\.category, 'category', CATEGORIES\)/);
});

test('database draft rows are host-private and public listing details/photos require published active parents', () => {
  assert.match(migration, /create table if not exists public\.host_listing_drafts/);
  assert.match(migration, /create policy host_listing_drafts_owner_only[\s\S]*auth\.uid\(\) = host_id/);
  assert.match(migration, /publication_state = 'published' and moderation_status = 'active'/);
  assert.match(migration, /listing_booking_details_published_select[\s\S]*publication_state = 'published'/);
  assert.match(migration, /listing_photos_published_select[\s\S]*publication_state = 'published'/);
  assert.match(migration, /listing_booking_details_owner_select[\s\S]*l\.host_id = auth\.uid\(\)/);
  assert.match(migration, /listing_photos_owner_select[\s\S]*l\.host_id = auth\.uid\(\)/);
});

test('the price-unit migration admits every unit validated by the listing API without running SQL', () => {
  const priceUnitMigration = fs.readFileSync(path.join(__dirname, '..', 'migrations', '20261022_000046_listing_booking_price_units.sql'), 'utf8');
  for (const unit of ['hour', 'day', 'week', 'night', 'month', 'year', 'sq_ft', 'm2', 'desk', 'turnover']) {
    assert.match(priceUnitMigration, new RegExp(`'${unit}'`));
  }
  assert.match(priceUnitMigration, /drop constraint if exists listing_booking_details_price_unit_check/i);
  assert.match(listingRoutes, /enumValue\(value, key, \['hour', 'day', 'week', 'night', 'month', 'year', 'sq_ft', 'm2', 'desk', 'turnover'\]\)/);
});
