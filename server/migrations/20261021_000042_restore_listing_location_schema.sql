-- Restore the location fields expected by current listing and booking code.
-- Production schema inspection confirmed that latitude/longitude existed but
-- the sibling location columns and booking snapshot were absent. This repair
-- is additive: it preserves all listing and booking rows.

alter table public.listings
  add column if not exists latitude double precision,
  add column if not exists longitude double precision,
  add column if not exists place_id text,
  add column if not exists formatted_address text,
  add column if not exists neighborhood text,
  add column if not exists city text,
  add column if not exists country text,
  add column if not exists location_status text not null default 'unset';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.listings'::regclass
      and conname = 'listings_location_status_check'
  ) then
    alter table public.listings
      add constraint listings_location_status_check
      check (location_status in ('unset', 'pending', 'confirmed'));
  end if;
end;
$$;

comment on column public.listings.latitude is
  'Source of truth for property location. Never expose directly to clients; access is gated by the server location-access functions.';
comment on column public.listings.longitude is
  'Source of truth for property location. Never expose directly to clients; access is gated by the server location-access functions.';
comment on column public.listings.location_status is
  'unset: no location saved; pending: picker started; confirmed: ready for location-aware publication.';

alter table public.bookings
  add column if not exists location_snapshot jsonb;

comment on column public.bookings.location_snapshot is
  'Exact location captured when a booking is approved. Existing bookings remain NULL until an eligible approval or explicit repair.';

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
     and old.status is distinct from 'approved'
     and new.location_snapshot is null then
    select latitude, longitude, place_id, formatted_address,
           neighborhood, city, country, location_status
      into loc
      from public.listings
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

drop trigger if exists varoom_snapshot_booking_location_trigger on public.bookings;
create trigger varoom_snapshot_booking_location_trigger
  before update on public.bookings
  for each row execute function public.varoom_snapshot_booking_location();

create index if not exists listings_lat_lng_idx
  on public.listings (latitude, longitude)
  where latitude is not null and longitude is not null;
