-- A listing holds at most 8 photos and videos, and the same picked photo only once.
--
-- 1. varoom_guard_listing_media_cap: before a photo (listing_photos) or a video
--    (property_media) is added, the listing's photos plus live videos must be under 8.
--    It takes the same per-listing lock as reserve_property_video_upload, so two
--    uploads at once cannot both pass. Rows already there are not touched.
-- 2. listing_photos.source_fingerprint: the picked file (name, size, last modified),
--    unique per listing. The listing wizard skips a photo the listing already has,
--    so a retry, a reload or a reopened draft cannot add it again.
--
-- Check before running (read only; listings already over 8 keep their photos but can add none):
--   select listing_id, count(*) from public.listing_photos group by 1 having count(*) > 8;

alter table public.listing_photos add column if not exists source_fingerprint text;
comment on column public.listing_photos.source_fingerprint is
  'The picked file as name|size|lastModified, set by the listing wizard; one per listing, so an upload retry is skipped.';
create unique index if not exists listing_photos_listing_source_fingerprint_key
  on public.listing_photos (listing_id, source_fingerprint) where source_fingerprint is not null;

create or replace function public.varoom_guard_listing_media_cap()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  -- TG_ARGV[0]: the column holding the listing id (listing_id or property_id).
  v_listing uuid := (to_jsonb(new) ->> tg_argv[0])::uuid;
  v_total integer;
begin
  if tg_table_name = 'property_media' and to_jsonb(new) ->> 'media_type' is distinct from 'video' then return new; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_listing::text, 0));
  select (select count(*) from public.listing_photos where listing_id = v_listing)
       + (select count(*) from public.property_media
          where property_id = v_listing and media_type = 'video' and deleted_at is null
            and status in ('pending', 'uploading', 'processing', 'ready'))
    into v_total;
  if v_total >= 8 then
    raise exception 'media_limit: a listing can have up to 8 photos and videos' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

revoke all on function public.varoom_guard_listing_media_cap() from public, anon, authenticated;

drop trigger if exists listing_photos_media_cap on public.listing_photos;
create trigger listing_photos_media_cap
  before insert on public.listing_photos
  for each row execute function public.varoom_guard_listing_media_cap('listing_id');

drop trigger if exists property_media_media_cap on public.property_media;
create trigger property_media_media_cap
  before insert on public.property_media
  for each row execute function public.varoom_guard_listing_media_cap('property_id');

-- Undo:
--   drop trigger if exists property_media_media_cap on public.property_media;
--   drop trigger if exists listing_photos_media_cap on public.listing_photos;
--   drop function if exists public.varoom_guard_listing_media_cap();
--   drop index if exists public.listing_photos_listing_source_fingerprint_key;
--   alter table public.listing_photos drop column if exists source_fingerprint;
