'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const { verifyWebhookSignature } = require('../lib/paystackClient');
const { recordWebhookEvent, applyVerifiedTransaction, cancelReplacedSubscription } = require('../lib/billingService');

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
  const payment = { id: 'p1', host_id: 'host-1', subscription_id: 'sub-1', plan_id: 'growth', amount_minor: 130000, currency: 'KES', status: 'initialized', provider_payload: { listing_allowance_transition: { limit: null } } };
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
  await assert.rejects(
    () => applyVerifiedTransaction(paymentSupabase(), { id: 10, reference: 'ref', status: 'success', amount: 1, currency: 'KES', metadata: { host_id: 'host-1', plan_id: 'growth' } }),
    /does not match/
  );
  const failedDb = paymentSupabase();
  const failed = await applyVerifiedTransaction(failedDb, { id: 11, reference: 'ref', status: 'failed', amount: 130000, currency: 'KES', metadata: { host_id: 'host-1', plan_id: 'growth' } });
  assert.equal(failed.activated, false);
  assert.equal(failedDb.updates.find((entry) => entry.table === 'host_subscriptions').value.status, 'failed');
  const pendingDb = paymentSupabase();
  const pending = await applyVerifiedTransaction(pendingDb, { id: 13, reference: 'ref', status: 'pending', amount: 130000, currency: 'KES', metadata: { host_id: 'host-1', plan_id: 'growth' } });
  assert.equal(pending.payment.status, 'pending');
  assert.equal(pending.activated, false);
  assert.equal(pendingDb.updates.some((entry) => entry.table === 'host_subscriptions'), false);
});

test('callback and webhook retries keep the original subscription period and payment reference', async () => {
  const payment = {
    id: 'p1', host_id: 'host-1', subscription_id: 'sub-1', plan_id: 'property_basic',
    amount_minor: 300000, currency: 'KES', status: 'initialized', paid_at: null,
    niche: 'property', billing_interval: 'monthly', provider_payload: { listing_allowance_transition: { limit: 5 } },
  };
  const subscriptionUpdates = [];
  const db = {
    from(table) {
      if (table === 'billing_payments') return {
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: payment, error: null }) }) }),
        update(value) {
          let onlyIfNotSucceeded = false;
          const query = {
            eq: () => query,
            neq: (_column, valueToExclude) => { onlyIfNotSucceeded = valueToExclude === 'succeeded'; return query; },
            select: async () => {
              if (onlyIfNotSucceeded && payment.status === 'succeeded') return { data: [], error: null };
              Object.assign(payment, value);
              return { data: [{ id: payment.id }], error: null };
            },
          };
          return query;
        },
      };
      return {
        update(value) {
          subscriptionUpdates.push(value);
          return { eq: async () => ({ error: null }) };
        },
      };
    },
  };
  const transaction = {
    id: 21, reference: 'checkout-ref', status: 'success', amount: 300000, currency: 'KES',
    metadata: { host_id: 'host-1', plan_id: 'property_basic', niche: 'property', billing_interval: 'monthly' },
  };

  await applyVerifiedTransaction(db, transaction); // browser callback verifies first
  const firstPeriodStart = subscriptionUpdates[0].current_period_start;
  const firstPeriodEnd = subscriptionUpdates[0].current_period_end;
  await applyVerifiedTransaction(db, transaction); // charge.success webhook retries afterward

  assert.equal(payment.status, 'succeeded');
  assert.equal(payment.provider_transaction_id, '21');
  assert.equal(subscriptionUpdates.length, 2);
  assert.equal(subscriptionUpdates[1].current_period_start, firstPeriodStart);
  assert.equal(subscriptionUpdates[1].current_period_end, firstPeriodEnd);
  assert.equal(subscriptionUpdates[1].plan_id, 'property_basic');
});

test('verified upgrade keeps its transition allowance and period across callback and webhook retries', async () => {
  const payment = {
    id: 'upgrade-payment', host_id: 'host-1', subscription_id: 'sub-1', plan_id: 'property_pro',
    amount_minor: 600000, currency: 'KES', status: 'initialized', paid_at: null,
    niche: 'property', billing_interval: 'monthly',
    provider_payload: { listing_allowance_transition: { limit: 14, previous_remaining: 2, newly_granted: 12 } },
  };
  const subscriptionUpdates = [];
  const db = {
    from(table) {
      if (table === 'billing_payments') return {
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: payment, error: null }) }) }),
        update(value) {
          const query = { eq: () => query, neq: () => query, select: async () => {
            if (payment.status === 'succeeded') return { data: [], error: null };
            Object.assign(payment, value);
            return { data: [{ id: payment.id, paid_at: payment.paid_at }], error: null };
          } };
          return query;
        },
      };
      return { update(value) { subscriptionUpdates.push(value); const query = { eq: async () => ({ error: null }) }; return query; } };
    },
  };
  const transaction = {
    id: 44, reference: 'upgrade-ref', status: 'success', amount: 600000, currency: 'KES',
    paid_at: '2026-10-21T10:00:00.000Z',
    metadata: { host_id: 'host-1', plan_id: 'property_pro', niche: 'property', billing_interval: 'monthly' },
    subscription: { subscription_code: 'SUB_new' },
  };
  await applyVerifiedTransaction(db, transaction);
  const firstPeriodStart = subscriptionUpdates[0].current_period_start;
  const firstPeriodEnd = subscriptionUpdates[0].current_period_end;
  await applyVerifiedTransaction(db, transaction);
  assert.equal(subscriptionUpdates[0].listing_allowance_limit, 14);
  assert.equal(subscriptionUpdates[1].listing_allowance_limit, 14);
  assert.equal(subscriptionUpdates[1].current_period_start, firstPeriodStart);
  assert.equal(subscriptionUpdates[1].current_period_end, firstPeriodEnd);
  assert.equal(payment.status, 'succeeded');
});

test('failed upgrade payment leaves the existing active subscription and allowance intact', async () => {
  const payment = {
    id: 'upgrade-payment', host_id: 'host-1', subscription_id: 'sub-1', plan_id: 'property_pro',
    amount_minor: 600000, currency: 'KES', status: 'initialized', niche: 'property', billing_interval: 'monthly',
    provider_payload: { listing_allowance_transition: { limit: 14, previous_remaining: 2, newly_granted: 12 } },
  };
  const subscription = { plan_id: 'property_basic', status: 'active', listing_allowance_limit: 5 };
  const subscriptionUpdates = [];
  const db = { from(table) {
    if (table === 'billing_payments') return {
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: payment, error: null }) }) }),
      update: (value) => { const query = { eq: () => query, neq: () => query, select: async () => { Object.assign(payment, value); return { data: [{ id: payment.id }], error: null }; } }; return query; },
    };
    return { update(value) {
      subscriptionUpdates.push(value);
      const filters = {};
      const query = { eq: (column, expected) => { filters[column] = expected; return query; },
        then: (resolve) => { if (Object.entries(filters).every(([key, expected]) => subscription[key] === expected)) Object.assign(subscription, value); return resolve({ error: null }); } };
      return query;
    } };
  } };
  const result = await applyVerifiedTransaction(db, {
    reference: 'upgrade-ref', status: 'failed', amount: 600000, currency: 'KES',
    metadata: { host_id: 'host-1', plan_id: 'property_pro', niche: 'property', billing_interval: 'monthly' },
  });
  assert.equal(result.payment.status, 'failed');
  assert.deepEqual(subscription, { plan_id: 'property_basic', status: 'active', listing_allowance_limit: 5 });
  assert.equal(subscriptionUpdates.length, 1);
  assert.equal(subscriptionUpdates[0].status, 'failed');
  assert.equal(subscriptionUpdates[0].provider_metadata.reference, 'upgrade-ref');
});

test('a duplicate renewal resets transition allowance to the new plan standard only once', async () => {
  const subscription = { id: 'sub-1', host_id: 'host-1', plan_id: 'property_pro', provider_subscription_code: 'SUB_new', niche: 'property', status: 'active' };
  const updates = [];
  let renewalInserted = false;
  const renewalPayment = { paid_at: '2026-10-21T10:00:00.000Z' };
  const db = { from(table) {
    if (table === 'billing_payments') return {
      select: (columns) => {
        const query = { eq: () => query, maybeSingle: async () => ({ data: columns === 'paid_at' && renewalInserted ? renewalPayment : null, error: null }) };
        return query;
      },
      insert: () => { if (renewalInserted) return Promise.resolve({ error: { code: '23505' } }); renewalInserted = true; return Promise.resolve({ error: null }); },
    };
    if (table === 'host_subscriptions') return {
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: subscription, error: null }) }) }),
      update(value) { updates.push(value); const query = { eq: async () => ({ error: null }) }; return query; },
    };
    return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: {
      id: 'property_pro', monthly_amount_minor: 600000, currency: 'KES', billing_interval: 'monthly', niche: 'property',
      features: { max_active_listings: 12 },
    }, error: null }) }) }) };
  } };
  const transaction = {
    id: 45, reference: 'renewal-ref', status: 'success', amount: 600000, currency: 'KES',
    paid_at: renewalPayment.paid_at, subscription: { subscription_code: 'SUB_new' },
    metadata: { host_id: 'host-1', plan_id: 'property_pro', niche: 'property', billing_interval: 'monthly' },
  };
  await applyVerifiedTransaction(db, transaction);
  await applyVerifiedTransaction(db, transaction);
  assert.equal(updates[0].listing_allowance_limit, 12);
  assert.equal(updates[1].listing_allowance_limit, 12);
  assert.equal(updates[1].current_period_start, updates[0].current_period_start);
  assert.equal(updates[1].current_period_end, updates[0].current_period_end);
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
  assert.equal(writes.find((write) => write.table === 'listings').value.availability_status, undefined,
    'verified payment grants the fee entitlement but leaves publication to the listing flow');
  await applyVerifiedTransaction(db, transaction);
  assert.equal(writes.filter((write) => write.table === 'listings').length, 2);
  assert.equal(writes.filter((write) => write.table === 'listings')[1].value.paid_listing_until, firstExpiry);
  await assert.rejects(() => applyVerifiedTransaction(db, { ...transaction, metadata: { ...transaction.metadata, listing_id: 'other-listing' } }), /does not match/);
});

test('pending listing payments grant nothing and terminal failures restore the listing draft', async () => {
  for (const status of ['pending', 'failed', 'abandoned']) {
    const writes = [];
    const payment = {
      id: 'fee-1', host_id: 'host-1', listing_id: 'listing-1', payment_kind: 'listing',
      amount_minor: 100000, currency: 'KES', status: 'initialized',
      niche: 'property', billing_interval: 'one_time', provider_payload: {},
    };
    const db = {
      from(table) {
        if (table === 'billing_payments') return {
          select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: payment, error: null }) }) }),
          update: (value) => {
            const query = {
              eq: () => query,
              neq: () => query,
              select: async () => {
                Object.assign(payment, value);
                return { data: [{ id: payment.id }], error: null };
              },
            };
            return query;
          },
        };
        return {
          update: (value) => {
            writes.push({ table, value });
            const query = { eq: () => query, then: (resolve) => resolve({ error: null }) };
            return query;
          },
        };
      },
    };
    const result = await applyVerifiedTransaction(db, {
      reference: 'listing-ref',
      status,
      amount: 100000,
      currency: 'KES',
      metadata: { host_id: 'host-1', listing_id: 'listing-1', niche: 'property', billing_interval: 'one_time', payment_kind: 'listing' },
    });
    assert.equal(result.payment.status, status);
    const listingWrite = writes.find((write) => write.table === 'listings');
    if (status === 'failed' || status === 'abandoned') {
      assert.deepEqual(listingWrite.value, { publication_state: 'draft' });
    } else {
      assert.equal(listingWrite, undefined);
    }
  }
});

test('a late verified failure cannot downgrade an already successful payment', async () => {
  const payment = {
    id: 'p1', host_id: 'host-1', subscription_id: 'sub-1', plan_id: 'growth',
    amount_minor: 130000, currency: 'KES', status: 'succeeded', paid_at: '2026-10-10T00:00:00.000Z',
  };
  let excludedSucceeded = false;
  const db = {
    from(table) {
      if (table === 'billing_payments') return {
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: payment, error: null }) }) }),
        update: () => {
          const query = { eq: () => query, neq: (column, value) => { excludedSucceeded = column === 'status' && value === 'succeeded'; return query; },
            select: async () => excludedSucceeded ? { data: [], error: null } : { data: [{ id: payment.id }], error: null } };
          return query;
        },
      };
      if (table === 'billing_plans') return {
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { features: { max_active_listings: 5 } }, error: null }) }) }),
      };
      return { update: () => { const query = { eq: () => query, then: (resolve) => resolve({ error: null }) }; return query; } };
    },
  };
  const result = await applyVerifiedTransaction(db, {
    reference: 'ref', status: 'failed', amount: 130000, currency: 'KES',
    metadata: { host_id: 'host-1', plan_id: 'growth' },
  });
  assert.equal(excludedSucceeded, true);
  assert.equal(result.payment.status, 'succeeded');
  assert.equal(payment.status, 'succeeded');
});

test('subscription upgrades cancel the replaced Paystack subscription without persisting its email token afterward', async () => {
  let disabled;
  let persisted;
  const db = { from() { return { update(value) { return { eq: async () => { persisted = value; return { error: null }; } }; } }; } };
  const payment = { id: 'payment-2', provider_payload: { replaces_subscription: { code: 'SUB_old', token: 'private-token' } } };
  await cancelReplacedSubscription(db, { disableSubscription: async (value) => { disabled = value; } }, payment);
  assert.deepEqual(disabled, { code: 'SUB_old', token: 'private-token' });
  assert.equal(persisted.provider_payload.replaces_subscription.cancelled, true);
  assert.equal(Object.hasOwn(persisted.provider_payload.replaces_subscription, 'token'), false);
});
