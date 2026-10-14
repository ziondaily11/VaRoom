'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const repositoryRoot = path.join(__dirname, '..', '..');
const migration = fs.readFileSync(
  path.join(__dirname, '..', 'migrations', '20261014_000039_delete_draft_listings.sql'),
  'utf8'
);
const route = fs.readFileSync(path.join(__dirname, '..', 'routes', 'listingRoutes.js'), 'utf8');
const controls = fs.readFileSync(
  path.join(repositoryRoot, 'client', 'public', 'js', 'host-listing-controls.js'),
  'utf8'
);
const profile = fs.readFileSync(
  path.join(repositoryRoot, 'client', 'legacy-pages', 'profile.html'),
  'utf8'
);

test('draft deletion SQL is service-only and rejects non-drafts and retained history', () => {
  assert.match(migration, /availability_status in \('available', 'booked', 'unavailable', 'paused', 'draft'\)/);
  assert.match(migration, /v_status <> 'draft'/);
  assert.match(migration, /public\.bookings b where b\.listing_id = p_listing_id/);
  assert.match(migration, /public\.table_reservations r where r\.listing_id = p_listing_id/);
  assert.match(migration, /public\.billing_payments bp where bp\.listing_id = p_listing_id/);
  assert.match(migration, /grant execute on function public\.varoom_delete_draft_listing\(uuid, uuid\) to service_role/);
  assert.match(migration, /on delete set null/);
});

test('host deletion endpoint verifies ownership and gathers media in the deletion transaction', () => {
  assert.match(route, /const user = await authenticatedHost\(req, res\);[\s\S]*?router\.delete\('\/listings\/:id'/);
  assert.match(route, /rpc\('varoom_delete_draft_listing'/);
  assert.match(route, /deleteListingStorageObjects\(media\?\.photo_paths, media\?\.property_media\)/);
  assert.match(route, /LISTING_DELETED_MEDIA_CLEANUP_FAILED/);
});

test('host controls label draft deletion explicitly and remove deleted listings from profile tabs', () => {
  assert.match(controls, /Delete draft permanently/);
  assert.match(controls, /including Discover and all profiles/);
  assert.match(controls, /LISTING_DELETED_MEDIA_CLEANUP_FAILED/);
  assert.match(profile, /varoom:listing-deleted/);
  assert.match(profile, /categoryListingIds\[categoryId\].*filter/);
});
