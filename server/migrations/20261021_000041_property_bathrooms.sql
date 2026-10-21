-- Add a structured bathroom count for Property listings.
--
-- Nullable and additive so existing listings and all other niches remain
-- unchanged. Bedroom/unit type continues to use the existing size_or_type
-- field for compatibility with current listing readers.

alter table public.listing_booking_details
  add column if not exists bathrooms integer
    check (bathrooms is null or bathrooms >= 1);

comment on column public.listing_booking_details.bathrooms is
  'Property listings only: bathroom count. NULL for existing listings without a provided count and all non-property categories.';
