-- Atomically reserve a property's video quota while creating an upload row.
-- The per-property transaction lock prevents concurrent requests from both
-- passing a count-then-insert check.
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
set search_path = public
as $$
declare
  video_count integer;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_property_id::text, 0));

  select count(*)::integer into video_count
  from public.property_media
  where property_id = p_property_id
    and media_type = 'video'
    and status in ('pending', 'uploading', 'processing', 'ready')
    and deleted_at is null;

  if video_count >= p_max_count then
    return query select false, video_count;
    return;
  end if;

  insert into public.property_media (
    id, property_id, host_id, media_type, storage_provider, storage_bucket,
    storage_key, original_filename, mime_type, file_size_bytes, status,
    visibility, upload_id, sort_order
  ) values (
    p_media_id, p_property_id, p_host_id, 'video', 'r2', p_storage_bucket,
    p_storage_key, p_original_filename, p_mime_type, p_file_size_bytes,
    'pending', 'public', p_upload_id, video_count
  );

  return query select true, video_count;
end;
$$;

revoke all on function public.reserve_property_video_upload(uuid, uuid, uuid, text, text, text, text, text, bigint, integer) from public;
grant execute on function public.reserve_property_video_upload(uuid, uuid, uuid, text, text, text, text, text, bigint, integer) to service_role;
