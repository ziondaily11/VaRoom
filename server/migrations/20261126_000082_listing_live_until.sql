-- Listings are online only while paid for.
--
--   * Property, Shops & Offices: 30 days from publishing (Silver / Gold), or
--     until an older monthly plan's period ends.
--   * Airbnb, Hotel, Venue: until the host's plan period ends. When a plan
--     payment is confirmed (first or renewal) the server moves the host's
--     listings' live_until to the new period end and live_since to that day,
--     so VaRoom Discover's "listed X days ago" restarts (its order does not).
--
-- live_until is the one rule: the public read policies for listings, their
-- photos and booking details show a listing only while live_until is in the
-- future. Owners and their team still see their own listings. Only the server
-- sets live_until / live_since (the publication trigger keeps them).
--
-- Applied immediately (the owner's decision, 2026-11-26): listings with no
-- running Silver / Gold term or plan go offline when this runs.
--
-- Check before running (read only):
--   select category, count(*) filter (where publication_state = 'published' and availability_status = 'available') as live
--   from public.listings group by category order by category;

alter table public.listings add column if not exists live_until timestamptz;
alter table public.listings add column if not exists live_since timestamptz;
create index if not exists listings_live_until_idx on public.listings(live_until);

-- Backfill. Discover counts from creation until a payment restarts it.
update public.listings set live_since = created_at where live_since is null;
-- A running Silver / Gold (or older pay-as-you-list) term.
update public.listings set live_until = paid_listing_until
where live_until is null and paid_listing_until is not null and paid_listing_until > now();
-- A running plan: its period end, counted from its start.
update public.listings l
set live_until = s.period_end, live_since = greatest(l.created_at, coalesce(s.period_start, l.created_at))
from (
  select host_id, niche, max(current_period_end) as period_end, max(current_period_start) as period_start
  from public.host_subscriptions
  where status in ('active', 'past_due', 'cancel_requested') and current_period_end > now()
  group by host_id, niche
) s
where l.host_id = s.host_id and l.live_until is null and l.paid_listing_until is null
  and ((l.category = 'property' and s.niche = 'property')
    or (l.category in ('shop', 'office') and s.niche = 'shops_offices')
    or (l.category in ('airbnb', 'hotel', 'venue') and s.niche in (l.category, 'legacy')));

drop policy if exists "listings_published_public_select" on public.listings;
create policy "listings_published_public_select" on public.listings
  for select to anon, authenticated
  using (publication_state = 'published' and moderation_status = 'active' and live_until > now() and public.varoom_account_active(host_id));

drop policy if exists "listing_photos_published_select" on public.listing_photos;
create policy "listing_photos_published_select" on public.listing_photos
  for select to anon, authenticated
  using (exists (select 1 from public.listings l where l.id = listing_photos.listing_id
    and l.publication_state = 'published' and l.moderation_status = 'active' and l.live_until > now() and public.varoom_account_active(l.host_id)));

drop policy if exists "listing_booking_details_published_select" on public.listing_booking_details;
create policy "listing_booking_details_published_select" on public.listing_booking_details
  for select to anon, authenticated
  using (exists (select 1 from public.listings l where l.id = listing_booking_details.listing_id
    and l.publication_state = 'published' and l.moderation_status = 'active' and l.live_until > now()));

-- A booking request needs the listing online too (it only checked the client and the host's account).
drop policy if exists "Clients can create a booking request" on public.bookings;
create policy "Clients can create a booking request" on public.bookings
  for insert to public
  with check (auth.uid() = client_id and public.varoom_account_active(host_id)
    and exists (select 1 from public.listings l where l.id = bookings.listing_id and l.host_id = bookings.host_id
      and l.publication_state = 'published' and l.moderation_status = 'active' and l.live_until > now()));

CREATE OR REPLACE FUNCTION public.varoom_guard_listing_publication_state()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_role text := coalesce(auth.role(), current_setting('request.jwt.claim.role', true), '');
begin
  if v_role = 'service_role' then return new; end if;
  if tg_op = 'INSERT' then
    new.publication_state := 'draft';
    new.availability_status := 'draft';
    new.listing_tier := null;
    new.paid_listing_until := null;
    new.live_until := null;
    new.live_since := null;
    return new;
  end if;
  if new.publication_state is distinct from old.publication_state then
    raise exception 'Publication state may only be changed by the server' using errcode = '42501';
  end if;
  new.listing_tier := old.listing_tier;
  new.paid_listing_until := old.paid_listing_until;
  new.live_until := old.live_until;
  new.live_since := old.live_since;
  if old.publication_state <> 'published' and new.availability_status = 'available' then
    new.availability_status := 'draft';
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.activate_listing_with_entitlement(p_listing_id uuid, p_host_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
    set availability_status = 'available', publication_state = 'published',
        live_until = v_listing.paid_listing_until, live_since = case when v_listing.live_until > now() then coalesce(v_listing.live_since, now()) else now() end
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
    set availability_status = 'available', publication_state = 'published', paid_listing_until = null, listing_tier = null,
        live_until = coalesce(v_subscription.current_period_end, now() + interval '30 days'), live_since = case when v_listing.live_until > now() then coalesce(v_listing.live_since, now()) else now() end
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
      listing_tier = v_credit.listing_tier, paid_listing_until = now() + interval '30 days',
      live_until = now() + interval '30 days', live_since = now()
  where id = v_listing.id;
  return jsonb_build_object('listing', jsonb_build_object(
    'id', v_listing.id, 'availability_status', 'available', 'publication_state', 'published',
    'listing_tier', v_credit.listing_tier
  ));
end;
$function$;

revoke all on function public.activate_listing_with_entitlement(uuid, uuid) from public, anon, authenticated;
grant execute on function public.activate_listing_with_entitlement(uuid, uuid) to service_role;

-- Undo (puts listings back online regardless of payment):
--   drop policy "listings_published_public_select" on public.listings;
--   create policy "listings_published_public_select" on public.listings for select to anon, authenticated
--     using (publication_state = 'published' and moderation_status = 'active' and public.varoom_account_active(host_id));
--   drop policy "listing_photos_published_select" on public.listing_photos;
--   create policy "listing_photos_published_select" on public.listing_photos for select to anon, authenticated
--     using (exists (select 1 from public.listings l where l.id = listing_photos.listing_id and l.publication_state = 'published'
--       and l.moderation_status = 'active' and public.varoom_account_active(l.host_id)));
--   drop policy "listing_booking_details_published_select" on public.listing_booking_details;
--   create policy "listing_booking_details_published_select" on public.listing_booking_details for select to anon, authenticated
--     using (exists (select 1 from public.listings l where l.id = listing_booking_details.listing_id
--       and l.publication_state = 'published' and l.moderation_status = 'active'));
--   drop policy "Clients can create a booking request" on public.bookings;
--   create policy "Clients can create a booking request" on public.bookings for insert to public
--     with check (auth.uid() = client_id and public.varoom_account_active(host_id));
--   Then re-run activate_listing_with_entitlement and varoom_guard_listing_publication_state from
--   20261122_000078_silver_gold_listing_plans.sql (the columns may stay; nothing else reads them).
