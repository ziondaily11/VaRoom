-- Structured details for stays and venues (listing wizard, "The space").
--
-- Airbnbs and hotel rooms get bedroom and bed counts (and may use the
-- existing bathrooms column); venues get seated and standing capacity.
-- All columns are nullable and additive: existing listings keep NULL and
-- every reader still works from size_or_type and max_guests, which the
-- wizard keeps filling in.

alter table public.listing_booking_details
  add column if not exists bedrooms integer
    check (bedrooms is null or (bedrooms >= 0 and bedrooms <= 100)),
  add column if not exists beds integer
    check (beds is null or (beds >= 1 and beds <= 500)),
  add column if not exists seated_capacity integer
    check (seated_capacity is null or (seated_capacity >= 1 and seated_capacity <= 100000)),
  add column if not exists standing_capacity integer
    check (standing_capacity is null or (standing_capacity >= 1 and standing_capacity <= 100000));

comment on column public.listing_booking_details.bedrooms is
  'Airbnb and hotel listings: bedroom count (0 = studio). NULL when not provided.';
comment on column public.listing_booking_details.beds is
  'Airbnb and hotel listings: bed count. NULL when not provided.';
comment on column public.listing_booking_details.seated_capacity is
  'Venue listings: seated guests. NULL when not provided.';
comment on column public.listing_booking_details.standing_capacity is
  'Venue listings: standing guests. NULL when not provided.';
comment on column public.listing_booking_details.bathrooms is
  'Property, Airbnb and hotel listings: bathroom count. NULL when not provided.';
