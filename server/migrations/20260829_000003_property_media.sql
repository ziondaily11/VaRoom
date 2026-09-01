-- VaRoom Property Media Schema
-- Stores metadata for all property media (photos, videos, etc)
-- Photos stored in Supabase Storage, videos stored in Cloudflare R2
-- This table is the single source of truth for all media ownership/visibility/state

-- 1. Main property_media table
create table if not exists public.property_media (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null,
  host_id uuid not null,
  media_type text not null default 'image',
  storage_provider text not null default 'supabase',
  storage_bucket text not null,
  storage_key text not null,
  original_filename text,
  mime_type text,
  file_size_bytes bigint,
  duration_seconds integer,
  width integer,
  height integer,
  thumbnail_key text,
  sort_order integer not null default 0,
  status text not null default 'pending',
  visibility text not null default 'public',
  upload_id text unique,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  deleted_at timestamp with time zone,
  constraint property_media_media_type_check check (media_type in ('image', 'video')),
  constraint property_media_storage_provider_check check (storage_provider in ('supabase', 'r2')),
  constraint property_media_status_check check (status in ('pending', 'uploading', 'processing', 'ready', 'failed', 'deleted')),
  constraint property_media_visibility_check check (visibility in ('public', 'restricted'))
);

-- 2. Indexes for common queries
create index if not exists property_media_property_id_idx on property_media (property_id, deleted_at) where deleted_at is null;
create index if not exists property_media_host_id_idx on property_media (host_id, deleted_at) where deleted_at is null;
create index if not exists property_media_status_idx on property_media (status) where status != 'deleted';
create index if not exists property_media_upload_id_idx on property_media (upload_id) where upload_id is not null;
create index if not exists property_media_storage_key_idx on property_media (storage_provider, storage_key) where deleted_at is null;

-- 3. Auto-update updated_at on row modification
create or replace function public.varoom_update_property_media_timestamp()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists varoom_update_property_media_timestamp_trigger on property_media;
create trigger varoom_update_property_media_timestamp_trigger
  before update on property_media
  for each row
  execute function public.varoom_update_property_media_timestamp();

-- 4. Comments for schema documentation
comment on table property_media is 'Unified media metadata for all property images and videos. Photos stored in Supabase Storage, videos in Cloudflare R2. This table is authoritative for ownership, visibility, lifecycle, and playback authorization.';
comment on column property_media.media_type is 'Type of media: image or video';
comment on column property_media.storage_provider is 'Where the binary content is stored: supabase (Storage) or r2 (Cloudflare R2)';
comment on column property_media.storage_key is 'The exact object path/key in the storage provider. For R2: videos/{environment}/{host_id}/{property_id}/{media_id}/original.{ext}';
comment on column property_media.status is 'Lifecycle state: pending (init sent), uploading (upload in progress), processing (optional future), ready (complete/playable), failed (upload error), deleted (marked deleted)';
comment on column property_media.visibility is 'public (visible to all), restricted (limited access based on listing visibility)';
comment on column property_media.upload_id is 'Unique upload session ID for idempotency and retry tracking';
