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

/** When the host's running plan for this category ends, or null with none. */
async function planCoverageEnd(supabaseAdmin, hostId, category, now = new Date()) {
  const niches = plansCovering(category);
  if (!niches.length) return null;
  const { data, error } = await supabaseAdmin.from('host_subscriptions').select('current_period_end')
    .eq('host_id', hostId).in('status', LIVE_STATUSES).in('niche', niches).gt('current_period_end', now.toISOString())
    .order('current_period_end', { ascending: false }).limit(1).maybeSingle();
  if (error) throw new Error('Unable to check the host plan');
  return data ? data.current_period_end : null;
}

/**
 * A confirmed plan payment: the host's published listings the plan covers
 * stay online until `until`, and Discover counts their days from `since`.
 * Listings on their own Silver / Gold term keep it.
 */
async function extendPlanListings(supabaseAdmin, { hostId, niche, until, since }) {
  const categories = categoriesCovered(niche);
  if (!hostId || !categories.length || !until) return;
  const { error } = await supabaseAdmin.from('listings').update({ live_until: until, live_since: since })
    .eq('host_id', hostId).in('category', categories).eq('publication_state', 'published').is('paid_listing_until', null);
  if (error) throw new Error('Unable to keep the plan listings online');
}

module.exports = { PLAN_CATEGORIES, plansCovering, categoriesCovered, planCoverageEnd, extendPlanListings };
