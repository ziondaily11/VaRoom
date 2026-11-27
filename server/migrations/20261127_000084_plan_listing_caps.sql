-- Airbnb and Venue plans cap how many listings are online at once
-- (billing_plans.features.max_active_listings), the numbers on their pricing
-- cards. Publishing past the cap is refused (LISTING_LIMIT_REACHED) and the
-- wizard offers the next plan; a plan payment keeps at most that many online.
-- Hotel plans count rooms, not listings, and older plans keep no cap.
--
-- Check first (6 rows, max_active_listings empty before, set after):
--   select id, features->'max_active_listings' as cap, features->'included_listings' as listings, features->'included_spaces' as spaces
--   from public.billing_plans where id in ('airbnb_starter', 'airbnb_pro', 'airbnb_business', 'venue_basic', 'venue_pro', 'venue_premium')
--   order by niche, monthly_amount_minor;

update public.billing_plans p
set features = coalesce(p.features, '{}'::jsonb) || jsonb_build_object('max_active_listings', v.listings),
    updated_at = now()
from (values
  ('airbnb_starter', 2), ('airbnb_pro', 6), ('airbnb_business', 15),
  ('venue_basic', 2), ('venue_pro', 5), ('venue_premium', 12)
) as v(id, listings)
where p.id = v.id;

-- Undo:
--   update public.billing_plans set features = features - 'max_active_listings', updated_at = now()
--   where id in ('airbnb_starter', 'airbnb_pro', 'airbnb_business', 'venue_basic', 'venue_pro', 'venue_premium');
