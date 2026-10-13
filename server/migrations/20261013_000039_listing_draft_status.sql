alter table public.listings
  drop constraint if exists listings_availability_status_check;

alter table public.listings
  add constraint listings_availability_status_check
  check (availability_status in ('available', 'booked', 'unavailable', 'paused', 'draft'));
