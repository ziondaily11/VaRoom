-- VaRoom Google Maps Integration, Phase 1: schema only.
-- Additive migration. Never alters existing listings/bookings columns,
-- never drops anything. Safe to run on the live project.
--
-- Per the Google Maps Flow spec: coordinates are the source of truth,
-- formatted address is supplementary. Exact coordinates are stored here
-- but must NEVER be sent to a client directly from this table — access
-- is gated entirely through server/lib/locationAccess.js (see that file
-- for the 4 access levels). Do not add a public Supabase policy that
-- exposes latitude/longitude/place_id/formatted_address on listings.

-- 1. Listing location fields -------------------------------------------------

alter table listings
  add column if not exists latitude double precision,
  add column if not exists longitude double precision,
  add column if not exists place_id text,
  add column if not exists formatted_address text,
  add column if not exists neighborhood text,
  add column if not exists city text,
  add column if not exists country text,
  add column if not exists location_status text not null default 'unset';

-- location_status tracks progress through the host picker flow (built in a
-- later phase). 'unset' = no location saved yet, listing cannot publish.
alter table listings
  drop constraint if exists listings_location_status_check;
alter table listings
  add constraint listings_location_status_check
  check (location_status in ('unset', 'pending', 'confirmed'));

comment on column listings.latitude is 'Source of truth for property location. Never expose directly to clients — see server/lib/locationAccess.js.';
comment on column listings.longitude is 'Source of truth for property location. Never expose directly to clients — see server/lib/locationAccess.js.';
comment on column listings.location_status is 'unset: no location saved (cannot publish). pending: picker started but not confirmed. confirmed: ready for publish.';

-- 2. Booking location snapshot ------------------------------------------------
-- Captured once, at approval time, from the listing's confirmed location.
-- A later host edit to listings.latitude/longitude must never change an
-- already-approved booking's destination (spec section 13).

alter table bookings
  add column if not exists location_snapshot jsonb;

comment on column bookings.location_snapshot is
  'Exact location captured at approval time: {latitude, longitude, place_id, formatted_address, neighborhood, city, country, snapshotted_at}. Independent of any later edits to the listing''s location. Populated by the booking-approval code path, not by the client.';

-- 3. Auto-snapshot on approval -----------------------------------------------
-- Booking approval currently happens as a direct client-side update to
-- bookings.status (see client/bookings.html) — there is no server-side
-- approval endpoint to hook this into. A trigger keeps the snapshot correct
-- regardless of which code path flips the status to 'approved', now or later.
-- Only fires once: if location_snapshot is already set, it is left alone
-- (a booking's destination should never move after being snapshotted).

create or replace function public.varoom_snapshot_booking_location()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  loc record;
begin
  if new.status = 'approved'
     and (old.status is distinct from 'approved')
     and new.location_snapshot is null then

    select latitude, longitude, place_id, formatted_address, neighborhood, city, country, location_status
      into loc
      from listings
      where id = new.listing_id;

    if found and loc.location_status = 'confirmed' then
      new.location_snapshot := jsonb_build_object(
        'latitude', loc.latitude,
        'longitude', loc.longitude,
        'place_id', loc.place_id,
        'formatted_address', loc.formatted_address,
        'neighborhood', loc.neighborhood,
        'city', loc.city,
        'country', loc.country,
        'snapshotted_at', now()
      );
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists varoom_snapshot_booking_location_trigger on bookings;
create trigger varoom_snapshot_booking_location_trigger
  before update on bookings
  for each row
  execute function public.varoom_snapshot_booking_location();

-- 4. Helpful index for future map-discovery / distance queries ---------------

create index if not exists listings_lat_lng_idx
  on listings (latitude, longitude)
  where latitude is not null and longitude is not null;
