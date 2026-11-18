-- Unpaid drafts follow the Terms of Service (Plans & Billing, "Failed
-- payments"): "Unpaid drafts are automatically deleted after 7 days together
-- with all their details."
--
-- Before: unpublished listings (draft, payment_pending, failed) lost their
-- media after 5 days, and their saved draft (host_listing_drafts: title,
-- form details) was never deleted, so its box stayed on the host's profile.
-- Now:
--   * 7 days everywhere (cleanup claim, video and photo upload guards); the
--     server reads the same number (server/lib/draftRetention.js).
--   * When the cleanup finishes, or the host discards the draft, the saved
--     draft rows linked to that listing are deleted too.
--   * Saved drafts never linked to a listing (no media on the server) are
--     deleted 7 days after they were created.
-- Function bodies are otherwise unchanged from
-- 20261018_000040_draft_media_lifecycle.sql. Safe to re-run.
--
-- Check before running (read only; works before this migration): the saved
-- drafts the first cleanup run will delete.
--   select d.id, d.host_id, d.listing_id, d.created_at, l.publication_state
--   from public.host_listing_drafts d
--   left join public.listings l on l.id = d.listing_id
--   where (d.listing_id is null and d.created_at <= now() - interval '7 days')
--      or l.publication_state in ('discarded', 'cleanup_pending', 'expired')
--      or (l.publication_state in ('draft', 'payment_pending', 'failed') and l.created_at <= now() - interval '7 days');

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
    delete from public.host_listing_drafts where listing_id = p_listing_id and host_id = p_host_id;
    return jsonb_build_object('queued', true, 'already_discarded', true);
  end if;
  if v_state not in ('draft', 'payment_pending', 'failed') then
    raise exception 'Only unpublished listings can be discarded' using errcode = '22023';
  end if;

  update public.listings set publication_state = 'discarded' where id = p_listing_id;
  delete from public.host_listing_drafts where listing_id = p_listing_id and host_id = p_host_id;
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

  -- Saved drafts that never reached a listing hold no server media: delete them after 7 days.
  delete from public.host_listing_drafts
  where listing_id is null and created_at <= now() - interval '7 days';

  insert into public.draft_media_cleanup_jobs (listing_id, host_id)
  select l.id, l.host_id
  from public.listings l
  where (
      l.publication_state in ('draft', 'payment_pending', 'failed')
      and l.created_at <= now() - interval '7 days'
    )
    or l.publication_state = 'discarded'
  on conflict (listing_id) do nothing;

  update public.listings l
  set publication_state = 'cleanup_pending'
  where l.publication_state in ('draft', 'payment_pending', 'failed', 'discarded')
    and (
      l.publication_state = 'discarded'
      or l.created_at <= now() - interval '7 days'
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
  -- "Together with all their details": the saved draft goes with its media.
  delete from public.host_listing_drafts where listing_id = p_listing_id;
  update public.listings set publication_state = 'expired' where id = p_listing_id;
  update public.draft_media_cleanup_jobs
  set status = 'completed', locked_until = null, last_error = null, updated_at = now()
  where listing_id = p_listing_id;
  return true;
end;
$$;

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
      and v_listing.created_at <= now() - interval '7 days'
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
      and v_listing.created_at <= now() - interval '7 days'
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
    or v_listing.created_at <= now() - interval '7 days'
    or p_object_key not like
      'drafts/photos/%/' || p_host_id::text || '/' || p_listing_id::text || '/%' then
    return false;
  end if;
  insert into public.draft_media_upload_sessions (object_key, listing_id, host_id, expires_at)
  values (p_object_key, p_listing_id, p_host_id, p_expires_at);
  return true;
end;
$$;

-- Same grants as before (create or replace keeps them; repeated for a fresh database).
revoke all on function public.varoom_discard_draft_listing(uuid, uuid) from public, anon, authenticated;
revoke all on function public.claim_draft_media_cleanup(integer) from public, anon, authenticated;
revoke all on function public.finish_draft_media_cleanup(uuid) from public, anon, authenticated;
revoke all on function public.reserve_property_video_upload(uuid, uuid, uuid, text, text, text, text, text, bigint, integer) from public, anon, authenticated;
revoke all on function public.claim_property_video_finalization(uuid, uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.reserve_draft_photo_upload(uuid, uuid, text, timestamptz) from public, anon, authenticated;
grant execute on function public.varoom_discard_draft_listing(uuid, uuid) to service_role;
grant execute on function public.claim_draft_media_cleanup(integer) to service_role;
grant execute on function public.finish_draft_media_cleanup(uuid) to service_role;
grant execute on function public.reserve_property_video_upload(uuid, uuid, uuid, text, text, text, text, text, bigint, integer) to service_role;
grant execute on function public.claim_property_video_finalization(uuid, uuid, uuid, text) to service_role;
grant execute on function public.reserve_draft_photo_upload(uuid, uuid, text, timestamptz) to service_role;

-- Rollback: re-run the function definitions in
-- 20261018_000040_draft_media_lifecycle.sql (5 days, saved drafts kept).
