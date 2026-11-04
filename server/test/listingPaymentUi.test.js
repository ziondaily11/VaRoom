'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// The native listing wizard's review buttons, Pay to list, Go Pro, payment
// verification and entitlement checks are tested in
// client/test/list-wizard-flows.test.js, list-wizard-startup.test.js and
// list-wizard-page.test.js. These checks pin the pricing return and the
// server's entitlement rule.
const clientFile = (file) => fs.readFileSync(path.join(__dirname, '..', '..', 'client', file), 'utf8');
// The native pricing page and its billing module (legacy pricing.html is retired).
const pricingPage = ['pages/pricing.tsx', 'lib/billing/pricing.ts'].map(clientFile).join('\n');
const listingEntitlementMigration = fs.readFileSync(path.join(__dirname, '..', 'migrations', '20261011_000036_listing_entitlement_activation.sql'), 'utf8');

test('Go Pro returns from pricing to the listing it saved, only after a verified payment', () => {
  assert.match(pricingPage, /pointer\.listingId/);
  assert.match(pricingPage, /\/list\?subscription=return&reference=\$\{encodeURIComponent\(reference\)\}/);
  assert.match(pricingPage, /reference && payment && payment\.status === 'succeeded'/);
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
