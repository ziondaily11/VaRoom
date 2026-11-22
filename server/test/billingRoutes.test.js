'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createBillingRoutes, normalizeRequestedPlan, authenticatedHost, resolvePaymentCallbackOrigin, buildPaymentCallbackUrl, calculateTransitionAllowance } = require('../routes/billingRoutes');
const { ValidationError } = require('../lib/inputValidation');

test('checkout accepts only canonical VaRoom plan identifiers, never a browser price', () => {
  assert.equal(normalizeRequestedPlan('basic'), 'basic');
  assert.equal(normalizeRequestedPlan('growth'), 'growth');
  assert.equal(normalizeRequestedPlan('pro'), 'pro');
  assert.equal(normalizeRequestedPlan('airbnb_pro'), 'airbnb_pro');
  // Property and Shops & Offices sell Silver and Gold per listing instead.
  for (const retired of ['property_basic', 'property_pro', 'property_premium', 'shops_basic', 'shops_pro', 'shops_premium']) {
    assert.throws(() => normalizeRequestedPlan(retired), ValidationError);
  }
  assert.throws(() => normalizeRequestedPlan('pro?amount=1'), ValidationError);
  assert.throws(() => normalizeRequestedPlan({ plan: 'pro', amount: 1 }), ValidationError);
});

test('upgrade allowance carries forward only the prior unused amount, then adds the new plan grant', () => {
  assert.deepEqual(calculateTransitionAllowance(5, 5, 12), {
    limit: 12, previous_remaining: 0, newly_granted: 12,
  });
  assert.deepEqual(calculateTransitionAllowance(5, 3, 12), {
    limit: 14, previous_remaining: 2, newly_granted: 12,
  });
  assert.deepEqual(calculateTransitionAllowance(14, 0, 20), {
    limit: 34, previous_remaining: 14, newly_granted: 20,
  });
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
  let insertedPayment;
  const plan = {
    id: 'airbnb_starter', active: true, niche: 'airbnb', monthly_amount_minor: 150000,
    currency: 'KES', billing_interval: 'monthly', paystack_plan_code: 'PLN_TEST',
  };
  const supabase = {
    auth: { getUser: async () => ({ data: { user: { id: 'host-1', email: 'host@example.test' } }, error: null }) },
    from(table) {
      const query = {
        select() { return query; }, eq() { return query; }, in() { return query; },
        insert(value) { query.inserted = value; if (table === 'billing_payments') insertedPayment = value; return query; },
        update(value) { query.updated = value; return query; },
        maybeSingle: async () => ({
          data: table === 'profiles' && query.selected === 'role' ? { role: 'host' }
            : table === 'profiles' ? { listing_categories: ['airbnb'] }
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
        assert.equal(insertedPayment.provider_reference, payload.reference,
          'the payment reservation must exist before Paystack can initialize a charge');
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
    body: { plan: 'airbnb_starter' },
  }, response);

  const callback = new URL(initialized.callback_url);
  assert.equal(responseCode, 201);
  assert.equal(responseBody.reference, 'checkout-reference');
  assert.equal(callback.searchParams.get('reference'), responseBody.reference);
  assert.equal(callback.searchParams.get('plan'), 'airbnb_starter');
  assert.equal(insertedPayment.provider_payload.checkout_reservation, true);
  assert.equal(insertedPayment.provider_payload.listing_allowance_transition.limit, null);
});

test('Property and Shops & Offices monthly plans can no longer be bought', async () => {
  let initialized = false;
  const supabase = {
    auth: { getUser: async () => ({ data: { user: { id: 'host-1', email: 'host@example.test' } }, error: null }) },
    from(table) {
      const query = { selected: null, select(columns) { this.selected = columns; return this; }, eq() { return this; },
        maybeSingle: async () => ({ data: table === 'profiles' ? (query.selected === 'role' ? { role: 'host' } : { listing_categories: ['property'] }) : null, error: null }) };
      return query;
    },
  };
  const router = createBillingRoutes({ supabaseAdmin: supabase, baseUrl: 'https://varoom.co.ke', nodeEnv: 'production',
    paystack: { generateReference: () => 'unused', initializeTransaction: async () => { initialized = true; return {}; } } });
  const route = router.stack.find((layer) => layer.route && layer.route.path === '/billing/checkout');
  let responseCode;
  const response = { status(code) { responseCode = code; return this; }, json(body) { this.body = body; return this; } };
  await route.route.stack[0].handle({ headers: { authorization: 'Bearer host-token' }, body: { plan: 'property_pro' } }, response);
  assert.equal(responseCode, 400);
  assert.equal(initialized, false);
});

// ---------- Silver / Gold (Property, Shops & Offices) ----------

function tierSupabase({ categories = ['property'], log = [] } = {}) {
  return {
    auth: { getUser: async () => ({ data: { user: { id: 'host-1', email: 'host@example.test' } }, error: null }) },
    from(table) {
      const query = {
        selected: '',
        select(columns) { this.selected = columns; return this; },
        eq() { return this; },
        maybeSingle: async () => (table === 'profiles'
          ? { data: query.selected === 'role' ? { role: 'host' } : { listing_categories: categories }, error: null }
          : { data: null, error: null }),
        insert(value) { log.push(['insert', value]); return Promise.resolve({ error: null }); },
        update(value) { log.push(['update', value]); return { eq: async () => ({ error: null }) }; },
      };
      return query;
    },
  };
}

async function tierCheckout(body, { categories, log = [] } = {}) {
  let initialized = null;
  const router = createBillingRoutes({
    supabaseAdmin: tierSupabase({ categories, log }), baseUrl: 'https://varoom.co.ke', nodeEnv: 'production',
    paystack: {
      generateReference: () => 'tier-reference',
      initializeTransaction: async (payload) => { log.push(['paystack']); initialized = payload; return { authorization_url: 'https://checkout.paystack.test/' }; },
    },
  });
  const route = router.stack.find((layer) => layer.route && layer.route.path === '/billing/listing-checkout');
  const response = { status(code) { this.code = code; return this; }, json(value) { this.body = value; return this; } };
  await route.route.stack[0].handle({ headers: { authorization: 'Bearer session-token' }, body }, response);
  return { response, initialized, log };
}

test('Gold checkout charges KSh 2,000 set by the server, recorded before Paystack, and returns to /list', async () => {
  const { response, initialized, log } = await tierCheckout({ tier: 'gold' });
  assert.equal(response.code, 201);
  assert.equal(response.body.reference, 'tier-reference');
  assert.equal(initialized.amount, 200000);
  assert.equal(initialized.currency, 'KES');
  assert.deepEqual(initialized.metadata, {
    host_id: 'host-1', niche: 'property', billing_interval: 'one_time', payment_kind: 'listing', listing_tier: 'gold', varoom_billing: true,
  });
  const callback = new URL(initialized.callback_url);
  assert.equal(callback.pathname, '/list');
  assert.equal(callback.searchParams.get('payment'), 'return');
  assert.equal(callback.searchParams.get('reference'), 'tier-reference');
  assert.deepEqual(log.map(([step]) => step), ['insert', 'paystack', 'update'], 'the payment row exists before Paystack can charge');
  const inserted = log[0][1];
  assert.equal(inserted.listing_id, null, 'a credit is not tied to a listing until one is published');
  assert.equal(inserted.listing_tier, 'gold');
  assert.equal(inserted.amount_minor, 200000);
  assert.equal(inserted.status, 'initialized');
});

test('Silver is KSh 1,000 for property, office and shop hosts, each in their billing niche', async () => {
  for (const [category, niche] of [['property', 'property'], ['office', 'shops_offices'], ['shop', 'shops_offices']]) {
    const { response, initialized } = await tierCheckout({ tier: 'silver' }, { categories: [category] });
    assert.equal(response.code, 201, category);
    assert.equal(initialized.amount, 100000);
    assert.equal(initialized.metadata.niche, niche);
  }
});

test('the tier checkout returns to the draft or listing being edited', async () => {
  const draft = '11111111-1111-4111-8111-111111111111';
  const edit = '22222222-2222-4222-8222-222222222222';
  const { initialized } = await tierCheckout({ tier: 'silver', draft, edit });
  const callback = new URL(initialized.callback_url);
  assert.equal(callback.searchParams.get('draft'), draft);
  assert.equal(callback.searchParams.get('edit'), edit);
});

test('the tier checkout refuses prices, unknown tiers, bad ids and other niches before Paystack', async () => {
  for (const body of [{ tier: 'platinum' }, { tier: 'gold', amount: 1 }, { tier: 'gold', draft: 'not-a-uuid' }, {}, { tier: '__proto__' }]) {
    const { response, initialized } = await tierCheckout(body);
    assert.equal(response.code, 400, JSON.stringify(body));
    assert.equal(initialized, null);
  }
  const airbnb = await tierCheckout({ tier: 'gold' }, { categories: ['airbnb'] });
  assert.equal(airbnb.response.code, 403);
  assert.equal(airbnb.initialized, null);
});
