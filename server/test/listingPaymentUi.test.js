'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// The native listing wizard's Silver / Gold choice, payment verification
// and entitlement checks are tested in
// client/test/list-wizard-flows.test.js, list-wizard-startup.test.js and
// list-wizard-page.test.js. These checks pin the pricing return and the
// server's entitlement rule.
const clientFile = (file) => fs.readFileSync(path.join(__dirname, '..', '..', 'client', file), 'utf8');
// The native pricing page, its plan cards and billing module (legacy pricing.html is retired).
const pricingPage = ['pages/pricing.tsx', 'components/pricing/PlanCards.tsx', 'lib/billing/pricing.ts'].map(clientFile).join('\n');
const listingEntitlementMigration = fs.readFileSync(path.join(__dirname, '..', 'migrations', '20261011_000036_listing_entitlement_activation.sql'), 'utf8');

test('Silver and Gold are bought by tier from pricing; monthly plans by plan id; neither sends a price', () => {
  assert.match(pricingPage, /card\.perListing \? startListingTierCheckout\(signedInToken\(\), card\.id as ListingTier, payment\) : startCheckout\(signedInToken\(\), card\.id\)/);
  assert.match(pricingPage, /'\/api\/billing\/listing-checkout', token, \{\s*tier, channel: payment\.channel,/);
  assert.doesNotMatch(pricingPage, /window\.location\.assign\(url\)/, 'checkout opens in VaRoom\'s window, not a full-page redirect');
  assert.match(pricingPage, /reference && payment && payment\.status === 'succeeded'/);
  assert.doesNotMatch(pricingPage, /subscription=return|returnTo|pointer\.listingId/, 'Go Pro (a monthly plan bought from the wizard) is gone');
});

test('pricing callback verifies the returned reference and marks only the purchased active plan current', () => {
  assert.match(pricingPage, /queryValue\(router\.query\.reference\) \|\| queryValue\(router\.query\.trxref\)/);
  assert.ok(pricingPage.includes('`/api/billing/payments/${encodeURIComponent(reference)}`'));
  assert.match(pricingPage, /payment\.status === 'succeeded'/);
  assert.match(pricingPage, /entitlements\.active && subscription && subscription\.status === 'active'/);
  assert.match(pricingPage, /subscription\.plan_id === payment\.plan_id/);
  assert.match(pricingPage, /\{current \? 'Current Plan' : card\.cta\}/);
});

test('the server activates a paid-niche listing only within an active plan\'s limit', () => {
  assert.match(listingEntitlementMigration, /hs\.status = 'active'/);
  assert.match(listingEntitlementMigration, /if v_active_count >= v_limit then/);
});
