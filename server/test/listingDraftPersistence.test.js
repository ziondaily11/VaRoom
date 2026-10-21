'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..', '..');
const listingPage = fs.readFileSync(path.join(root, 'client', 'legacy-pages', 'list.html'), 'utf8');
const profilePage = fs.readFileSync(path.join(root, 'client', 'legacy-pages', 'profile.html'), 'utf8');
const listingRoutes = fs.readFileSync(path.join(root, 'server', 'routes', 'listingRoutes.js'), 'utf8');
const migration = fs.readFileSync(path.join(__dirname, '..', 'migrations', '20261021_000044_private_listing_drafts_and_publication_rls.sql'), 'utf8');

test('a fresh listing session does not read or restore the previous host draft pointer', () => {
  assert.match(listingPage, /const requestedDraftId = new URLSearchParams\(window\.location\.search\)\.get\('draft'\)/);
  assert.match(listingPage, /if \(!editMode && \(requestedDraftId \|\| listingPaymentReturnReference\)\)/);
  assert.match(listingPage, /await restoreListingDraftAfterUpgrade\(currentUser\.id, session\.access_token, continuationDraftRecord, continuationDraftPointer\)/);
  assert.doesNotMatch(listingPage, /if \(!editMode\) await restoreListingDraftAfterUpgrade/);
  assert.match(listingPage, /queueListingDraftSave/);
  assert.match(listingPage, /method: 'PUT'/);
});

test('My Profile displays private saved drafts and Continue Listing opens their explicit draft id', () => {
  assert.match(profilePage, /fetch\('\/api\/listing-drafts'/);
  assert.match(profilePage, /savedListingDrafts\.filter\(function\(draft\)\{ return !draft\.listing_id; \}\)/);
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
  assert.match(listingPage, /category: hostNiche,\s*title: fieldValue\('title'\)/);
  assert.match(listingPage, /button\.dataset\.officeShopType === hostNiche/);
  assert.match(listingPage, /button\.selected\{ border-color:#050505; background:#050505; color:#fff; \}/);
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

