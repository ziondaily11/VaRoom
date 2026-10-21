-- During an upgrade, the host retains unused active-listing slots from the
-- prior period and receives the new plan's standard allowance. Renewals reset
-- this override to the plan's standard max_active_listings value.
alter table public.host_subscriptions
  add column if not exists listing_allowance_limit integer
  check (listing_allowance_limit is null or listing_allowance_limit > 0);

-- The route records a unique reservation before contacting Paystack. This
-- serializes parallel checkout requests without changing legacy payment rows.
create unique index if not exists billing_payments_checkout_reservation_idx
  on public.billing_payments(subscription_id)
  where payment_kind = 'subscription'
    and status in ('initialized', 'pending')
    and provider_payload->>'checkout_reservation' = 'true';

-- Keep the existing per-host/niche transaction lock and active-listing model;
-- only the effective allowance source changes for upgraded subscriptions.
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
    update public.listings set availability_status = 'available' where id = v_listing.id;
    return jsonb_build_object('listing', jsonb_build_object('id', v_listing.id, 'availability_status', 'available'));
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
        and id <> v_listing.id;
    else
      select count(*) into v_active_count
      from public.listings
      where host_id = p_host_id
        and category in ('shop', 'office')
        and availability_status = 'available'
        and paid_listing_until is null
        and id <> v_listing.id;
    end if;

    if v_active_count >= v_limit then
      return jsonb_build_object(
        'code', 'LISTING_LIMIT_REACHED',
        'error', format('Your plan allows up to %s active listings. Upgrade your plan or deactivate a listing first.', v_limit)
      );
    end if;
  end if;

  update public.listings set availability_status = 'available', paid_listing_until = null where id = v_listing.id;
  return jsonb_build_object('listing', jsonb_build_object('id', v_listing.id, 'availability_status', 'available'));
end;
$$;

revoke all on function public.activate_listing_with_entitlement(uuid, uuid) from public, anon, authenticated;
grant execute on function public.activate_listing_with_entitlement(uuid, uuid) to service_role;
