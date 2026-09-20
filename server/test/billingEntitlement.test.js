'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { planAtLeast, PLAN_RANK, getHostEntitlements } = require('../lib/billingEntitlement');

test('plan ranks reflect the existing pricing-page feature hierarchy', () => {
  assert.deepEqual(PLAN_RANK, { basic: 1, growth: 2, pro: 3 });
  assert.equal(planAtLeast('growth', 'growth'), true);
  assert.equal(planAtLeast('pro', 'growth'), true);
  assert.equal(planAtLeast('basic', 'growth'), false);
});

test('unknown plans never receive entitlements', () => {
  assert.equal(planAtLeast('browser-tampered-plan', 'basic'), false);
  assert.equal(planAtLeast('pro', 'browser-tampered-plan'), false);
});

function entitlementSupabase(subscription) {
  const query = {
    select() { return query; }, eq() { return query; }, in() { return query; }, order() { return query; }, limit() { return query; },
    async maybeSingle() { return { data: subscription, error: null }; },
  };
  return { from() { return query; } };
}

test('verified Growth activates video entitlement; absent or expired subscriptions do not', async () => {
  const growth = await getHostEntitlements(entitlementSupabase({ id: 's1', plan_id: 'growth', status: 'active' }), 'host-id');
  assert.equal(growth.active, true);
  assert.equal(growth.canUploadPremiumVideo, true);
  const absent = await getHostEntitlements(entitlementSupabase(null), 'host-id');
  assert.equal(absent.active, false);
  assert.equal(absent.canUploadPremiumVideo, false);
  const expired = await getHostEntitlements(entitlementSupabase({ id: 's2', plan_id: 'pro', status: 'active', current_period_end: '2020-01-01T00:00:00.000Z' }), 'host-id');
  assert.equal(expired.active, false);
  assert.equal(expired.canUploadPremiumVideo, false);
});
