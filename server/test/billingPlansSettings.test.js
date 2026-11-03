'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createBillingRoutes, paymentMethodFrom } = require('../routes/billingRoutes');

// A recording Supabase stand-in: each table answers from `tables`, every
// filter and write is kept in `calls`.
function fakeDb(tables) {
  const calls = [];
  return {
    calls,
    auth: { getUser: async () => ({ data: { user: { id: 'host-1', email: 'host@example.test' } }, error: null }) },
    from(table) {
      const entry = { table, selected: null, filters: [], update: null };
      calls.push(entry);
      const result = () => {
        if (table === 'profiles') return { data: { role: 'host' }, error: null };
        const value = tables[table];
        return typeof value === 'function' ? value(entry) : { data: value === undefined ? null : value, error: null };
      };
      const query = {
        select(columns) { entry.selected = columns; return query; },
        eq(column, value) { entry.filters.push(['eq', column, value]); return query; },
        in(column, values) { entry.filters.push(['in', column, values]); return query; },
        order() { return query; },
        limit() { return query; },
        update(value) { entry.update = value; return query; },
        maybeSingle: async () => result(),
        then(resolve, reject) { return Promise.resolve(result()).then(resolve, reject); },
      };
      return query;
    },
  };
}

function route(router, method, path) {
  const layer = router.stack.find((item) => item.route && item.route.path === path && item.route.methods[method]);
  return async (req = {}) => {
    const res = { code: 200, body: null, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
    await layer.route.stack[0].handle({ headers: { authorization: 'Bearer host-token' }, body: {}, ...req }, res);
    return res;
  };
}

const routes = (db, paystack = {}) => createBillingRoutes({ supabaseAdmin: db, paystack, baseUrl: 'https://varoom.co.ke', nodeEnv: 'production' });

const liveSubscription = (status = 'active') => ({
  id: 'sub-1', host_id: 'host-1', plan_id: 'property_premium', status, current_period_end: '2026-12-01T00:00:00Z',
  cancel_at_period_end: false, listing_allowance_limit: 20, niche: 'property', billing_plans: { id: 'property_premium', display_name: 'Premium', features: { max_active_listings: 20 } },
});

test('payment method shows only display fields, never the reusable authorization code', () => {
  const method = paymentMethodFrom({
    authorization_code: 'AUTH_secret', signature: 'SIG_secret', bin: '408408', last4: '4081', exp_month: '3', exp_year: '2030',
    channel: 'card', card_type: 'visa ', bank: 'TEST BANK', brand: 'visa', reusable: true,
  });
  assert.deepEqual(method, { channel: 'card', brand: 'visa', last4: '4081', exp_month: '03', exp_year: '2030', bank: 'TEST BANK' });
  assert.equal(paymentMethodFrom({ channel: 'mobile_money', bank: 'M-PESA' }).bank, 'M-PESA');
  assert.equal(paymentMethodFrom(null), null);
  assert.equal(paymentMethodFrom({ last4: 'abcd' }), null);
});

test('billing history: the host\'s own subscription and pay-as-you-list payments, unfinished checkouts left out', async () => {
  const db = fakeDb({
    billing_payments: () => ({
      data: [
        { id: 'p2', payment_kind: 'listing', amount_minor: 100000, currency: 'KES', status: 'succeeded', paid_at: '2026-10-05T10:00:00Z', created_at: '2026-10-05T09:59:00Z', provider_reference: 'ref-2',
          verified_authorization: { authorization_code: 'AUTH_x', channel: 'mobile_money', bank: 'M-PESA', last4: '5678' }, renewal_authorization: null, billing_plans: null, listings: { title: 'Kilimani 2BR' } },
        { id: 'p1', payment_kind: 'subscription', amount_minor: 1200000, currency: 'KES', status: 'succeeded', paid_at: '2026-10-01T08:00:00Z', created_at: '2026-10-01T07:59:00Z', provider_reference: 'ref-1',
          verified_authorization: null, renewal_authorization: { channel: 'card', brand: 'visa', last4: '4081', exp_month: 12, exp_year: 2030 }, billing_plans: { display_name: 'Premium' }, listings: null },
      ],
      error: null,
    }),
  });
  const res = await route(routes(db), 'get', '/billing/payments')();
  assert.equal(res.code, 200);
  const query = db.calls.find((call) => call.table === 'billing_payments');
  assert.deepEqual(query.filters.find((f) => f[1] === 'host_id'), ['eq', 'host_id', 'host-1']);
  assert.deepEqual(query.filters.find((f) => f[1] === 'status')[2], ['pending', 'succeeded', 'failed', 'refunded']);
  assert.doesNotMatch(query.selected, /provider_payload(,|$)/, 'only the authorization part of the payload is read');
  assert.deepEqual(res.body.payments.map((p) => p.description), ['Pay as you list — Kilimani 2BR', 'Premium plan — monthly']);
  assert.equal(res.body.payment_method.bank, 'M-PESA', 'the latest successful payment\'s method');
  assert.doesNotMatch(JSON.stringify(res.body), /AUTH_|provider_payload|authorization_code/);
});

test('billing routes stay host-only', async () => {
  const db = fakeDb({});
  db.from = ((from) => (table) => (table === 'profiles'
    ? { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { role: 'client' }, error: null }) }) }) }
    : from(table)))(db.from.bind(db));
  for (const [method, path] of [['get', '/billing/payments'], ['get', '/billing/subscription/manage-link'], ['post', '/billing/subscription/cancel']]) {
    assert.equal((await route(routes(db), method, path)()).code, 403, path);
  }
});

test('cancel: reads the provider codes on the server, disables at Paystack, keeps the plan to the period end', async () => {
  let disabled = null;
  const db = fakeDb({
    host_subscriptions: (entry) => (entry.selected && entry.selected.startsWith('provider_subscription_code')
      ? { data: { provider_subscription_code: 'SUB_1', provider_email_token: 'TOKEN_1' }, error: null }
      : entry.update ? { error: null } : { data: liveSubscription(), error: null }),
  });
  const res = await route(routes(db, { disableSubscription: async (value) => { disabled = value; } }), 'post', '/billing/subscription/cancel')();
  assert.equal(res.code, 200);
  assert.deepEqual(disabled, { code: 'SUB_1', token: 'TOKEN_1' });
  assert.deepEqual(db.calls.find((call) => call.update).update, { status: 'cancel_requested', cancel_at_period_end: true });
  assert.equal(res.body.subscription.status, 'cancel_requested');
  assert.equal(res.body.subscription.current_period_end, '2026-12-01T00:00:00Z');
  assert.doesNotMatch(JSON.stringify(res.body), /SUB_1|TOKEN_1/, 'codes never reach the browser');
});

test('cancel: a cancelled plan is not disabled twice; no plan is a 400; a Paystack failure changes nothing', async () => {
  let calls = 0;
  const paystack = { disableSubscription: async () => { calls += 1; throw new Error('Paystack down'); } };
  const cancelled = fakeDb({ host_subscriptions: (entry) => (entry.selected && entry.selected.startsWith('provider_') ? { data: { provider_subscription_code: 'S', provider_email_token: 'T' }, error: null } : { data: liveSubscription('cancel_requested'), error: null }) });
  assert.equal((await route(routes(cancelled, paystack), 'post', '/billing/subscription/cancel')()).code, 409);
  const none = fakeDb({ host_subscriptions: null });
  assert.equal((await route(routes(none, paystack), 'post', '/billing/subscription/cancel')()).code, 400);
  const live = fakeDb({ host_subscriptions: (entry) => (entry.selected && entry.selected.startsWith('provider_') ? { data: { provider_subscription_code: 'S', provider_email_token: 'T' }, error: null } : { data: liveSubscription(), error: null }) });
  const failed = await route(routes(live, paystack), 'post', '/billing/subscription/cancel')();
  assert.equal(failed.code, 502);
  assert.equal(calls, 1);
  assert.equal(live.calls.some((call) => call.update), false);
});

test('update card: a Paystack-hosted https link for a live subscription only', async () => {
  const codes = (entry) => (entry.selected && entry.selected.startsWith('provider_') ? { data: { provider_subscription_code: 'SUB_1', provider_email_token: 'T' }, error: null } : { data: liveSubscription('past_due'), error: null });
  let asked = null;
  const ok = await route(routes(fakeDb({ host_subscriptions: codes }), { subscriptionManageLink: async (code) => { asked = code; return { link: 'https://paystack.com/manage/subscriptions/abc' }; } }), 'get', '/billing/subscription/manage-link')();
  assert.equal(ok.code, 200);
  assert.equal(ok.body.link, 'https://paystack.com/manage/subscriptions/abc');
  assert.equal(asked, 'SUB_1');
  const bad = await route(routes(fakeDb({ host_subscriptions: codes }), { subscriptionManageLink: async () => ({ link: 'javascript:alert(1)' }) }), 'get', '/billing/subscription/manage-link')();
  assert.equal(bad.code, 502);
  const cancelled = (entry) => (entry.selected && entry.selected.startsWith('provider_') ? { data: { provider_subscription_code: 'SUB_1' }, error: null } : { data: liveSubscription('cancel_requested'), error: null });
  assert.equal((await route(routes(fakeDb({ host_subscriptions: cancelled }), { subscriptionManageLink: async () => ({ link: 'https://x' }) }), 'get', '/billing/subscription/manage-link')()).code, 400);
});
