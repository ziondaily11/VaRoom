-- Host listing lifecycle state. Additive and safe for existing listings.
alter table listings
  add column if not exists availability_status text not null default 'available';

alter table listings drop constraint if exists listings_availability_status_check;
alter table listings add constraint listings_availability_status_check
  check (availability_status in ('available', 'booked', 'unavailable', 'paused'));

create index if not exists listings_availability_status_idx
  on listings (availability_status, created_at);

-- Never rely on the booking page alone: a stale client must not create a
-- booking while a host has made the listing unavailable.
create or replace function public.varoom_block_unavailable_booking()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (
    select 1 from listings
    where id = new.listing_id
      and coalesce(availability_status, 'available') <> 'available'
  ) then
    raise exception 'This listing is not currently available';
  end if;
  return new;
end;
$$;

drop trigger if exists varoom_block_unavailable_booking_trigger on bookings;
create trigger varoom_block_unavailable_booking_trigger
  before insert on bookings
  for each row
  execute function public.varoom_block_unavailable_booking();
