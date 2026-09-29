-- Hotel dining is intentionally separate from room/stay booking details.
-- Existing listings remain stay-capable, preserving the current hotel flow.
alter table public.listings
  add column if not exists supports_stay boolean not null default true,
  add column if not exists supports_table_reservation boolean not null default false;

create table if not exists public.hotel_dining_configs (
  listing_id uuid primary key references public.listings(id) on delete cascade,
  restaurant_name text not null,
  caption text not null,
  location_text text not null,
  opening_hours text not null,
  tables_available integer not null check (tables_available >= 1 and tables_available <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.table_reservations (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings(id) on delete cascade,
  host_id uuid not null references public.profiles(id) on delete cascade,
  client_id uuid not null references public.profiles(id) on delete cascade,
  client_name text not null,
  client_phone text not null,
  guest_count integer not null check (guest_count >= 1 and guest_count <= 1000),
  table_count integer not null check (table_count >= 1 and table_count <= 1000),
  requested_date date not null,
  requested_time time not null,
  special_occasion boolean not null default false,
  occasion_details text,
  restaurant_name text not null,
  listing_title text not null,
  status text not null default 'requested' check (status in ('requested', 'contacted', 'closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists table_reservations_host_created_idx
  on public.table_reservations(host_id, created_at desc);
create index if not exists table_reservations_client_created_idx
  on public.table_reservations(client_id, created_at desc);

alter table public.hotel_dining_configs enable row level security;
alter table public.table_reservations enable row level security;

-- Browser clients read only the dining configuration; creation and reservation
-- writes go through authenticated server routes using the service role.
drop policy if exists hotel_dining_configs_public_select on public.hotel_dining_configs;
create policy hotel_dining_configs_public_select on public.hotel_dining_configs
  for select using (true);

