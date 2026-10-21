'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createBillingRoutes, normalizeRequestedPlan, authenticatedHost, resolvePaymentCallbackOrigin, buildPaymentCallbackUrl, isEligibleListingForHost } = require('../routes/billingRoutes');
const { ValidationError } = require('../lib/inputValidation');

test('checkout accepts only canonical VaRoom plan identifiers, never a browser price', () => {
  assert.equal(normalizeRequestedPlan('basic'), 'basic');
  assert.equal(normalizeRequestedPlan('growth'), 'growth');
  assert.equal(normalizeRequestedPlan('pro'), 'pro');
  assert.equal(normalizeRequestedPlan('property_basic'), 'property_basic');
  assert.equal(normalizeRequestedPlan('shops_premium'), 'shops_premium');
  assert.throws(() => normalizeRequestedPlan('pro?amount=1'), ValidationError);
  assert.throws(() => normalizeRequestedPlan({ plan: 'pro', amount: 1 }), ValidationError);
});

function fakeSupabase({ user, role }) {
  return {
    auth: { getUser: async () => ({ data: { user }, error: user ? null : new Error('bad token') }) },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: role ? { role } : null, error: null }) }) }) }),
  };
}

test('unauthenticated and client callers cannot begin host checkout', async () => {
  const unauthenticated = await authenticatedHost({ headers: {} }, fakeSupabase({ user: null }));
  assert.deepEqual(unauthenticated.error, [401, 'Missing access token']);
  const client = await authenticatedHost({ headers: { authorization: 'Bearer valid' } }, fakeSupabase({ user: { id: 'host-id', email: 'a@example.test' }, role: 'client' }));
  assert.deepEqual(client.error, [403, 'Host access required']);
});

test('a verified host is eligible to use the host-only billing route', async () => {
  const result = await authenticatedHost({ headers: { authorization: 'Bearer valid' } }, fakeSupabase({ user: { id: 'host-id', email: 'a@example.test' }, role: 'host' }));
  assert.equal(result.user.id, 'host-id');
});

test('production Paystack callbacks use the configured HTTPS public origin and preserve return parameters', () => {
  const origin = resolvePaymentCallbackOrigin('https://varoom.co.ke', { nodeEnv: 'production' });
  assert.equal(
    buildPaymentCallbackUrl(origin, '/pricing', { billing: 'return', reference: 'varoom_reference', plan: 'property_basic', returnTo: 'list', trxref: 'varoom_reference' }),
    'https://varoom.co.ke/pricing?billing=return&reference=varoom_reference&plan=property_basic&returnTo=list&trxref=varoom_reference'
  );
  assert.equal(
    buildPaymentCallbackUrl(origin, '/list', { payment: 'return', reference: 'varoom_reference' }),
    'https://varoom.co.ke/list?payment=return&reference=varoom_reference'
  );
});

test('local payment callbacks continue to use the local configured origin', () => {
  const origin = resolvePaymentCallbackOrigin('http://localhost:3000', { nodeEnv: 'development' });
  assert.equal(
    buildPaymentCallbackUrl(origin, '/pricing', { billing: 'return', returnTo: 'list', plan: 'property_basic' }),
    'http://localhost:3000/pricing?billing=return&returnTo=list&plan=property_basic'
  );
  assert.throws(
    () => resolvePaymentCallbackOrigin('http://localhost:3000', { nodeEnv: 'production' }),
    /must use HTTPS in production/
  );
});

test('subscription checkout callback includes its generated payment reference and selected plan', async () => {
  let initialized;
  const plan = {
    id: 'property_basic', active: true, niche: 'property', monthly_amount_minor: 300000,
    currency: 'KES', billing_interval: 'monthly', paystack_plan_code: 'PLN_TEST',
  };
  const supabase = {
    auth: { getUser: async () => ({ data: { user: { id: 'host-1', email: 'host@example.test' } }, error: null }) },
    from(table) {
      const query = {
        select() { return query; }, eq() { return query; }, in() { return query; },
        insert(value) { query.inserted = value; return query; },
        maybeSingle: async () => ({
          data: table === 'profiles' && query.selected === 'role' ? { role: 'host' }
            : table === 'profiles' ? { listing_categories: ['property'] }
              : table === 'billing_plans' ? plan : null,
          error: null,
        }),
        single: async () => ({ data: { id: 'sub-1' }, error: null }),
      };
      query.select = (columns) => { query.selected = columns; return query; };
      return query;
    },
  };
  const router = createBillingRoutes({
    supabaseAdmin: supabase,
    baseUrl: 'https://varoom.co.ke',
    nodeEnv: 'production',
    paystack: {
      generateReference: () => 'checkout-reference',
      initializeTransaction: async (payload) => {
        initialized = payload;
        return { authorization_url: 'https://checkout.paystack.test/' };
      },
    },
  });
  const checkoutRoute = router.stack.find((layer) => layer.route && layer.route.path === '/billing/checkout');
  let responseCode;
  let responseBody;
  const response = {
    status(code) { responseCode = code; return this; },
    json(body) { responseBody = body; return this; },
  };

  await checkoutRoute.route.stack[0].handle({
    headers: { authorization: 'Bearer host-token' },
    body: { plan: 'property_basic' },
  }, response);

  const callback = new URL(initialized.callback_url);
  assert.equal(responseCode, 201);
  assert.equal(responseBody.reference, 'checkout-reference');
  assert.equal(callback.searchParams.get('reference'), responseBody.reference);
  assert.equal(callback.searchParams.get('plan'), 'property_basic');
});

test('pay-as-you-list checkout initializes KSh 1,000 with its listing-bound callback metadata', async () => {
  const insertedPayments = [];
  let initialized;
  const supabase = {
    auth: { getUser: async () => ({ data: { user: { id: 'host-1', email: 'host@example.test' } }, error: null }) },
    from(table) {
      const query = {
        selected: '',
        filters: {},
        select(columns) { this.selected = columns; return this; },
        eq(column, value) { this.filters[column] = value; return this; },
        maybeSingle: async () => {
          if (table === 'profiles' && query.selected === 'role') return { data: { role: 'host' }, error: null };
          if (table === 'profiles') return { data: { listing_categories: ['property'] }, error: null };
          if (table === 'listings') return { data: { id: 'listing-1', host_id: 'host-1', category: 'property' }, error: null };
          if (table === 'billing_payments') return { data: null, error: null };
          return { data: null, error: null };
        },
        insert(value) { insertedPayments.push(value); return Promise.resolve({ error: null }); },
      };
      return query;
    },
  };
  const router = createBillingRoutes({
    supabaseAdmin: supabase,
    baseUrl: 'https://varoom.co.ke',
    nodeEnv: 'production',
    paystack: {
      generateReference: () => 'listing-checkout-reference',
      initializeTransaction: async (payload) => {
        initialized = payload;
        return { authorization_url: 'https://checkout.paystack.test/' };
      },
    },
  });
  const checkoutRoute = router.stack.find((layer) => layer.route && layer.route.path === '/billing/listing-checkout');
  let responseCode;
  let responseBody;
  const response = {
    status(code) { responseCode = code; return this; },
    json(body) { responseBody = body; return this; },
  };

  await checkoutRoute.route.stack[0].handle({
    headers: { authorization: 'Bearer session-token' },
    body: { listing_id: '11111111-1111-4111-8111-111111111111' },
  }, response);

  assert.equal(responseCode, 201);
  assert.equal(responseBody.reference, 'listing-checkout-reference');
  assert.equal(initialized.amount, 100000);
  assert.equal(initialized.currency, 'KES');
  assert.deepEqual(initialized.metadata, {
    host_id: 'host-1',
    listing_id: 'listing-1',
    niche: 'property',
    billing_interval: 'one_time',
    payment_kind: 'listing',
    varoom_billing: true,
  });
  const callback = new URL(initialized.callback_url);
  assert.equal(callback.pathname, '/list');
  assert.equal(callback.searchParams.get('payment'), 'return');
  assert.equal(callback.searchParams.get('reference'), responseBody.reference);
  assert.equal(insertedPayments[0].status, 'initialized');
  assert.equal(insertedPayments[0].amount_minor, 100000);
});

test('listing checkout eligibility preserves property, office, and shop categories and verifies ownership', () => {
  const hostId = 'host-1';
  assert.equal(isEligibleListingForHost({ host_id: hostId, category: 'property' }, hostId, ['property']), true);
  assert.equal(isEligibleListingForHost({ host_id: hostId, category: 'office' }, hostId, ['office']), true);
  assert.equal(isEligibleListingForHost({ host_id: hostId, category: 'shop' }, hostId, ['shop']), true);
  assert.equal(isEligibleListingForHost({ host_id: hostId, category: 'shop' }, hostId, ['office']), true);
  assert.equal(isEligibleListingForHost({ host_id: 'another-host', category: 'property' }, hostId, ['property']), false);
  assert.equal(isEligibleListingForHost({ host_id: hostId, category: 'shop' }, hostId, ['property']), false);
  assert.equal(isEligibleListingForHost({ host_id: hostId, category: 'hotel' }, hostId, ['office']), false);
});

test('listing checkout starts payment only for the authenticated host and matching niche', async (t) => {
  for (const scenario of [
    { category: 'property', hostCategories: ['property'], expectedNiche: 'property' },
    { category: 'office', hostCategories: ['office'], expectedNiche: 'shops_offices' },
    { category: 'shop', hostCategories: ['shop'], expectedNiche: 'shops_offices' },
    { category: 'shop', hostCategories: ['office'], expectedNiche: 'shops_offices' },
  ]) {
    await t.test(scenario.category + ' from profile ' + scenario.hostCategories[0], async () => {
      let initialized;
      const listing = { id: 'listing-1', host_id: 'host-1', category: scenario.category };
      const supabase = {
        auth: { getUser: async () => ({ data: { user: { id: 'host-1', email: 'host@example.test' } }, error: null }) },
        from(table) {
          const query = { selected: '', filters: {}, select(columns) { this.selected = columns; return this; },
            eq(column, value) { this.filters[column] = value; return this; },
            maybeSingle: async () => table === 'profiles'
              ? (query.selected === 'role' ? { data: { role: 'host' }, error: null } : { data: { listing_categories: scenario.hostCategories }, error: null })
              : table === 'listings' ? { data: listing, error: null } : { data: null, error: null },
            insert: async () => ({ error: null }),
          };
          return query;
        },
      };
      const router = createBillingRoutes({
        supabaseAdmin: supabase, baseUrl: 'https://varoom.co.ke', nodeEnv: 'production',
        paystack: { generateReference: () => 'reference-' + scenario.category,
          initializeTransaction: async (payload) => { initialized = payload; return { authorization_url: 'https://checkout.paystack.test/' }; } },
      });
      const route = router.stack.find((layer) => layer.route && layer.route.path === '/billing/listing-checkout');
      let status;
      const response = { status(code) { status = code; return this; }, json(body) { this.body = body; return this; } };
      await route.route.stack[0].handle({ headers: { authorization: 'Bearer token' }, body: { listing_id: '11111111-1111-4111-8111-111111111111' } }, response);
      assert.equal(status, 201);
      assert.equal(initialized.metadata.host_id, 'host-1');
      assert.equal(initialized.metadata.listing_id, listing.id);
      assert.equal(initialized.metadata.niche, scenario.expectedNiche);
    });
  }
});

test('listing checkout rejects another host\'s listing before initializing payment', async () => {
  let initialized = false;
  const supabase = {
    auth: { getUser: async () => ({ data: { user: { id: 'host-1', email: 'host@example.test' } }, error: null }) },
    from(table) {
      const query = { selected: '', select(columns) { this.selected = columns; return this; }, eq() { return this; },
        maybeSingle: async () => table === 'profiles'
          ? (query.selected === 'role' ? { data: { role: 'host' }, error: null } : { data: { listing_categories: ['property'] }, error: null })
          : table === 'listings' ? { data: { id: 'listing-1', host_id: 'other-host', category: 'property' }, error: null }
            : { data: null, error: null } };
      return query;
    },
  };
  const router = createBillingRoutes({ supabaseAdmin: supabase, baseUrl: 'https://varoom.co.ke', nodeEnv: 'production',
    paystack: { generateReference: () => 'unused', initializeTransaction: async () => { initialized = true; return {}; } } });
  const route = router.stack.find((layer) => layer.route && layer.route.path === '/billing/listing-checkout');
  let status;
  const response = { status(code) { status = code; return this; }, json() { return this; } };
  await route.route.stack[0].handle({ headers: { authorization: 'Bearer token' }, body: { listing_id: '11111111-1111-4111-8111-111111111111' } }, response);
  assert.equal(status, 404);
  assert.equal(initialized, false);
});
