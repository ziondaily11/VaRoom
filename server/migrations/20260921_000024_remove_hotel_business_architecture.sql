-- Roll back the hotel-business implementation introduced by migrations
-- 20260921_000022 and 20260921_000023.
--
-- This deliberately preserves pre-existing profiles, listings, bookings, and
-- reviews. It removes data that existed only in the new business, branch,
-- menu, table, and reservation tables.

drop trigger if exists hotel_room_offerings_sync_business_identity on public.hotel_room_offerings;
drop trigger if exists hotel_room_offerings_consistent on public.hotel_room_offerings;
drop trigger if exists hotel_menus_branch_consistent on public.hotel_menus;
drop trigger if exists hotel_tables_branch_consistent on public.hotel_tables;
drop trigger if exists table_reservations_branch_consistent on public.table_reservations;
drop trigger if exists hotel_menus_require_niche on public.hotel_menus;
drop trigger if exists hotel_tables_require_niche on public.hotel_tables;
drop trigger if exists hotel_rooms_require_niche on public.hotel_room_offerings;
drop trigger if exists businesses_sync_public_name on public.businesses;
drop trigger if exists businesses_updated_at on public.businesses;
drop trigger if exists business_branches_updated_at on public.business_branches;
drop trigger if exists hotel_menus_updated_at on public.hotel_menus;
drop trigger if exists hotel_tables_updated_at on public.hotel_tables;
drop trigger if exists table_reservations_updated_at on public.table_reservations;
drop trigger if exists listings_prevent_hotel_room_reclassification on public.listings;

alter table public.reviews drop column if exists business_id;
alter table public.listings drop column if exists business_display_name;
alter table public.listings drop column if exists business_id;

drop table if exists public.table_reservations;
drop table if exists public.hotel_menu_items;
drop table if exists public.hotel_menu_categories;
drop table if exists public.hotel_menus;
drop table if exists public.hotel_tables;
drop table if exists public.hotel_room_offerings;
drop table if exists public.business_branches;
drop table if exists public.business_members;
drop table if exists public.business_niches;
drop table if exists public.businesses;

drop function if exists public.varoom_sync_hotel_listing_business_identity();
drop function if exists public.varoom_sync_business_name_to_listings();
drop function if exists public.varoom_prevent_hotel_room_reclassification();
drop function if exists public.varoom_table_reservation_consistent();
drop function if exists public.varoom_hotel_offering_requires_hotel_niche();
drop function if exists public.varoom_hotel_room_consistent();
drop function if exists public.varoom_business_branch_consistent();
drop function if exists public.varoom_business_updated_at();

-- Restore the niche contract that existed before the hotel refinement.
create or replace function public.varoom_validate_host_niches()
returns trigger language plpgsql as $$
begin
  if new.role = 'host' and new.listing_categories is distinct from old.listing_categories then
    if new.listing_categories is null
       or cardinality(new.listing_categories) <> 2
       or exists (
         select 1 from unnest(new.listing_categories) as niche
         where niche not in ('airbnb', 'hotel', 'venue', 'office', 'shop', 'property')
       )
       or (select count(distinct niche) from unnest(new.listing_categories) as niche) <> 2 then
      raise exception 'Hosts must have exactly two valid posting niches' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.varoom_enforce_listing_host_niche()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  allowed_niches text[];
begin
  select listing_categories into allowed_niches from public.profiles where id = new.host_id and role = 'host';
  if allowed_niches is null or cardinality(allowed_niches) <> 2 or not (new.category = any(allowed_niches)) then
    raise exception 'Listing category must be one of the host''s two posting niches' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
