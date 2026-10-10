'use strict';

function paystackStatus(data) {
  return data && data.status === 'success' ? 'succeeded' : 'failed';
}

async function applyVerifiedTransaction(supabaseAdmin, transaction) {
  const reference = transaction && transaction.reference;
  if (!reference) throw new Error('Verified Paystack transaction has no reference');
  const { data: payment, error } = await supabaseAdmin.from('billing_payments')
    .select('id,host_id,subscription_id,plan_id,amount_minor,currency,status,listing_id,payment_kind,niche,billing_interval')
    .eq('provider_reference', reference).maybeSingle();
  if (error || !payment) throw new Error('Billing payment was not found');

  const status = paystackStatus(transaction);
  const amountMatches = Number(transaction.amount) === Number(payment.amount_minor);
  const currencyMatches = transaction.currency === payment.currency;
  const metadata = transaction.metadata || {};
  const legacyPayment = payment.niche === 'legacy';
  const scopeMatches = (!payment.niche || (legacyPayment ? (!metadata.niche || metadata.niche === 'legacy') : metadata.niche === payment.niche))
    && (!payment.billing_interval || (legacyPayment ? (!metadata.billing_interval || metadata.billing_interval === payment.billing_interval) : metadata.billing_interval === payment.billing_interval));
  const ownershipMatches = metadata.host_id === payment.host_id && (payment.payment_kind === 'listing'
    ? scopeMatches && metadata.listing_id === payment.listing_id && metadata.payment_kind === 'listing'
    : scopeMatches && metadata.plan_id === payment.plan_id && (!payment.listing_id || metadata.listing_id === payment.listing_id));
  if (status === 'succeeded' && (!amountMatches || !currencyMatches || !ownershipMatches)) {
    throw new Error('Verified Paystack transaction does not match the VaRoom payment');
  }

  const paymentUpdate = {
    status,
    verified_at: new Date().toISOString(),
    paid_at: status === 'succeeded' ? (transaction.paid_at || new Date().toISOString()) : null,
    provider_transaction_id: transaction.id ? String(transaction.id) : null,
    provider_payload: transaction,
  };
  const paymentWrite = supabaseAdmin.from('billing_payments').update(paymentUpdate).eq('id', payment.id);
  if (status === 'succeeded') paymentWrite.neq('status', 'succeeded');
  const { data: paymentChanged, error: paymentError } = await paymentWrite.select('id');
  if (paymentError) throw new Error('Unable to update billing payment');

  if (status === 'succeeded' && payment.payment_kind === 'listing') {
    // Payment records are keyed by a unique provider reference. Activation is
    // tied to that record and may be repeated safely after webhook retries.
    const paidAt = transaction.paid_at || new Date().toISOString();
    const { error: listingError } = await supabaseAdmin.from('listings').update({
      paid_listing_until: new Date(new Date(paidAt).getTime() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      availability_status: 'available',
    }).eq('id', payment.listing_id).eq('host_id', payment.host_id);
    if (listingError) throw new Error('Unable to activate paid listing');
  } else if (status === 'succeeded') {
    const subscriptionUpdate = {
      status: 'active',
      current_period_start: transaction.paid_at || new Date().toISOString(),
      provider_subscription_code: transaction.subscription && transaction.subscription.subscription_code || undefined,
      provider_email_token: transaction.subscription && transaction.subscription.email_token || undefined,
      provider_metadata: transaction,
    };
    Object.keys(subscriptionUpdate).forEach((key) => subscriptionUpdate[key] === undefined && delete subscriptionUpdate[key]);
    const { error: subscriptionError } = await supabaseAdmin.from('host_subscriptions').update(subscriptionUpdate).eq('id', payment.subscription_id);
    if (subscriptionError) throw new Error('Unable to activate host subscription');
    if (payment.listing_id) {
      const { error: listingError } = await supabaseAdmin.from('listings').update({ availability_status: 'available' })
        .eq('id', payment.listing_id).eq('host_id', payment.host_id).eq('availability_status', 'paused');
      if (listingError) throw new Error('Unable to activate subscription listing');
    }
  } else {
    await supabaseAdmin.from('host_subscriptions').update({ status: 'failed', provider_metadata: transaction }).eq('id', payment.subscription_id).eq('status', 'pending');
  }
  return { payment: { ...payment, ...paymentUpdate }, activated: status === 'succeeded' && Boolean(paymentChanged && paymentChanged.length) };
}

async function recordWebhookEvent(supabaseAdmin, event) {
  const eventId = String(event.id || (event.data && (event.data.id || event.data.reference)) || '');
  if (!eventId) throw new Error('Paystack event has no stable identifier');
  const providerEventId = `${event.event}:${eventId}`;
  const { data, error } = await supabaseAdmin.from('paystack_webhook_events').insert({
    provider_event_id: providerEventId, event_type: event.event, signature_verified: true, payload: event,
  }).select('id').maybeSingle();
  if (error && error.code === '23505') {
    const { data: existing, error: existingError } = await supabaseAdmin.from('paystack_webhook_events')
      .select('id,processing_status').eq('provider_event_id', providerEventId).maybeSingle();
    if (existingError || !existing) throw new Error('Unable to load existing Paystack webhook event');
    // Failed deliveries are retried safely; processed/ignored events are idempotent no-ops.
    return { duplicate: true, id: existing.id, retry: existing.processing_status === 'failed' };
  }
  if (error) throw new Error('Unable to record Paystack webhook event');
  return { duplicate: false, id: data.id, retry: false };
}

async function markWebhookEvent(supabaseAdmin, id, status, processingError = null) {
  if (!id) return;
  await supabaseAdmin.from('paystack_webhook_events').update({
    processing_status: status, processing_error: processingError, processed_at: new Date().toISOString(),
  }).eq('id', id);
}

module.exports = { paystackStatus, applyVerifiedTransaction, recordWebhookEvent, markWebhookEvent };
