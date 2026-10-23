'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const listingPage = fs.readFileSync(path.join(__dirname, '..', '..', 'client', 'legacy-pages', 'list.html'), 'utf8');
const pricingPage = fs.readFileSync(path.join(__dirname, '..', '..', 'client', 'legacy-pages', 'pricing.html'), 'utf8');
const listingEntitlementMigration = fs.readFileSync(path.join(__dirname, '..', 'migrations', '20261011_000036_listing_entitlement_activation.sql'), 'utf8');

test('review payment actions are non-submit buttons with independent handlers', () => {
  assert.match(listingPage, /\.submit-row \[hidden\]\{ display:none !important; \}/);
  assert.match(listingPage, /<button type="button" class="pay-to-list-btn" id="pay-to-list-btn"/);
  assert.match(listingPage, /<button type="button" class="submit-btn" id="go-pro-btn"/);
  assert.match(listingPage, /<button type="submit" class="submit-btn" id="submit-btn"/);

  const goProStart = listingPage.indexOf("document.getElementById('go-pro-btn').addEventListener('click'");
  assert.notEqual(goProStart, -1);
  const goProHandler = listingPage.slice(goProStart, listingPage.indexOf('</script>', goProStart));
  assert.match(goProHandler, /window\.location\.assign\('\/pricing\?/);
  assert.doesNotMatch(goProHandler, /requestSubmit|\/api\/listings|listing-checkout|uploadVideoToR2/);

  const payClickStart = listingPage.indexOf("document.getElementById('pay-to-list-btn').addEventListener");
  const payClickEnd = listingPage.indexOf("document.getElementById('go-pro-btn').addEventListener", payClickStart);
  const payClickHandler = listingPage.slice(payClickStart, payClickEnd);
  assert.match(payClickHandler, /startPayToListFlow\(\)/);
  assert.doesNotMatch(payClickHandler, /requestSubmit|\/pricing/);
});

test('one-time checkout uses same-tab navigation and reveals Publish Listing only after server verification', () => {
  const flowStart = listingPage.indexOf('async function startPayToListFlow()');
  const flowEnd = listingPage.indexOf("document.getElementById('pay-to-list-btn').addEventListener", flowStart);
  const flow = listingPage.slice(flowStart, flowEnd);

  assert.match(flow, /\/api\/billing\/listing-checkout/);
  assert.match(listingPage, /payment_draft: true/);
  assert.doesNotMatch(flow, /uploadVideoToR2|storage\.from\('listing-photos'\)\.upload/);
  assert.match(flow, /paymentFlowInProgress \|\| publishInProgress/);
  assert.match(flow, /window\.location\.assign\(checkout\.authorization_url\)/);
  assert.doesNotMatch(flow, /window\.open|checkoutWindow|requestSubmit\(\)/,
    'checkout must not use a popup or submit the listing automatically');
  assert.match(listingPage, /async function verifyReturnedListingPayment/);
  assert.match(listingPage, /payment\.payment_kind === 'listing' && payment\.listing_id/);
  assert.match(listingPage, /listingPaymentVerified = true/);
  assert.match(listingPage, /checkingAuth\.textContent = 'Confirming your payment\.\.\.'/);
  assert.match(listingPage, /Payment confirmed\. Review your listing, then select Publish Listing/);
  assert.doesNotMatch(listingPage, /window\.location\.replace\('\/list\?edit=/,
    'a verified listing payment must return to the restored review page, not edit mode');
});

test('listing video client matches server duration validation and uses the proxied completion route', () => {
  assert.match(listingPage, /durationSeconds > 60\).*Videos must be 60 seconds or less/);
  assert.match(listingPage, /\/api\/properties\/'\s*\+\s*encodeURIComponent\(listingId\)\s*\+\s*'\/videos\/'\s*\+\s*encodeURIComponent\(mediaId\)\s*\+\s*'\/complete/);
  assert.match(listingPage, /body: JSON\.stringify\(\{ uploadId: initPayload\.uploadId \}\)/);
});

test('Go Pro checkpoints host-scoped state before subscription checkout and restores the verified listing return', () => {
  const goProStart = listingPage.indexOf("document.getElementById('go-pro-btn').addEventListener");
  const goProHandler = listingPage.slice(goProStart, listingPage.indexOf('</script>', goProStart));
  assert.ok(goProHandler.indexOf('persistBeforeCheckout(session, { saveProfileDraft: true })') < goProHandler.indexOf("window.location.assign('/pricing?"));
  assert.match(listingPage, /mediaFiles: selectedFiles\.slice\(\)/);
  assert.match(listingPage, /policyFile: null/);
  assert.match(listingPage, /uploadedDocumentRefs: listingUploadedDocumentRefs/);
  assert.match(listingPage, /await listingDraftCache\.load\(cacheKey\)/);
  assert.match(listingPage, /!Number\.isFinite\(snapshot\.createdAt\)/);
  assert.match(listingPage, /preparedPaymentListingId = serverDraft\.listing_id \|\| null/);
  assert.doesNotMatch(listingPage, /preparedPaymentListingId = preparedPaymentListingId \|\| pointer\.listingId/);
  assert.match(listingPage, /requestedDraftId \|\| listingRecoveryReturnReference/);
  assert.match(listingPage, /method: existingSubmissionListingId \? 'PATCH' : 'POST'/);
  assert.match(listingPage, /await listingDraftCache\.clearForHost\(currentUser\.id\)/);
  assert.match(pricingPage, /pointer\.listingId/);
  assert.match(pricingPage, /window\.location\.replace\('\/list\?subscription=return&reference=' \+ encodeURIComponent\(paymentReference\)\)/);
  assert.match(pricingPage, /paymentReference && payment && payment\.status === 'succeeded'/);
  assert.match(listingPage, /Your private draft and uploaded media are preserved/);
});

test('pricing callback verifies the returned reference and marks only the purchased active plan current', () => {
  assert.match(pricingPage, /returnParams\.get\('reference'\) \|\| returnParams\.get\('trxref'\)/);
  assert.ok(pricingPage.includes("fetch('/api/billing/payments/' + encodeURIComponent(paymentReference)"));
  assert.match(pricingPage, /payment\.status === 'succeeded'/);
  assert.match(pricingPage, /entitlements\.active && subscription && subscription\.status === 'active'/);
  assert.match(pricingPage, /subscription\.plan_id === payment\.plan_id/);
  assert.match(pricingPage, /currentPlanButton\.textContent = 'Current Plan'/);
});

test('review publication requires an active matching entitlement and preserves pay and upgrade actions otherwise', () => {
  assert.match(listingPage, /entitlement\.subscription\.status === 'active'/);
  assert.match(listingPage, /entitlement\.subscription\.niche === expectedNiche/);
  assert.match(listingPage, /listingAllowance && listingAllowance\.allowed/);
  assert.match(listingPage, /if \(!entitlementResponse\.ok\) throw new Error\('Unable to confirm your listing allowance'\)/);
  assert.match(listingPage, /else if \(needsListingPayment\)[\s\S]*Unable to confirm your listing allowance/);
  assert.match(listingPage, /document\.getElementById\('pay-to-list-btn'\)\.hidden = false/);
  assert.match(listingPage, /document\.getElementById\('go-pro-btn'\)\.hidden = false/);
  assert.match(listingPage, /document\.getElementById\('submit-btn'\)\.hidden = false/);
  assert.match(listingPage, /id="submit-btn">Publish Listing/);
  assert.match(listingPage, /window\.location\.assign\('\/pricing\?/);
  assert.match(listingPage, /\/api\/billing\/listing-checkout/);
  assert.match(listingEntitlementMigration, /hs\.status = 'active'/);
  assert.match(listingEntitlementMigration, /if v_active_count >= v_limit then/);
});
