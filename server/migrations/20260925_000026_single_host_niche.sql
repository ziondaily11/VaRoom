-- Hosts have one authoritative posting niche stored in profiles.listing_categories.
-- Existing listing fields and rows are preserved.

create or replace function public.varoom_validate_host_niches()
returns trigger language plpgsql as $$
begin
  if new.role = 'host' and new.listing_categories is distinct from old.listing_categories then
    if new.listing_categories is null
       or cardinality(new.listing_categories) <> 1
       or exists (
         select 1 from unnest(new.listing_categories) as niche
         where niche not in ('airbnb', 'hotel', 'venue', 'office', 'shop', 'property')
       ) then
      raise exception 'Hosts must have exactly one valid posting niche' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.varoom_enforce_listing_host_niche()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  host_niche text;
begin
  select listing_categories[1] into host_niche
  from public.profiles
  where id = new.host_id and role = 'host' and cardinality(listing_categories) = 1;
  if host_niche is null or new.category <> host_niche then
    raise exception 'Listing category must match the host niche' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
