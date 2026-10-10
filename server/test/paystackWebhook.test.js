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
          update: (value) => {
            const builder = { eq: () => builder, neq: () => builder, select: async () => { updates.push({ table, value }); return { data: [{ id: 'p1' }], error: null }; } };
            return builder;
          },
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

test('listing fee activation requires matching server-verified metadata and is idempotent', async () => {
  const writes = [];
  let alreadySucceeded = false;
  const db = { from(table) {
    if (table === 'billing_payments') return {
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: {
        id: 'fee-1', host_id: 'host-1', listing_id: 'listing-1', payment_kind: 'listing',
        plan_id: null, subscription_id: null, amount_minor: 100000, currency: 'KES', status: alreadySucceeded ? 'succeeded' : 'initialized', niche: 'property', billing_interval: 'one_time'
      }, error: null }) }) }),
      update: (value) => { const query = { eq: () => query, neq: () => query, select: async () => {
        writes.push({ table, value });
        if (alreadySucceeded) return { data: [], error: null };
        alreadySucceeded = true; return { data: [{ id: 'fee-1' }], error: null };
      } }; return query; },
    };
    return { update: (value) => { writes.push({ table, value }); const query = { eq: () => query }; return query; } };
  } };
  const transaction = { id: 12, reference: 'listing-ref', status: 'success', amount: 100000, currency: 'KES', paid_at: '2026-10-10T00:00:00.000Z', metadata: { host_id: 'host-1', listing_id: 'listing-1', niche: 'property', billing_interval: 'one_time', payment_kind: 'listing' } };
  const first = await applyVerifiedTransaction(db, transaction);
  assert.equal(first.activated, true);
  assert.equal(writes.filter((write) => write.table === 'listings').length, 1);
  const firstExpiry = writes.find((write) => write.table === 'listings').value.paid_listing_until;
  assert.equal(firstExpiry, '2026-11-09T00:00:00.000Z');
  await applyVerifiedTransaction(db, transaction);
  assert.equal(writes.filter((write) => write.table === 'listings').length, 2);
  assert.equal(writes.filter((write) => write.table === 'listings')[1].value.paid_listing_until, firstExpiry);
  await assert.rejects(() => applyVerifiedTransaction(db, { ...transaction, metadata: { ...transaction.metadata, listing_id: 'other-listing' } }), /does not match/);
});
