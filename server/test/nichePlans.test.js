'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createBillingRoutes, normalizeRequestedPlan, billingNicheFor } = require('../routes/billingRoutes');
const { getHostEntitlements } = require('../lib/billingEntitlement');

const NICHE_PLAN_IDS = [
  'airbnb_starter', 'airbnb_pro', 'airbnb_business',
  'hotel_dining', 'hotel_boutique', 'hotel_standard', 'hotel_plus',
  'venue_basic', 'venue_pro', 'venue_premium',
];

test('Airbnb, Hotel and Venue hosts get their own billing niche; others are unchanged', () => {
  assert.equal(billingNicheFor('airbnb'), 'airbnb');
  assert.equal(billingNicheFor('hotel'), 'hotel');
  assert.equal(billingNicheFor('venue'), 'venue');
  assert.equal(billingNicheFor('property'), 'property');
  assert.equal(billingNicheFor('shop'), 'shops_offices');
  assert.equal(billingNicheFor('office'), 'shops_offices');
  assert.equal(billingNicheFor(null), 'legacy');
  assert.equal(billingNicheFor('unknown'), 'legacy');
});

test('checkout accepts every niche plan id', () => {
  for (const id of NICHE_PLAN_IDS) assert.equal(normalizeRequestedPlan(id), id);
});

// A checkout route over a fake Supabase: the host's niche, the requested plan
// and the host's current subscription.
function checkoutHarness({ hostNiche, targetPlan, existing = null }) {
  const calls = { insertedPayment: null, initialized: null, listingLookups: 0 };
  const supabase = {
    auth: { getUser: async () => ({ data: { user: { id: 'host-1', email: 'host@example.test' } }, error: null }) },
    from(table) {
      const query = {
        selected: null,
        select(columns) { this.selected = columns; return this; },
        eq() { return this; }, in() { return this; }, is() { return this; },
        order() { return this; }, limit() { return this; },
        maybeSingle: async () => {
          if (table === 'profiles' && query.selected === 'role') return { data: { role: 'host' }, error: null };
          if (table === 'profiles') return { data: { listing_categories: [hostNiche] }, error: null };
          if (table === 'billing_plans') return { data: targetPlan, error: null };
          if (table === 'host_subscriptions') return { data: existing, error: null };
          if (table === 'listings') { calls.listingLookups += 1; return { data: null, error: null }; }
          return { data: null, error: null };
        },
        single: async () => ({ data: { id: 'new-sub' }, error: null }),
        async then(resolve) { return resolve({ count: 0, error: null }); },
        insert(value) {
          if (table === 'billing_payments') { calls.insertedPayment = value; return Promise.resolve({ error: null }); }
          return { select: () => ({ single: async () => ({ data: { id: 'new-sub' }, error: null }) }) };
        },
        update() { return { eq: async () => ({ error: null }) }; },
      };
      return query;
    },
  };
  const router = createBillingRoutes({
    supabaseAdmin: supabase,
    baseUrl: 'https://varoom.co.ke',
    nodeEnv: 'production',
    paystack: {
      generateReference: () => 'niche-reference',
      initializeTransaction: async (payload) => { calls.initialized = payload; return { authorization_url: 'https://checkout.paystack.test/' }; },
    },
  });
  const route = router.stack.find((layer) => layer.route && layer.route.path === '/billing/checkout');
  const run = async (body) => {
    const response = { code: null, body: null, status(code) { this.code = code; return this; }, json(value) { this.body = value; return this; } };
    await route.route.stack[0].handle({ headers: { authorization: 'Bearer host-token' }, body }, response);
    return response;
  };
  return { run, calls };
}

const hotelPlan = (id, amount) => ({
  id, active: true, niche: 'hotel', monthly_amount_minor: amount, currency: 'KES', billing_interval: 'monthly',
  paystack_plan_code: `PLN_${id}`, features: { video_listings: true },
});

test('a hotel host subscribes to a hotel plan with the server price and niche', async () => {
  const { run, calls } = checkoutHarness({ hostNiche: 'hotel', targetPlan: hotelPlan('hotel_boutique', 400000) });
  const response = await run({ plan: 'hotel_boutique' });
  assert.equal(response.code, 201);
  assert.equal(calls.initialized.amount, 400000);
  assert.equal(calls.initialized.metadata.niche, 'hotel');
  assert.equal(calls.insertedPayment.niche, 'hotel');
  assert.equal(calls.insertedPayment.provider_payload.listing_allowance_transition.limit, null, 'no publishing cap');
});

test('a host cannot buy another niche\'s plan', async () => {
  const { run } = checkoutHarness({ hostNiche: 'airbnb', targetPlan: hotelPlan('hotel_boutique', 400000) });
  const response = await run({ plan: 'hotel_boutique' });
  assert.equal(response.code, 403);
});

test('a pending listing id is ignored for feature-only niche plans', async () => {
  const { run, calls } = checkoutHarness({ hostNiche: 'hotel', targetPlan: hotelPlan('hotel_boutique', 400000) });
  const response = await run({ plan: 'hotel_boutique', listing_id: '6f1c2f8e-6a4b-4c5d-9e2f-1a2b3c4d5e6f' });
  assert.equal(response.code, 201);
  assert.equal(calls.listingLookups, 0);
  assert.equal(calls.initialized.metadata.listing_id, undefined);
});

const activeSubscription = (planId, niche, amount) => ({
  id: 'sub-1', plan_id: planId, status: 'active', niche, listing_allowance_limit: null,
  provider_subscription_code: 'SUB_OLD', provider_email_token: 'token',
  billing_plans: { monthly_amount_minor: amount, features: {}, niche },
});

test('a legacy hotel subscriber can move onto a hotel plan, replacing the old subscription', async () => {
  const { run, calls } = checkoutHarness({
    hostNiche: 'hotel', targetPlan: hotelPlan('hotel_dining', 200000), existing: activeSubscription('growth', 'legacy', 130000),
  });
  const response = await run({ plan: 'hotel_dining' });
  assert.equal(response.code, 201);
  assert.equal(calls.insertedPayment.subscription_id, 'sub-1');
  assert.equal(calls.insertedPayment.provider_payload.replaces_subscription.code, 'SUB_OLD');
});

test('niche plan upgrades must move to a higher price; same or lower is refused', async () => {
  const up = checkoutHarness({
    hostNiche: 'hotel', targetPlan: hotelPlan('hotel_plus', 1500000), existing: activeSubscription('hotel_standard', 'hotel', 800000),
  });
  assert.equal((await up.run({ plan: 'hotel_plus' })).code, 201);
  const down = checkoutHarness({
    hostNiche: 'hotel', targetPlan: hotelPlan('hotel_boutique', 400000), existing: activeSubscription('hotel_standard', 'hotel', 800000),
  });
  const refused = await down.run({ plan: 'hotel_boutique' });
  assert.equal(refused.code, 409);
  assert.equal(refused.body.error, 'Choose a higher plan to upgrade.');
});

function entitlementSupabase(subscription) {
  const query = {
    select() { return query; }, eq() { return query; }, in() { return query; }, order() { return query; }, limit() { return query; },
    async maybeSingle() { return { data: subscription, error: null }; },
  };
  return { from() { return query; } };
}

test('niche plan features grant video and Elie; no listing cap is set', async () => {
  const starter = await getHostEntitlements(entitlementSupabase({
    id: 's1', plan_id: 'airbnb_starter', status: 'active', billing_plans: { features: { included_listings: 2 } },
  }), 'host-1');
  assert.equal(starter.canUploadPremiumVideo, false);
  assert.equal(starter.hasPro, false);
  assert.equal(starter.canCreateAnotherListing.limit, null);
  const business = await getHostEntitlements(entitlementSupabase({
    id: 's2', plan_id: 'airbnb_business', status: 'active',
    billing_plans: { features: { included_listings: 15, video_listings: true, elie: true, landing_page_promotion: true } },
  }), 'host-1');
  assert.equal(business.canUploadPremiumVideo, true);
  assert.equal(business.hasGrowth, true);
  assert.equal(business.hasPro, true);
  assert.equal(business.canPromoteLandingPage, true);
  assert.equal(business.canCreateAnotherListing.limit, null);
});
