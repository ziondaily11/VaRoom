'use strict';

// How long a listing stays online (listings.live_until; the public read
// policies hide it after that). Property, Shops & Offices: Silver / Gold's 30
// days, set by activate_listing_with_entitlement. Airbnb, Hotel, Venue: until
// the host's plan period ends; a confirmed plan payment moves the host's
// listings to the new period end and restarts Discover's count (live_since).

const PLAN_CATEGORIES = new Set(['airbnb', 'hotel', 'venue']);
const LIVE_STATUSES = ['active', 'past_due', 'cancel_requested'];

/** The billing niches whose plans keep a listing of this category online. */
function plansCovering(category) {
  if (PLAN_CATEGORIES.has(category)) return [category, 'legacy'];
  if (category === 'property') return ['property'];
  if (category === 'shop' || category === 'office') return ['shops_offices'];
  return [];
}

/** The listing categories a plan of this billing niche keeps online. */
function categoriesCovered(niche) {
  if (niche === 'legacy') return [...PLAN_CATEGORIES];
  if (PLAN_CATEGORIES.has(niche) || niche === 'property') return [niche];
  if (niche === 'shops_offices') return ['shop', 'office'];
  return [];
}

/** A plan's listing cap (billing_plans.features.max_active_listings, or the subscription's own), or null with none. */
function listingCap(subscription) {
  const features = subscription && subscription.billing_plans && subscription.billing_plans.features || {};
  const cap = Number(subscription && subscription.listing_allowance_limit != null ? subscription.listing_allowance_limit : features.max_active_listings);
  return Number.isInteger(cap) && cap > 0 ? cap : null;
}

/**
 * The host's running plan for this category, or null with none: when it ends,
 * its listing cap (null: no cap) and how many of its listings are online now
 * (`exceptId` left out, so republishing a listing doesn't count it twice).
 */
async function planAllowance(supabaseAdmin, hostId, category, { exceptId = null, now = new Date() } = {}) {
  const niches = plansCovering(category);
  if (!niches.length) return null;
  const { data: plan, error } = await supabaseAdmin.from('host_subscriptions')
    .select('plan_id,niche,current_period_end,listing_allowance_limit,billing_plans(display_name,features)')
    .eq('host_id', hostId).in('status', LIVE_STATUSES).in('niche', niches).gt('current_period_end', now.toISOString())
    .order('current_period_end', { ascending: false }).limit(1).maybeSingle();
  if (error) throw new Error('Unable to check the host plan');
  if (!plan) return null;
  const limit = listingCap(plan);
  let used = 0;
  if (limit) {
    const query = supabaseAdmin.from('listings').select('id', { count: 'exact', head: true })
      .eq('host_id', hostId).in('category', categoriesCovered(plan.niche)).eq('publication_state', 'published')
      .eq('availability_status', 'available').gt('live_until', now.toISOString());
    if (exceptId) query.neq('id', exceptId);
    const { count, error: countError } = await query;
    if (countError) throw new Error('Unable to count the online listings');
    used = count || 0;
  }
  return { planId: plan.plan_id, planName: plan.billing_plans && plan.billing_plans.display_name || 'current', end: plan.current_period_end, limit, used };
}

/**
 * A confirmed plan payment: the host's published listings the plan covers
 * stay online until `until`, and Discover counts their days from `since`.
 * With a cap, only that many: the ones online now first, then the newest.
 * Listings on their own Silver / Gold term keep it.
 */
async function extendPlanListings(supabaseAdmin, { hostId, niche, until, since, limit = null }) {
  const categories = categoriesCovered(niche);
  if (!hostId || !categories.length || !until) return;
  const update = supabaseAdmin.from('listings').update({ live_until: until, live_since: since })
    .eq('host_id', hostId).in('category', categories).eq('publication_state', 'published').is('paid_listing_until', null);
  if (Number.isInteger(limit) && limit > 0) {
    const { data: kept, error: pickError } = await supabaseAdmin.from('listings').select('id')
      .eq('host_id', hostId).in('category', categories).eq('publication_state', 'published').eq('availability_status', 'available')
      .is('paid_listing_until', null).order('live_until', { ascending: false, nullsFirst: false }).order('created_at', { ascending: false }).limit(limit);
    if (pickError) throw new Error('Unable to keep the plan listings online');
    update.in('id', (kept || []).map((row) => row.id));
  }
  const { error } = await update;
  if (error) throw new Error('Unable to keep the plan listings online');
}

/** The billing_plans.niche for a host's posting niche (profiles.listing_categories[0]). */
function billingNicheFor(hostNiche) {
  if (hostNiche === 'property') return 'property';
  if (['shop', 'office'].includes(hostNiche)) return 'shops_offices';
  if (PLAN_CATEGORIES.has(hostNiche)) return hostNiche;
  return 'legacy';
}

module.exports = { PLAN_CATEGORIES, plansCovering, categoriesCovered, listingCap, planAllowance, extendPlanListings, billingNicheFor };
