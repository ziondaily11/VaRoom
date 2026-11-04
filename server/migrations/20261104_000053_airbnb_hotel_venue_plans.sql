-- Niche plans for Airbnb, Hotel and Event Venue hosts. Additive: the legacy
-- basic/growth/pro plans stay intact for existing subscribers.
--
-- These plans unlock features only. The included listings / rooms / spaces
-- are shown on the pricing cards (included_* keys) and are deliberately NOT
-- stored as max_active_listings, so no publishing cap is enforced yet.
-- Paystack plan codes are read from the env vars named in paystack_plan_env.

alter table public.billing_plans drop constraint if exists billing_plans_id_check;
alter table public.billing_plans add constraint billing_plans_id_check check (
  id in ('basic', 'growth', 'pro', 'property_basic', 'property_pro', 'property_premium',
         'shops_basic', 'shops_pro', 'shops_premium',
         'airbnb_starter', 'airbnb_pro', 'airbnb_business',
         'hotel_dining', 'hotel_boutique', 'hotel_standard', 'hotel_plus',
         'venue_basic', 'venue_pro', 'venue_premium')
);

insert into public.billing_plans
  (id, display_name, currency, monthly_amount_minor, billing_interval, paystack_plan_code, features, active, niche, paystack_plan_env)
values
  ('airbnb_starter', 'Starter', 'KES', 150000, 'monthly', null,
    '{"included_listings":2,"analytics":true,"landing_page_promotion":false}'::jsonb,
    true, 'airbnb', 'PAYSTACK_PLAN_AIRBNB_STARTER'),
  ('airbnb_pro', 'Pro', 'KES', 350000, 'monthly', null,
    '{"included_listings":6,"analytics":true,"video_listings":true,"showcase":"niche","landing_page_promotion":true}'::jsonb,
    true, 'airbnb', 'PAYSTACK_PLAN_AIRBNB_PRO'),
  ('airbnb_business', 'Business', 'KES', 750000, 'monthly', null,
    '{"included_listings":15,"analytics":true,"video_listings":true,"showcase":"marketplace_and_discover","landing_page_promotion":true,"elie":true}'::jsonb,
    true, 'airbnb', 'PAYSTACK_PLAN_AIRBNB_BUSINESS'),
  ('hotel_dining', 'Dining', 'KES', 200000, 'monthly', null,
    '{"included_rooms":0,"table_reservations":true,"analytics":true,"landing_page_promotion":false}'::jsonb,
    true, 'hotel', 'PAYSTACK_PLAN_HOTEL_DINING'),
  ('hotel_boutique', 'Boutique', 'KES', 400000, 'monthly', null,
    '{"included_rooms":20,"table_reservations":true,"analytics":true,"video_listings":true,"landing_page_promotion":false}'::jsonb,
    true, 'hotel', 'PAYSTACK_PLAN_HOTEL_BOUTIQUE'),
  ('hotel_standard', 'Hotel', 'KES', 800000, 'monthly', null,
    '{"included_rooms":60,"table_reservations":true,"analytics":true,"video_listings":true,"showcase":"niche","landing_page_promotion":true}'::jsonb,
    true, 'hotel', 'PAYSTACK_PLAN_HOTEL_STANDARD'),
  ('hotel_plus', 'Hotel Plus', 'KES', 1500000, 'monthly', null,
    '{"included_rooms":null,"table_reservations":true,"analytics":true,"video_listings":true,"showcase":"marketplace_and_discover","landing_page_promotion":true,"elie":true}'::jsonb,
    true, 'hotel', 'PAYSTACK_PLAN_HOTEL_PLUS'),
  ('venue_basic', 'Venue', 'KES', 250000, 'monthly', null,
    '{"included_spaces":2,"analytics":true,"landing_page_promotion":false}'::jsonb,
    true, 'venue', 'PAYSTACK_PLAN_VENUE_BASIC'),
  ('venue_pro', 'Venue Pro', 'KES', 500000, 'monthly', null,
    '{"included_spaces":5,"analytics":true,"video_listings":true,"showcase":"niche","landing_page_promotion":true}'::jsonb,
    true, 'venue', 'PAYSTACK_PLAN_VENUE_PRO'),
  ('venue_premium', 'Venue Premium', 'KES', 1000000, 'monthly', null,
    '{"included_spaces":12,"analytics":true,"video_listings":true,"showcase":"marketplace_and_discover","landing_page_promotion":true,"elie":true}'::jsonb,
    true, 'venue', 'PAYSTACK_PLAN_VENUE_PREMIUM')
on conflict (id) do update set
  display_name = excluded.display_name,
  currency = excluded.currency,
  monthly_amount_minor = excluded.monthly_amount_minor,
  billing_interval = excluded.billing_interval,
  features = excluded.features,
  active = excluded.active,
  niche = excluded.niche,
  paystack_plan_env = excluded.paystack_plan_env,
  updated_at = now();
