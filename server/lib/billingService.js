'use strict';

function paystackStatus(data) {
  const status = String(data && data.status || '').toLowerCase();
  if (status === 'success') return 'succeeded';
  if (status === 'pending' || status === 'ongoing' || status === 'processing') return 'pending';
  if (status === 'abandoned') return 'abandoned';
  if (status === 'reversed' || status === 'refunded') return 'refunded';
  return 'failed';
}

async function applyVerifiedTransaction(supabaseAdmin, transaction) {
  const reference = transaction && transaction.reference;
  if (!reference) throw new Error('Verified Paystack transaction has no reference');
  const { data: payment, error } = await supabaseAdmin.from('billing_payments')
    .select('id,host_id,subscription_id,plan_id,amount_minor,currency,status,paid_at,listing_id,payment_kind,niche,billing_interval,provider_payload')
    .eq('provider_reference', reference).maybeSingle();
  if (error) throw new Error('Unable to load billing payment');
  // Paystack creates a fresh transaction reference for each recurring charge.
  // Those references do not have a checkout row, so match renewals through the
  // subscription code returned by the server-side transaction verification.
  if (!payment) return applyVerifiedRenewal(supabaseAdmin, transaction);

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
    paid_at: status === 'succeeded' ? (transaction.paid_at || payment.paid_at || new Date().toISOString()) : null,
    provider_transaction_id: transaction.id ? String(transaction.id) : null,
    provider_payload: { ...(payment.provider_payload || {}), last_verification: transaction },
  };
  const paymentWrite = supabaseAdmin.from('billing_payments').update(paymentUpdate).eq('id', payment.id);
  if (status === 'succeeded') paymentWrite.neq('status', 'succeeded');
  const { data: paymentChanged, error: paymentError } = await paymentWrite.select('id,paid_at');
  if (paymentError) throw new Error('Unable to update billing payment');
  let verifiedPaidAt = transaction.paid_at || (paymentChanged && paymentChanged[0] && paymentChanged[0].paid_at) || payment.paid_at;
  if (status === 'succeeded' && !verifiedPaidAt) {
    const { data: persistedPayment, error: persistedPaymentError } = await supabaseAdmin.from('billing_payments')
      .select('paid_at').eq('id', payment.id).maybeSingle();
    if (persistedPaymentError || !persistedPayment) throw new Error('Unable to load verified payment timestamp');
    verifiedPaidAt = persistedPayment.paid_at || paymentUpdate.paid_at;
  }
  verifiedPaidAt = verifiedPaidAt || paymentUpdate.paid_at;

  if (status === 'succeeded' && payment.payment_kind === 'listing') {
    // Payment records are keyed by a unique provider reference. Activation is
    // tied to that record and may be repeated safely after webhook retries.
    const paidAt = verifiedPaidAt;
    const { error: listingError } = await supabaseAdmin.from('listings').update({
      paid_listing_until: new Date(new Date(paidAt).getTime() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    }).eq('id', payment.listing_id).eq('host_id', payment.host_id);
    if (listingError) throw new Error('Unable to activate paid listing');
  } else if (status === 'succeeded') {
    const paidAt = verifiedPaidAt;
    const periodEnd = new Date(paidAt);
    periodEnd.setMonth(periodEnd.getMonth() + 1);
    const subscriptionUpdate = {
      plan_id: payment.plan_id,
      niche: payment.niche || 'legacy',
      status: 'active',
      current_period_start: paidAt,
      current_period_end: periodEnd.toISOString(),
      provider_subscription_code: transaction.subscription && transaction.subscription.subscription_code || undefined,
      provider_email_token: transaction.subscription && transaction.subscription.email_token || undefined,
      provider_metadata: transaction,
    };
    Object.keys(subscriptionUpdate).forEach((key) => subscriptionUpdate[key] === undefined && delete subscriptionUpdate[key]);
    const { error: subscriptionError } = await supabaseAdmin.from('host_subscriptions').update(subscriptionUpdate).eq('id', payment.subscription_id);
    if (subscriptionError) throw new Error('Unable to activate host subscription');
  } else if (['failed', 'abandoned', 'refunded'].includes(status)) {
    await supabaseAdmin.from('host_subscriptions').update({ status: 'failed', provider_metadata: transaction }).eq('id', payment.subscription_id).eq('status', 'pending');
  }
  return { payment: { ...payment, ...paymentUpdate }, activated: status === 'succeeded' && Boolean(paymentChanged && paymentChanged.length) };
}

async function applyVerifiedRenewal(supabaseAdmin, transaction) {
  if (paystackStatus(transaction) !== 'succeeded') throw new Error('Billing payment was not found');
  const code = transaction.subscription && transaction.subscription.subscription_code;
  if (!code) throw new Error('Unrecognized Paystack transaction reference');
  const { data: subscription, error: subscriptionLookupError } = await supabaseAdmin.from('host_subscriptions')
    .select('id,host_id,plan_id,provider_subscription_code,niche,status')
    .eq('provider_subscription_code', code).maybeSingle();
  if (subscriptionLookupError || !subscription) throw new Error('Paystack subscription was not found');
  if (!['active', 'past_due', 'cancel_requested'].includes(subscription.status)) throw new Error('Paystack subscription is not renewable');
  const { data: plan, error: planError } = await supabaseAdmin.from('billing_plans')
    .select('id,monthly_amount_minor,currency,billing_interval,niche').eq('id', subscription.plan_id).maybeSingle();
  if (planError || !plan || Number(transaction.amount) !== Number(plan.monthly_amount_minor) || transaction.currency !== plan.currency) {
    throw new Error('Recurring Paystack transaction does not match the VaRoom subscription');
  }
  let paidAt = transaction.paid_at || new Date().toISOString();
  const { error: insertError } = await supabaseAdmin.from('billing_payments').insert({
    host_id: subscription.host_id,
    subscription_id: subscription.id,
    plan_id: plan.id,
    niche: subscription.niche || plan.niche || 'legacy',
    billing_interval: plan.billing_interval || 'monthly',
    provider_reference: transaction.reference,
    provider_transaction_id: transaction.id ? String(transaction.id) : null,
    amount_minor: plan.monthly_amount_minor,
    currency: plan.currency,
    status: 'succeeded',
    verified_at: new Date().toISOString(),
    paid_at: paidAt,
    provider_payload: transaction,
  });
  if (insertError && insertError.code !== '23505') throw new Error('Unable to record recurring Paystack payment');
  if (insertError) {
    const { data: existingPayment, error: existingPaymentError } = await supabaseAdmin.from('billing_payments')
      .select('paid_at').eq('provider_reference', transaction.reference).maybeSingle();
    if (existingPaymentError || !existingPayment) throw new Error('Unable to load recurring Paystack payment');
    paidAt = existingPayment.paid_at || paidAt;
  }
  const periodEnd = new Date(paidAt);
  periodEnd.setMonth(periodEnd.getMonth() + 1);
  const { error: updateError } = await supabaseAdmin.from('host_subscriptions').update({
    status: 'active',
    current_period_start: paidAt,
    current_period_end: periodEnd.toISOString(),
    provider_metadata: transaction,
  }).eq('id', subscription.id);
  if (updateError) throw new Error('Unable to renew host subscription');
  return { payment: { provider_reference: transaction.reference, status: 'succeeded' }, activated: !insertError };
}

async function updateSubscriptionFromWebhook(supabaseAdmin, code, patch) {
  if (!code) return false;
  const { data: subscription, error: lookupError } = await supabaseAdmin.from('host_subscriptions')
    .select('id,status').eq('provider_subscription_code', code).maybeSingle();
  if (lookupError) throw new Error('Unable to load Paystack subscription');
  if (!subscription) return false;
  const { error } = await supabaseAdmin.from('host_subscriptions').update(patch).eq('id', subscription.id);
  if (error) throw new Error('Unable to update Paystack subscription');
  return true;
}

async function cancelReplacedSubscription(supabaseAdmin, paystack, payment) {
  const replacement = payment && payment.provider_payload && payment.provider_payload.replaces_subscription;
  if (!replacement || replacement.cancelled || !replacement.code || !replacement.token) return false;
  await paystack.disableSubscription({ code: replacement.code, token: replacement.token });
  const { token: _removedToken, ...replacementRecord } = replacement;
  const providerPayload = {
    ...(payment.provider_payload || {}),
    replaces_subscription: { ...replacementRecord, cancelled: true },
  };
  const { error } = await supabaseAdmin.from('billing_payments').update({ provider_payload: providerPayload }).eq('id', payment.id);
  if (error) throw new Error('Unable to record replaced subscription cancellation');
  return true;
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

module.exports = { paystackStatus, applyVerifiedTransaction, updateSubscriptionFromWebhook, cancelReplacedSubscription, recordWebhookEvent, markWebhookEvent };
