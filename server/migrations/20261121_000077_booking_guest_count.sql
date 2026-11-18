-- How many guests a stay booking is for.
--
-- The booking page always asked "Guests" but never saved the answer, so hosts
-- never saw it. A booking now keeps the guest count, and the database checks
-- it against the listing's maximum guests (guests insert bookings from the
-- browser, so the page alone can't be trusted). Leases and older bookings keep
-- NULL. A guest still can't change the count afterwards: the existing guard
-- (varoom_guard_guest_booking_update) lets a guest change only the status.
-- Each statement is safe to re-run.

alter table public.bookings
  add column if not exists guest_count integer
    check (guest_count is null or (guest_count >= 1 and guest_count <= 1000));

comment on column public.bookings.guest_count is
  'Stays and venues: how many guests the booking is for. NULL for leases and bookings made before it was saved.';

create or replace function public.varoom_check_booking_guest_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  guest_limit integer;
begin
  if new.guest_count is null then
    return new;
  end if;
  select d.max_guests into guest_limit
    from public.listing_booking_details d
    where d.listing_id = new.listing_id;
  if guest_limit is not null and guest_limit > 0 and new.guest_count > guest_limit then
    raise exception 'booking_rule: This place takes up to % guest(s).', guest_limit;
  end if;
  return new;
end;
$$;

-- BEFORE triggers run in name order: after varoom_apply_booking_rules_trigger.
drop trigger if exists varoom_check_booking_guest_count_trigger on public.bookings;
create trigger varoom_check_booking_guest_count_trigger
  before insert on public.bookings
  for each row execute function public.varoom_check_booking_guest_count();

-- Rollback:
-- drop trigger if exists varoom_check_booking_guest_count_trigger on public.bookings;
-- drop function if exists public.varoom_check_booking_guest_count();
-- alter table public.bookings drop column if exists guest_count;
