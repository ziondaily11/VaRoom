-- Property listing personalisation (category = 'property' only).
--
-- Adds listing_purpose to listings, and four new columns to
-- listing_booking_details for sale pricing, unit counts, and policy uploads.
--
-- Every new column is nullable with no NOT NULL constraint, so every existing
-- row for Airbnbs, Hotels, Event Venues, Offices, and Shops is left completely
-- unaffected.  No existing constraint, trigger, index, or RLS policy is
-- modified by this migration.

alter table public.listings
  add column if not exists listing_purpose text
    check (listing_purpose in ('rent', 'sale', 'both'));

comment on column public.listings.listing_purpose is
  'Property listings only: whether the property is for rent, for sale, or both. NULL for every other category.';

alter table public.listing_booking_details
  add column if not exists sale_price_amount  numeric check (sale_price_amount >= 0),
  add column if not exists sale_price_mode    text    check (sale_price_mode in ('starting', 'exact')),
  add column if not exists units_available    integer check (units_available >= 1),
  add column if not exists policy_storage_path text;

comment on column public.listing_booking_details.sale_price_amount is
  'Property listings only: asking price for sale. NULL for rent-only and all non-property categories.';
comment on column public.listing_booking_details.sale_price_mode is
  'Property listings only: "exact" or "starting" — whether the sale price is the exact or minimum asking price.';
comment on column public.listing_booking_details.units_available is
  'Property listings only: number of units currently available to rent or buy.';
comment on column public.listing_booking_details.policy_storage_path is
  'Property listings only: Supabase storage path for an uploaded property policy / brochure document.';
