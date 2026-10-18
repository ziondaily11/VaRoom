alter table public.listings
  add column if not exists publication_state text not null default 'published';

-- Legacy listing photos must also pass the server authorization endpoint.
update storage.buckets set public = false where id = 'listing-photos';
drop policy if exists varoom_listing_photos_private on storage.objects;
create policy varoom_listing_photos_private
  on storage.objects as restrictive
  for all to anon, authenticated
  using (bucket_id <> 'listing-photos')
  with check (bucket_id <> 'listing-photos');

alter table public.listings
  drop constraint if exists listings_publication_state_check;

alter table public.listings
  add constraint listings_publication_state_check
  check (publication_state in (
    'draft', 'payment_pending', 'failed', 'published',
    'discarded', 'cleanup_pending', 'expired'
  ));

-- Preserve existing availability semantics. Existing drafts and listings with
-- unresolved listing payments are private; all other legacy rows retain their
-- current visibility, including paused, booked, and unavailable listings.
update public.listings l
set publication_state = case
  when exists (
    select 1 from public.billing_payments bp
    where bp.listing_id = l.id
      and bp.payment_kind = 'listing'
      and bp.status in ('initialized', 'pending')
  ) then 'payment_pending'
  when exists (
    select 1 from public.billing_payments bp
    where bp.listing_id = l.id
      and bp.payment_kind = 'listing'
      and bp.status in ('failed', 'abandoned')
  ) then 'failed'
  when l.availability_status = 'draft' then 'draft'
  else 'published'
end;

create index if not exists listings_draft_expiry_idx
  on public.listings (created_at, id)
  where publication_state in ('draft', 'payment_pending', 'failed');

create table if not exists public.draft_media_cleanup_jobs (
  listing_id uuid primary key,
  host_id uuid not null,
  status text not null default 'queued'
    check (status in ('queued', 'processing', 'completed')),
  objects jsonb,
  attempts integer not null default 0,
  available_at timestamptz not null default now(),
  locked_until timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists draft_media_cleanup_jobs_ready_idx
  on public.draft_media_cleanup_jobs (available_at, created_at)
  where status in ('queued', 'processing');

create table if not exists public.draft_media_upload_sessions (
  object_key text primary key,
  listing_id uuid not null,
  host_id uuid not null,
  expires_at timestamptz not null,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists draft_media_upload_sessions_listing_idx
  on public.draft_media_upload_sessions (listing_id, expires_at);

alter table public.draft_media_cleanup_jobs enable row level security;
alter table public.draft_media_upload_sessions enable row level security;
revoke all on public.draft_media_cleanup_jobs from public, anon, authenticated;
revoke all on public.draft_media_upload_sessions from public, anon, authenticated;
grant all on public.draft_media_cleanup_jobs to service_role;
grant all on public.draft_media_upload_sessions to service_role;

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
    return new;
  end if;
  if new.publication_state is distinct from old.publication_state then
    raise exception 'Publication state may only be changed by the server' using errcode = '42501';
  end if;
  if old.publication_state <> 'published' and new.availability_status = 'available' then
    new.availability_status := 'draft';
  end if;
  return new;
end;
$$;

drop trigger if exists varoom_guard_listing_publication_state_trigger on public.listings;
create trigger varoom_guard_listing_publication_state_trigger
  before insert or update on public.listings
  for each row execute function public.varoom_guard_listing_publication_state();

create or replace function public.varoom_discard_draft_listing(
  p_listing_id uuid,
  p_host_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_state text;
begin
  select publication_state into v_state
  from public.listings
  where id = p_listing_id and host_id = p_host_id
  for update;

  if not found then
    raise exception 'Listing not found or not owned by this host' using errcode = 'P0002';
  end if;

  if v_state = 'discarded' or v_state = 'cleanup_pending' or v_state = 'expired' then
    return jsonb_build_object('queued', true, 'already_discarded', true);
  end if;
  if v_state not in ('draft', 'payment_pending', 'failed') then
    raise exception 'Only unpublished listings can be discarded' using errcode = '22023';
  end if;

  update public.listings set publication_state = 'discarded' where id = p_listing_id;
  insert into public.draft_media_cleanup_jobs (listing_id, host_id)
  values (p_listing_id, p_host_id)
  on conflict (listing_id) do update
    set status = 'queued', available_at = now(), locked_until = null,
        last_error = null, updated_at = now();
  return jsonb_build_object('queued', true, 'already_discarded', false);
end;
$$;

create or replace function public.claim_draft_media_cleanup(p_batch_size integer default 25)
returns setof public.draft_media_cleanup_jobs
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_batch_size < 1 or p_batch_size > 100 then
    raise exception 'Invalid cleanup batch size' using errcode = '22023';
  end if;

  insert into public.draft_media_cleanup_jobs (listing_id, host_id)
  select l.id, l.host_id
  from public.listings l
  where (
      l.publication_state in ('draft', 'payment_pending', 'failed')
      and l.created_at <= now() - interval '5 days'
    )
    or l.publication_state = 'discarded'
  on conflict (listing_id) do nothing;

  update public.listings l
  set publication_state = 'cleanup_pending'
  where l.publication_state in ('draft', 'payment_pending', 'failed', 'discarded')
    and (
      l.publication_state = 'discarded'
      or l.created_at <= now() - interval '5 days'
    )
    and exists (
      select 1 from public.draft_media_cleanup_jobs j
      where j.listing_id = l.id
    );

  return query
  with candidates as (
    select j.listing_id
    from public.draft_media_cleanup_jobs j
    join public.listings l on l.id = j.listing_id
    where j.available_at <= now()
      and (j.status = 'queued' or (j.status = 'processing' and j.locked_until < now()))
      and l.publication_state = 'cleanup_pending'
      and not exists (
        select 1 from public.property_media pm
        where pm.property_id = j.listing_id
          and pm.media_type = 'video'
          and (
            pm.status = 'processing'
            or (pm.status in ('pending', 'uploading') and pm.created_at + interval '30 minutes' > now())
          )
          and pm.deleted_at is null
      )
      and not exists (
        select 1 from public.draft_media_upload_sessions s
        where s.listing_id = j.listing_id and s.expires_at > now() - interval '2 hours'
      )
    order by j.created_at
    for update of j skip locked
    limit p_batch_size
  )
  update public.draft_media_cleanup_jobs j
  set status = 'processing',
      locked_until = now() + interval '10 minutes',
      objects = coalesce(j.objects, (
        select jsonb_build_object(
          'photos', coalesce((
            select jsonb_agg(lp.storage_path)
            from public.listing_photos lp where lp.listing_id = j.listing_id
          ), '[]'::jsonb),
          'media', coalesce((
            select jsonb_agg(jsonb_build_object(
              'storage_provider', pm.storage_provider,
              'storage_bucket', pm.storage_bucket,
              'storage_key', pm.storage_key,
              'thumbnail_key', pm.thumbnail_key
            ))
            from public.property_media pm where pm.property_id = j.listing_id
          ), '[]'::jsonb),
          'uploads', coalesce((
            select jsonb_agg(s.object_key)
            from public.draft_media_upload_sessions s where s.listing_id = j.listing_id
          ), '[]'::jsonb)
        )
      )),
      updated_at = now()
  from candidates c
  where j.listing_id = c.listing_id
  returning j.*;
end;
$$;

create or replace function public.retry_draft_media_cleanup(
  p_listing_id uuid,
  p_error text
)
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  update public.draft_media_cleanup_jobs
  set status = 'queued',
      attempts = attempts + 1,
      available_at = now() + make_interval(secs => least(3600, 30 * (2 ^ least(attempts, 7))::integer)),
      locked_until = null,
      last_error = left(p_error, 1000),
      updated_at = now()
  where listing_id = p_listing_id and status = 'processing'
$$;

create or replace function public.finish_draft_media_cleanup(p_listing_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not exists (
    select 1 from public.listings
    where id = p_listing_id and publication_state = 'cleanup_pending'
    for update
  ) then
    return false;
  end if;

  delete from public.property_media where property_id = p_listing_id;
  delete from public.listing_photos where listing_id = p_listing_id;
  delete from public.draft_media_upload_sessions where listing_id = p_listing_id;
  update public.listings set publication_state = 'expired' where id = p_listing_id;
  update public.draft_media_cleanup_jobs
  set status = 'completed', locked_until = null, last_error = null, updated_at = now()
  where listing_id = p_listing_id;
  return true;
end;
$$;

revoke all on function public.varoom_discard_draft_listing(uuid, uuid) from public, anon, authenticated;
revoke all on function public.claim_draft_media_cleanup(integer) from public, anon, authenticated;
revoke all on function public.retry_draft_media_cleanup(uuid, text) from public, anon, authenticated;
revoke all on function public.finish_draft_media_cleanup(uuid) from public, anon, authenticated;
grant execute on function public.varoom_discard_draft_listing(uuid, uuid) to service_role;
grant execute on function public.claim_draft_media_cleanup(integer) to service_role;
grant execute on function public.retry_draft_media_cleanup(uuid, text) to service_role;
grant execute on function public.finish_draft_media_cleanup(uuid) to service_role;

create or replace function public.reserve_property_video_upload(
  p_property_id uuid,
  p_host_id uuid,
  p_media_id uuid,
  p_upload_id text,
  p_storage_bucket text,
  p_storage_key text,
  p_original_filename text,
  p_mime_type text,
  p_file_size_bytes bigint,
  p_max_count integer
)
returns table (reserved boolean, current_count integer)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_listing public.listings%rowtype;
  v_count integer;
  v_visibility text;
begin
  select * into v_listing
  from public.listings
  where id = p_property_id and host_id = p_host_id
  for update;

  if not found
    or v_listing.publication_state in ('discarded', 'cleanup_pending', 'expired')
    or (
      v_listing.publication_state in ('draft', 'payment_pending', 'failed')
      and v_listing.created_at <= now() - interval '5 days'
    ) then
    return query select false, 0;
    return;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_property_id::text, 0));
  v_visibility := case
    when v_listing.publication_state in ('draft', 'payment_pending', 'failed') then 'restricted'
    else 'public'
  end;

  if v_visibility = 'restricted' and p_storage_key not like
    'drafts/videos/%/' || p_host_id::text || '/' || p_property_id::text || '/' || p_media_id::text || '/%' then
    raise exception 'Draft videos must use the private draft prefix' using errcode = '22023';
  end if;

  select count(*)::integer into v_count
  from public.property_media
  where property_id = p_property_id
    and media_type = 'video'
    and status in ('pending', 'uploading', 'processing', 'ready')
    and deleted_at is null;
  if v_count >= p_max_count then
    return query select false, v_count;
    return;
  end if;

  insert into public.property_media (
    id, property_id, host_id, media_type, storage_provider, storage_bucket,
    storage_key, original_filename, mime_type, file_size_bytes, status,
    visibility, upload_id, sort_order
  ) values (
    p_media_id, p_property_id, p_host_id, 'video', 'r2', p_storage_bucket,
    p_storage_key, p_original_filename, p_mime_type, p_file_size_bytes,
    'pending', v_visibility, p_upload_id, v_count
  );
  if v_visibility = 'restricted' then
    insert into public.draft_media_upload_sessions (object_key, listing_id, host_id, expires_at, completed_at)
    values
      (p_storage_key, p_property_id, p_host_id, now() + interval '30 minutes', now()),
      (regexp_replace(p_storage_key, '/original\.[^/.]+$', '/thumbnail.jpg'), p_property_id, p_host_id, now() + interval '30 minutes', now())
    on conflict (object_key) do nothing;
  end if;

  return query select true, v_count;
end;
$$;

revoke all on function public.reserve_property_video_upload(uuid, uuid, uuid, text, text, text, text, text, bigint, integer)
  from public, anon, authenticated;
grant execute on function public.reserve_property_video_upload(uuid, uuid, uuid, text, text, text, text, text, bigint, integer)
  to service_role;

create or replace function public.claim_property_video_finalization(
  p_property_id uuid,
  p_media_id uuid,
  p_host_id uuid,
  p_upload_id text
)
returns setof public.property_media
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_listing public.listings%rowtype;
begin
  select * into v_listing
  from public.listings
  where id = p_property_id and host_id = p_host_id
  for update;
  if not found
    or v_listing.publication_state in ('discarded', 'cleanup_pending', 'expired')
    or (
      v_listing.publication_state in ('draft', 'payment_pending', 'failed')
      and v_listing.created_at <= now() - interval '5 days'
    ) then
    return;
  end if;

  return query
  update public.property_media
  set status = 'processing', updated_at = now()
  where id = p_media_id
    and property_id = p_property_id
    and host_id = p_host_id
    and upload_id = p_upload_id
    and media_type = 'video'
    and status in ('pending', 'uploading')
    and deleted_at is null
  returning *;
end;
$$;

revoke all on function public.claim_property_video_finalization(uuid, uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.claim_property_video_finalization(uuid, uuid, uuid, text)
  to service_role;

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
  if v_listing.publication_state in ('discarded', 'cleanup_pending', 'expired')
    or (v_listing.publication_state in ('draft', 'payment_pending', 'failed')
      and v_listing.created_at <= now() - interval '5 days') then
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
  select hs.id, hs.current_period_end, bp.features
  into v_subscription
  from public.host_subscriptions hs
  join public.billing_plans bp on bp.id = hs.plan_id
  where hs.host_id = p_host_id and hs.status = 'active' and bp.niche = v_niche
    and (hs.current_period_end is null or hs.current_period_end > now())
  order by hs.updated_at desc limit 1;
  if not found then
    return jsonb_build_object(
      'code', 'LISTING_PAYMENT_REQUIRED',
      'error', 'A verified listing payment or active niche subscription is required before activation'
    );
  end if;

  v_limit := nullif(v_subscription.features->>'max_active_listings', '')::integer;
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
        'error', format('Your plan allows up to %s active listings. Upgrade your plan or deactivate a listing first.', v_limit)
      );
    end if;
  end if;

  update public.property_media set visibility = 'public'
  where property_id = p_listing_id and status = 'ready' and deleted_at is null;
  update public.listings
  set availability_status = 'available', publication_state = 'published', paid_listing_until = null
  where id = v_listing.id;
  return jsonb_build_object('listing', jsonb_build_object(
    'id', v_listing.id, 'availability_status', 'available', 'publication_state', 'published'
  ));
end;
$$;

revoke all on function public.activate_listing_with_entitlement(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.activate_listing_with_entitlement(uuid, uuid)
  to service_role;

create or replace function public.reserve_draft_photo_upload(
  p_listing_id uuid,
  p_host_id uuid,
  p_object_key text,
  p_expires_at timestamptz
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_listing public.listings%rowtype;
begin
  select * into v_listing
  from public.listings
  where id = p_listing_id and host_id = p_host_id
  for update;
  if not found
    or v_listing.publication_state not in ('draft', 'payment_pending', 'failed')
    or v_listing.created_at <= now() - interval '5 days'
    or p_object_key not like
      'drafts/photos/%/' || p_host_id::text || '/' || p_listing_id::text || '/%' then
    return false;
  end if;
  insert into public.draft_media_upload_sessions (object_key, listing_id, host_id, expires_at)
  values (p_object_key, p_listing_id, p_host_id, p_expires_at);
  return true;
end;
$$;

revoke all on function public.reserve_draft_photo_upload(uuid, uuid, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.reserve_draft_photo_upload(uuid, uuid, text, timestamptz)
  to service_role;
