'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { applyVerifiedTransaction } = require('../lib/billingService');
const { billingHistoryEntry } = require('../routes/billingRoutes');
const { LISTING_TIERS, LISTING_TERM_DAYS, listingTierPlans } = require('../lib/listingTiers');

// Silver / Gold: the server sets the prices, a paid credit waits for a
// listing, and publishing (activate_listing_with_entitlement) uses it.

test('Silver is KES 1,000 and Gold KES 2,000, one listing each for 30 days', () => {
  assert.equal(LISTING_TIERS.silver.amount_minor, 100000);
  assert.equal(LISTING_TIERS.gold.amount_minor, 200000);
  assert.equal(LISTING_TERM_DAYS, 30);
  assert.deepEqual(listingTierPlans('shops_offices').map((plan) => [plan.id, plan.monthly_amount_minor, plan.billing_interval, plan.niche, plan.features.landing_page_promotion]), [
    ['silver', 100000, 'one_time', 'shops_offices', false],
    ['gold', 200000, 'one_time', 'shops_offices', true],
  ]);
});

/** A billing_payments row and every write the verification makes. */
function verificationSupabase(payment) {
  const writes = [];
  const chain = (table) => {
    const query = {
      select() { return query; }, eq() { return query; }, neq() { return query; }, is() { return query; }, in() { return query; },
      maybeSingle: async () => ({ data: table === 'billing_payments' ? payment : null, error: null }),
      update(value) { writes.push([table, value]); return query; },
      insert(value) { writes.push([table, value]); return query; },
      single: async () => ({ data: { id: 'n1' }, error: null }),
      then(resolve) { return resolve({ data: [{ id: payment.id, paid_at: '2026-11-22T10:00:00Z' }], error: null }); },
    };
    return query;
  };
  return { supabase: { from: chain, rpc: async () => ({ data: null, error: null }) }, writes };
}

const goldCredit = {
  id: 'pay-1', host_id: 'host-1', subscription_id: null, plan_id: null, amount_minor: 200000, currency: 'KES', status: 'initialized', paid_at: null,
  listing_id: null, listing_tier: 'gold', payment_kind: 'listing', niche: 'property', billing_interval: 'one_time', provider_payload: {},
};
const paystackSuccess = (metadata, amount = 200000) => ({
  reference: 'ref-1', status: 'success', amount, currency: 'KES', paid_at: '2026-11-22T10:00:00Z',
  metadata: { host_id: 'host-1', niche: 'property', billing_interval: 'one_time', payment_kind: 'listing', listing_tier: 'gold', varoom_billing: true, ...metadata },
});

test('a paid Gold credit is marked succeeded and touches no listing: its 30 days start on publishing', async () => {
  const { supabase, writes } = verificationSupabase(goldCredit);
  const originalError = console.error;
  console.error = () => {};
  try { await applyVerifiedTransaction(supabase, paystackSuccess({})); } finally { console.error = originalError; }
  assert.equal(writes.find(([table]) => table === 'billing_payments')[1].status, 'succeeded');
  assert.equal(writes.some(([table]) => table === 'listings'), false, 'no paid_listing_until yet');
  assert.equal(writes.some(([table]) => table === 'host_subscriptions'), false, 'not a subscription');
});

test('a credit is matched by its tier and amount; a different tier or price is refused', async () => {
  await assert.rejects(applyVerifiedTransaction(verificationSupabase(goldCredit).supabase, paystackSuccess({ listing_tier: 'silver' })), /does not match/);
  await assert.rejects(applyVerifiedTransaction(verificationSupabase(goldCredit).supabase, paystackSuccess({}, 100000)), /does not match/);
  // Once a listing has used it, a webhook retry still matches (listing_id is filled in by publishing).
  const used = verificationSupabase({ ...goldCredit, status: 'succeeded', paid_at: '2026-11-22T10:00:00Z', listing_id: 'listing-1' });
  const originalError = console.error;
  console.error = () => {};
  try { await applyVerifiedTransaction(used.supabase, paystackSuccess({})); } finally { console.error = originalError; }
  assert.equal(used.writes.some(([table]) => table === 'listings'), false);
});

test('billing history names the plan of each listing payment', () => {
  const row = (extra) => ({ id: 'p', payment_kind: 'listing', amount_minor: 200000, currency: 'KES', status: 'succeeded', created_at: 'x', provider_reference: 'r', ...extra });
  assert.equal(billingHistoryEntry(row({ listing_tier: 'gold', listings: { title: 'Kilimani 2BR' } })).description, 'Gold listing — Kilimani 2BR');
  assert.equal(billingHistoryEntry(row({ listing_tier: 'silver', listings: null })).description, 'Silver listing');
  assert.equal(billingHistoryEntry(row({ listing_tier: null, listings: { title: 'Old flat' } })).description, 'Pay as you list — Old flat', 'older payments keep their name');
});

test('the migration sells Silver / Gold per listing and keeps old subscribers until their period ends', () => {
  const sql = fs.readFileSync(path.join(__dirname, '..', 'migrations', '20261122_000078_silver_gold_listing_plans.sql'), 'utf8');
  assert.match(sql, /update public\.billing_plans set active = false, updated_at = now\(\)\s*where niche in \('property', 'shops_offices'\)/);
  // Order in activation: a running term, then an old monthly plan, then the oldest unused credit.
  const term = sql.indexOf('-- 1. A paid term still running');
  const plan = sql.indexOf('-- 2. A monthly plan bought before Silver and Gold');
  const credit = sql.indexOf("-- 3. The host's oldest unused Silver / Gold credit");
  assert.ok(term > 0 && plan > term && credit > plan);
  assert.match(sql, /for update skip locked/, 'one credit can never publish two listings');
  assert.match(sql, /listing_tier = v_credit\.listing_tier, paid_listing_until = now\(\) \+ interval '30 days'/);
  assert.match(sql, /new\.listing_tier := old\.listing_tier;\s*new\.paid_listing_until := old\.paid_listing_until;/, 'hosts cannot set their own tier or term');
  assert.match(sql, /generated always as \(case when listing_tier = 'gold' then 1 else 0 end\) stored/);
});

test('an M-Pesa charge still waiting for the PIN is pending, never failed', async () => {
  for (const status of ['pay_offline', 'send_otp', 'ongoing', 'pending', 'queued']) {
    const { supabase, writes } = verificationSupabase(goldCredit);
    const originalError = console.error;
    console.error = () => {};
    try { await applyVerifiedTransaction(supabase, { ...paystackSuccess({}), status }); } finally { console.error = originalError; }
    assert.equal(writes.find(([table]) => table === 'billing_payments')[1].status, 'pending', status);
  }
});
