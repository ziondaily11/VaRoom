-- Persist resumable listing form state per authenticated host. The client may
-- keep binary File objects in IndexedDB, while this private row stores fields,
-- category, and media metadata so drafts can be discovered from My Profile.
create table if not exists public.host_listing_drafts (
  id uuid primary key,
  host_id uuid not null references auth.users(id) on delete cascade,
  listing_id uuid references public.listings(id) on delete set null,
  category text not null check (category in ('airbnb', 'hotel', 'venue', 'office', 'shop', 'property')),
  form_data jsonb not null default '{}'::jsonb check (jsonb_typeof(form_data) = 'object'),
  media_metadata jsonb not null default '[]'::jsonb check (jsonb_typeof(media_metadata) = 'array'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists host_listing_drafts_host_updated_idx
  on public.host_listing_drafts (host_id, updated_at desc);

alter table public.host_listing_drafts enable row level security;
revoke all on public.host_listing_drafts from public, anon;
grant select, insert, update, delete on public.host_listing_drafts to authenticated;
grant all on public.host_listing_drafts to service_role;

drop policy if exists host_listing_drafts_owner_only on public.host_listing_drafts;
create policy host_listing_drafts_owner_only
  on public.host_listing_drafts for all to authenticated
  using (auth.uid() = host_id)
  with check (auth.uid() = host_id);

-- The existing USING (true) policies exposed unpublished listing rows and
-- their details through the public Supabase client. Remove each permissive
-- policy because PostgreSQL combines permissive policies with OR semantics.
drop policy if exists "Anyone can view listings" on public.listings;
drop policy if exists "Listings are viewable by everyone" on public.listings;
drop policy if exists listings_published_public_select on public.listings;
drop policy if exists listings_owner_select on public.listings;

create policy listings_published_public_select
  on public.listings for select to anon, authenticated
  using (publication_state = 'published' and moderation_status = 'active');
create policy listings_owner_select
  on public.listings for select to authenticated
  using (auth.uid() = host_id);

drop policy if exists "Booking details are viewable by everyone" on public.listing_booking_details;
drop policy if exists listing_booking_details_published_select on public.listing_booking_details;
drop policy if exists listing_booking_details_owner_select on public.listing_booking_details;

create policy listing_booking_details_published_select
  on public.listing_booking_details for select to anon, authenticated
  using (exists (
    select 1 from public.listings l
    where l.id = listing_booking_details.listing_id
      and l.publication_state = 'published'
      and l.moderation_status = 'active'
  ));
create policy listing_booking_details_owner_select
  on public.listing_booking_details for select to authenticated
  using (exists (
    select 1 from public.listings l
    where l.id = listing_booking_details.listing_id and l.host_id = auth.uid()
  ));

drop policy if exists "Anyone can view listing photos" on public.listing_photos;
drop policy if exists "Listing photos are viewable by everyone" on public.listing_photos;
drop policy if exists listing_photos_published_select on public.listing_photos;
drop policy if exists listing_photos_owner_select on public.listing_photos;

create policy listing_photos_published_select
  on public.listing_photos for select to anon, authenticated
  using (exists (
    select 1 from public.listings l
    where l.id = listing_photos.listing_id
      and l.publication_state = 'published'
      and l.moderation_status = 'active'
  ));
create policy listing_photos_owner_select
  on public.listing_photos for select to authenticated
  using (exists (
    select 1 from public.listings l
    where l.id = listing_photos.listing_id and l.host_id = auth.uid()
  ));
