'use strict';

// Silver and Gold: the per-listing plans of Property and Shops & Offices.
// A payment buys one listing credit; publishing a listing uses it and keeps
// that listing live for LISTING_TERM_DAYS (activate_listing_with_entitlement).
// The server owns the prices: the browser only names the tier.
const LISTING_TERM_DAYS = 30;
const LISTING_TIERS = Object.freeze({
  silver: Object.freeze({ id: 'silver', display_name: 'Silver', amount_minor: 100000 }),
  gold: Object.freeze({ id: 'gold', display_name: 'Gold', amount_minor: 200000 }),
});
/** billing_plans.niche values sold per listing. */
const LISTING_TIER_NICHES = new Set(['property', 'shops_offices']);

/** The tiers as /billing/plans rows (one-off, so billing_interval is one_time). */
function listingTierPlans(niche) {
  return Object.values(LISTING_TIERS).map((tier) => ({
    id: tier.id,
    display_name: tier.display_name,
    currency: 'KES',
    monthly_amount_minor: tier.amount_minor,
    billing_interval: 'one_time',
    features: { listing_days: LISTING_TERM_DAYS, landing_page_promotion: tier.id === 'gold' },
    niche,
  }));
}

module.exports = { LISTING_TERM_DAYS, LISTING_TIERS, LISTING_TIER_NICHES, listingTierPlans };
