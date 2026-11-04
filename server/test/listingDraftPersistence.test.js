'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..', '..');
// The native listing wizard (legacy list.html is retired). Its behaviour is
// covered by client/test/list-wizard-*.test.js; these checks pin the flows
// the server depends on.
const wizardFile = (file) => fs.readFileSync(path.join(root, 'client', file), 'utf8');
const listingPage = wizardFile('pages/list.tsx') + wizardFile('lib/listWizard/startup.ts');
const wizardSession = wizardFile('lib/listWizard/wizardSession.ts');
const wizardDrafts = wizardFile('lib/listWizard/drafts.ts');
const wizardApi = wizardFile('lib/listWizard/api.ts');
const wizardPublish = wizardFile('lib/listWizard/publish.ts');
const leaveDialog = wizardFile('components/listWizard/LeaveDialog.tsx');
const wizardStyles = wizardFile('components/listWizard/listWizardStyles.ts');
const between = (source, start, end) => source.slice(source.indexOf(start), source.indexOf(end, source.indexOf(start)));
// The native profile (legacy profile.html is retired).
const profilePage = ['lib/profile/hostProfile.ts', 'pages/profile.tsx', 'components/profile/HostListings.tsx']
  .map((file) => fs.readFileSync(path.join(root, 'client', file), 'utf8')).join('\n');
const listingRoutes = fs.readFileSync(path.join(root, 'server', 'routes', 'listingRoutes.js'), 'utf8');
const migration = fs.readFileSync(path.join(__dirname, '..', 'migrations', '20261021_000044_private_listing_drafts_and_publication_rls.sql'), 'utf8');

test('a fresh listing session does not read or restore the previous host draft pointer', () => {
  // Only ?draft= (Continue Listing) or a Paystack return restores anything.
  assert.match(listingPage, /if \(!params\.edit && \(params\.draft \|\| recoveryReference\)\) \{\s+continuationPointer = /);
  assert.match(listingPage, /if \(!params\.edit && \(params\.draft \|\| recoveryReference\)\) \{\s+const restored = await restoreDraft\(/);
  assert.equal((listingPage.match(/await restoreDraft\(/g) || []).length, 1);
  assert.match(wizardSession, /queueSave\(\): void/);
  assert.match(wizardApi, /method: 'PUT'/);
});

test('Paystack uses a verified per-listing save state and restores complete form state before draft fallbacks', () => {
  assert.match(wizardSession, /async saveCheckoutState\(listingId: string\)/);
  assert.match(wizardSession, /await cache\.save\(snapshot\);\s*const saved = await cache\.load<DraftSnapshot>\(cacheKey\);\s*if \(!checkoutSnapshotMatches\(saved, snapshot\)\)/);
  assert.match(wizardSession, /const cacheKey = `\$\{this\.hostId\}:checkout:\$\{listingId\}`/);
  assert.match(wizardDrafts, /hotelListingMode: form\.hotelListingMode/);
  assert.match(wizardDrafts, /availableDates: form\.availableDates\.slice\(\)/);
  assert.match(wizardDrafts, /officeShopFiles: \{ floorPlan: null, policy: null, documents: \[\] \}/);
  assert.match(wizardDrafts, /uploadedDocumentRefs: media\.documentRefs/);
  assert.match(wizardDrafts, /serverRevision: identity\.serverRevision/);
  assert.match(wizardSession, /draft\.serverRevision = this\.revision;[\s\S]*?await cache\.save\(draft\)/);
  assert.match(wizardDrafts, /!sameFiles\(saved\.mediaFiles, source\.mediaFiles\)/);
  assert.match(wizardDrafts, /const FORM_DATA_KEYS = \['fields', 'controls', 'propertyPurpose', 'propertySalePriceMode', 'hotelListingMode', 'availableDates', 'currentStep', 'furthestStep', 'amenities',\s*'officeShopAmenitySelections', 'officeShopPermittedUses', 'officeShopCharges', 'uploadedDocumentRefs', 'documentSelections'\]/);
  assert.match(wizardDrafts, /FORM_DATA_KEYS\.some\(\(key\) => json\(saved\[key\]\) !== json\(source\[key\]\)\)/);
  assert.match(wizardDrafts, /documentSelections: \{[\s\S]*officeShop: \{/);
  assert.match(listingPage, /sanitized\.checkoutState = snapshot\.checkoutState === true/);
  assert.match(wizardSession, /private async mirrorVerifiedCheckout\(draft: DraftSnapshot, serverMediaMetadata\?/);
  assert.match(wizardSession, /mirrorVerifiedCheckout\(draft, outcome\.mediaMetadata\)/);

  const payFlow = between(listingPage, 'const payToList = async', 'const goPro = async');
  assert.ok(payFlow.indexOf('await persistBeforeCheckout(accessToken, false)') < payFlow.indexOf('await startListingCheckout('));
  const checkoutFlow = between(listingPage, 'const persistBeforeCheckout = useCallback', '// ---------- Startup');
  assert.ok(checkoutFlow.indexOf('await current.settled()') < checkoutFlow.indexOf('await current.documentQueue'));
  assert.ok(checkoutFlow.indexOf('await current.documentQueue') < checkoutFlow.indexOf('await current.saveCheckoutState(listingId)'));
  assert.ok(checkoutFlow.indexOf('await current.saveCheckoutState(listingId)') < checkoutFlow.indexOf('await current.save(listingId)'));
  assert.match(wizardSession, /private writeQueue: Promise<unknown> = Promise\.resolve\(\)/);
  assert.match(wizardSession, /private async saveNow\(/);
  // A stale profile revision or an API outage never strands checkout.
  assert.match(checkoutFlow, /if \(current\.revisionConflict\)[\s\S]*will sync after this listing returns/);
  assert.match(checkoutFlow, /if \(current\.remoteUnavailable\)[\s\S]*Profile sync will resume when connected/);
  assert.match(payFlow, /redirected = true/);
  assert.match(wizardSession, /!this\.checkoutHandoff/);
  assert.match(checkoutFlow, /const handoff = !saveProfileDraft/);

  assert.match(listingPage, /session\.checkoutPointer\(payment\.listing_id\)/);
  assert.match(listingPage, /cached\.listingId === payment\.listing_id/);
  assert.match(listingPage, /await restoreDraft\(deps, niche, continuationDraft, continuationPointer, checkoutSnapshot, flags, Boolean\(recoveryReference\), Boolean\(params\.draft\)\)/);
  assert.match(wizardDrafts, /form\.hotelListingMode = snapshot\.hotelListingMode as HotelMode/);
  assert.match(wizardDrafts, /form\.availableDates = snapshot\.availableDates\.filter/);
  assert.match(listingPage, /subscriptionReturn/);
  assert.match(listingPage, /payment\.niche === planNiche\(niche\)/);
  assert.match(listingPage, /Your plan is active\. Your saved listing has been restored for review and publishing\./);
  const subscriptionReturn = fs.readFileSync(path.join(root, 'client', 'pages', 'pricing.tsx'), 'utf8');
  assert.match(subscriptionReturn, /subscription=return&reference=\$\{encodeURIComponent\(reference\)\}/);
});

test('My Profile displays private saved drafts and Continue Listing opens their explicit draft id', () => {
  assert.match(profilePage, /fetchFn\('\/api\/listing-drafts'/);
  assert.match(profilePage, /publication_state,created_at/);
  assert.match(profilePage, /rows\.filter\(\(listing\) => listing\.publication_state === 'published'\)/);
  assert.match(profilePage, /drafts\.filter\(\(draft\) => !draft\.listing_id \|\| !listed\.has\(draft\.listing_id\)\)/);
  assert.match(profilePage, /\/list\?draft=/);
  assert.match(profilePage, /Continue Listing →/);
});

test('autosave does not create a payment listing shell and checkout shell creation is single-flight', () => {
  // Only Save as draft and checkout create the shell (publish creates the listing itself).
  const autosave = between(wizardSession, 'queueSave(): void', 'saveBeforeLeaving(): void');
  assert.doesNotMatch(autosave, /ensureShell|createListingShell/);
  assert.equal((listingPage.match(/\.ensureShell\(/g) || []).length, 2);
  assert.match(wizardSession, /private shellPromise: Promise<string> \| null = null/);
  assert.match(wizardSession, /if \(!this\.shellPromise\) \{/);
  assert.match(listingPage, /params\.set\('draft', draftId\)/);
});

test('edit mode restores private document references before the next save', () => {
  assert.match(wizardApi, /fetch\(`\/api\/listings\/\$\{encodeURIComponent\(listingId\)\}\/documents`/);
  assert.match(wizardApi, /\(refs\[item\.documentType\] = refs\[item\.documentType\] \|\| \[\]\)\.push\(\{\s*id: item\.id/);
  assert.match(wizardPublish, /documents\.floor_plan_document_id = floorPlan\[floorPlan\.length - 1\]\.id/);
  assert.match(wizardPublish, /documents\.policy_document_id = policy\[policy\.length - 1\]\.id/);
  assert.match(wizardPublish, /documents\.management_document_ids = management\.map/);
  assert.match(wizardPublish, /mergeOfficeShopPatch\(form, hydrateOfficeShopDetails\(stored\)\)/);
  assert.match(wizardApi, /Unable to restore listing documents\. Please try again before saving\./);
});

test('draft API routes authenticate the host, enforce owner scoping, and persist the canonical category', () => {
  assert.match(listingRoutes, /router\.get\('\/listing-drafts'/);
  assert.match(listingRoutes, /router\.get\('\/listing-drafts\/:id'/);
  assert.match(listingRoutes, /router\.put\('\/listing-drafts\/:id'/);
  assert.match(listingRoutes, /\.eq\('host_id', user\.id\)/);
  assert.match(listingRoutes, /category,\s*form_data: req\.body\.form_data/);
  assert.match(listingRoutes, /listing\.category !== category/);
  assert.match(listingRoutes, /category = req\.body\.category === undefined \? hostNiche : enumValue\(req\.body\.category, 'category', CATEGORIES\)/);
  assert.match(wizardPublish, /category, title: text\(form\.fields, 'title'\)/);
  assert.match(wizardFile('components/listWizard/WizardFields.tsx'), /className=\{active && category === kind \? 'selected' : undefined\}/);
  assert.match(wizardStyles, /button\.selected\{ border-color:#050505; background:#050505; color:#fff; \}/);
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
  const submitFlow = between(listingPage, 'const publish = async', '// ---------- Review');
  assert.match(submitFlow, /const existingId = editMode \? editListingId : current \? current\.listingId : null/);
  assert.match(wizardApi, /fetch\(listingId \? `\/api\/listings\/\$\{encodeURIComponent\(listingId\)\}` : '\/api\/listings'/);
  assert.match(wizardApi, /body: JSON\.stringify\(\{ booking_details: details \}\)/);
  assert.doesNotMatch(submitFlow, /from\(['"]listing_booking_details['"]\)\.insert/);
  assert.match(leaveDialog, /<h2 id="listing-leave-title">Leave this listing\?<\/h2>/);
  assert.match(leaveDialog, /'Save your progress as a draft, or discard your changes\.'/);
  assert.match(leaveDialog, /data-leave-action="confirm-discard"/);
  assert.doesNotMatch(listingPage, /window\.confirm\(/);
  assert.match(listingPage, /if \(current\.listingId\) await current\.clearCheckoutState\(current\.listingId\)/);
});

test('the price-unit migration admits every unit validated by the listing API without running SQL', () => {
  const priceUnitMigration = fs.readFileSync(path.join(__dirname, '..', 'migrations', '20261022_000046_listing_booking_price_units.sql'), 'utf8');
  for (const unit of ['hour', 'day', 'week', 'night', 'month', 'year', 'sq_ft', 'm2', 'desk', 'turnover']) {
    assert.match(priceUnitMigration, new RegExp(`'${unit}'`));
  }
  assert.match(priceUnitMigration, /drop constraint if exists listing_booking_details_price_unit_check/i);
  assert.match(listingRoutes, /enumValue\(value, key, \['hour', 'day', 'week', 'night', 'month', 'year', 'sq_ft', 'm2', 'desk', 'turnover'\]\)/);
});
