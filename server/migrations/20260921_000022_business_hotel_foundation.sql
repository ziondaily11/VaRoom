-- Business / branch foundation for niche-specific offerings. This migration is
-- additive: existing profiles, listings, bookings, and reviews are retained.

create table if not exists public.businesses (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete restrict,
  name text not null check (length(trim(name)) between 2 and 300),
  description text,
  status text not null default 'active' check (status in ('active', 'inactive')),
  subscription_context jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists businesses_owner_idx on public.businesses(owner_id);

create table if not exists public.business_niches (
  business_id uuid not null references public.businesses(id) on delete restrict,
  niche text not null check (niche in ('hotel', 'airbnb', 'venue', 'office', 'shop', 'property')),
  primary key (business_id, niche)
);

create table if not exists public.business_members (
  business_id uuid not null references public.businesses(id) on delete restrict,
  user_id uuid not null references public.profiles(id) on delete restrict,
  role text not null default 'manager' check (role in ('owner', 'manager')),
  created_at timestamptz not null default now(),
  primary key (business_id, user_id)
);
create index if not exists business_members_user_idx on public.business_members(user_id, business_id);

create table if not exists public.business_branches (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete restrict,
  name text not null check (length(trim(name)) between 1 and 300),
  address_text text not null check (length(trim(address_text)) between 1 and 500),
  county_city text,
  latitude double precision,
  longitude double precision,
  place_id text,
  formatted_address text,
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((latitude is null and longitude is null) or (latitude between -90 and 90 and longitude between -180 and 180))
);
create index if not exists business_branches_business_status_idx on public.business_branches(business_id, status, created_at);

-- A room remains a normal accommodation listing so existing booking, media and
-- availability paths continue to work. Its business and branch are explicit.
create table if not exists public.hotel_room_offerings (
  listing_id uuid primary key references public.listings(id) on delete restrict,
  business_id uuid not null references public.businesses(id) on delete restrict,
  branch_id uuid not null references public.business_branches(id) on delete restrict,
  created_at timestamptz not null default now()
);
create index if not exists hotel_room_offerings_branch_idx on public.hotel_room_offerings(branch_id);

create table if not exists public.hotel_menus (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete restrict,
  branch_id uuid not null references public.business_branches(id) on delete restrict,
  title text not null check (length(trim(title)) between 1 and 300),
  description text,
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists hotel_menus_branch_status_idx on public.hotel_menus(branch_id, status, created_at);

create table if not exists public.hotel_menu_categories (
  id uuid primary key default gen_random_uuid(),
  menu_id uuid not null references public.hotel_menus(id) on delete restrict,
  name text not null check (length(trim(name)) between 1 and 200),
  display_order integer not null default 0 check (display_order >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique(menu_id, name)
);

create table if not exists public.hotel_menu_items (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.hotel_menu_categories(id) on delete restrict,
  name text not null check (length(trim(name)) between 1 and 300),
  description text,
  price_amount numeric(12,2) not null check (price_amount >= 0),
  photo_url text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists hotel_menu_items_category_idx on public.hotel_menu_items(category_id, active);

create table if not exists public.hotel_tables (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete restrict,
  branch_id uuid not null references public.business_branches(id) on delete restrict,
  identifier text not null check (length(trim(identifier)) between 1 and 100),
  seating_capacity integer not null check (seating_capacity > 0 and seating_capacity <= 1000),
  area_description text,
  setting text check (setting in ('indoor', 'outdoor', 'either')),
  availability_status text not null default 'available' check (availability_status in ('available', 'unavailable')),
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(branch_id, identifier)
);
create index if not exists hotel_tables_branch_status_idx on public.hotel_tables(branch_id, status, availability_status);

create table if not exists public.table_reservations (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete restrict,
  branch_id uuid not null references public.business_branches(id) on delete restrict,
  table_id uuid not null references public.hotel_tables(id) on delete restrict,
  customer_id uuid not null references public.profiles(id) on delete restrict,
  reservation_at timestamptz not null,
  guest_count integer not null check (guest_count > 0),
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'declined', 'cancelled', 'completed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists table_reservations_table_time_idx on public.table_reservations(table_id, reservation_at);
create index if not exists table_reservations_customer_idx on public.table_reservations(customer_id, reservation_at desc);

-- Existing reviews remain untouched. New hotel-room reviews can additionally
-- identify the business, allowing a business profile to aggregate real stays.
alter table public.reviews add column if not exists business_id uuid references public.businesses(id) on delete restrict;
create index if not exists reviews_business_created_idx on public.reviews(business_id, created_at desc) where business_id is not null;
update public.reviews as review
set business_id = room.business_id
from public.hotel_room_offerings as room
where review.listing_id = room.listing_id and review.business_id is null;

create or replace function public.varoom_business_branch_consistent()
returns trigger language plpgsql security definer set search_path = public as $$
declare branch_business_id uuid;
begin
  select business_id into branch_business_id from public.business_branches where id = new.branch_id;
  if branch_business_id is null or branch_business_id <> new.business_id then
    raise exception 'Branch must belong to the same business' using errcode = '23514';
  end if;
  return new;
end; $$;

create or replace function public.varoom_hotel_room_consistent()
returns trigger language plpgsql security definer set search_path = public as $$
declare listing_category text; branch_business_id uuid;
begin
  select category into listing_category from public.listings where id = new.listing_id;
  select business_id into branch_business_id from public.business_branches where id = new.branch_id;
  if listing_category <> 'hotel' or branch_business_id is null or branch_business_id <> new.business_id then
    raise exception 'Hotel room must be a hotel listing in its business branch' using errcode = '23514';
  end if;
  return new;
end; $$;

create or replace function public.varoom_prevent_hotel_room_reclassification()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.category <> 'hotel' and exists (select 1 from public.hotel_room_offerings where listing_id = new.id) then
    raise exception 'A hotel room cannot be reclassified outside Hotel' using errcode = '23514';
  end if;
  return new;
end; $$;

create or replace function public.varoom_hotel_offering_requires_hotel_niche()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.business_niches where business_id = new.business_id and niche = 'hotel') then
    raise exception 'Hotel offerings require a hotel business niche' using errcode = '23514';
  end if;
  return new;
end; $$;

create or replace function public.varoom_table_reservation_consistent()
returns trigger language plpgsql security definer set search_path = public as $$
declare table_business_id uuid; table_branch_id uuid;
begin
  select business_id, branch_id into table_business_id, table_branch_id from public.hotel_tables where id = new.table_id;
  if table_business_id is null or table_business_id <> new.business_id or table_branch_id <> new.branch_id then
    raise exception 'Reservation table must belong to the supplied business branch' using errcode = '23514';
  end if;
  return new;
end; $$;

drop trigger if exists hotel_room_offerings_consistent on public.hotel_room_offerings;
create trigger hotel_room_offerings_consistent before insert or update on public.hotel_room_offerings for each row execute function public.varoom_hotel_room_consistent();
drop trigger if exists listings_prevent_hotel_room_reclassification on public.listings;
create trigger listings_prevent_hotel_room_reclassification before update of category on public.listings for each row execute function public.varoom_prevent_hotel_room_reclassification();
drop trigger if exists hotel_menus_branch_consistent on public.hotel_menus;
create trigger hotel_menus_branch_consistent before insert or update on public.hotel_menus for each row execute function public.varoom_business_branch_consistent();
drop trigger if exists hotel_tables_branch_consistent on public.hotel_tables;
create trigger hotel_tables_branch_consistent before insert or update on public.hotel_tables for each row execute function public.varoom_business_branch_consistent();
drop trigger if exists table_reservations_branch_consistent on public.table_reservations;
create trigger table_reservations_branch_consistent before insert or update on public.table_reservations for each row execute function public.varoom_table_reservation_consistent();
drop trigger if exists hotel_menus_require_niche on public.hotel_menus;
create trigger hotel_menus_require_niche before insert or update on public.hotel_menus for each row execute function public.varoom_hotel_offering_requires_hotel_niche();
drop trigger if exists hotel_tables_require_niche on public.hotel_tables;
create trigger hotel_tables_require_niche before insert or update on public.hotel_tables for each row execute function public.varoom_hotel_offering_requires_hotel_niche();
drop trigger if exists hotel_rooms_require_niche on public.hotel_room_offerings;
create trigger hotel_rooms_require_niche before insert or update on public.hotel_room_offerings for each row execute function public.varoom_hotel_offering_requires_hotel_niche();

create or replace function public.varoom_business_updated_at()
returns trigger language plpgsql security definer set search_path = public as $$ begin new.updated_at := now(); return new; end; $$;
drop trigger if exists businesses_updated_at on public.businesses;
create trigger businesses_updated_at before update on public.businesses for each row execute function public.varoom_business_updated_at();
drop trigger if exists business_branches_updated_at on public.business_branches;
create trigger business_branches_updated_at before update on public.business_branches for each row execute function public.varoom_business_updated_at();
drop trigger if exists hotel_menus_updated_at on public.hotel_menus;
create trigger hotel_menus_updated_at before update on public.hotel_menus for each row execute function public.varoom_business_updated_at();
drop trigger if exists hotel_tables_updated_at on public.hotel_tables;
create trigger hotel_tables_updated_at before update on public.hotel_tables for each row execute function public.varoom_business_updated_at();
drop trigger if exists table_reservations_updated_at on public.table_reservations;
create trigger table_reservations_updated_at before update on public.table_reservations for each row execute function public.varoom_business_updated_at();

alter table public.businesses enable row level security;
alter table public.business_niches enable row level security;
alter table public.business_members enable row level security;
alter table public.business_branches enable row level security;
alter table public.hotel_room_offerings enable row level security;
alter table public.hotel_menus enable row level security;
alter table public.hotel_menu_categories enable row level security;
alter table public.hotel_menu_items enable row level security;
alter table public.hotel_tables enable row level security;
alter table public.table_reservations enable row level security;
