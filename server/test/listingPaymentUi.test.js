'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// The native listing wizard (legacy list.html is retired).
const clientFile = (file) => fs.readFileSync(path.join(__dirname, '..', '..', 'client', file), 'utf8');
const listingPage = clientFile('pages/list.tsx') + clientFile('lib/listWizard/startup.ts');
const wizardApi = clientFile('lib/listWizard/api.ts');
const wizardDrafts = clientFile('lib/listWizard/drafts.ts');
const wizardStyles = clientFile('components/listWizard/listWizardStyles.ts');
const between = (source, start, end) => source.slice(source.indexOf(start), source.indexOf(end, source.indexOf(start)));
// The native pricing page and its billing module (legacy pricing.html is retired).
const pricingPage = ['pages/pricing.tsx', 'lib/billing/pricing.ts'].map(clientFile).join('\n');
const listingEntitlementMigration = fs.readFileSync(path.join(__dirname, '..', 'migrations', '20261011_000036_listing_entitlement_activation.sql'), 'utf8');

test('review payment actions are non-submit buttons with independent handlers', () => {
  assert.match(wizardStyles, /\.submit-row \[hidden\]\{ display:none !important; \}/);
  assert.match(listingPage, /<button type="button" className="pay-to-list-btn" id="pay-to-list-btn"/);
  assert.match(listingPage, /<button type="button" className="submit-btn" id="go-pro-btn"/);
  assert.match(listingPage, /<button type="submit" className="submit-btn" id="submit-btn"/);
  assert.match(listingPage, /id="pay-to-list-btn"[^\n]*onClick=\{\(event\) => \{ event\.preventDefault\(\); void payToList\(\); \}\}/);
  assert.match(listingPage, /id="go-pro-btn"[^\n]*onClick=\{\(event\) => \{ event\.preventDefault\(\); void goPro\(\); \}\}/);

  const goPro = between(listingPage, 'const goPro = async', '// ---------- Publish');
  assert.match(goPro, /router\.push\(`\/pricing\?niche=/);
  assert.doesNotMatch(goPro, /requestSubmit|saveListing\(|startListingCheckout|uploadListingVideo/);
  const payFlow = between(listingPage, 'const payToList = async', 'const goPro = async');
  assert.doesNotMatch(payFlow, /requestSubmit|\/pricing/);
});

test('one-time checkout uses same-tab navigation and reveals Publish Listing only after server verification', () => {
  const flow = between(listingPage, 'const payToList = async', 'const goPro = async');
  assert.match(wizardApi, /\/api\/billing\/listing-checkout/);
  assert.match(wizardApi, /payment_draft: true/);
  assert.doesNotMatch(flow, /uploadListingVideo|uploadListingPhoto/);
  assert.match(flow, /if \(paying\.current \|\| publishing\.current\) return/);
  assert.match(flow, /window\.location\.assign\(url\)/);
  assert.doesNotMatch(flow, /window\.open|checkoutWindow|requestSubmit\(\)/,
    'checkout must not use a popup or submit the listing automatically');
  assert.match(wizardApi, /export async function verifyReturnedPayment/);
  assert.match(listingPage, /payment\.payment_kind === 'listing' && payment\.listing_id\) \{/);
  assert.match(listingPage, /flags\.paymentVerified = true/);
  assert.match(listingPage, /deps\.onChecking\('Confirming your payment\.\.\.'\)/);
  assert.match(listingPage, /Payment confirmed\. Review your listing, then select Publish Listing/);
  assert.doesNotMatch(listingPage, /\/list\?edit=/,
    'a verified listing payment must return to the restored review page, not edit mode');
});

test('a signed-out payment check stops instead of polling for a minute', () => {
  const verify = between(wizardApi, 'export async function verifyReturnedPayment', '\n}\n');
  assert.match(verify, /if \(response\.status === 401 \|\| response\.status === 403\) throw new Error\(SESSION_EXPIRED_PAYMENT\)/);
  // The throw is outside the network try/catch, so it is never retried.
  assert.ok(verify.indexOf('} catch (error) {') < verify.indexOf('SESSION_EXPIRED_PAYMENT'));
});

test('listing video client matches server duration validation and uses the proxied completion route', () => {
  assert.match(wizardApi, /if \(durationSeconds > 60\) throw new Error\('Videos must be 60 seconds or less\.'\)/);
  assert.match(wizardApi, /const base = `\/api\/properties\/\$\{encodeURIComponent\(listingId\)\}\/videos`/);
  assert.match(wizardApi, /fetch\(`\$\{base\}\/\$\{encodeURIComponent\(mediaId\)\}\/complete`/);
  assert.match(wizardApi, /body: JSON\.stringify\(\{ uploadId: init\.uploadId \}\)/);
});

test('Go Pro checkpoints host-scoped state before subscription checkout and restores the verified listing return', () => {
  const goPro = between(listingPage, 'const goPro = async', '// ---------- Publish');
  assert.ok(goPro.indexOf('await persistBeforeCheckout(accessToken, true)') < goPro.indexOf('router.push(`/pricing?'));
  assert.match(wizardDrafts, /mediaFiles: media\.mediaFiles\.slice\(\)/);
  assert.match(wizardDrafts, /policyFile: null/);
  assert.match(wizardDrafts, /uploadedDocumentRefs: media\.documentRefs/);
  assert.match(listingPage, /snapshot = await draftCache\.load<DraftSnapshot>\(cacheKey\)/);
  assert.match(listingPage, /!Number\.isFinite\(snapshot\.createdAt\)/);
  assert.match(listingPage, /session\.listingId = remote\.listing_id \|\| null/);
  assert.match(listingPage, /params\.draft \|\| recoveryReference/);
  assert.match(wizardApi, /method: listingId \? 'PATCH' : 'POST'/);
  assert.match(listingPage, /await draftCache\.clearForHost\(userId\)/);
  assert.match(pricingPage, /pointer\.listingId/);
  assert.match(pricingPage, /\/list\?subscription=return&reference=\$\{encodeURIComponent\(reference\)\}/);
  assert.match(pricingPage, /reference && payment && payment\.status === 'succeeded'/);
  assert.match(listingPage, /Your private draft and uploaded media are preserved/);
});

test('pricing callback verifies the returned reference and marks only the purchased active plan current', () => {
  assert.match(pricingPage, /queryValue\(router\.query\.reference\) \|\| queryValue\(router\.query\.trxref\)/);
  assert.ok(pricingPage.includes('`/api/billing/payments/${encodeURIComponent(reference)}`'));
  assert.match(pricingPage, /payment\.status === 'succeeded'/);
  assert.match(pricingPage, /entitlements\.active && subscription && subscription\.status === 'active'/);
  assert.match(pricingPage, /subscription\.plan_id === payment\.plan_id/);
  assert.match(pricingPage, /\{current \? 'Current Plan' : card\.cta\}/);
});

test('review publication requires an active matching entitlement and preserves pay and upgrade actions otherwise', () => {
  assert.match(wizardApi, /entitlement\.subscription\.status === 'active'/);
  assert.match(wizardApi, /entitlement\.subscription\.niche === expectedNiche/);
  assert.match(wizardApi, /allowance && allowance\.allowed/);
  assert.match(wizardApi, /if \(!response\.ok\) throw new Error\('Unable to confirm your listing allowance'\)/);
  // A failed check shows the note and neither Publish nor Pay.
  assert.match(listingPage, /const showPay = paymentNeeded && flags\.entitlementChecked/);
  assert.match(listingPage, /hidden=\{!\(paymentNeeded && !flags\.entitlementChecked\)\}/);
  assert.match(listingPage, /Unable to confirm your listing allowance\. Refresh this page to try again before publishing or paying\./);
  assert.match(listingPage, /id="pay-to-list-btn" hidden=\{!showPay\}/);
  assert.match(listingPage, /id="go-pro-btn" hidden=\{!showPay\}/);
  assert.match(listingPage, /id="submit-btn" hidden=\{submitHidden\}/);
  assert.match(listingPage, /editMode \? 'Save changes' : 'Publish Listing'/);
  assert.match(listingPage, /router\.push\(`\/pricing\?/);
  assert.match(wizardApi, /\/api\/billing\/listing-checkout/);
  assert.match(listingEntitlementMigration, /hs\.status = 'active'/);
  assert.match(listingEntitlementMigration, /if v_active_count >= v_limit then/);
});
