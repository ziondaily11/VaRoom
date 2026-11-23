'use strict';

const express = require('express');
const supabaseDefault = require('../lib/supabaseClient');
const { actAsHost } = require('../lib/team');
const { createPaystackClient } = require('../lib/paystackClient');
const { getCurrentSubscription, getHostEntitlements } = require('../lib/billingEntitlement');
const { applyVerifiedTransaction, cancelReplacedSubscription } = require('../lib/billingService');
const { ValidationError, assertAllowedKeys, text, uuid } = require('../lib/inputValidation');
const { LISTING_TIERS, LISTING_TIER_NICHES, listingTierPlans, mpesaPhone } = require('../lib/listingTiers');

// Monthly plans still sold. Property and Shops & Offices sell Silver and Gold
// per listing instead (/billing/listing-checkout).
const VALID_PLAN_IDS = new Set([
  'basic', 'growth', 'pro',
  'airbnb_starter', 'airbnb_pro', 'airbnb_business',
  'hotel_dining', 'hotel_boutique', 'hotel_standard', 'hotel_plus',
  'venue_basic', 'venue_pro', 'venue_premium',
]);

// Niches whose plans unlock features only; publishing is not capped yet.
const FEATURE_PLAN_NICHES = new Set(['airbnb', 'hotel', 'venue']);

/** The billing_plans.niche for a host's posting niche. */
function billingNicheFor(hostNiche) {
  if (hostNiche === 'property') return 'property';
  if (['shop', 'office'].includes(hostNiche)) return 'shops_offices';
  if (FEATURE_PLAN_NICHES.has(hostNiche)) return hostNiche;
  return 'legacy';
}

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

function calculateTransitionAllowance(previousLimit, activeListings, newLimit) {
  const granted = Number.isInteger(Number(newLimit)) && Number(newLimit) > 0 ? Number(newLimit) : null;
  if (!granted) return { limit: null, previous_remaining: 0, newly_granted: null };
  const previous = Number.isInteger(Number(previousLimit)) && Number(previousLimit) > 0 ? Number(previousLimit) : 0;
  const active = Number.isInteger(Number(activeListings)) && Number(activeListings) > 0 ? Number(activeListings) : 0;
  const remaining = Math.max(0, previous - active);
  return { limit: remaining + granted, previous_remaining: remaining, newly_granted: granted };
}

const HISTORY_STATUSES = ['pending', 'succeeded', 'failed', 'refunded'];

function safeText(value, max = 40) {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : null;
}

// Only display fields of Paystack's authorization; never its reusable
// authorization_code, signature or customer details.
function paymentMethodFrom(authorization) {
  if (!authorization || typeof authorization !== 'object') return null;
  const last4 = /^\d{4}$/.test(String(authorization.last4 || '')) ? String(authorization.last4) : null;
  const channel = safeText(authorization.channel, 20);
  if (!last4 && !channel) return null;
  const month = /^\d{1,2}$/.test(String(authorization.exp_month || '')) ? String(authorization.exp_month).padStart(2, '0') : null;
  const year = /^\d{2,4}$/.test(String(authorization.exp_year || '')) ? String(authorization.exp_year) : null;
  return {
    channel,
    brand: safeText(authorization.brand) || safeText(authorization.card_type),
    last4,
    exp_month: month,
    exp_year: year,
    bank: safeText(authorization.bank),
  };
}

function billingHistoryEntry(row) {
  const planName = row.billing_plans && row.billing_plans.display_name || null;
  const listingTitle = row.listings && row.listings.title || null;
  const isListing = row.payment_kind === 'listing';
  const isVcoins = row.payment_kind === 'vcoins';
  const tier = row.listing_tier && LISTING_TIERS[row.listing_tier];
  return {
    id: row.id,
    kind: isVcoins ? 'vcoins' : isListing ? 'listing' : 'subscription',
    description: isVcoins
      ? `${row.vcoins} V-Coins for Elie`
      : isListing
      ? `${tier ? `${tier.display_name} listing` : 'Pay as you list'}${listingTitle ? ` — ${listingTitle}` : ''}`
      : `${planName || 'VaRoom'} plan — monthly`,
    plan_name: planName,
    listing_title: listingTitle,
    amount_minor: row.amount_minor,
    currency: row.currency,
    status: row.status,
    paid_at: row.paid_at || null,
    created_at: row.created_at,
    reference: row.provider_reference,
    method: paymentMethodFrom(row.verified_authorization || row.renewal_authorization),
  };
}

async function authenticatedHost(req, supabaseAdmin) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return { error: [401, 'Missing access token'] };
  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !user) return { error: [401, 'Invalid or expired session'] };
  // A Finance member working as a company acts for it (X-VaRoom-Host).
  const host = await actAsHost(req, user, 'finance', supabaseAdmin);
  if (!host) return { error: [403, 'You are not on Finance for this team'] };
  const { data: profile, error: profileError } = await supabaseAdmin.from('profiles').select('role').eq('id', host.id).maybeSingle();
  if (profileError || !profile || profile.role !== 'host') return { error: [403, 'Host access required'] };
  if (host.id === user.id) return { user };
  // Paystack bills the company's own email, so its plan stays on its account.
  const { data: owner, error: ownerError } = await supabaseAdmin.auth.admin.getUserById(host.id);
  if (ownerError || !owner || !owner.user || !owner.user.email) return { error: [502, 'The company account could not be loaded'] };
  return { user: { ...host, email: owner.user.email } };
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
    const niche = billingNicheFor(hostNiche);
    if (LISTING_TIER_NICHES.has(niche)) return res.json({ plans: listingTierPlans(niche) });
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
      // Paid Silver / Gold listings that no published listing has used yet.
      const { data: credits, error: creditsError } = await supabaseAdmin.from('billing_payments').select('listing_tier')
        .eq('host_id', user.id).eq('payment_kind', 'listing').eq('status', 'succeeded')
        .not('listing_tier', 'is', null).is('consumed_at', null).is('listing_id', null);
      if (creditsError) throw new Error('Unable to load listing credits');
      const { data: profile, error: profileError } = await supabaseAdmin.from('profiles').select('listing_categories').eq('id', user.id).maybeSingle();
      if (profileError) throw new Error('Unable to load the posting niche');
      // Property and Shops & Offices pay per listing (Silver / Gold).
      entitlements.listingTiers = LISTING_TIER_NICHES.has(billingNicheFor(Array.isArray(profile?.listing_categories) ? profile.listing_categories[0] : null));
      entitlements.listingCredits = { silver: 0, gold: 0 };
      (credits || []).forEach((credit) => { if (credit.listing_tier in entitlements.listingCredits) entitlements.listingCredits[credit.listing_tier] += 1; });
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
    try { assertAllowedKeys(req.body || {}, ['plan']); } catch { return res.status(400).json({ error: 'Invalid checkout request' }); }
    let planId;
    try { planId = normalizeRequestedPlan(req.body.plan); } catch (error) { return res.status(400).json({ error: 'Invalid plan' }); }
    const { data: plan, error: planError } = await supabaseAdmin.from('billing_plans').select('*').eq('id', planId).eq('active', true).maybeSingle();
    if (planError || !plan) return res.status(400).json({ error: 'Unknown billing plan' });
    const { data: profile } = await supabaseAdmin.from('profiles').select('listing_categories').eq('id', user.id).maybeSingle();
    const hostNiche = Array.isArray(profile?.listing_categories) ? profile.listing_categories[0] : null;
    const niche = billingNicheFor(hostNiche);
    if (plan.niche !== niche) return res.status(403).json({ error: 'This plan is not available for your posting niche' });
    const paystackPlanCode = plan.paystack_plan_env ? process.env[plan.paystack_plan_env] : plan.paystack_plan_code;
    if (!paystackPlanCode) return res.status(503).json({ error: 'Checkout is not configured for this plan yet' });
    let { data: existing, error: existingError } = await supabaseAdmin.from('host_subscriptions')
      .select('id,plan_id,status,current_period_end,listing_allowance_limit,provider_subscription_code,provider_email_token,niche,billing_plans(monthly_amount_minor,features,niche)')
      .eq('host_id', user.id).in('status', ['pending', 'active', 'past_due', 'cancel_requested']).maybeSingle();
    if (existingError) return res.status(500).json({ error: 'Unable to check the current subscription' });
    if (existing && existing.status === 'pending') {
      const { data: lastPayment, error: lastPaymentError } = await supabaseAdmin.from('billing_payments')
        .select('id,status').eq('subscription_id', existing.id).order('created_at', { ascending: false }).limit(1).maybeSingle();
      if (lastPaymentError) return res.status(500).json({ error: 'Unable to check the pending subscription payment' });
      if (!lastPayment || ['failed', 'abandoned', 'refunded'].includes(lastPayment.status)) {
        const { error: staleSubscriptionError } = await supabaseAdmin.from('host_subscriptions')
          .update({ status: 'failed' }).eq('id', existing.id).eq('status', 'pending');
        if (staleSubscriptionError) return res.status(500).json({ error: 'Unable to clear the previous failed subscription attempt' });
        existing = null;
      }
    }
    let replacingSubscription = null;
    let activeListingCount = 0;
    if (existing) {
      // A legacy subscriber of a feature-plan niche may move onto that niche's new plans.
      const legacyToNichePlan = existing.niche === 'legacy' && FEATURE_PLAN_NICHES.has(niche);
      if (existing.status !== 'active' || (existing.niche !== niche && !legacyToNichePlan) || !existing.provider_subscription_code || !existing.provider_email_token) {
        return res.status(409).json({ error: 'Your current subscription cannot be upgraded yet.' });
      }
      const currentFeatures = existing.billing_plans && existing.billing_plans.features || {};
      const targetFeatures = plan.features || {};
      const currentLimit = Number(existing.listing_allowance_limit ?? currentFeatures.max_active_listings ?? 0);
      const targetLimit = Number(targetFeatures.max_active_listings || 0);
      if (FEATURE_PLAN_NICHES.has(niche)) {
        const currentAmount = Number(existing.billing_plans && existing.billing_plans.monthly_amount_minor || 0);
        if (!legacyToNichePlan && Number(plan.monthly_amount_minor) <= currentAmount) {
          return res.status(409).json({ error: 'Choose a higher plan to upgrade.' });
        }
      } else if (targetLimit <= currentLimit) return res.status(409).json({ error: 'Choose a plan with a higher listing allowance to upgrade.' });
      if (currentLimit > 0 && targetLimit > 0) {
        const activeListingsQuery = supabaseAdmin.from('listings').select('id', { count: 'exact', head: true })
          .eq('host_id', user.id).eq('availability_status', 'available').is('paid_listing_until', null);
        if (niche === 'property') activeListingsQuery.eq('category', 'property');
        else activeListingsQuery.in('category', ['shop', 'office']);
        const { count, error: activeListingsError } = await activeListingsQuery;
        if (activeListingsError) return res.status(503).json({ error: 'Unable to reconcile the current listing allowance' });
        activeListingCount = count || 0;
      }
      const { data: pendingUpgrade, error: pendingError } = await supabaseAdmin.from('billing_payments')
        .select('id,provider_reference,provider_payload').eq('subscription_id', existing.id).in('status', ['initialized', 'pending']).maybeSingle();
      if (pendingError) return res.status(500).json({ error: 'Unable to check for a pending upgrade' });
      if (pendingUpgrade) {
        const authorizationUrl = pendingUpgrade.provider_payload && pendingUpgrade.provider_payload.authorization_url;
        if (authorizationUrl) return res.status(200).json({ reference: pendingUpgrade.provider_reference, authorization_url: authorizationUrl, reused: true });
        return res.status(409).json({ error: 'An upgrade payment is already being processed.' });
      }
      replacingSubscription = {
        code: existing.provider_subscription_code,
        token: existing.provider_email_token,
        previous_plan_id: existing.plan_id,
        previous_allowance_limit: currentLimit,
      };
    }
    const reference = paystack.generateReference();
    const callbackUrl = buildPaymentCallbackUrl(callbackOrigin, '/pricing', {
      billing: 'return',
      reference,
      plan: plan.id,
    });
    let subscriptionId = existing && existing.id;
    if (!subscriptionId) {
      const { data: subscription, error: subscriptionError } = await supabaseAdmin.from('host_subscriptions').insert({ host_id: user.id, plan_id: plan.id, niche, status: 'pending', provider_metadata: { reference } }).select('id').single();
      if (subscriptionError) return res.status(500).json({ error: 'Unable to create pending subscription' });
      subscriptionId = subscription.id;
    }
    const payment = {
      host_id: user.id, subscription_id: subscriptionId, plan_id: plan.id, niche, billing_interval: plan.billing_interval,
      provider_reference: reference,
      amount_minor: plan.monthly_amount_minor, currency: plan.currency, status: 'initialized',
      provider_payload: {
        checkout_reservation: true,
        listing_allowance_transition: calculateTransitionAllowance(
          replacingSubscription ? replacingSubscription.previous_allowance_limit : 0,
          activeListingCount,
          Number(plan.features && plan.features.max_active_listings)
        ),
        ...(replacingSubscription ? { replaces_subscription: replacingSubscription } : {}),
      },
    };
    const { error: paymentError } = await supabaseAdmin.from('billing_payments').insert(payment);
    if (paymentError) {
      if (!existing) await supabaseAdmin.from('host_subscriptions').delete().eq('id', subscriptionId);
      if (paymentError.code === '23505') return res.status(409).json({ error: 'An upgrade payment is already being processed.' });
      return res.status(500).json({ error: 'Unable to create billing payment' });
    }
    let initialized;
    try {
      initialized = await paystack.initializeTransaction({ email: user.email, amount: plan.monthly_amount_minor, currency: plan.currency, plan: paystackPlanCode, reference, callback_url: callbackUrl, metadata: { host_id: user.id, plan_id: plan.id, niche, billing_interval: plan.billing_interval, varoom_billing: true } });
    } catch (error) {
      // Keep the reservation initialized when the network result is uncertain;
      // allowing another checkout here could charge twice for the same upgrade.
      console.error('Paystack subscription checkout initialization is unresolved', { userId: user.id, planId: plan.id, reference, message: error.message });
      return res.status(503).json({ error: 'Unable to confirm checkout initialization. Check the payment status before retrying.' });
    }
    const { error: checkoutUrlError } = await supabaseAdmin.from('billing_payments')
      .update({ provider_payload: { ...payment.provider_payload, authorization_url: initialized.authorization_url } })
      .eq('provider_reference', reference);
    if (checkoutUrlError) {
      console.error('Unable to save Paystack subscription checkout URL', { userId: user.id, planId: plan.id, reference, message: checkoutUrlError.message });
    }
    return res.status(201).json({ reference, authorization_url: initialized.authorization_url, access_code: initialized.access_code });
  });
  // Silver or Gold: one listing credit for Property or Shops & Offices. The
  // next listing the host publishes uses it (activate_listing_with_entitlement),
  // so the host pays first. M-Pesa: Paystack sends the PIN prompt to the
  // host's phone and VaRoom's window waits for it. Card: the window opens
  // Paystack's popup with the access code (its authorization URL, back to
  // /list, is the fallback). The row is recorded before Paystack is called, so
  // a paid transaction is never unmatched.
  router.post('/billing/listing-checkout', async (req, res) => {
    const user = await requireHost(req, res); if (!user) return;
    const body = req.body || {};
    let tier = null;
    try {
      assertAllowedKeys(body, ['tier', 'draft', 'edit', 'channel', 'phone']);
      // The draft being continued or the listing being edited: /list reopens it on return (and checks it is the host's).
      ['draft', 'edit'].forEach((key) => { if (body[key] !== undefined) uuid(body[key], key); });
      if (body.channel !== undefined && !['card', 'mpesa'].includes(body.channel)) throw new ValidationError('Unknown payment method');
      if (Object.prototype.hasOwnProperty.call(LISTING_TIERS, body.tier)) tier = LISTING_TIERS[body.tier];
    } catch { tier = null; }
    if (!tier) return res.status(400).json({ error: 'Choose Silver or Gold' });
    const mpesa = body.channel === 'mpesa';
    const phone = mpesa ? mpesaPhone(body.phone) : null;
    if (mpesa && !phone) return res.status(400).json({ error: 'Enter a Safaricom number, for example 0712 345 678.' });
    const { data: profile, error: profileError } = await supabaseAdmin.from('profiles').select('listing_categories').eq('id', user.id).maybeSingle();
    if (profileError) return res.status(503).json({ error: 'Unable to verify your listing category' });
    const niche = billingNicheFor(Array.isArray(profile?.listing_categories) ? profile.listing_categories[0] : null);
    if (!LISTING_TIER_NICHES.has(niche)) return res.status(403).json({ error: 'Silver and Gold are available for Property and Shops & Offices' });
    const reference = paystack.generateReference();
    const { error: insertError } = await supabaseAdmin.from('billing_payments').insert({
      host_id: user.id, listing_id: null, listing_tier: tier.id, payment_kind: 'listing', niche, billing_interval: 'one_time', plan_id: null, subscription_id: null,
      provider_reference: reference, amount_minor: tier.amount_minor, currency: 'KES', status: 'initialized', provider_payload: {},
    });
    if (insertError) return res.status(500).json({ error: 'Unable to record listing payment' });
    const metadata = { host_id: user.id, niche, billing_interval: 'one_time', payment_kind: 'listing', listing_tier: tier.id, varoom_billing: true };
    if (mpesa) {
      let charged;
      try {
        charged = await paystack.charge({ email: user.email, amount: tier.amount_minor, currency: 'KES', reference,
          mobile_money: { phone, provider: 'mpesa' }, metadata });
      } catch (error) {
        console.error('Paystack M-Pesa charge failed', { tier: tier.id, reference, message: error.message });
        return res.status(502).json({ error: error.message || 'M-Pesa could not be reached. Please try again.' });
      }
      return res.status(201).json({
        reference, channel: 'mpesa',
        display_text: (charged && typeof charged.display_text === 'string' && charged.display_text) || 'Check your phone and enter your M-Pesa PIN.',
      });
    }
    let initialized;
    try {
      initialized = await paystack.initializeTransaction({ email: user.email, amount: tier.amount_minor, currency: 'KES', reference,
        callback_url: buildPaymentCallbackUrl(callbackOrigin, '/list', { payment: 'return', reference, draft: body.draft, edit: body.edit }),
        metadata });
    } catch (error) {
      console.error('Paystack listing checkout initialization failed', { tier: tier.id, reference, message: error.message });
      return res.status(503).json({ error: error.message || 'Unable to initialize checkout' });
    }
    const { error: urlError } = await supabaseAdmin.from('billing_payments')
      .update({ provider_payload: { authorization_url: initialized.authorization_url } }).eq('provider_reference', reference);
    if (urlError) console.error('Unable to save Paystack listing checkout URL', { reference, message: urlError.message });
    return res.status(201).json({ reference, channel: 'card', authorization_url: initialized.authorization_url, access_code: initialized.access_code });
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
    if (verifiedPayment.status === 'succeeded' && !['listing', 'vcoins'].includes(verifiedPayment.payment_kind)) {
      try { await cancelReplacedSubscription(supabaseAdmin, paystack, verifiedPayment); }
      catch (error) { return res.status(502).json({ error: error.message || 'Unable to complete subscription upgrade' }); }
    }
    const { data: refreshed } = await supabaseAdmin.from('billing_payments').select('*').eq('id', payment.id).single();
    const { provider_payload: _privateProviderPayload, ...safePayment } = refreshed || verifiedPayment;
    return res.json({ payment: safePayment });
  });
  // Subscription, listing (Silver, Gold, pay-as-you-list) and V-Coin payments, newest first, with the
  // payment method of the latest successful one. Unfinished checkouts are left out.
  router.get('/billing/payments', async (req, res) => {
    const user = await requireHost(req, res); if (!user) return;
    const { data, error } = await supabaseAdmin.from('billing_payments')
      .select('id,payment_kind,listing_tier,vcoins,amount_minor,currency,status,paid_at,created_at,provider_reference,verified_authorization:provider_payload->last_verification->authorization,renewal_authorization:provider_payload->authorization,billing_plans(display_name),listings(title)')
      .eq('host_id', user.id).in('status', HISTORY_STATUSES)
      .order('created_at', { ascending: false }).limit(100);
    if (error) return res.status(500).json({ error: 'Unable to load billing history' });
    const payments = (data || []).map(billingHistoryEntry);
    const latestPaid = payments.find((payment) => payment.status === 'succeeded' && payment.method);
    return res.json({ payments, payment_method: latestPaid ? latestPaid.method : null });
  });
  // The subscription's provider codes stay on the server.
  const subscriptionCodes = async (subscriptionId) => {
    const { data, error } = await supabaseAdmin.from('host_subscriptions')
      .select('provider_subscription_code,provider_email_token').eq('id', subscriptionId).maybeSingle();
    if (error) throw new Error('Unable to load subscription');
    return data || {};
  };
  router.get('/billing/subscription/manage-link', async (req, res) => {
    const user = await requireHost(req, res); if (!user) return;
    let subscription; let codes;
    try {
      subscription = await getCurrentSubscription(supabaseAdmin, user.id);
      codes = subscription ? await subscriptionCodes(subscription.id) : {};
    } catch { return res.status(500).json({ error: 'Unable to load subscription' }); }
    if (!subscription || !['active', 'past_due'].includes(subscription.status) || !codes.provider_subscription_code) {
      return res.status(400).json({ error: 'No subscription card to update' });
    }
    try {
      const result = await paystack.subscriptionManageLink(codes.provider_subscription_code);
      if (!result || typeof result.link !== 'string' || !result.link.startsWith('https://')) throw new Error('Paystack did not return a link');
      return res.json({ link: result.link });
    } catch { return res.status(502).json({ error: 'Unable to open the card update page' }); }
  });
  router.post('/billing/subscription/cancel', async (req, res) => {
    const user = await requireHost(req, res); if (!user) return;
    let subscription; let codes;
    try {
      subscription = await getCurrentSubscription(supabaseAdmin, user.id);
      codes = subscription ? await subscriptionCodes(subscription.id) : {};
    } catch { return res.status(500).json({ error: 'Unable to load subscription' }); }
    if (subscription && subscription.status === 'cancel_requested') return res.status(409).json({ error: 'This subscription is already cancelled' });
    if (!subscription || !codes.provider_subscription_code || !codes.provider_email_token) return res.status(400).json({ error: 'No cancellable subscription found' });
    try { await paystack.disableSubscription({ code: codes.provider_subscription_code, token: codes.provider_email_token }); }
    catch (error) { return res.status(502).json({ error: error.message || 'Unable to cancel subscription' }); }
    const { error: updateError } = await supabaseAdmin.from('host_subscriptions').update({ status: 'cancel_requested', cancel_at_period_end: true }).eq('id', subscription.id);
    // Paystack no longer renews it; its webhook records the same state if this write failed.
    if (updateError) console.error('Unable to record subscription cancellation', { subscriptionId: subscription.id, message: updateError.message });
    return res.json({ subscription: { ...subscription, status: 'cancel_requested', cancel_at_period_end: true } });
  });
  return router;
}
module.exports = { createBillingRoutes, authenticatedHost, billingNicheFor, paymentMethodFrom, billingHistoryEntry, VALID_PLAN_IDS, normalizeRequestedPlan, resolvePaymentCallbackOrigin, buildPaymentCallbackUrl, calculateTransitionAllowance };
