-- Draft listings can be permanently removed by their owning host.
alter table public.listings
  drop constraint if exists listings_availability_status_check;

alter table public.listings
  add constraint listings_availability_status_check
  check (availability_status in ('available', 'booked', 'unavailable', 'paused', 'draft'));

-- Keep historical chat messages when their associated draft listing is deleted.
alter table public.messages
  drop constraint if exists messages_listing_id_fkey;

alter table public.messages
  add constraint messages_listing_id_fkey
  foreign key (listing_id) references public.listings(id) on delete set null;

create or replace function public.varoom_delete_draft_listing(
  p_listing_id uuid,
  p_host_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_status text;
  v_media jsonb;
begin
  if p_listing_id is null or p_host_id is null then
    raise exception 'A listing and host are required' using errcode = '22023';
  end if;

  select l.availability_status
    into v_status
    from public.listings l
   where l.id = p_listing_id
     and l.host_id = p_host_id
   for update;

  if not found then
    raise exception 'Listing not found or not owned by this host' using errcode = 'P0002';
  end if;

  if v_status <> 'draft' then
    raise exception 'Only draft listings can be permanently deleted here' using errcode = '22023';
  end if;

  if exists (select 1 from public.bookings b where b.listing_id = p_listing_id)
     or exists (select 1 from public.table_reservations r where r.listing_id = p_listing_id) then
    raise exception 'This listing has booking or reservation history and cannot be permanently deleted'
      using errcode = '23503';
  end if;

  if exists (select 1 from public.billing_payments bp where bp.listing_id = p_listing_id) then
    raise exception 'This listing has payment history and cannot be permanently deleted'
      using errcode = '23503';
  end if;

  select jsonb_build_object(
    'photo_paths', coalesce(
      (select jsonb_agg(lp.storage_path) from public.listing_photos lp where lp.listing_id = p_listing_id),
      '[]'::jsonb
    ),
    'property_media', coalesce(
      (
        select jsonb_agg(jsonb_build_object(
          'storage_provider', pm.storage_provider,
          'storage_bucket', pm.storage_bucket,
          'storage_key', pm.storage_key,
          'thumbnail_key', pm.thumbnail_key
        ))
        from public.property_media pm
        where pm.property_id = p_listing_id
      ),
      '[]'::jsonb
    )
  )
  into v_media;

  delete from public.availability where listing_id = p_listing_id;
  delete from public.bookmarks where listing_id = p_listing_id;
  delete from public.listing_photos where listing_id = p_listing_id;
  delete from public.listing_booking_details where listing_id = p_listing_id;
  delete from public.listings where id = p_listing_id and host_id = p_host_id;
  return v_media;
end;
$$;

revoke all on function public.varoom_delete_draft_listing(uuid, uuid) from public, anon, authenticated;
grant execute on function public.varoom_delete_draft_listing(uuid, uuid) to service_role;
