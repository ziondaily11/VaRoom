-- Property type (Apartment, House, Bungalow, Maisonette, Townhouse, Villa).
--
-- Hosts choose it in the listing wizard for a Property listing, and the
-- Marketplace narrows by it: Property › Buy/Rent › type › bedrooms.
-- NULL for every other category, and for older Property listings until the
-- host edits them (the wizard then asks for it).
--
-- Review and apply manually; the application never runs migrations.
-- Apply BEFORE deploying the client that writes and filters this column.
-- Safe to run more than once.

alter table public.listing_booking_details
  add column if not exists property_type text;

alter table public.listing_booking_details drop constraint if exists listing_booking_details_property_type_check;
alter table public.listing_booking_details add constraint listing_booking_details_property_type_check
  check (property_type is null or property_type in ('apartment', 'house', 'bungalow', 'maisonette', 'townhouse', 'villa'));

comment on column public.listing_booking_details.property_type is
  'Property listings only: apartment, house, bungalow, maisonette, townhouse or villa. The Marketplace filters Property by it.';

-- The Marketplace filters by it inside Property; a partial index keeps that cheap.
create index if not exists listing_booking_details_property_type_idx
  on public.listing_booking_details (property_type)
  where property_type is not null;

-- Undo:
-- drop index if exists public.listing_booking_details_property_type_idx;
-- alter table public.listing_booking_details drop constraint if exists listing_booking_details_property_type_check;
-- alter table public.listing_booking_details drop column if exists property_type;
