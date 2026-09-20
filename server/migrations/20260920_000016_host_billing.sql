-- VaRoom host-plan billing foundation. Additive: no existing profile, listing,
-- booking, or media columns are changed. All money is stored in minor units.

create table if not exists public.billing_plans (
  id text primary key check (id in ('basic', 'growth', 'pro')),
  display_name text not null,
  currency char(3) not null default 'KES' check (currency = 'KES'),
  monthly_amount_minor integer not null check (monthly_amount_minor > 0),
  billing_interval text not null default 'monthly' check (billing_interval = 'monthly'),
  paystack_plan_code text unique,
  features jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.billing_plans (id, display_name, monthly_amount_minor, features) values
  ('basic', 'Basic', 80000, '{"core_host_tools":true,"storage":"limited","listing_access":"standard"}'::jsonb),
  ('growth', 'Growth', 130000, '{"core_host_tools":true,"video_listings":true,"storage":"increased","showcase":"niche"}'::jsonb),
  ('pro', 'Pro', 180000, '{"core_host_tools":true,"video_listings":true,"storage":"maximum","showcase":"marketplace_and_discover","elie":true}'::jsonb)
on conflict (id) do update set
  display_name = excluded.display_name,
  monthly_amount_minor = excluded.monthly_amount_minor,
  features = excluded.features,
  updated_at = now();

create table if not exists public.host_subscriptions (
  id uuid primary key default gen_random_uuid(),
  host_id uuid not null references public.profiles(id) on delete cascade,
  plan_id text not null references public.billing_plans(id),
  provider text not null default 'paystack' check (provider = 'paystack'),
  provider_subscription_code text unique,
  provider_email_token text,
  status text not null default 'pending' check (status in ('pending', 'active', 'past_due', 'cancel_requested', 'cancelled', 'expired', 'failed')),
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  provider_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists host_subscriptions_one_live_per_host_idx
  on public.host_subscriptions(host_id)
  where status in ('pending', 'active', 'past_due', 'cancel_requested');
create index if not exists host_subscriptions_host_status_idx
  on public.host_subscriptions(host_id, status, updated_at desc);

create table if not exists public.billing_payments (
  id uuid primary key default gen_random_uuid(),
  host_id uuid not null references public.profiles(id) on delete cascade,
  subscription_id uuid not null references public.host_subscriptions(id) on delete restrict,
  plan_id text not null references public.billing_plans(id),
  provider text not null default 'paystack' check (provider = 'paystack'),
  provider_reference text not null unique,
  provider_transaction_id text unique,
  amount_minor integer not null check (amount_minor > 0),
  currency char(3) not null default 'KES' check (currency = 'KES'),
  status text not null default 'initialized' check (status in ('initialized', 'pending', 'succeeded', 'failed', 'abandoned', 'refunded')),
  initialized_at timestamptz not null default now(),
  verified_at timestamptz,
  paid_at timestamptz,
  provider_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists billing_payments_host_created_idx on public.billing_payments(host_id, created_at desc);
create index if not exists billing_payments_subscription_idx on public.billing_payments(subscription_id, created_at desc);

create table if not exists public.paystack_webhook_events (
  id uuid primary key default gen_random_uuid(),
  provider_event_id text not null unique,
  event_type text not null,
  signature_verified boolean not null default false,
  payload jsonb not null,
  processing_status text not null default 'received' check (processing_status in ('received', 'processed', 'ignored', 'failed')),
  processing_error text,
  received_at timestamptz not null default now(),
  processed_at timestamptz
);
create index if not exists paystack_webhook_events_received_idx on public.paystack_webhook_events(received_at desc);

create or replace function public.varoom_billing_set_updated_at()
returns trigger language plpgsql security definer set search_path = public as $$
begin new.updated_at := now(); return new; end;
$$;
drop trigger if exists billing_plans_updated_at on public.billing_plans;
create trigger billing_plans_updated_at before update on public.billing_plans for each row execute function public.varoom_billing_set_updated_at();
drop trigger if exists host_subscriptions_updated_at on public.host_subscriptions;
create trigger host_subscriptions_updated_at before update on public.host_subscriptions for each row execute function public.varoom_billing_set_updated_at();
drop trigger if exists billing_payments_updated_at on public.billing_payments;
create trigger billing_payments_updated_at before update on public.billing_payments for each row execute function public.varoom_billing_set_updated_at();

-- No browser policies are created. With RLS enabled, browser anon/authenticated
-- roles cannot read or mutate billing records; Render's service-role client owns writes.
alter table public.billing_plans enable row level security;
alter table public.host_subscriptions enable row level security;
alter table public.billing_payments enable row level security;
alter table public.paystack_webhook_events enable row level security;
