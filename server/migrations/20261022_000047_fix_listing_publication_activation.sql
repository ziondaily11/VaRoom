-- The subscription allowance migration recreated the activation function but
-- dropped its publication_state transition. A paid listing was then left in
-- payment_pending with available=true, so its private media was shown in
-- public feeds and returned 404 from the media route.
-- Keep the allowance logic and make activation publish the same listing
-- record, idempotently, after entitlement has been verified.
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

  if v_listing.category not in ('property', 'shop', 'office') then
    return jsonb_build_object('code', 'INVALID_LISTING_NICHE', 'error', 'This listing is outside paid listing entitlements');
  end if;

  if v_listing.paid_listing_until is not null and v_listing.paid_listing_until > now() then
    update public.property_media
    set visibility = 'public'
    where property_id = v_listing.id and status = 'ready' and deleted_at is null;
    update public.listings
    set availability_status = 'available', publication_state = 'published'
    where id = v_listing.id;
    return jsonb_build_object('listing', jsonb_build_object(
      'id', v_listing.id,
      'availability_status', 'available',
      'publication_state', 'published'
    ));
  end if;

  v_niche := case when v_listing.category = 'property' then 'property' else 'shops_offices' end;
  perform pg_advisory_xact_lock(hashtextextended(p_host_id::text || ':' || v_niche, 0));

  select hs.id, hs.current_period_end, hs.listing_allowance_limit, bp.features
  into v_subscription
  from public.host_subscriptions hs
  join public.billing_plans bp on bp.id = hs.plan_id
  where hs.host_id = p_host_id
    and hs.status = 'active'
    and bp.niche = v_niche
    and (hs.current_period_end is null or hs.current_period_end > now())
  order by hs.updated_at desc
  limit 1;

  if not found then
    return jsonb_build_object(
      'code', 'LISTING_PAYMENT_REQUIRED',
      'error', 'A verified listing payment or active niche subscription is required before activation'
    );
  end if;

  v_limit := coalesce(v_subscription.listing_allowance_limit, nullif(v_subscription.features->>'max_active_listings', '')::integer);
  if v_limit is not null and v_limit > 0 then
    if v_listing.category = 'property' then
      select count(*) into v_active_count
      from public.listings
      where host_id = p_host_id
        and category = 'property'
        and availability_status = 'available'
        and paid_listing_until is null
        and publication_state = 'published'
        and id <> v_listing.id;
    else
      select count(*) into v_active_count
      from public.listings
      where host_id = p_host_id
        and category in ('shop', 'office')
        and availability_status = 'available'
        and paid_listing_until is null
        and publication_state = 'published'
        and id <> v_listing.id;
    end if;

    if v_active_count >= v_limit then
      return jsonb_build_object(
        'code', 'LISTING_LIMIT_REACHED',
        'error', format('Your plan allows up to %s active listings. Upgrade your plan or deactivate a listing first.', v_limit)
      );
    end if;
  end if;

  update public.property_media
  set visibility = 'public'
  where property_id = v_listing.id and status = 'ready' and deleted_at is null;
  update public.listings
  set availability_status = 'available', publication_state = 'published', paid_listing_until = null
  where id = v_listing.id;
  return jsonb_build_object('listing', jsonb_build_object(
    'id', v_listing.id,
    'availability_status', 'available',
    'publication_state', 'published'
  ));
end;
$$;

revoke all on function public.activate_listing_with_entitlement(uuid, uuid) from public, anon, authenticated;
grant execute on function public.activate_listing_with_entitlement(uuid, uuid) to service_role;

-- Repair rows that already completed a verified listing payment and were
-- marked available by the broken function, but never received the published
-- publication state. The guard trigger intentionally rejects direct state
-- changes, so this one-time, tightly scoped repair disables only that trigger
-- inside the migration and restores it before the migration finishes.
do $$
begin
  execute 'alter table public.listings disable trigger varoom_guard_listing_publication_state_trigger';
  begin
    update public.listings l
    set publication_state = 'published'
    where l.publication_state = 'payment_pending'
      and l.availability_status = 'available'
      and l.moderation_status = 'active'
      and l.paid_listing_until > now()
      and exists (
        select 1
        from public.billing_payments p
        where p.listing_id = l.id
          and p.host_id = l.host_id
          and p.payment_kind = 'listing'
          and p.status = 'succeeded'
      );
  exception when others then
    execute 'alter table public.listings enable trigger varoom_guard_listing_publication_state_trigger';
    raise;
  end;
  execute 'alter table public.listings enable trigger varoom_guard_listing_publication_state_trigger';
end;
$$;
