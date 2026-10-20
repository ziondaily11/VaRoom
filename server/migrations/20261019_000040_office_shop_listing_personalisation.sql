-- Office and Shop listing personalisation.
--
-- This migration is additive: it keeps the existing listings and
-- listing_booking_details tables, and does not change existing rows' values.
-- Office and Shop answers live on the existing one-to-one details row so the
-- current listing, price, location, photo, and amenity storage stays canonical.

alter table public.listings
  add column if not exists address_visibility text
    check (address_visibility in ('full', 'after_inquiry'));

comment on column public.listings.address_visibility is
  'Office and Shop listings: whether to show the full address or share the exact unit after an enquiry.';

alter table public.listing_booking_details
  add column if not exists office_shop_details jsonb not null default '{}'::jsonb,
  add column if not exists office_shop_last_confirmed_at timestamptz;

comment on column public.listing_booking_details.office_shop_details is
  'Structured Office and Shop-only answers: subtype, role, amenity booleans, space, commercial pricing, costs, rules, lease terms, and document paths.';
comment on column public.listing_booking_details.office_shop_last_confirmed_at is
  'Server-assigned date and time when the host last confirmed an Office or Shop listing is accurate.';

create index if not exists listing_booking_details_office_shop_details_gin_idx
  on public.listing_booking_details using gin (office_shop_details)
  where office_shop_details <> '{}'::jsonb;

-- Hosts retain one authoritative posting niche. A host whose niche is Office
-- or Shop may choose either commercial listing type on an individual listing;
-- every other niche still requires an exact category match.
create or replace function public.varoom_enforce_listing_host_niche()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  host_niche text;
begin
  select listing_categories[1] into host_niche
  from public.profiles
  where id = new.host_id and role = 'host' and cardinality(listing_categories) = 1;

  if host_niche is null
     or (new.category <> host_niche
         and not (host_niche in ('office', 'shop') and new.category in ('office', 'shop'))) then
    raise exception 'Listing category must match the host niche' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
