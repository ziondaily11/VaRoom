'use strict';

const PLAN_RANK = { basic: 1, growth: 2, pro: 3 };
const LIVE_STATUSES = new Set(['active', 'past_due', 'cancel_requested']);

function planAtLeast(planId, requiredPlan) {
  return Boolean(PLAN_RANK[planId] && PLAN_RANK[requiredPlan] && PLAN_RANK[planId] >= PLAN_RANK[requiredPlan]);
}

async function getCurrentSubscription(supabaseAdmin, hostId) {
  const { data, error } = await supabaseAdmin.from('host_subscriptions')
    .select('id,host_id,plan_id,status,current_period_start,current_period_end,cancel_at_period_end,updated_at,billing_plans(id,display_name,features)')
    .eq('host_id', hostId).in('status', [...LIVE_STATUSES]).order('updated_at', { ascending: false }).limit(1).maybeSingle();
  if (error) throw new Error('Unable to load subscription');
  return data || null;
}

async function getHostEntitlements(supabaseAdmin, hostId) {
  const subscription = await getCurrentSubscription(supabaseAdmin, hostId);
  const planId = subscription && subscription.plan_id;
  const periodHasExpired = subscription && subscription.current_period_end && new Date(subscription.current_period_end).getTime() <= Date.now();
  const active = Boolean(subscription && LIVE_STATUSES.has(subscription.status) && !periodHasExpired);
  return {
    subscription,
    planId: active ? planId : null,
    active,
    hasGrowth: active && planAtLeast(planId, 'growth'),
    hasPro: active && planAtLeast(planId, 'pro'),
    canUploadPremiumVideo: active && planAtLeast(planId, 'growth'),
    // No listing quota exists in the product today; deliberately do not invent one.
    canCreateAnotherListing: { allowed: true, limit: null, reason: 'No listing limit is defined yet.' },
  };
}

module.exports = { PLAN_RANK, LIVE_STATUSES, planAtLeast, getCurrentSubscription, getHostEntitlements };
