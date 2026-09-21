-- Refinement: a host may select one or two niches, never more than two.
-- Existing valid selections and data are preserved.
create or replace function public.varoom_validate_host_niches()
returns trigger language plpgsql as $$
begin
  if new.role = 'host' and new.listing_categories is distinct from old.listing_categories then
    if new.listing_categories is null
       or cardinality(new.listing_categories) < 1
       or cardinality(new.listing_categories) > 2
       or exists (select 1 from unnest(new.listing_categories) as niche where niche not in ('airbnb', 'hotel', 'venue', 'office', 'shop', 'property'))
       or (select count(distinct niche) from unnest(new.listing_categories) as niche) <> cardinality(new.listing_categories) then
      raise exception 'Hosts must have one or two valid posting niches' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.varoom_enforce_listing_host_niche()
returns trigger language plpgsql security definer set search_path = public as $$
declare allowed_niches text[];
begin
  select listing_categories into allowed_niches from public.profiles where id = new.host_id and role = 'host';
  if allowed_niches is null or cardinality(allowed_niches) < 1 or cardinality(allowed_niches) > 2 or not (new.category = any(allowed_niches)) then
    raise exception 'Listing category must be one of the host''s permitted posting niches' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

-- A hotel business name is the public identity of a hotel room throughout
-- discovery and profile cards. Non-hotel listings retain their host identity.
alter table public.listings add column if not exists business_id uuid references public.businesses(id) on delete restrict;
alter table public.listings add column if not exists business_display_name text;
create index if not exists listings_business_idx on public.listings(business_id) where business_id is not null;

create or replace function public.varoom_sync_hotel_listing_business_identity()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.listings set business_id = new.business_id,
    business_display_name = (select name from public.businesses where id = new.business_id)
  where id = new.listing_id;
  return new;
end;
$$;
drop trigger if exists hotel_room_offerings_sync_business_identity on public.hotel_room_offerings;
create trigger hotel_room_offerings_sync_business_identity after insert or update on public.hotel_room_offerings
for each row execute function public.varoom_sync_hotel_listing_business_identity();

create or replace function public.varoom_sync_business_name_to_listings()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.name is distinct from old.name then
    update public.listings set business_display_name = new.name where business_id = new.id;
  end if;
  return new;
end;
$$;
drop trigger if exists businesses_sync_public_name on public.businesses;
create trigger businesses_sync_public_name after update of name on public.businesses
for each row execute function public.varoom_sync_business_name_to_listings();

update public.listings listing set business_id = room.business_id, business_display_name = business.name
from public.hotel_room_offerings room join public.businesses business on business.id = room.business_id
where listing.id = room.listing_id and listing.business_id is null;
