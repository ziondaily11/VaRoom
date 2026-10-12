'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeRequestedPlan, authenticatedHost, resolvePaymentCallbackOrigin, buildPaymentCallbackUrl } = require('../routes/billingRoutes');
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
    buildPaymentCallbackUrl(origin, '/pricing', { billing: 'return', returnTo: 'list', plan: 'property_basic', trxref: 'varoom_reference' }),
    'https://varoom.co.ke/pricing?billing=return&returnTo=list&plan=property_basic&trxref=varoom_reference'
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
