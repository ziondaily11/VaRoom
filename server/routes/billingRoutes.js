'use strict';

const express = require('express');
const supabaseDefault = require('../lib/supabaseClient');
const { createPaystackClient } = require('../lib/paystackClient');
const { getCurrentSubscription, getHostEntitlements } = require('../lib/billingEntitlement');
const { applyVerifiedTransaction, cancelReplacedSubscription } = require('../lib/billingService');
const { ValidationError, assertAllowedKeys, text, uuid } = require('../lib/inputValidation');

const VALID_PLAN_IDS = new Set(['basic', 'growth', 'pro', 'property_basic', 'property_pro', 'property_premium', 'shops_basic', 'shops_pro', 'shops_premium']);

function normalizeRequestedPlan(value) {
  const planId = text(value, 'plan', { max: 20 });
  if (!VALID_PLAN_IDS.has(planId)) throw new ValidationError('Unknown plan');
  return planId;
}

function resolvePaymentCallbackOrigin(baseUrl, { nodeEnv = process.env.NODE_ENV, port = process.env.PORT || 3000 } = {}) {
  const configuredBaseUrl = baseUrl || (nodeEnv === 'production' ? null : `http://localhost:${port}`);
  if (!configuredBaseUrl) {
    throw new Error('PUBLIC_BASE_URL must be configured in production for Paystack callbacks');
  }

  let parsed;
  try { parsed = new URL(configuredBaseUrl); }
  catch { throw new Error('PUBLIC_BASE_URL must be a valid absolute URL'); }
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password || parsed.pathname !== '/' || parsed.search || parsed.hash) {
    throw new Error('PUBLIC_BASE_URL must be an absolute origin without a path, query, or credentials');
  }
  if (nodeEnv === 'production' && parsed.protocol !== 'https:') {
    throw new Error('PUBLIC_BASE_URL must use HTTPS in production');
  }
  if (nodeEnv === 'production' && ['localhost', '127.0.0.1', '::1'].includes(parsed.hostname)) {
    throw new Error('PUBLIC_BASE_URL cannot point to localhost in production');
  }
  return parsed.origin;
}

function buildPaymentCallbackUrl(origin, pathname, parameters) {
  const callbackUrl = new URL(pathname, origin);
  for (const [key, value] of Object.entries(parameters)) {
    if (value !== undefined && value !== null && value !== '') callbackUrl.searchParams.set(key, String(value));
  }
  return callbackUrl.toString();
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

function createBillingRoutes({ supabaseAdmin = supabaseDefault, paystack = createPaystackClient(), baseUrl = process.env.PUBLIC_BASE_URL || process.env.CLIENT_BASE_URL, nodeEnv = process.env.NODE_ENV, port = process.env.PORT || 3000 } = {}) {
  const router = express.Router();
  const callbackOrigin = resolvePaymentCallbackOrigin(baseUrl, { nodeEnv, port });
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
    try {
      const entitlements = await getHostEntitlements(supabaseAdmin, user.id);
      const limit = Number(entitlements.listingLimit);
      if (!entitlements.active) {
        entitlements.canCreateAnotherListing = { allowed: false, limit: null, activeCount: 0, reason: 'No active niche subscription.' };
      } else if (!Number.isInteger(limit) || limit < 1 || !['property', 'shops_offices'].includes(entitlements.subscription.niche)) {
        entitlements.canCreateAnotherListing = { allowed: true, limit: null, activeCount: 0, reason: null };
      } else {
        const query = supabaseAdmin.from('listings').select('id', { count: 'exact', head: true })
          .eq('host_id', user.id).eq('availability_status', 'available')
          .is('paid_listing_until', null);
        if (entitlements.subscription.niche === 'property') query.eq('category', 'property');
        else query.in('category', ['shop', 'office']);
        const { count, error } = await query;
        if (error) throw new Error('Unable to verify listing allowance');
        const activeCount = count || 0;
        entitlements.canCreateAnotherListing = {
          allowed: activeCount < limit, limit, activeCount,
          reason: activeCount < limit ? null : `Your plan allows up to ${limit} active listings.`,
        };
      }
      return res.json({ entitlements });
    }
    catch { return res.status(500).json({ error: 'Unable to load entitlements' }); }
  });
  router.post('/billing/checkout', async (req, res) => {
    const user = await requireHost(req, res); if (!user) return;
    try { assertAllowedKeys(req.body || {}, ['plan', 'listing_id', 'return_to']); if (req.body.listing_id !== undefined) uuid(req.body.listing_id, 'listing_id'); if (req.body.return_to !== undefined && req.body.return_to !== 'list') throw new ValidationError('Invalid return destination'); } catch (error) { return res.status(400).json({ error: 'Invalid checkout request' }); }
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
    const { data: existing, error: existingError } = await supabaseAdmin.from('host_subscriptions')
      .select('id,plan_id,status,current_period_end,provider_subscription_code,provider_email_token,niche,billing_plans(monthly_amount_minor,features,niche)')
      .eq('host_id', user.id).in('status', ['pending', 'active', 'past_due', 'cancel_requested']).maybeSingle();
    if (existingError) return res.status(500).json({ error: 'Unable to check the current subscription' });
    let replacingSubscription = null;
    if (existing) {
      if (existing.status !== 'active' || existing.niche !== niche || !existing.provider_subscription_code || !existing.provider_email_token) {
        return res.status(409).json({ error: 'Your current subscription cannot be upgraded yet.' });
      }
      const currentFeatures = existing.billing_plans && existing.billing_plans.features || {};
      const targetFeatures = plan.features || {};
      const currentLimit = Number(currentFeatures.max_active_listings || 0);
      const targetLimit = Number(targetFeatures.max_active_listings || 0);
      if (targetLimit <= currentLimit) return res.status(409).json({ error: 'Choose a plan with a higher listing allowance to upgrade.' });
      const { data: pendingUpgrade, error: pendingError } = await supabaseAdmin.from('billing_payments')
        .select('id').eq('subscription_id', existing.id).in('status', ['initialized', 'pending']).maybeSingle();
      if (pendingError) return res.status(500).json({ error: 'Unable to check for a pending upgrade' });
      if (pendingUpgrade) return res.status(409).json({ error: 'An upgrade payment is already being processed.' });
      replacingSubscription = {
        code: existing.provider_subscription_code,
        token: existing.provider_email_token,
      };
    }
    const reference = paystack.generateReference();
    const callbackUrl = buildPaymentCallbackUrl(callbackOrigin, '/pricing', {
      billing: 'return',
      reference,
      plan: plan.id,
      ...(req.body.return_to === 'list' ? { returnTo: 'list' } : {}),
    });
    let initialized;
    try {
      initialized = await paystack.initializeTransaction({ email: user.email, amount: plan.monthly_amount_minor, currency: plan.currency, plan: paystackPlanCode, reference, callback_url: callbackUrl, metadata: { host_id: user.id, plan_id: plan.id, niche, billing_interval: plan.billing_interval, ...(pendingListing ? { listing_id: pendingListing.id } : {}), varoom_billing: true } });
    } catch (error) { return res.status(503).json({ error: error.message || 'Unable to initialize checkout' }); }
    let subscriptionId = existing && existing.id;
    if (!subscriptionId) {
      const { data: subscription, error: subscriptionError } = await supabaseAdmin.from('host_subscriptions').insert({ host_id: user.id, plan_id: plan.id, niche, status: 'pending', provider_metadata: { reference } }).select('id').single();
      if (subscriptionError) return res.status(500).json({ error: 'Unable to create pending subscription' });
      subscriptionId = subscription.id;
    }
    const payment = {
      host_id: user.id, subscription_id: subscriptionId, plan_id: plan.id, niche, billing_interval: plan.billing_interval,
      ...(pendingListing ? { listing_id: pendingListing.id } : {}), provider_reference: reference,
      amount_minor: plan.monthly_amount_minor, currency: plan.currency, status: 'initialized',
      provider_payload: replacingSubscription ? { replaces_subscription: replacingSubscription } : {},
    };
    const { error: paymentError } = await supabaseAdmin.from('billing_payments').insert(payment);
    if (paymentError) {
      if (!existing) await supabaseAdmin.from('host_subscriptions').delete().eq('id', subscriptionId);
      return res.status(500).json({ error: 'Unable to create billing payment' });
    }
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
    const { data: existing } = await supabaseAdmin.from('billing_payments').select('id,status,provider_reference,provider_payload').eq('listing_id', listing.id).eq('payment_kind', 'listing').maybeSingle();
    if (existing?.status === 'succeeded') return res.status(409).json({ error: 'This listing has already been paid' });
    if (existing && ['initialized', 'pending'].includes(existing.status)) {
      const authorizationUrl = existing.provider_payload && existing.provider_payload.authorization_url;
      if (authorizationUrl) return res.status(200).json({ reference: existing.provider_reference, authorization_url: authorizationUrl, reused: true });
      return res.status(409).json({ error: 'A payment for this listing is still being verified. Please check its status before retrying.' });
    }
    const reference = paystack.generateReference();
    let initialized;
    try {
      initialized = await paystack.initializeTransaction({ email: user.email, amount: 100000, currency: 'KES', reference,
        callback_url: buildPaymentCallbackUrl(callbackOrigin, '/list', { payment: 'return', reference }),
        metadata: { host_id: user.id, listing_id: listing.id, niche: listing.category === 'property' ? 'property' : 'shops_offices', billing_interval: 'one_time', payment_kind: 'listing', varoom_billing: true } });
    } catch (error) { return res.status(503).json({ error: error.message || 'Unable to initialize checkout' }); }
    const payment = { host_id: user.id, listing_id: listing.id, payment_kind: 'listing', niche: listing.category === 'property' ? 'property' : 'shops_offices', billing_interval: 'one_time', plan_id: null, subscription_id: null,
      provider_reference: reference, amount_minor: 100000, currency: 'KES', status: 'initialized', provider_payload: { authorization_url: initialized.authorization_url } };
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
    let verifiedPayment = payment;
    if (payment.status === 'initialized' || payment.status === 'pending') {
      try { verifiedPayment = (await applyVerifiedTransaction(supabaseAdmin, await paystack.verifyTransaction(reference))).payment; }
      catch (error) { return res.status(502).json({ error: error.message || 'Unable to verify payment' }); }
    }
    if (verifiedPayment.status === 'succeeded' && verifiedPayment.payment_kind !== 'listing') {
      try { await cancelReplacedSubscription(supabaseAdmin, paystack, verifiedPayment); }
      catch (error) { return res.status(502).json({ error: error.message || 'Unable to complete subscription upgrade' }); }
    }
    const { data: refreshed } = await supabaseAdmin.from('billing_payments').select('*').eq('id', payment.id).single();
    const { provider_payload: _privateProviderPayload, ...safePayment } = refreshed || verifiedPayment;
    return res.json({ payment: safePayment });
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
module.exports = { createBillingRoutes, authenticatedHost, VALID_PLAN_IDS, normalizeRequestedPlan, resolvePaymentCallbackOrigin, buildPaymentCallbackUrl };
