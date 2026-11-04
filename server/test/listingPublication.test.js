'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const repositoryRoot = path.join(__dirname, '..', '..');
const discoverPage = fs.readFileSync(path.join(repositoryRoot, 'client', 'pages', 'client-home.tsx'), 'utf8');
const hostHomePage = fs.readFileSync(path.join(repositoryRoot, 'client', 'lib', 'hostHome', 'hostHome.ts'), 'utf8');
// Marketplace is native; its listing query lives in lib/marketplace.
const marketplacePage = fs.readFileSync(path.join(repositoryRoot, 'client', 'lib', 'marketplace', 'marketplace.ts'), 'utf8');
const landingPage = fs.readFileSync(path.join(repositoryRoot, 'client', 'pages', 'index.tsx'), 'utf8');
// The native profile's listing query and labels (legacy profile.html is retired).
const profilePage = fs.readFileSync(path.join(repositoryRoot, 'client', 'lib', 'profile', 'hostProfile.ts'), 'utf8');
const profileLabels = fs.readFileSync(path.join(repositoryRoot, 'client', 'lib', 'profile', 'profilePage.ts'), 'utf8');
// The public host pages share the native profile data (legacy .jsx pages are retired).
const publicHostProfile = fs.readFileSync(path.join(repositoryRoot, 'client', 'components', 'hostProfile', 'PublicHostProfile.tsx'), 'utf8');
const hostProfileView = fs.readFileSync(path.join(repositoryRoot, 'client', 'components', 'hostProfile', 'HostProfileView.tsx'), 'utf8');
const hostListingControls = fs.readFileSync(path.join(repositoryRoot, 'client', 'lib', 'listings', 'hostListingActions.ts'), 'utf8');
// The listing wizard's own behaviour (edit mode reads only the host's listing,
// a failed media upload stops before activation) is tested in
// client/test/list-wizard-startup.test.js and list-wizard-flows/page.test.js.
const listingRoutes = fs.readFileSync(path.join(__dirname, '..', 'routes', 'listingRoutes.js'), 'utf8');
const draftStatusMigration = fs.readFileSync(
  path.join(__dirname, '..', 'migrations', '20261013_000039_listing_draft_status.sql'),
  'utf8'
);
const activationMigration = fs.readFileSync(
  path.join(__dirname, '..', 'migrations', '20261018_000040_draft_media_lifecycle.sql'),
  'utf8'
);
const allowanceTransitionMigration = fs.readFileSync(
  path.join(__dirname, '..', 'migrations', '20261021_000044_subscription_allowance_transitions.sql'),
  'utf8'
);
const finalizationMigration = fs.readFileSync(
  path.join(__dirname, '..', 'migrations', '20261012_000038_property_video_finalization_claim.sql'),
  'utf8'
);

test('all Discover feed branches require active moderation and available status', () => {
  const listingQueryBlock = discoverPage.slice(
    discoverPage.indexOf('const listingQuery = () => {'),
    discoverPage.indexOf('if (!term) {', discoverPage.indexOf('const listingQuery = () => {'))
  );
  assert.match(listingQueryBlock, /\.eq\('moderation_status', 'active'\)/);
  assert.match(listingQueryBlock, /\.eq\('availability_status', 'available'\)/);
  assert.match(discoverPage, /\.range\(offset, offset \+ limit - 1\)/);
  assert.match(
    discoverPage,
    /\.in\('id', Array\.from\(saved\)\)\s*\.eq\('moderation_status', 'active'\)\s*\.eq\('availability_status', 'available'\)/
  );

  const marketplaceFetch = marketplacePage.slice(
    marketplacePage.indexOf('export async function fetchListingPage('),
    marketplacePage.indexOf('// Recent pages per search')
  );
  assert.match(marketplaceFetch, /\.eq\('moderation_status', 'active'\)/);
  assert.match(marketplaceFetch, /\.eq\('availability_status', 'available'\)/);
  assert.match(marketplaceFetch, /paid_listing_until\.is\.null,paid_listing_until\.gt\./);
  assert.doesNotMatch(marketplacePage, /isMissingAvailabilityStatusColumnError|fetchListings\(false/);
  assert.match(landingPage, /\.eq\('moderation_status', 'active'\)\s*\.eq\('availability_status', 'available'\)/);
  assert.doesNotMatch(landingPage, /missingColumnMessage|select\(baseSelect\)/);

  // Host home (native): visitors' feed is active and available; the host's own listings are all theirs.
  assert.match(hostHomePage, /let next = onlyMine \? query\.eq\('host_id', userId\) : query\.eq\('moderation_status', 'active'\)\.eq\('availability_status', 'available'\);/);
  assert.match(hostHomePage, /\.eq\('host_id', userId\)\.order\('created_at', \{ ascending: false \}\)/);

  const profileListings = profilePage.slice(
    profilePage.indexOf('export async function fetchHostListings'),
    profilePage.indexOf('export async function fetchProfileCategories')
  );
  assert.match(profileListings, /\.eq\('host_id', hostId\)/);
  assert.match(profileListings, /if \(!owner\) query = query\.eq\('moderation_status', 'active'\)\.eq\('availability_status', 'available'\)/);
  assert.match(profileLabels, /value === 'draft'\) return \{ label: 'Draft'/);

  assert.match(publicHostProfile, /loadHostListings\(client, viewerId, hostId, false\)/, 'the public page reads only active, available listings');
  assert.match(hostProfileView, /const isOwner = Boolean\(viewerId && hostId && viewerId === hostId\)/);
  assert.match(hostProfileView, /loadHostListings\(client, viewerId, hostId, isOwner\)/, 'visitors read only active, available listings; the owner reads all');
  assert.match(hostListingControls, /\{ status: 'draft', label: 'Save as draft' \}/);

  assert.match(listingRoutes, /const STATUSES = new Set\(\['available', 'booked', 'unavailable', 'paused', 'draft'\]\)/);
  assert.match(draftStatusMigration, /availability_status in \('available', 'booked', 'unavailable', 'paused', 'draft'\)/);
  const statusRoute = listingRoutes.slice(
    listingRoutes.indexOf("router.patch('/listings/:id/status'"),
    listingRoutes.indexOf("// This is intentionally separate", listingRoutes.indexOf("router.patch('/listings/:id/status'"))
  );
  assert.match(statusRoute, /\.update\(changes\)/);
  assert.match(statusRoute, /publication_state = 'published'|publication_state: 'published'/);
  assert.doesNotMatch(statusRoute, /\.delete\(/);
  const ownershipCheck = listingRoutes.slice(
    listingRoutes.indexOf('async function ownedListing'),
    listingRoutes.indexOf("router.patch('/listings/:id/status'")
  );
  assert.match(ownershipCheck, /\.eq\('id', id\)[\s\S]*if \(data\.host_id !== userId\)/);
});

test('server activation keeps subscription limits and verified listing-payment entitlement checks', () => {
  assert.match(activationMigration, /paid_listing_until is not null and v_listing\.paid_listing_until > now\(\)/i);
  assert.match(activationMigration, /hs\.status = 'active'/);
  assert.match(activationMigration, /hs\.current_period_end is null or hs\.current_period_end > now\(\)/i);
  assert.match(activationMigration, /pg_advisory_xact_lock/);
  assert.match(activationMigration, /max_active_listings/);
  assert.match(activationMigration, /LISTING_LIMIT_REACHED/);
  assert.match(listingRoutes, /activate_listing_with_entitlement/);
  assert.match(allowanceTransitionMigration, /listing_allowance_limit/);
  assert.match(allowanceTransitionMigration, /pg_advisory_xact_lock/);
  assert.match(allowanceTransitionMigration, /v_subscription.listing_allowance_limit/);
  assert.match(allowanceTransitionMigration, /billing_payments_checkout_reservation_idx/);
  assert.match(allowanceTransitionMigration, /checkout_reservation/);
});

test('video finalization claim is scoped and deletion cannot remove a processing video', () => {
  assert.match(finalizationMigration, /for key share/i);
  assert.match(finalizationMigration, /id = p_media_id[\s\S]*property_id = p_property_id[\s\S]*host_id = p_host_id[\s\S]*upload_id = p_upload_id/i);
  assert.match(finalizationMigration, /status in \('pending', 'uploading'\)/);
  assert.match(finalizationMigration, /old\.media_type = 'video' and old\.status = 'processing'/i);
  assert.match(finalizationMigration, /using errcode = '55000'/i);
});
