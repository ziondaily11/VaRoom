-- Hosts keep using profiles.listing_categories. Existing rows are preserved:
-- hosts with an older multi-category selection must deliberately choose two
-- before they can create or recategorize a listing.

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

drop trigger if exists profiles_validate_host_niches on public.profiles;
create trigger profiles_validate_host_niches
before update of listing_categories on public.profiles
for each row execute function public.varoom_validate_host_niches();

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

drop trigger if exists listings_enforce_host_niche on public.listings;
create trigger listings_enforce_host_niche
before insert or update of category, host_id on public.listings
for each row execute function public.varoom_enforce_listing_host_niche();
