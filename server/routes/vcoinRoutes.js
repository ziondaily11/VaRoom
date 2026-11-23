'use strict';

const express = require('express');
const supabaseDefault = require('../lib/supabaseClient');
const { createPaystackClient } = require('../lib/paystackClient');
const { applyVerifiedTransaction } = require('../lib/billingService');
const { VCOIN_PACKS, vcoinWallet, creditVcoinPurchase } = require('../lib/vcoins');
const { mpesaPhone } = require('../lib/listingTiers');
const { resolvePaymentCallbackOrigin, buildPaymentCallbackUrl } = require('./billingRoutes');

// V-Coins for Elie search. Any signed-in account buys them: clients, and hosts
// whatever their plan (an expired or missing plan included). Coins belong to
// the person signed in, never to a company they work for.
const packList = () => Object.values(VCOIN_PACKS).map((pack) => ({ id: pack.id, coins: pack.coins, price_kes: pack.amount_minor / 100 }));

function createVcoinRoutes({ supabaseAdmin = supabaseDefault, paystack = createPaystackClient(), baseUrl = process.env.PUBLIC_BASE_URL || process.env.CLIENT_BASE_URL, nodeEnv = process.env.NODE_ENV, port = process.env.PORT || 3000 } = {}) {
  const router = express.Router();
  const callbackOrigin = resolvePaymentCallbackOrigin(baseUrl, { nodeEnv, port });
  const requireUser = async (req, res) => {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    const { data, error } = token ? await supabaseAdmin.auth.getUser(token) : { data: {}, error: true };
    if (error || !data || !data.user) { res.status(401).json({ error: 'Invalid or expired session' }); return null; }
    return data.user;
  };
  const walletOrError = async (res, userId) => {
    try { return await vcoinWallet(supabaseAdmin, userId); }
    catch { res.status(503).json({ error: 'Unable to load your V-Coins' }); return null; }
  };

  router.get('/vcoins', async (req, res) => {
    const user = await requireUser(req, res); if (!user) return;
    const wallet = await walletOrError(res, user.id); if (!wallet) return;
    return res.json({ ...wallet, packs: packList() });
  });

  // The row is recorded before Paystack is called, so a paid transaction is never unmatched.
  router.post('/vcoins/checkout', async (req, res) => {
    const user = await requireUser(req, res); if (!user) return;
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    if (Object.keys(body).some((key) => !['pack', 'channel', 'phone'].includes(key))) return res.status(400).json({ error: 'Invalid checkout request' });
    const pack = Object.prototype.hasOwnProperty.call(VCOIN_PACKS, body.pack) ? VCOIN_PACKS[body.pack] : null;
    if (!pack) return res.status(400).json({ error: 'Choose a V-Coin pack' });
    if (!['card', 'mpesa'].includes(body.channel)) return res.status(400).json({ error: 'Unknown payment method' });
    const mpesa = body.channel === 'mpesa';
    const phone = mpesa ? mpesaPhone(body.phone) : null;
    if (mpesa && !phone) return res.status(400).json({ error: 'Enter a Safaricom number, for example 0712 345 678.' });
    if (!user.email) return res.status(400).json({ error: 'Add an email address to your account to pay.' });
    const reference = paystack.generateReference();
    const { error: insertError } = await supabaseAdmin.from('billing_payments').insert({
      host_id: user.id, payment_kind: 'vcoins', vcoins: pack.coins, niche: 'legacy', billing_interval: 'one_time',
      plan_id: null, subscription_id: null, listing_id: null,
      provider_reference: reference, amount_minor: pack.amount_minor, currency: 'KES', status: 'initialized', provider_payload: {},
    });
    if (insertError) return res.status(500).json({ error: 'Unable to record the V-Coin payment' });
    const metadata = { host_id: user.id, payment_kind: 'vcoins', vcoins: pack.coins, varoom_billing: true };
    if (mpesa) {
      let charged;
      try {
        charged = await paystack.charge({ email: user.email, amount: pack.amount_minor, currency: 'KES', reference,
          mobile_money: { phone, provider: 'mpesa' }, metadata });
      } catch (error) {
        console.error('Paystack M-Pesa V-Coin charge failed', { pack: pack.id, reference, message: error.message });
        return res.status(502).json({ error: error.message || 'M-Pesa could not be reached. Please try again.' });
      }
      return res.status(201).json({
        reference, channel: 'mpesa',
        display_text: (charged && typeof charged.display_text === 'string' && charged.display_text) || 'Check your phone and enter your M-Pesa PIN.',
      });
    }
    let initialized;
    try {
      initialized = await paystack.initializeTransaction({ email: user.email, amount: pack.amount_minor, currency: 'KES', reference,
        callback_url: buildPaymentCallbackUrl(callbackOrigin, '/chats', { c: 'elie', vcoins: 'return', reference }), metadata });
    } catch (error) {
      console.error('Paystack V-Coin checkout initialization failed', { pack: pack.id, reference, message: error.message });
      return res.status(503).json({ error: error.message || 'Unable to initialize checkout' });
    }
    return res.status(201).json({ reference, channel: 'card', authorization_url: initialized.authorization_url, access_code: initialized.access_code });
  });

  // One check of a V-Coin payment, verified with Paystack while unfinished; returns the balance after it.
  router.get('/vcoins/payments/:reference', async (req, res) => {
    const user = await requireUser(req, res); if (!user) return;
    const reference = String(req.params.reference || '').slice(0, 100);
    const { data: payment, error } = await supabaseAdmin.from('billing_payments').select('id,host_id,status,payment_kind,vcoins')
      .eq('provider_reference', reference).eq('host_id', user.id).eq('payment_kind', 'vcoins').maybeSingle();
    if (error) return res.status(503).json({ error: 'Unable to load the payment' });
    if (!payment) return res.status(404).json({ error: 'Payment not found' });
    let status = payment.status;
    try {
      if (status === 'initialized' || status === 'pending') {
        status = (await applyVerifiedTransaction(supabaseAdmin, await paystack.verifyTransaction(reference))).payment.status;
      } else if (status === 'succeeded') {
        // Repairs a credit an earlier verification could not write (one row per payment).
        await creditVcoinPurchase(supabaseAdmin, payment);
      }
    } catch (verifyError) {
      return res.status(502).json({ error: verifyError.message || 'Unable to verify payment' });
    }
    const wallet = await walletOrError(res, user.id); if (!wallet) return;
    return res.json({ payment: { reference, status, vcoins: payment.vcoins }, ...wallet });
  });

  return router;
}

module.exports = { createVcoinRoutes, packList };
