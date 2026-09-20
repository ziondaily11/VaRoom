'use strict';

const express = require('express');
const supabaseDefault = require('../lib/supabaseClient');
const { createPaystackClient } = require('../lib/paystackClient');
const { applyVerifiedTransaction, recordWebhookEvent, markWebhookEvent } = require('../lib/billingService');

function createPaystackWebhookRoutes({ supabaseAdmin = supabaseDefault, paystack = createPaystackClient() } = {}) {
  const router = express.Router();
  router.post('/', async (req, res) => {
    const rawBody = req.body;
    const signature = req.get('x-paystack-signature');
    if (!paystack.verifyWebhookSignature(rawBody, signature)) return res.status(401).json({ error: 'Invalid Paystack signature' });
    let event;
    try { event = JSON.parse(rawBody.toString('utf8')); } catch { return res.status(400).json({ error: 'Malformed webhook payload' }); }
    if (!event || typeof event.event !== 'string' || !event.data) return res.status(400).json({ error: 'Malformed webhook payload' });
    let recorded;
    try { recorded = await recordWebhookEvent(supabaseAdmin, event); }
    catch (error) { return res.status(500).json({ error: error.message || 'Unable to record webhook' }); }
    if (recorded.duplicate && !recorded.retry) return res.status(200).json({ received: true, duplicate: true });
    try {
      if (event.event === 'charge.success') {
        const reference = event.data.reference;
        if (!reference) throw new Error('charge.success is missing a reference');
        // Never trust the signed event alone: verify its transaction with Paystack.
        await applyVerifiedTransaction(supabaseAdmin, await paystack.verifyTransaction(reference));
      } else if (event.event === 'subscription.disable') {
        const code = event.data.subscription_code;
        if (code) {
          const verified = await paystack.fetchSubscription(code);
          await supabaseAdmin.from('host_subscriptions').update({ status: 'cancelled', provider_metadata: verified }).eq('provider_subscription_code', code);
        }
      }
      await markWebhookEvent(supabaseAdmin, recorded.id, ['charge.success', 'subscription.disable'].includes(event.event) ? 'processed' : 'ignored');
      return res.status(200).json({ received: true });
    } catch (error) {
      await markWebhookEvent(supabaseAdmin, recorded.id, 'failed', error.message || 'Webhook processing failed');
      // Paystack retries a non-2xx response; the stored event makes this safe.
      return res.status(500).json({ error: 'Webhook processing failed' });
    }
  });
  return router;
}
module.exports = { createPaystackWebhookRoutes };
