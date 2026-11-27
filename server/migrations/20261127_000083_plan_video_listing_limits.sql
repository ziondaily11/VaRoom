-- Video on a number of listings per plan (billing_plans.features.video_listing_limit).
--
-- Each plan allows a video on up to this many listings; each listing takes up
-- to 2 videos (server/lib/videoEntitlement.js). Property and Shops & Offices
-- (Silver / Gold, and the retired monthly plans) are photos only.
-- video_listings (true / false) is kept in step: existing code reads it.
--
-- Check before running (read only):
--   select id, niche, features->'video_listings' as video, features->'video_listing_limit' as limit
--   from public.billing_plans order by niche, monthly_amount_minor;

update public.billing_plans p
set features = coalesce(p.features, '{}'::jsonb) || jsonb_build_object('video_listing_limit', v.listings, 'video_listings', v.listings > 0),
    updated_at = now()
from (values
  ('airbnb_starter', 0), ('airbnb_pro', 2), ('airbnb_business', 5),
  ('hotel_dining', 0), ('hotel_boutique', 1), ('hotel_standard', 2), ('hotel_plus', 4),
  ('venue_basic', 0), ('venue_pro', 2), ('venue_premium', 5),
  ('basic', 0), ('growth', 1), ('pro', 3),
  ('property_basic', 0), ('property_pro', 0), ('property_premium', 0),
  ('shops_basic', 0), ('shops_pro', 0), ('shops_premium', 0)
) as v(id, listings)
where p.id = v.id;

-- Undo:
--   update public.billing_plans set features = features - 'video_listing_limit', updated_at = now();
--   update public.billing_plans set features = features || '{"video_listings": true}'::jsonb
--   where id in ('airbnb_pro', 'airbnb_business', 'hotel_boutique', 'hotel_standard', 'hotel_plus', 'venue_pro', 'venue_premium', 'growth', 'pro');
