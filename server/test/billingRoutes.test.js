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

async function tierCheckout(body, { categories, log = [], charge } = {}) {
  let initialized = null;
  let charged = null;
  const router = createBillingRoutes({
    supabaseAdmin: tierSupabase({ categories, log }), baseUrl: 'https://varoom.co.ke', nodeEnv: 'production',
    paystack: {
      generateReference: () => 'tier-reference',
      initializeTransaction: async (payload) => { log.push(['paystack']); initialized = payload; return { authorization_url: 'https://checkout.paystack.test/', access_code: 'access-1' }; },
      charge: async (payload) => {
        log.push(['charge']); charged = payload;
        if (charge) return charge(payload);
        return { status: 'pay_offline', display_text: 'Please complete authorization process on your mobile phone' };
      },
    },
  });
  const route = router.stack.find((layer) => layer.route && layer.route.path === '/billing/listing-checkout');
  const response = { status(code) { this.code = code; return this; }, json(value) { this.body = value; return this; } };
  await route.route.stack[0].handle({ headers: { authorization: 'Bearer session-token' }, body }, response);
  return { response, initialized, charged, log };
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

test('card checkout gives the popup its access code; the full page stays as the fallback', async () => {
  const { response, charged } = await tierCheckout({ tier: 'silver', channel: 'card' });
  assert.equal(response.code, 201);
  assert.deepEqual(response.body, { reference: 'tier-reference', channel: 'card', authorization_url: 'https://checkout.paystack.test/', access_code: 'access-1' });
  assert.equal(charged, null);
});

test('M-Pesa sends the PIN prompt to the host\'s Safaricom number at the server\'s price, recorded first', async () => {
  const { response, initialized, charged, log } = await tierCheckout({ tier: 'gold', channel: 'mpesa', phone: '0712 345 678' });
  assert.equal(response.code, 201);
  assert.deepEqual(response.body, { reference: 'tier-reference', channel: 'mpesa', display_text: 'Please complete authorization process on your mobile phone' });
  assert.equal(initialized, null, 'no Paystack page');
  assert.deepEqual(charged, {
    email: 'host@example.test', amount: 200000, currency: 'KES', reference: 'tier-reference',
    mobile_money: { phone: '+254712345678', provider: 'mpesa' },
    metadata: { host_id: 'host-1', niche: 'property', billing_interval: 'one_time', payment_kind: 'listing', listing_tier: 'gold', varoom_billing: true },
  });
  assert.deepEqual(log.map(([step]) => step), ['insert', 'charge'], 'the payment row exists before M-Pesa is asked');
});

test('M-Pesa refuses numbers that are not Safaricom before anything is recorded; Paystack errors reach the host', async () => {
  for (const phone of ['', '12345', '0812345678', '+255712345678', undefined]) {
    const { response, log } = await tierCheckout({ tier: 'silver', channel: 'mpesa', phone });
    assert.equal(response.code, 400, String(phone));
    assert.match(response.body.error, /Safaricom number/);
    assert.equal(log.length, 0);
  }
  assert.equal((await tierCheckout({ tier: 'silver', channel: 'paypal' })).response.code, 400, 'unknown method');
  const refused = await tierCheckout({ tier: 'silver', channel: 'mpesa', phone: '0712345678' }, { charge: async () => { throw new Error('Charge attempted on an invalid number'); } });
  assert.equal(refused.response.code, 502);
  assert.equal(refused.response.body.error, 'Charge attempted on an invalid number');
});

test('Safaricom numbers are normalised the way Paystack wants them', () => {
  const { mpesaPhone } = require('../lib/listingTiers');
  for (const typed of ['0712345678', '0712 345 678', '712345678', '254712345678', '+254 712-345-678', '(0712) 345678']) assert.equal(mpesaPhone(typed), '+254712345678', typed);
  assert.equal(mpesaPhone('0110 123 456'), '+254110123456', 'the 01… range');
  for (const bad of ['0812345678', '07123456', '07123456789', '+255712345678', 'abc', null]) assert.equal(mpesaPhone(bad), null, String(bad));
});

// A host whose earlier plan checkout was never finished (status pending, its payment initialized).
function unfinishedCheckout({ createdAt, paystackStatus }) {
  const log = [];
  const subscription = { id: 'sub-old', plan_id: 'basic', status: 'pending', niche: 'legacy' };
  const lastPayment = { id: 'pay-old', status: 'initialized', provider_reference: 'ref-old', created_at: createdAt };
  const plan = { id: 'airbnb_starter', active: true, niche: 'airbnb', monthly_amount_minor: 150000, currency: 'KES', billing_interval: 'monthly', paystack_plan_code: 'PLN_TEST', features: { max_active_listings: 2 } };
  const supabase = {
    auth: { getUser: async () => ({ data: { user: { id: 'host-1', email: 'host@example.test' } }, error: null }) },
    from(table) {
      const query = {};
      ['eq', 'in', 'neq', 'order', 'limit', 'is', 'not', 'gt', 'delete'].forEach((method) => { query[method] = () => query; });
      query.select = (columns) => { query.selected = columns || ''; return query; };
      query.insert = (value) => { log.push(['insert', table, value]); return query; };
      query.update = (value) => { log.push(['update', table, value]); query.updated = true; return query; };
      query.maybeSingle = async () => ({
        data: table === 'profiles' ? (query.selected === 'role' ? { role: 'host' } : { listing_categories: ['airbnb'] })
          : table === 'billing_plans' ? plan
            : table === 'host_subscriptions' ? subscription
              : table === 'billing_payments' && query.selected.includes('created_at') ? lastPayment
                : table === 'billing_payments' ? { ...lastPayment, host_id: 'host-1', subscription_id: 'sub-old', plan_id: 'basic', amount_minor: 80000, currency: 'KES', payment_kind: 'subscription', niche: 'legacy' }
                  : null,
        error: null,
      });
      query.single = async () => ({ data: { id: 'sub-new' }, error: null });
      query.then = (resolve) => resolve({ data: [], error: null });
      return query;
    },
  };
  const verified = [];
  const router = createBillingRoutes({
    supabaseAdmin: supabase, baseUrl: 'https://varoom.co.ke', nodeEnv: 'production',
    paystack: {
      generateReference: () => 'ref-new',
      verifyTransaction: async (reference) => { verified.push(reference); return { reference, status: paystackStatus, amount: 80000, currency: 'KES', metadata: { host_id: 'host-1', plan_id: 'basic' } }; },
      initializeTransaction: async () => ({ authorization_url: 'https://checkout.paystack.test/', access_code: 'code-new' }),
    },
  });
  const route = router.stack.find((layer) => layer.route && layer.route.path === '/billing/checkout');
  return {
    log, verified,
    async checkout() {
      const response = { status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
      await route.route.stack[0].handle({ headers: { authorization: 'Bearer host-token' }, body: { plan: 'airbnb_starter' } }, response);
      return response;
    },
  };
}

test('an abandoned plan checkout never locks the host out: Paystack is asked, then a new checkout starts', async () => {
  const host = unfinishedCheckout({ createdAt: '2026-09-20T10:00:00.000Z', paystackStatus: 'abandoned' });
  const response = await host.checkout();
  assert.deepEqual(host.verified, ['ref-old']);
  assert.ok(host.log.some(([kind, table, value]) => kind === 'update' && table === 'billing_payments' && value.status === 'abandoned'));
  assert.ok(host.log.some(([kind, table, value]) => kind === 'update' && table === 'host_subscriptions' && value.status === 'failed'));
  assert.equal(response.code, 201);
  assert.equal(response.body.access_code, 'code-new');
});

test('a plan checkout still open (recent, or still paying at Paystack) is not replaced by a second one', async () => {
  const recent = unfinishedCheckout({ createdAt: new Date(Date.now() - 60 * 1000).toISOString(), paystackStatus: 'abandoned' });
  const first = await recent.checkout();
  assert.deepEqual(recent.verified, [], 'a checkout opened a minute ago is not asked about');
  assert.equal(first.code, 409);
  assert.match(first.body.error, /still open/);

  const paying = unfinishedCheckout({ createdAt: '2026-09-20T10:00:00.000Z', paystackStatus: 'ongoing' });
  const second = await paying.checkout();
  assert.equal(second.code, 409);
  assert.equal(paying.log.some(([kind, table]) => kind === 'insert' && table === 'billing_payments'), false, 'no second charge is prepared');
});
