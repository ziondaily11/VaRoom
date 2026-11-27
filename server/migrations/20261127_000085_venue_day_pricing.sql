-- Event venues are hired by the hour or by the day, never by the night.
--
-- 1. A booking priced per day stores its first and last day (start_date,
--    end_date), both included, so one day is the same date twice. The booking
--    rules accept that when the listing is priced per day; nightly stays still need a
--    check-out after check-in. Overlaps were already checked with both ends
--    included, and minimum/maximum nights are not used by venues.
-- 2. Venue listings priced per night move to per day (the wizard no longer
--    offers per night for venues).
--
-- Check first:
--   select d.price_unit, count(*) from public.listings l
--   join public.listing_booking_details d on d.listing_id = l.id
--   where l.category = 'venue' group by d.price_unit;

create or replace function public.varoom_apply_booking_rules()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  rules record;
  today date := (now() at time zone 'Africa/Nairobi')::date;
  first_day date := coalesce(new.start_date, new.lease_start_date);
  nights integer;
  has_rules boolean;
  daily boolean;
begin
  select d.instant_book, d.min_notice_days, d.max_advance_days, d.min_stay_nights, d.max_stay_nights, d.price_unit
    into rules
    from public.listing_booking_details d
    where d.listing_id = new.listing_id;
  has_rules := found;
  -- The listing's own unit decides, never the one the browser sent.
  daily := has_rules and rules.price_unit = 'day';

  -- The status is the database's decision, never the guest's. Instant booking
  -- covers nightly stays (checked for overlaps below), not hours or leases.
  if has_rules and rules.instant_book and new.start_date is not null and new.end_date is not null then
    new.status := 'approved';
    new.responded_at := now();
  else
    new.status := 'pending';
    new.responded_at := null;
  end if;

  if first_day is not null then
    if first_day < today then
      raise exception 'booking_rule: That date has already passed.';
    end if;
    if has_rules and rules.min_notice_days is not null and first_day < today + rules.min_notice_days then
      raise exception 'booking_rule: This host needs at least % day(s) notice.', rules.min_notice_days;
    end if;
    if has_rules and rules.max_advance_days is not null and first_day > today + rules.max_advance_days then
      raise exception 'booking_rule: This host takes bookings up to % days ahead.', rules.max_advance_days;
    end if;
  end if;

  -- Nightly stays: a check-in and a check-out. A venue hired by the day: a
  -- first and a last day, both included (one day: the same date twice).
  if new.start_date is not null and new.end_date is not null then
    if daily and new.end_date < new.start_date then
      raise exception 'booking_rule: The last day can''t be before the first day.';
    end if;
    if not daily and new.end_date <= new.start_date then
      raise exception 'booking_rule: Check-out must be after check-in.';
    end if;
    nights := new.end_date - new.start_date;
    if has_rules and rules.min_stay_nights is not null and nights < rules.min_stay_nights then
      raise exception 'booking_rule: The minimum stay is % night(s).', rules.min_stay_nights;
    end if;
    if has_rules and rules.max_stay_nights is not null and nights > rules.max_stay_nights then
      raise exception 'booking_rule: The maximum stay is % night(s).', rules.max_stay_nights;
    end if;
    -- One booking at a time per listing, so two guests can't take the same nights.
    perform pg_advisory_xact_lock(hashtext('varoom-booking:' || new.listing_id::text));
    if exists (
      select 1 from public.bookings b
      where b.listing_id = new.listing_id
        and b.status in ('pending', 'approved')
        and b.start_date is not null and b.end_date is not null
        and b.start_date <= new.end_date and b.end_date >= new.start_date
    ) then
      raise exception 'booking_rule: Those dates were just booked. Please choose other dates.';
    end if;
  end if;
  return new;
end;
$$;

update public.listing_booking_details d
set price_unit = 'day'
from public.listings l
where l.id = d.listing_id and l.category = 'venue' and d.price_unit = 'night';

-- Undo:
--   update public.listing_booking_details d set price_unit = 'night'
--   from public.listings l where l.id = d.listing_id and l.category = 'venue' and d.price_unit = 'day';
--   then re-run the varoom_apply_booking_rules function from 20261110_000063_booking_rules.sql.
