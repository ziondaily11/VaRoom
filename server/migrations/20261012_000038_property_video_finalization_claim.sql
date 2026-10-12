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
begin
  -- Coordinate with listing deletion, but release the lock before storage work.
  perform 1
  from public.listings
  where id = p_property_id and host_id = p_host_id
  for key share;

  if not found then
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

create or replace function public.varoom_prevent_processing_video_delete()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if old.media_type = 'video' and old.status = 'processing' then
    raise exception 'Video finalization is in progress'
      using errcode = '55000';
  end if;
  return old;
end;
$$;

drop trigger if exists varoom_prevent_processing_video_delete_trigger on public.property_media;
create trigger varoom_prevent_processing_video_delete_trigger
  before delete on public.property_media
  for each row
  execute function public.varoom_prevent_processing_video_delete();

revoke all on function public.varoom_prevent_processing_video_delete() from public, anon, authenticated;
