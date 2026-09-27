-- Keep the existing listings.description column as the short Discover caption.
-- The detailed booking-page copy is deliberately stored separately so either
-- field can evolve without overwriting the other. Nullable preserves every
-- existing listing; clients fall back to the legacy value until hosts update.
alter table public.listings
  add column if not exists property_description text;

comment on column public.listings.description is
  'Short Discover caption for a listing.';
comment on column public.listings.property_description is
  'Detailed property information displayed in the booking page About this place section.';
