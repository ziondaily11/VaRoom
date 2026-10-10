-- Additive Property + Shops & Offices monetization. Legacy plans remain intact.
alter table public.billing_plans drop constraint if exists billing_plans_id_check;
alter table public.billing_plans add constraint billing_plans_id_check check (
  id in ('basic', 'growth', 'pro', 'property_basic', 'property_pro', 'property_premium',
         'shops_basic', 'shops_pro', 'shops_premium')
);

alter table public.billing_plans add column if not exists niche text not null default 'legacy';
alter table public.billing_plans add column if not exists paystack_plan_env text;
alter table public.host_subscriptions add column if not exists niche text not null default 'legacy';
alter table public.billing_payments add column if not exists listing_id uuid references public.listings(id) on delete cascade;
alter table public.billing_payments add column if not exists payment_kind text not null default 'subscription';
alter table public.billing_payments add column if not exists niche text not null default 'legacy';
alter table public.billing_payments add column if not exists billing_interval text not null default 'monthly';
alter table public.billing_payments alter column subscription_id drop not null;
alter table public.billing_payments alter column plan_id drop not null;
alter table public.billing_payments add constraint billing_payments_kind_check
  check (payment_kind in ('subscription', 'listing'));
alter table public.billing_payments add constraint billing_payments_interval_check
  check (billing_interval in ('monthly', 'one_time'));
alter table public.listings add column if not exists paid_listing_until timestamptz;


insert into public.billing_plans
  (id, display_name, currency, monthly_amount_minor, billing_interval, paystack_plan_code, features, active, niche, paystack_plan_env)
values
  ('property_basic', 'Basic', 'KES', 300000, 'monthly', null, '{"max_active_listings":5,"analytics":true,"landing_page_promotion":false}'::jsonb, true, 'property', 'PAYSTACK_PLAN_PROPERTY_BASIC'),
  ('property_pro', 'Pro', 'KES', 600000, 'monthly', null, '{"max_active_listings":12,"analytics":true,"landing_page_promotion":true}'::jsonb, true, 'property', 'PAYSTACK_PLAN_PROPERTY_PRO'),
  ('property_premium', 'Premium', 'KES', 1200000, 'monthly', null, '{"max_active_listings":20,"analytics":true,"landing_page_promotion":true}'::jsonb, true, 'property', 'PAYSTACK_PLAN_PROPERTY_PREMIUM'),
  ('shops_basic', 'Basic', 'KES', 300000, 'monthly', null, '{"max_active_listings":5,"analytics":true,"landing_page_promotion":false}'::jsonb, true, 'shops_offices', 'PAYSTACK_PLAN_SHOPS_BASIC'),
  ('shops_pro', 'Pro', 'KES', 600000, 'monthly', null, '{"max_active_listings":12,"analytics":true,"landing_page_promotion":true}'::jsonb, true, 'shops_offices', 'PAYSTACK_PLAN_SHOPS_PRO'),
  ('shops_premium', 'Premium', 'KES', 1200000, 'monthly', null, '{"max_active_listings":20,"analytics":true,"landing_page_promotion":true}'::jsonb, true, 'shops_offices', 'PAYSTACK_PLAN_SHOPS_PREMIUM')
on conflict (id) do update set
  display_name = excluded.display_name,
  monthly_amount_minor = excluded.monthly_amount_minor,
  billing_interval = excluded.billing_interval,
  features = excluded.features,
  niche = excluded.niche,
  paystack_plan_env = excluded.paystack_plan_env,
  updated_at = now();

create index if not exists listings_host_active_category_idx
  on public.listings(host_id, category, availability_status);
create unique index if not exists billing_payments_one_listing_fee_idx
  on public.billing_payments(listing_id) where payment_kind = 'listing';
