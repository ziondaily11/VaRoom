-- Profile banners and host-owned organisation categories. Categories reference
-- existing listings and never create or change listing records.
alter table public.profiles
  add column if not exists banner_image_key text;

create table if not exists public.profile_categories (
  id uuid primary key default gen_random_uuid(),
  host_id uuid not null references public.profiles(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 60),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profile_categories_host_name_unique unique (host_id, name),
  constraint profile_categories_id_host_unique unique (id, host_id)
);

create index if not exists profile_categories_host_order_idx
  on public.profile_categories(host_id, sort_order, created_at);

create table if not exists public.profile_category_listings (
  category_id uuid not null,
  host_id uuid not null references public.profiles(id) on delete cascade,
  listing_id uuid not null references public.listings(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (category_id, listing_id),
  constraint profile_category_listings_category_owner_fk
    foreign key (category_id, host_id)
    references public.profile_categories(id, host_id) on delete cascade
);

create index if not exists profile_category_listings_host_idx
  on public.profile_category_listings(host_id, listing_id);

alter table public.profile_categories enable row level security;
alter table public.profile_category_listings enable row level security;

drop policy if exists "Profile categories are publicly readable" on public.profile_categories;
create policy "Profile categories are publicly readable"
  on public.profile_categories for select using (true);
drop policy if exists "Hosts manage their own profile categories" on public.profile_categories;
create policy "Hosts manage their own profile categories"
  on public.profile_categories for all to authenticated
  using (auth.uid() = host_id)
  with check (
    auth.uid() = host_id
    and exists (select 1 from public.profiles p where p.id = host_id and p.role = 'host')
  );

drop policy if exists "Profile category listings are publicly readable" on public.profile_category_listings;
create policy "Profile category listings are publicly readable"
  on public.profile_category_listings for select using (true);
drop policy if exists "Hosts manage their own category assignments" on public.profile_category_listings;
create policy "Hosts manage their own category assignments"
  on public.profile_category_listings for all to authenticated
  using (
    auth.uid() = host_id
    and exists (select 1 from public.listings l where l.id = listing_id and l.host_id = auth.uid())
  )
  with check (
    auth.uid() = host_id
    and exists (select 1 from public.listings l where l.id = listing_id and l.host_id = auth.uid())
    and exists (select 1 from public.profile_categories c where c.id = category_id and c.host_id = auth.uid())
  );

comment on column public.profiles.banner_image_key is
  'Cloudflare R2 object key for the profile header banner; null means use the fallback.';
comment on table public.profile_categories is
  'Host-created labels for organising existing listings on the host profile.';
comment on table public.profile_category_listings is
  'Associations to existing listings; this table never represents or publishes listings.';

-- Reversible rollback:
-- drop table if exists public.profile_category_listings;
-- drop table if exists public.profile_categories;
-- alter table public.profiles drop column if exists banner_image_key;
