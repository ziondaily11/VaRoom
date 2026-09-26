-- Keep the existing media tables and references while recording their provider.
alter table public.listing_photos
  add column if not exists media_id uuid default gen_random_uuid(),
  add column if not exists storage_provider text not null default 'supabase',
  add column if not exists storage_bucket text not null default 'listing-photos',
  add column if not exists mime_type text,
  add column if not exists file_size_bytes bigint,
  add column if not exists sort_order integer,
  add column if not exists is_cover boolean;

update public.listing_photos set media_id = gen_random_uuid() where media_id is null;
alter table public.listing_photos alter column media_id set not null;
create unique index if not exists listing_photos_media_id_unique on public.listing_photos(media_id);

with ordered_photos as (
  select ctid, row_number() over (partition by listing_id order by ctid) - 1 as position
  from public.listing_photos
)
update public.listing_photos as photo
set sort_order = coalesce(photo.sort_order, ordered_photos.position),
    is_cover = coalesce(photo.is_cover, ordered_photos.position = 0)
from ordered_photos
where photo.ctid = ordered_photos.ctid;
alter table public.listing_photos alter column sort_order set default 0;
alter table public.listing_photos alter column sort_order set not null;
alter table public.listing_photos alter column is_cover set default false;
alter table public.listing_photos alter column is_cover set not null;

alter table public.listing_photos
  drop constraint if exists listing_photos_storage_provider_check;
alter table public.listing_photos
  add constraint listing_photos_storage_provider_check
  check (storage_provider in ('supabase', 'r2'));

alter table public.profiles
  add column if not exists avatar_storage_provider text not null default 'supabase';
alter table public.profiles
  drop constraint if exists profiles_avatar_storage_provider_check;
alter table public.profiles
  add constraint profiles_avatar_storage_provider_check
  check (avatar_storage_provider in ('supabase', 'r2'));

alter table public.property_media
  alter column storage_provider set default 'r2';

create table if not exists public.media_cleanup_queue (
  id uuid primary key default gen_random_uuid(),
  storage_provider text not null check (storage_provider in ('supabase', 'r2')),
  storage_bucket text not null,
  storage_key text not null,
  attempts integer not null default 0,
  last_error text,
  created_at timestamptz not null default now(),
  last_attempted_at timestamptz,
  unique (storage_provider, storage_bucket, storage_key)
);
create index if not exists media_cleanup_queue_created_idx
  on public.media_cleanup_queue (created_at);
alter table public.media_cleanup_queue enable row level security;
