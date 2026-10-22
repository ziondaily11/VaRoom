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
  assert.match(listingPage, /if \(!editMode && \(requestedDraftId \|\| listingRecoveryReturnReference\)\)/);
  assert.match(listingPage, /await restoreListingDraftAfterUpgrade\(currentUser\.id, session\.access_token, continuationDraftRecord, continuationDraftPointer, paymentCheckoutSnapshot\)/);
  assert.doesNotMatch(listingPage, /if \(!editMode\) await restoreListingDraftAfterUpgrade/);
  assert.match(listingPage, /queueListingDraftSave/);
  assert.match(listingPage, /method: 'PUT'/);
});

test('Paystack uses a verified per-listing save state and restores complete form state before draft fallbacks', () => {
  assert.match(listingPage, /async function saveListingCheckoutState\(hostId, listingId\)/);
  assert.match(listingPage, /await listingDraftCache\.save\(snapshot\);[\s\S]*await listingDraftCache\.load\(cacheKey\)/);
  assert.match(listingPage, /const cacheKey = hostId \+ ':checkout:' \+ listingId/);
  assert.match(listingPage, /hotelListingMode: hotelListingMode/);
  assert.match(listingPage, /availableDates: Array\.from\(openDates\)/);
  assert.match(listingPage, /officeShopFiles: \{ floorPlan: null, policy: null, documents: \[\] \}/);
  assert.match(listingPage, /uploadedDocumentRefs: listingUploadedDocumentRefs/);
  assert.match(listingPage, /serverRevision: listingDraftRevision/);
  assert.match(listingPage, /listingDraftCache\.save\(draft\);[\s\S]*?draft\.serverRevision = listingDraftRevision/);
  assert.match(listingPage, /!filesMatch\(persistedSnapshot\.mediaFiles, snapshot\.mediaFiles\)/);
  assert.match(listingPage, /await draftSaveQueue\.catch\(function\(\)\{\}\);[\s\S]*await listingDocumentUploadQueue;[\s\S]*await saveListingCheckoutState/);
  assert.match(listingPage, /sanitizedSnapshot\.checkoutState = snapshot\.checkoutState === true/);
  assert.match(listingPage, /async function mirrorVerifiedCheckoutDraft\(hostId, draft, serverMediaMetadata\)/);
  assert.match(listingPage, /mirrorVerifiedCheckoutDraft\(hostId, draft, result\.draft && result\.draft\.media_metadata\)/);
  assert.match(listingPage, /'fields','controls','propertyPurpose','propertySalePriceMode','hotelListingMode','availableDates','currentStep','furthestStep','amenities','officeShopAmenitySelections','officeShopPermittedUses','officeShopCharges','uploadedDocumentRefs','documentSelections'[\s\S]*JSON\.stringify\(persistedSnapshot\[key\][\s\S]*JSON\.stringify\(snapshot\[key\]/);
  assert.match(listingPage, /documentSelections: \{[\s\S]*officeShop: officeDocumentSelections/);

  const payFlowStart = listingPage.indexOf('async function startPayToListFlow()');
  const payFlowEnd = listingPage.indexOf("document.getElementById('pay-to-list-btn').addEventListener", payFlowStart);
  const payFlow = listingPage.slice(payFlowStart, payFlowEnd);
  assert.ok(payFlow.indexOf('await persistBeforeCheckout(session)') < payFlow.indexOf("fetch('/api/billing/listing-checkout'"));
  const checkoutStart = listingPage.indexOf('async function persistBeforeCheckout(session, options)');
  const checkoutEnd = listingPage.indexOf('async function verifyReturnedListingPayment', checkoutStart);
  const checkoutFlow = listingPage.slice(checkoutStart, checkoutEnd);
  assert.ok(checkoutFlow.indexOf('await saveListingCheckoutState(session.user.id, listingId)') < checkoutFlow.indexOf('await saveListingDraft(session.user.id, listingId)'));
  assert.match(checkoutFlow, /if \(listingDraftRevisionConflict\)[\s\S]*A newer copy of this listing exists in My Profile/);
  assert.match(checkoutFlow, /if \(listingDraftRemoteSaveUnavailable\)[\s\S]*Profile sync will resume when connected/);
  assert.match(payFlow, /checkoutRedirectStarted = true/);
  assert.match(listingPage, /listingCheckoutHandoffInProgress\) return/);
  assert.match(listingPage, /const checkoutHandoff = !\(options && options\.saveProfileDraft\)/);

  assert.match(listingPage, /getListingCheckoutStatePointer\(currentUser\.id, payment\.listing_id\)/);
  assert.match(listingPage, /cachedCheckout\.listingId === payment\.listing_id/);
  assert.match(listingPage, /restoreListingDraftAfterUpgrade\(currentUser\.id, session\.access_token, continuationDraftRecord, continuationDraftPointer, paymentCheckoutSnapshot\)/);
  assert.match(listingPage, /applyHotelMode\(snapshot\.hotelListingMode\)/);
  assert.match(listingPage, /openDates\.clear\(\);[\s\S]*snapshot\.availableDates\.forEach/);
  assert.match(listingPage, /listingSubscriptionReturnReference/);
  assert.match(listingPage, /payment\.niche === \(hostNiche === 'property' \? 'property' : 'shops_offices'\)/);
  assert.match(listingPage, /Your plan is active\. Your saved listing has been restored for review and publishing\./);
  const subscriptionReturn = fs.readFileSync(path.join(root, 'client', 'legacy-pages', 'pricing.html'), 'utf8');
  assert.match(subscriptionReturn, /subscription=return&reference=' \+ encodeURIComponent\(paymentReference\)/);
});

test('My Profile displays private saved drafts and Continue Listing opens their explicit draft id', () => {
  assert.match(profilePage, /fetch\('\/api\/listing-drafts'/);
  assert.match(profilePage, /savedListingDrafts\.filter\(function\(draft\)\{ return !draft\.listing_id; \}\)/);
  assert.match(profilePage, /\/list\?draft=/);
  assert.match(profilePage, /Continue Listing →/);
});

test('edit mode restores private document references before the next save', () => {
  assert.match(listingPage, /fetch\('\/api\/listings\/' \+ encodeURIComponent\(id\) \+ '\/documents'/);
  assert.match(listingPage, /listingUploadedDocumentRefs\[item\.documentType\]\.push\(\{[\s\S]*id: item\.id/);
  assert.match(listingPage, /officeDocuments\.floor_plan_document_id = floorPlan\[floorPlan\.length - 1\]\.id/);
  assert.match(listingPage, /officeDocuments\.policy_document_id = commercialPolicy\[commercialPolicy\.length - 1\]\.id/);
  assert.match(listingPage, /officeDocuments\.management_document_ids = ownershipDocuments\.map/);
  assert.match(listingPage, /hydrateOfficeShopDetails\(details\.office_shop_details \|\| \{\}\)/);
  assert.match(listingPage, /Unable to restore listing documents\. Please try again before saving\./);
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

test('the paid listing is edited through the authenticated API and the leave dialog separates discard confirmation', () => {
  const submitStart = listingPage.indexOf("document.getElementById('list-form').addEventListener('submit'");
  const submitEnd = listingPage.indexOf("document.getElementById('pay-to-list-btn').addEventListener", submitStart);
  const submitFlow = listingPage.slice(submitStart, submitEnd);
  assert.match(submitFlow, /const existingSubmissionListingId = editMode \? editListingId : preparedPaymentListingId/);
  assert.match(submitFlow, /fetch\(existingSubmissionListingId \? '\/api\/listings\/' \+ encodeURIComponent\(existingSubmissionListingId\) : '\/api\/listings'/);
  assert.match(submitFlow, /booking_details: detailsPatch/);
  assert.doesNotMatch(submitFlow, /supabaseClient\.from\(['"]listing_booking_details['"]\)\.insert/);
  assert.match(listingPage, /dialog\.innerHTML = '<div class="listing-leave-card"><h2 id="listing-leave-title">Leave this listing\?<\/h2><p class="listing-leave-copy">Save your progress as a draft, or discard your changes\.<\/p>/);
  assert.match(listingPage, /data-leave-action="confirm-discard"/);
  assert.doesNotMatch(listingPage, /window\.confirm\(/);
  assert.match(listingPage, /clearListingCheckoutState\(currentUser\.id, preparedPaymentListingId\)/);
});

test('the price-unit migration admits every unit validated by the listing API without running SQL', () => {
  const priceUnitMigration = fs.readFileSync(path.join(__dirname, '..', 'migrations', '20261022_000046_listing_booking_price_units.sql'), 'utf8');
  for (const unit of ['hour', 'day', 'week', 'night', 'month', 'year', 'sq_ft', 'm2', 'desk', 'turnover']) {
    assert.match(priceUnitMigration, new RegExp(`'${unit}'`));
  }
  assert.match(priceUnitMigration, /drop constraint if exists listing_booking_details_price_unit_check/i);
  assert.match(listingRoutes, /enumValue\(value, key, \['hour', 'day', 'week', 'night', 'month', 'year', 'sq_ft', 'm2', 'desk', 'turnover'\]\)/);
});

