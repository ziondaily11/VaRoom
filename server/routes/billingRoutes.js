'use strict';

const express = require('express');
const supabaseDefault = require('../lib/supabaseClient');
const { createPaystackClient } = require('../lib/paystackClient');
const { getCurrentSubscription, getHostEntitlements } = require('../lib/billingEntitlement');
const { applyVerifiedTransaction } = require('../lib/billingService');
const { ValidationError, assertAllowedKeys, text } = require('../lib/inputValidation');

const VALID_PLAN_IDS = new Set(['basic', 'growth', 'pro', 'property_basic', 'property_pro', 'property_premium', 'shops_basic', 'shops_pro', 'shops_premium']);

function normalizeRequestedPlan(value) {
  const planId = text(value, 'plan', { max: 20 });
  if (!VALID_PLAN_IDS.has(planId)) throw new ValidationError('Unknown plan');
  return planId;
}

async function authenticatedHost(req, supabaseAdmin) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return { error: [401, 'Missing access token'] };
  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !user) return { error: [401, 'Invalid or expired session'] };
  const { data: profile, error: profileError } = await supabaseAdmin.from('profiles').select('role').eq('id', user.id).maybeSingle();
  if (profileError || !profile || profile.role !== 'host') return { error: [403, 'Host access required'] };
  return { user };
}

function createBillingRoutes({ supabaseAdmin = supabaseDefault, paystack = createPaystackClient(), baseUrl = process.env.PUBLIC_BASE_URL || process.env.CLIENT_BASE_URL } = {}) {
  const router = express.Router();
  const requireHost = async (req, res) => {
    const result = await authenticatedHost(req, supabaseAdmin);
    if (result.error) { res.status(result.error[0]).json({ error: result.error[1] }); return null; }
    return result.user;
  };

  router.get('/billing/plans', async (req, res) => {
    const user = await requireHost(req, res); if (!user) return;
    const { data: profile } = await supabaseAdmin.from('profiles').select('listing_categories').eq('id', user.id).maybeSingle();
    const hostNiche = Array.isArray(profile?.listing_categories) ? profile.listing_categories[0] : null;
    const niche = hostNiche === 'property' ? 'property' : (['shop', 'office'].includes(hostNiche) ? 'shops_offices' : 'legacy');
    const { data, error } = await supabaseAdmin.from('billing_plans').select('id,display_name,currency,monthly_amount_minor,billing_interval,features,niche').eq('active', true).eq('niche', niche).order('monthly_amount_minor');
    if (error) return res.status(500).json({ error: 'Unable to load billing plans' });
    return res.json({ plans: data || [] });
  });
  router.get('/billing/subscription', async (req, res) => {
    const user = await requireHost(req, res); if (!user) return;
    try { return res.json({ subscription: await getCurrentSubscription(supabaseAdmin, user.id) }); }
    catch { return res.status(500).json({ error: 'Unable to load subscription' }); }
  });
  router.get('/billing/entitlements', async (req, res) => {
    const user = await requireHost(req, res); if (!user) return;
    try { return res.json({ entitlements: await getHostEntitlements(supabaseAdmin, user.id) }); }
    catch { return res.status(500).json({ error: 'Unable to load entitlements' }); }
  });
  router.post('/billing/checkout', async (req, res) => {
    const user = await requireHost(req, res); if (!user) return;
    try { assertAllowedKeys(req.body || {}, ['plan', 'listing_id']); if (req.body.listing_id !== undefined) uuid(req.body.listing_id, 'listing_id'); } catch (error) { return res.status(400).json({ error: 'Invalid checkout request' }); }
    let planId;
    try { planId = normalizeRequestedPlan(req.body.plan); } catch (error) { return res.status(400).json({ error: 'Invalid plan' }); }
    const { data: plan, error: planError } = await supabaseAdmin.from('billing_plans').select('*').eq('id', planId).eq('active', true).maybeSingle();
    if (planError || !plan) return res.status(400).json({ error: 'Unknown billing plan' });
    const { data: profile } = await supabaseAdmin.from('profiles').select('listing_categories').eq('id', user.id).maybeSingle();
    const hostNiche = Array.isArray(profile?.listing_categories) ? profile.listing_categories[0] : null;
    const niche = hostNiche === 'property' ? 'property' : (['shop', 'office'].includes(hostNiche) ? 'shops_offices' : 'legacy');
    if (plan.niche !== niche) return res.status(403).json({ error: 'This plan is not available for your posting niche' });
    let pendingListing = null;
    if (req.body.listing_id) {
      const { data: listing } = await supabaseAdmin.from('listings').select('id,host_id,category,availability_status').eq('id', req.body.listing_id).maybeSingle();
      const categoryMatches = niche === 'property' ? listing?.category === 'property' : ['shop', 'office'].includes(listing?.category);
      if (!listing || listing.host_id !== user.id || !categoryMatches || listing.availability_status !== 'paused') return res.status(400).json({ error: 'Pending listing does not match this plan' });
      pendingListing = listing;
    }
    const paystackPlanCode = plan.paystack_plan_env ? process.env[plan.paystack_plan_env] : plan.paystack_plan_code;
    if (!paystackPlanCode) return res.status(503).json({ error: 'Checkout is not configured for this plan yet' });
    const { data: existing } = await supabaseAdmin.from('host_subscriptions').select('id').eq('host_id', user.id).in('status', ['pending', 'active', 'past_due', 'cancel_requested']).maybeSingle();
    if (existing) return res.status(409).json({ error: 'You already have an active or pending subscription' });
    const reference = paystack.generateReference();
    const callbackUrl = baseUrl ? `${baseUrl.replace(/\/$/, '')}/pricing?billing=return` : undefined;
    let initialized;
    try {
      initialized = await paystack.initializeTransaction({ email: user.email, amount: plan.monthly_amount_minor, currency: plan.currency, plan: paystackPlanCode, reference, callback_url: callbackUrl, metadata: { host_id: user.id, plan_id: plan.id, niche, billing_interval: plan.billing_interval, ...(pendingListing ? { listing_id: pendingListing.id } : {}), varoom_billing: true } });
    } catch (error) { return res.status(503).json({ error: error.message || 'Unable to initialize checkout' }); }
    const { data: subscription, error: subscriptionError } = await supabaseAdmin.from('host_subscriptions').insert({ host_id: user.id, plan_id: plan.id, niche, status: 'pending', provider_metadata: { reference } }).select('id').single();
    if (subscriptionError) return res.status(500).json({ error: 'Unable to create pending subscription' });
    const { error: paymentError } = await supabaseAdmin.from('billing_payments').insert({ host_id: user.id, subscription_id: subscription.id, plan_id: plan.id, niche, billing_interval: plan.billing_interval, ...(pendingListing ? { listing_id: pendingListing.id } : {}), provider_reference: reference, amount_minor: plan.monthly_amount_minor, currency: plan.currency, status: 'initialized' });
    if (paymentError) { await supabaseAdmin.from('host_subscriptions').delete().eq('id', subscription.id); return res.status(500).json({ error: 'Unable to create billing payment' }); }
    return res.status(201).json({ reference, authorization_url: initialized.authorization_url, access_code: initialized.access_code });
  });
  router.post('/billing/listing-checkout', async (req, res) => {
    const user = await requireHost(req, res); if (!user) return;
    try { assertAllowedKeys(req.body || {}, ['listing_id']); uuid(req.body.listing_id, 'listing_id'); }
    catch { return res.status(400).json({ error: 'Invalid listing checkout request' }); }
    const { data: profile } = await supabaseAdmin.from('profiles').select('listing_categories').eq('id', user.id).maybeSingle();
    const categories = Array.isArray(profile?.listing_categories) ? profile.listing_categories : [];
    if (!categories.some((category) => ['property', 'office', 'shop'].includes(category))) return res.status(403).json({ error: 'Pay-as-you-list is not available for this niche' });
    const { data: listing } = await supabaseAdmin.from('listings').select('id,host_id,category').eq('id', req.body.listing_id).maybeSingle();
    if (!listing || listing.host_id !== user.id || !['property', 'office', 'shop'].includes(listing.category)) return res.status(404).json({ error: 'Eligible listing not found' });
    const { data: existing } = await supabaseAdmin.from('billing_payments').select('id,status').eq('listing_id', listing.id).eq('payment_kind', 'listing').maybeSingle();
    if (existing?.status === 'succeeded') return res.status(409).json({ error: 'This listing has already been paid' });
    const reference = paystack.generateReference();
    let initialized;
    try {
      initialized = await paystack.initializeTransaction({ email: user.email, amount: 100000, currency: 'KES', reference,
        callback_url: baseUrl ? `${baseUrl.replace(/\/$/, '')}/list?payment=return&reference=${encodeURIComponent(reference)}` : undefined,
        metadata: { host_id: user.id, listing_id: listing.id, niche: listing.category === 'property' ? 'property' : 'shops_offices', billing_interval: 'one_time', payment_kind: 'listing', varoom_billing: true } });
    } catch (error) { return res.status(503).json({ error: error.message || 'Unable to initialize checkout' }); }
    const payment = { host_id: user.id, listing_id: listing.id, payment_kind: 'listing', niche: listing.category === 'property' ? 'property' : 'shops_offices', billing_interval: 'one_time', plan_id: null, subscription_id: null,
      provider_reference: reference, amount_minor: 100000, currency: 'KES', status: 'initialized' };
    const result = existing
      ? await supabaseAdmin.from('billing_payments').update(payment).eq('id', existing.id)
      : await supabaseAdmin.from('billing_payments').insert(payment);
    if (result.error) return res.status(500).json({ error: 'Unable to record listing payment' });
    return res.status(201).json({ reference, authorization_url: initialized.authorization_url });
  });
  router.get('/billing/payments/:reference', async (req, res) => {
    const user = await requireHost(req, res); if (!user) return;
    const reference = String(req.params.reference || '');
    const { data: payment } = await supabaseAdmin.from('billing_payments').select('*').eq('provider_reference', reference).eq('host_id', user.id).maybeSingle();
    if (!payment) return res.status(404).json({ error: 'Payment not found' });
    if (payment.status === 'initialized' || payment.status === 'pending') {
      try { await applyVerifiedTransaction(supabaseAdmin, await paystack.verifyTransaction(reference)); }
      catch (error) { return res.status(502).json({ error: error.message || 'Unable to verify payment' }); }
    }
    const { data: refreshed } = await supabaseAdmin.from('billing_payments').select('*').eq('id', payment.id).single();
    return res.json({ payment: refreshed || payment });
  });
  router.post('/billing/subscription/cancel', async (req, res) => {
    const user = await requireHost(req, res); if (!user) return;
    const subscription = await getCurrentSubscription(supabaseAdmin, user.id);
    if (!subscription || !subscription.provider_subscription_code || !subscription.provider_email_token) return res.status(400).json({ error: 'No cancellable subscription found' });
    try { await paystack.disableSubscription({ code: subscription.provider_subscription_code, token: subscription.provider_email_token }); }
    catch (error) { return res.status(502).json({ error: error.message || 'Unable to cancel subscription' }); }
    await supabaseAdmin.from('host_subscriptions').update({ status: 'cancel_requested', cancel_at_period_end: true }).eq('id', subscription.id);
    return res.json({ subscription: { ...subscription, status: 'cancel_requested', cancel_at_period_end: true } });
  });
  return router;
}
module.exports = { createBillingRoutes, authenticatedHost, VALID_PLAN_IDS, normalizeRequestedPlan };
