-- No bookings of one's own listing.
-- Review and apply manually; the application never runs migrations.
--
-- The booking page now shows hosts their own listing (with notes in place of
-- the booking actions), and guests insert bookings straight from the browser,
-- so the page alone can't be trusted. The owner is read from the listing
-- itself, not from the booking's host_id, which the browser sends.
-- Existing bookings are not touched: the check runs only when a booking is
-- created. Safe to re-run.

create or replace function public.varoom_block_own_listing_booking()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (
    select 1 from public.listings l
    where l.id = new.listing_id
      and l.host_id = new.client_id
  ) then
    -- The booking_rule: prefix makes the booking page show the text as it is.
    raise exception 'booking_rule: This is your own listing. You can''t book it.'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

revoke all on function public.varoom_block_own_listing_booking() from public, anon, authenticated;

drop trigger if exists varoom_block_own_listing_booking_trigger on public.bookings;
create trigger varoom_block_own_listing_booking_trigger
  before insert on public.bookings
  for each row execute function public.varoom_block_own_listing_booking();

-- Rollback (run only to undo this migration):
-- drop trigger if exists varoom_block_own_listing_booking_trigger on public.bookings;
-- drop function if exists public.varoom_block_own_listing_booking();
