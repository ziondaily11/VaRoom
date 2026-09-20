'use strict';

function paystackStatus(data) {
  return data && data.status === 'success' ? 'succeeded' : 'failed';
}

async function applyVerifiedTransaction(supabaseAdmin, transaction) {
  const reference = transaction && transaction.reference;
  if (!reference) throw new Error('Verified Paystack transaction has no reference');
  const { data: payment, error } = await supabaseAdmin.from('billing_payments')
    .select('id,host_id,subscription_id,plan_id,amount_minor,currency,status')
    .eq('provider_reference', reference).maybeSingle();
  if (error || !payment) throw new Error('Billing payment was not found');

  const status = paystackStatus(transaction);
  const amountMatches = Number(transaction.amount) === Number(payment.amount_minor);
  const currencyMatches = transaction.currency === payment.currency;
  const metadata = transaction.metadata || {};
  const ownershipMatches = metadata.host_id === payment.host_id && metadata.plan_id === payment.plan_id;
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
  const { error: paymentError } = await supabaseAdmin.from('billing_payments').update(paymentUpdate).eq('id', payment.id);
  if (paymentError) throw new Error('Unable to update billing payment');

  if (status === 'succeeded') {
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
  } else {
    await supabaseAdmin.from('host_subscriptions').update({ status: 'failed', provider_metadata: transaction }).eq('id', payment.subscription_id).eq('status', 'pending');
  }
  return { payment: { ...payment, ...paymentUpdate }, activated: status === 'succeeded' };
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
