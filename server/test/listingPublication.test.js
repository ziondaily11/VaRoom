'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const repositoryRoot = path.join(__dirname, '..', '..');
const discoverPage = fs.readFileSync(path.join(repositoryRoot, 'client', 'legacy-pages', 'client-home.html'), 'utf8');
const hostHomePage = fs.readFileSync(path.join(repositoryRoot, 'client', 'legacy-pages', 'host-home.html'), 'utf8');
const marketplacePage = fs.readFileSync(path.join(repositoryRoot, 'client', 'legacy-pages', 'marketplace.html'), 'utf8');
const landingPage = fs.readFileSync(path.join(repositoryRoot, 'client', 'pages', 'index.tsx'), 'utf8');
const profilePage = fs.readFileSync(path.join(repositoryRoot, 'client', 'legacy-pages', 'profile.html'), 'utf8');
const publicHostProfile = fs.readFileSync(path.join(repositoryRoot, 'client', 'legacy-pages', 'public-profile.jsx'), 'utf8');
const hostProfileView = fs.readFileSync(path.join(repositoryRoot, 'client', 'legacy-pages', 'host-profile-view.jsx'), 'utf8');
const hostListingControls = fs.readFileSync(path.join(repositoryRoot, 'client', 'public', 'js', 'host-listing-controls.js'), 'utf8');
const listingPage = fs.readFileSync(path.join(repositoryRoot, 'client', 'legacy-pages', 'list.html'), 'utf8');
const listingRoutes = fs.readFileSync(path.join(__dirname, '..', 'routes', 'listingRoutes.js'), 'utf8');
const draftStatusMigration = fs.readFileSync(
  path.join(__dirname, '..', 'migrations', '20261013_000039_listing_draft_status.sql'),
  'utf8'
);
const activationMigration = fs.readFileSync(
  path.join(__dirname, '..', 'migrations', '20261011_000036_listing_entitlement_activation.sql'),
  'utf8'
);
const finalizationMigration = fs.readFileSync(
  path.join(__dirname, '..', 'migrations', '20261012_000038_property_video_finalization_claim.sql'),
  'utf8'
);

test('all Discover feed branches require active moderation and available status', () => {
  const categoryFilter = discoverPage.slice(
    discoverPage.indexOf('function withCategory(query)'),
    discoverPage.indexOf('return async function(offset, limit)', discoverPage.indexOf('function withCategory(query)'))
  );
  assert.match(categoryFilter, /eq\('moderation_status', 'active'\)/);
  assert.match(categoryFilter, /eq\('availability_status', 'available'\)/);
  const recommendedStart = discoverPage.indexOf('async function loadRecommended()');
  const recommendedEnd = discoverPage.indexOf('function mobileWidgetsBlock()', recommendedStart);
  const recommendedFeed = discoverPage.slice(recommendedStart, recommendedEnd);
  assert.match(recommendedFeed, /eq\('moderation_status', 'active'\)/);
  assert.match(recommendedFeed, /eq\('availability_status', 'available'\)/);

  const paginationAndSearch = discoverPage.slice(
    discoverPage.indexOf('return async function(offset, limit)'),
    discoverPage.indexOf('function feedScrollStateKey')
  );
  assert.match(paginationAndSearch, /\.range\(offset, offset \+ limit - 1\)/);
  assert.match(paginationAndSearch, /withCategory\(supabaseClient\.from\('listings'\)/);
  assert.match(discoverPage, /\.in\('id', Array\.from\(bookmarkedIds\)\)\s*\.eq\('moderation_status', 'active'\)\s*\.eq\('availability_status', 'available'\)/);

  const marketplaceFetch = marketplacePage.slice(
    marketplacePage.indexOf('async function fetchListings(offset)'),
    marketplacePage.indexOf('async function loadListings(reset)')
  );
  assert.match(marketplaceFetch, /query\.eq\('moderation_status', 'active'\)/);
  assert.match(marketplaceFetch, /query\.eq\('availability_status', 'available'\)/);
  assert.doesNotMatch(marketplacePage, /isMissingAvailabilityStatusColumnError|fetchListings\(false/);
  assert.match(landingPage, /\.eq\('moderation_status', 'active'\)\s*\.eq\('availability_status', 'available'\)/);
  assert.doesNotMatch(landingPage, /missingColumnMessage|select\(baseSelect\)/);

  const hostFeedFilter = hostHomePage.slice(
    hostHomePage.indexOf('function withFilters(query)'),
    hostHomePage.indexOf('return async function(offset, limit)', hostHomePage.indexOf('function withFilters(query)'))
  );
  assert.match(hostFeedFilter, /if \(onlyMine\) query = query\.eq\('host_id', currentUser\.id\)/);
  assert.match(hostFeedFilter, /else query = query\.eq\('moderation_status', 'active'\)\.eq\('availability_status', 'available'\)/);
  assert.match(hostHomePage, /\.eq\('host_id', currentUser\.id\)\s*\.order\('created_at', \{ ascending:false \}\)/);

  const profileListings = profilePage.slice(
    profilePage.indexOf('let listingsQuery = supabaseClient'),
    profilePage.indexOf('const { data: listings, error: listingsError }', profilePage.indexOf('let listingsQuery = supabaseClient'))
  );
  assert.match(profileListings, /\.eq\('host_id', profileData\.id\)/);
  assert.match(profileListings, /if \(!isOwner\)[\s\S]*\.eq\('moderation_status', 'active'\)[\s\S]*\.eq\('availability_status', 'available'\)/);
  assert.match(profilePage, /s === 'draft'[\s\S]*>Draft</);

  assert.match(publicHostProfile, /\.eq\("moderation_status", "active"\)\s*\.eq\("availability_status", "available"\)/);
  assert.match(hostProfileView, /if \(sessionResult\.data\.session\?\.user\?\.id !== hostId\)[\s\S]*\.eq\("moderation_status", "active"\)[\s\S]*\.eq\("availability_status", "available"\)/);
  assert.match(hostListingControls, /data-status="draft"[^>]*>Save as draft/);

  assert.match(listingRoutes, /const STATUSES = new Set\(\['available', 'booked', 'unavailable', 'paused', 'draft'\]\)/);
  assert.match(draftStatusMigration, /availability_status in \('available', 'booked', 'unavailable', 'paused', 'draft'\)/);
  const statusRoute = listingRoutes.slice(
    listingRoutes.indexOf("router.patch('/listings/:id/status'"),
    listingRoutes.indexOf("// This is intentionally separate", listingRoutes.indexOf("router.patch('/listings/:id/status'"))
  );
  assert.match(statusRoute, /\.update\(\{ availability_status: req\.body\.status \}\)/);
  assert.doesNotMatch(statusRoute, /\.delete\(/);
  const ownershipCheck = listingRoutes.slice(
    listingRoutes.indexOf('async function ownedListing'),
    listingRoutes.indexOf("router.patch('/listings/:id/status'")
  );
  assert.match(ownershipCheck, /\.eq\('id', id\)[\s\S]*if \(data\.host_id !== userId\)/);
  assert.match(listingPage, /\.eq\('id', editListingId\)\.eq\('host_id', currentUser\.id\)/);
});

test('failed new-listing media upload exits before requesting activation', () => {
  const failedMediaStart = listingPage.indexOf("if (!editMode && selectedFiles.length > 0 && failedCount > 0)");
  const activationMatch = /if \(listingPaymentVerified\s*\|\|\s*\(!editMode/.exec(listingPage.slice(failedMediaStart));
  const activationStart = activationMatch ? failedMediaStart + activationMatch.index : -1;
  assert.ok(failedMediaStart >= 0 && activationStart > failedMediaStart);

  const failedMediaBranch = listingPage.slice(failedMediaStart, activationStart);
  assert.match(failedMediaBranch, /return;/);
  assert.doesNotMatch(failedMediaBranch, /\/status/);
  assert.match(listingPage.slice(failedMediaStart, activationStart),
    /Media upload failed, so the listing was not published/);
});

test('server activation keeps subscription limits and verified listing-payment entitlement checks', () => {
  assert.match(activationMigration, /paid_listing_until is not null and v_listing\.paid_listing_until > now\(\)/i);
  assert.match(activationMigration, /hs\.status = 'active'/);
  assert.match(activationMigration, /hs\.current_period_end is null or hs\.current_period_end > now\(\)/i);
  assert.match(activationMigration, /pg_advisory_xact_lock/);
  assert.match(activationMigration, /max_active_listings/);
  assert.match(activationMigration, /LISTING_LIMIT_REACHED/);
  assert.match(listingRoutes, /activate_listing_with_entitlement/);
});

test('video finalization claim is scoped and deletion cannot remove a processing video', () => {
  assert.match(finalizationMigration, /for key share/i);
  assert.match(finalizationMigration, /id = p_media_id[\s\S]*property_id = p_property_id[\s\S]*host_id = p_host_id[\s\S]*upload_id = p_upload_id/i);
  assert.match(finalizationMigration, /status in \('pending', 'uploading'\)/);
  assert.match(finalizationMigration, /old\.media_type = 'video' and old\.status = 'processing'/i);
  assert.match(finalizationMigration, /using errcode = '55000'/i);
});
