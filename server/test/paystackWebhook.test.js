'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const { verifyWebhookSignature } = require('../lib/paystackClient');
const { recordWebhookEvent, applyVerifiedTransaction } = require('../lib/billingService');

test('accepts a valid raw-body Paystack signature and rejects an invalid one', () => {
  const secret = 'sk_test_example';
  const body = Buffer.from('{"event":"charge.success","data":{"id":1}}');
  const signature = crypto.createHmac('sha512', secret).update(body).digest('hex');
  assert.equal(verifyWebhookSignature(body, signature, secret), true);
  assert.equal(verifyWebhookSignature(body, 'not-a-signature', secret), false);
  assert.equal(verifyWebhookSignature(Buffer.from('{'), signature, secret), false);
});

test('duplicate webhook event IDs are idempotent', async () => {
  const duplicateSupabase = {
    from: () => ({
      insert: () => ({ select: () => ({ maybeSingle: async () => ({ data: null, error: { code: '23505' } }) }) }),
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: 'event-id', processing_status: 'processed' }, error: null }) }) }),
    }),
  };
  const result = await recordWebhookEvent(duplicateSupabase, { event: 'charge.success', data: { id: 22 } });
  assert.deepEqual(result, { duplicate: true, id: 'event-id', retry: false });
});

test('malformed webhook data has no stable event identity', async () => {
  await assert.rejects(() => recordWebhookEvent({ from() { throw new Error('must not write'); } }, { event: 'charge.success', data: {} }), /stable identifier/);
});

function paymentSupabase() {
  const updates = [];
  const payment = { id: 'p1', host_id: 'host-1', subscription_id: 'sub-1', plan_id: 'growth', amount_minor: 130000, currency: 'KES', status: 'initialized' };
  return {
    updates,
    from(table) {
      if (table === 'billing_payments') {
        return {
          select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: payment, error: null }) }) }),
          update: (value) => ({ eq: () => { updates.push({ table, value }); return { error: null }; } }),
        };
      }
      return {
        update(value) {
          updates.push({ table, value });
          const response = { error: null };
          response.eq = () => response;
          return response;
        },
      };
    },
  };
}

test('only a verified matching successful transaction activates a subscription; failure does not', async () => {
  const successDb = paymentSupabase();
  const success = await applyVerifiedTransaction(successDb, { id: 10, reference: 'ref', status: 'success', amount: 130000, currency: 'KES', metadata: { host_id: 'host-1', plan_id: 'growth' } });
  assert.equal(success.activated, true);
  assert.equal(successDb.updates.find((entry) => entry.table === 'host_subscriptions').value.status, 'active');
  const failedDb = paymentSupabase();
  const failed = await applyVerifiedTransaction(failedDb, { id: 11, reference: 'ref', status: 'failed', amount: 130000, currency: 'KES', metadata: { host_id: 'host-1', plan_id: 'growth' } });
  assert.equal(failed.activated, false);
  assert.equal(failedDb.updates.find((entry) => entry.table === 'host_subscriptions').value.status, 'failed');
});
