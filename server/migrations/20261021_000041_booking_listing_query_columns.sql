-- Keep the booking-page listing select valid on environments that have not
-- yet applied the listing personalisation migrations.
alter table public.listings
  add column if not exists listing_purpose text
    check (listing_purpose in ('rent', 'sale', 'both')),
  add column if not exists address_visibility text
    check (address_visibility in ('full', 'after_inquiry'));
