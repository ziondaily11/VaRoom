-- Silver and Gold listing plans for Property and Shops & Offices.
--
-- The monthly Basic / Pro / Premium plans of these two niches are no longer
-- sold (active = false). Hosts already subscribed keep publishing until their
-- paid period ends: activation still honours their subscription.
--
-- Instead a host buys a listing credit, Silver (KES 1,000) or Gold
-- (KES 2,000): a billing_payments row with payment_kind 'listing', a
-- listing_tier and no listing_id. Publishing a listing uses the host's oldest
-- unused credit for that niche: the credit gets the listing_id and
-- consumed_at, and the listing gets the tier and 30 days live
-- (paid_listing_until) from that moment. Gold listings rank first in
-- Marketplace (tier_rank) and are the only paid ones eligible for the landing page.
--
-- Older pay-as-you-list payments (listing_id set at checkout, no tier) keep
-- working as before. Safe to re-run.
--
-- Check before running (read only; works before this migration):
--   1. The live activation function this migration replaces:
--        select pg_get_functiondef('public.activate_listing_with_entitlement(uuid, uuid)'::regprocedure);
--   2. Property / Shops & Offices subscriptions still running (they stay honoured):
--        select hs.host_id, hs.plan_id, hs.status, hs.current_period_end
--        from public.host_subscriptions hs
--        where hs.plan_id in ('property_basic', 'property_pro', 'property_premium', 'shops_basic', 'shops_pro', 'shops_premium')
--          and hs.status in ('active', 'past_due', 'cancel_requested');

alter table public.listings add column if not exists listing_tier text;
alter table public.listings drop constraint if exists listings_listing_tier_check;
alter table public.listings add constraint listings_listing_tier_check
  check (listing_tier is null or listing_tier in ('silver', 'gold'));
alter table public.listings add column if not exists tier_rank smallint
  generated always as (case when listing_tier = 'gold' then 1 else 0 end) stored;

alter table public.billing_payments add column if not exists listing_tier text;
alter table public.billing_payments drop constraint if exists billing_payments_listing_tier_check;
alter table public.billing_payments add constraint billing_payments_listing_tier_check
  check (listing_tier is null or (listing_tier in ('silver', 'gold') and payment_kind = 'listing'));
alter table public.billing_payments add column if not exists consumed_at timestamptz;

-- One pay-as-you-list payment per listing still holds for the older
-- listing-bound payments; a listing may use a new credit each time its term ends.
drop index if exists public.billing_payments_one_listing_fee_idx;
create unique index if not exists billing_payments_one_listing_fee_idx
  on public.billing_payments(listing_id) where payment_kind = 'listing' and listing_tier is null;
create index if not exists billing_payments_unused_credit_idx
  on public.billing_payments(host_id, niche, paid_at)
  where payment_kind = 'listing' and listing_tier is not null and status = 'succeeded' and consumed_at is null;
create index if not exists listings_tier_rank_created_idx on public.listings(tier_rank desc, created_at desc);

update public.billing_plans set active = false, updated_at = now()
where niche in ('property', 'shops_offices') and active;

-- Only the server sets a listing's tier and paid term (as it does publication_state).
create or replace function public.varoom_guard_listing_publication_state()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_role text := coalesce(auth.role(), current_setting('request.jwt.claim.role', true), '');
begin
  if v_role = 'service_role' then return new; end if;
  if tg_op = 'INSERT' then
    new.publication_state := 'draft';
    new.availability_status := 'draft';
    new.listing_tier := null;
    new.paid_listing_until := null;
    return new;
  end if;
  if new.publication_state is distinct from old.publication_state then
    raise exception 'Publication state may only be changed by the server' using errcode = '42501';
  end if;
  new.listing_tier := old.listing_tier;
  new.paid_listing_until := old.paid_listing_until;
  if old.publication_state <> 'published' and new.availability_status = 'available' then
    new.availability_status := 'draft';
  end if;
  return new;
end;
$$;

create or replace function public.activate_listing_with_entitlement(
  p_listing_id uuid,
  p_host_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_listing public.listings%rowtype;
  v_subscription record;
  v_credit record;
  v_limit integer;
  v_active_count integer;
  v_niche text;
begin
  select * into v_listing
  from public.listings
  where id = p_listing_id and host_id = p_host_id
  for update;
  if not found then
    return jsonb_build_object('code', 'LISTING_NOT_FOUND', 'error', 'Listing not found');
  end if;
  if v_listing.publication_state in ('discarded', 'cleanup_pending', 'expired')
    or (v_listing.publication_state in ('draft', 'payment_pending', 'failed')
      and v_listing.created_at <= now() - interval '7 days') then
    return jsonb_build_object('code', 'LISTING_NOT_FOUND', 'error', 'Listing is no longer publishable');
  end if;
  if v_listing.category not in ('property', 'shop', 'office') then
    return jsonb_build_object('code', 'INVALID_LISTING_NICHE', 'error', 'This listing is outside paid listing entitlements');
  end if;
  if nullif(trim(v_listing.title), '') is null
    or nullif(trim(v_listing.description), '') is null
    or nullif(trim(v_listing.location_text), '') is null then
    return jsonb_build_object('code', 'LISTING_INVALID', 'error', 'Required listing details are missing');
  end if;
  if exists (
    select 1 from public.property_media
    where property_id = p_listing_id and deleted_at is null
      and status not in ('ready', 'deleted')
  ) then
    return jsonb_build_object('code', 'LISTING_MEDIA_NOT_READY', 'error', 'Listing media is still processing');
  end if;

  -- 1. A paid term still running (a Silver / Gold credit or an older pay-as-you-list payment).
  if v_listing.paid_listing_until is not null and v_listing.paid_listing_until > now() then
    update public.property_media set visibility = 'public'
    where property_id = p_listing_id and status = 'ready' and deleted_at is null;
    update public.listings
    set availability_status = 'available', publication_state = 'published'
    where id = v_listing.id;
    return jsonb_build_object('listing', jsonb_build_object(
      'id', v_listing.id, 'availability_status', 'available', 'publication_state', 'published'
    ));
  end if;

  v_niche := case when v_listing.category = 'property' then 'property' else 'shops_offices' end;
  perform pg_advisory_xact_lock(hashtextextended(p_host_id::text || ':' || v_niche, 0));

  -- 2. A monthly plan bought before Silver and Gold, until its period ends.
  select hs.id, hs.current_period_end, hs.listing_allowance_limit, bp.features
  into v_subscription
  from public.host_subscriptions hs
  join public.billing_plans bp on bp.id = hs.plan_id
  where hs.host_id = p_host_id and hs.status = 'active' and bp.niche = v_niche
    and (hs.current_period_end is null or hs.current_period_end > now())
  order by hs.updated_at desc limit 1;
  if found then
    v_limit := coalesce(v_subscription.listing_allowance_limit, nullif(v_subscription.features->>'max_active_listings', '')::integer);
    if v_limit is not null and v_limit > 0 then
      select count(*) into v_active_count
      from public.listings
      where host_id = p_host_id
        and (case when v_listing.category = 'property' then category = 'property' else category in ('shop', 'office') end)
        and availability_status = 'available'
        and paid_listing_until is null
        and publication_state = 'published'
        and id <> v_listing.id;
      if v_active_count >= v_limit then
        return jsonb_build_object(
          'code', 'LISTING_LIMIT_REACHED',
          'error', format('Your plan allows up to %s active listings. Deactivate a listing first.', v_limit)
        );
      end if;
    end if;
    update public.property_media set visibility = 'public'
    where property_id = p_listing_id and status = 'ready' and deleted_at is null;
    update public.listings
    set availability_status = 'available', publication_state = 'published', paid_listing_until = null, listing_tier = null
    where id = v_listing.id;
    return jsonb_build_object('listing', jsonb_build_object(
      'id', v_listing.id, 'availability_status', 'available', 'publication_state', 'published'
    ));
  end if;

  -- 3. The host's oldest unused Silver / Gold credit: 30 days live from now.
  select bp.id, bp.listing_tier into v_credit
  from public.billing_payments bp
  where bp.host_id = p_host_id and bp.payment_kind = 'listing' and bp.listing_tier is not null
    and bp.status = 'succeeded' and bp.consumed_at is null and bp.listing_id is null and bp.niche = v_niche
  order by bp.paid_at nulls last, bp.created_at
  limit 1
  for update skip locked;
  if not found then
    return jsonb_build_object(
      'code', 'LISTING_PAYMENT_REQUIRED',
      'error', 'Choose Silver or Gold before publishing this listing'
    );
  end if;

  update public.billing_payments set listing_id = v_listing.id, consumed_at = now(), updated_at = now()
  where id = v_credit.id;
  update public.property_media set visibility = 'public'
  where property_id = p_listing_id and status = 'ready' and deleted_at is null;
  update public.listings
  set availability_status = 'available', publication_state = 'published',
      listing_tier = v_credit.listing_tier, paid_listing_until = now() + interval '30 days'
  where id = v_listing.id;
  return jsonb_build_object('listing', jsonb_build_object(
    'id', v_listing.id, 'availability_status', 'available', 'publication_state', 'published',
    'listing_tier', v_credit.listing_tier
  ));
end;
$$;

revoke all on function public.activate_listing_with_entitlement(uuid, uuid) from public, anon, authenticated;
grant execute on function public.activate_listing_with_entitlement(uuid, uuid) to service_role;
