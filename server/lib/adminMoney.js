'use strict';

// What VaRoom earns, and the money controls on an account. VaRoom's income
// is plan subscriptions, Silver/Gold listing payments and V-Coin packs
// (billing_payments, through Paystack); bookings are paid to hosts directly.
// A free plan ("comp") is a host_subscriptions row with no Paystack code,
// marked provider_metadata.comp: Paystack never renews or cancels it, and it
// ends at current_period_end (expireFreePlans).

const { LIVE_STATUSES } = require('./billingEntitlement');
const { billingNicheFor, extendPlanListings } = require('./listingLive');

const DAY_MS = 86400000;
const createNotification = (...args) => require('./notifications').createNotification(...args);

const major = (minor) => Number(minor || 0) / 100;
// The listings a plan keeps online, as paid plans set it (billingService): a whole number, else no cap.
const allowance = (features) => { const cap = Number(features && features.max_active_listings); return Number.isInteger(cap) && cap > 0 ? cap : null; };
const isComp = (subscription) => Boolean(subscription && subscription.comp === true && !subscription.provider_subscription_code);

async function audit(admin, adminId, action, targetId, reason, metadata = {}) {
  const { error } = await admin.from('admin_activity').insert({ admin_id: adminId || null, action, target_type: 'user', target_id: String(targetId), reason: reason || null, metadata });
  if (error) console.error('Money audit failed:', error.message);
}

async function names(admin, ids) {
  const unique = [...new Set(ids.filter(Boolean))];
  if (!unique.length) return {};
  const { data, error } = await admin.from('profiles').select('id,full_name,username').in('id', unique);
  if (error) throw error;
  return Object.fromEntries((data || []).map((p) => [p.id, p.full_name || p.username || null]));
}

/** VaRoom's revenue over the last `range` days, its plans, and the payments that need a look. */
async function revenueReport(admin, range = 30, now = Date.now()) {
  const since = new Date(now - range * DAY_MS).toISOString();
  const [payments, subscriptions] = await Promise.all([
    admin.from('billing_payments').select('id,host_id,payment_kind,plan_id,listing_tier,amount_minor,currency,status,provider_reference,paid_at,vcoins,created_at')
      .gte('created_at', since).order('created_at', { ascending: false }),
    admin.from('host_subscriptions').select('id,host_id,plan_id,status,current_period_end,cancel_at_period_end,provider_subscription_code,comp:provider_metadata->comp,billing_plans(display_name,monthly_amount_minor)')
      .in('status', [...LIVE_STATUSES]),
  ]);
  if (payments.error || subscriptions.error) throw payments.error || subscriptions.error;
  const rows = payments.data || [];
  const live = (subscriptions.data || []).filter((s) => !s.current_period_end || new Date(s.current_period_end).getTime() > now);
  const who = await names(admin, [...rows.map((p) => p.host_id), ...live.map((s) => s.host_id)]);
  const payment = (p) => ({
    id: p.id, host_id: p.host_id, payer: who[p.host_id] || null, kind: p.payment_kind, plan_id: p.plan_id, listing_tier: p.listing_tier,
    vcoins: p.vcoins, amount: major(p.amount_minor), status: p.status, reference: p.provider_reference, date: p.paid_at || p.created_at,
  });
  const succeeded = rows.filter((p) => p.status === 'succeeded').map(payment);
  const byKind = { subscription: 0, listing: 0, vcoins: 0 };
  succeeded.forEach((p) => { byKind[p.kind] = (byKind[p.kind] || 0) + p.amount; });

  const paid = live.filter((s) => !isComp(s));
  const byPlan = {};
  paid.forEach((s) => {
    const plan = byPlan[s.plan_id] || (byPlan[s.plan_id] = { plan_id: s.plan_id, name: s.billing_plans && s.billing_plans.display_name || s.plan_id, count: 0, monthly: 0 });
    plan.count += 1;
    plan.monthly += major(s.billing_plans && s.billing_plans.monthly_amount_minor);
  });

  return {
    range,
    total: succeeded.reduce((sum, p) => sum + p.amount, 0),
    byKind,
    transactions: succeeded,
    series: Array.from({ length: range }, (_, i) => {
      const day = new Date(now - (range - 1 - i) * DAY_MS).toISOString().slice(0, 10);
      return { day, revenue: succeeded.filter((p) => String(p.date).slice(0, 10) === day).reduce((sum, p) => sum + p.amount, 0) };
    }),
    mrr: paid.reduce((sum, s) => sum + major(s.billing_plans && s.billing_plans.monthly_amount_minor), 0),
    subscribers: { paid: paid.length, pastDue: paid.filter((s) => s.status === 'past_due').length, cancelling: paid.filter((s) => s.cancel_at_period_end).length, byPlan: Object.values(byPlan) },
    failed: rows.filter((p) => ['failed', 'abandoned'].includes(p.status)).map(payment),
    refunded: rows.filter((p) => p.status === 'refunded').map(payment),
    freePlans: live.filter(isComp).map((s) => ({ host_id: s.host_id, host: who[s.host_id] || null, plan_id: s.plan_id, name: s.billing_plans && s.billing_plans.display_name || s.plan_id, until: s.current_period_end })),
  };
}

/** Succeeded payments in the last 7 days (the Overview figure), in KES. */
async function weekRevenue(admin, now = Date.now()) {
  const { data, error } = await admin.from('billing_payments').select('amount_minor').eq('status', 'succeeded').gte('created_at', new Date(now - 7 * DAY_MS).toISOString());
  if (error) throw error;
  return (data || []).reduce((sum, p) => sum + major(p.amount_minor), 0);
}

class MoneyError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}

/** The plans a host can be given: active ones of their posting niche. */
async function plansFor(admin, userId) {
  const { data: profile, error } = await admin.from('profiles').select('listing_categories').eq('id', userId).maybeSingle();
  if (error) throw error;
  const niche = billingNicheFor(Array.isArray(profile && profile.listing_categories) ? profile.listing_categories[0] : null);
  const { data, error: plansError } = await admin.from('billing_plans').select('id,display_name,niche,monthly_amount_minor,features').eq('niche', niche).eq('active', true).order('monthly_amount_minor');
  if (plansError) throw plansError;
  return (data || []).map((p) => ({ id: p.id, name: p.display_name, niche: p.niche, monthly: major(p.monthly_amount_minor), listings: allowance(p.features) }));
}

async function liveSubscription(admin, userId) {
  const { data, error } = await admin.from('host_subscriptions').select('id,plan_id,status,current_period_end,provider_subscription_code,comp:provider_metadata->comp')
    .eq('host_id', userId).in('status', ['pending', ...LIVE_STATUSES]).maybeSingle();
  if (error) throw error;
  return data || null;
}

/**
 * Gives a host a plan free for `days`, or extends (and may change) the free
 * plan they have. A plan they pay for through Paystack is left alone:
 * Paystack's next renewal would overwrite any change made here.
 */
async function giveFreePlan(admin, { userId, planId, days, reason, adminId }) {
  const plan = (await plansFor(admin, userId)).find((p) => p.id === planId);
  if (!plan) throw new MoneyError("That plan is not one of this host's niche plans");
  const current = await liveSubscription(admin, userId);
  if (current && !isComp(current)) throw new MoneyError('This host has a plan through Paystack (or a checkout in progress); change it in Paystack instead', 409);
  const now = new Date();
  const from = current && current.current_period_end && new Date(current.current_period_end) > now ? new Date(current.current_period_end) : now;
  const until = new Date(from.getTime() + days * DAY_MS).toISOString();
  const fields = { plan_id: plan.id, niche: plan.niche, status: 'active', current_period_end: until, cancel_at_period_end: true, listing_allowance_limit: plan.listings };
  const write = current
    ? admin.from('host_subscriptions').update(fields).eq('id', current.id)
    : admin.from('host_subscriptions').insert({ ...fields, host_id: userId, provider: 'paystack', current_period_start: now.toISOString(), provider_metadata: { comp: true, granted_by: adminId, reason } });
  const { error } = await write;
  if (error) throw error;
  await extendPlanListings(admin, { hostId: userId, niche: plan.niche, until, since: now.toISOString(), limit: plan.listings });
  await audit(admin, adminId, current ? 'free_plan_extended' : 'free_plan_given', userId, reason, { plan_id: plan.id, until });
  await createNotification({
    supabase: admin, recipientUserId: userId, type: 'plan_granted', title: `${plan.name} from VaRoom`,
    message: `VaRoom has given you the ${plan.name} plan free until ${new Date(until).toDateString()}.`,
    relatedEntityType: 'subscription', eventKey: `plan-granted:${userId}:${until}`,
  }).catch((notifyError) => console.error('Free plan notice failed:', notifyError.message));
  return { plan_id: plan.id, until };
}

/** Ends a free plan now (a paid one is ended in Paystack). */
async function endFreePlan(admin, { userId, reason, adminId }) {
  const current = await liveSubscription(admin, userId);
  if (!current || !isComp(current)) throw new MoneyError('This host has no free plan', 404);
  const { error } = await admin.from('host_subscriptions').update({ status: 'expired', current_period_end: new Date().toISOString() }).eq('id', current.id);
  if (error) throw error;
  await audit(admin, adminId, 'free_plan_ended', userId, reason, { plan_id: current.plan_id });
}

/** Free plans whose time is up end, so the host can choose a paid one. */
async function expireFreePlans(admin, now = new Date()) {
  const { data, error } = await admin.from('host_subscriptions').select('id,host_id,plan_id,provider_subscription_code,comp:provider_metadata->comp')
    .eq('status', 'active').lte('current_period_end', now.toISOString());
  if (error) throw error;
  const ended = (data || []).filter(isComp);
  for (const subscription of ended) {
    const { error: updateError } = await admin.from('host_subscriptions').update({ status: 'expired' }).eq('id', subscription.id).eq('status', 'active');
    if (updateError) throw updateError;
    await audit(admin, null, 'free_plan_expired', subscription.host_id, 'The free plan period ended', { plan_id: subscription.plan_id });
  }
  return ended.length;
}

/** Adds V-Coins to an account (a 'grant' in the ledger) and tells the person. */
async function grantVcoins(admin, { userId, amount, reason, adminId }) {
  const { error } = await admin.from('elie_ledger').insert({ user_id: userId, delta: amount, kind: 'grant' });
  if (error) throw error;
  await audit(admin, adminId, 'vcoins_granted', userId, reason, { amount });
  await createNotification({
    supabase: admin, recipientUserId: userId, type: 'vcoins_granted', title: 'V-Coins from VaRoom',
    message: `VaRoom has added ${amount} V-Coins to your Elie balance.`, relatedEntityType: 'vcoins', eventKey: `vcoins-granted:${userId}:${Date.now()}`,
  }).catch((notifyError) => console.error('V-Coin grant notice failed:', notifyError.message));
}

module.exports = { MoneyError, isComp, revenueReport, weekRevenue, plansFor, giveFreePlan, endFreePlan, expireFreePlans, grantVcoins };
