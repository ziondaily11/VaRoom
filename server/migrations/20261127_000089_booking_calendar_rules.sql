-- Calendar part 1: the booking rules the calendar relies on
-- (docs/host-controls/CALENDAR_PLAN.md, P1, P3, P4, P6, P7).
--
-- 1. Changeover day: a stay from the 1st to the 5th takes the nights of the
--    1st to the 4th, so another guest can check in on the 5th. Venues hired by
--    the day still take every day from the first to the last, both included.
-- 2. Hotels: a listing is a room type with units_available rooms. A night is
--    full only when that many bookings cover it.
-- 3. A pending request holds its dates for 48 hours, the time the host has to
--    answer, even if the hourly expiry sweep hasn't run yet. A host can no
--    longer approve a request after those 48 hours.
-- 4. The database checks that every booked day is one the host opened (the
--    booking page did, the database didn't).
-- 5. listing_calendar(listing): the open days and the booked nights of one
--    listing, for the booking page. Guests can't read other guests' bookings
--    (row-level security), so the page could only ever grey out the guest's own
--    bookings. The function returns dates and rooms left only: no names, no ids.
--
-- Check first (both must work):
--   select count(*) from public.availability where date >= current_date;
--   select count(*) from public.bookings where status = 'pending' and created_at < now() - interval '48 hours';
-- Each statement is safe to re-run.

-- ---- Booked nights of one listing (internal) ----
-- One row per night (per day for venues hired by the day) that at least one
-- approved booking, or pending request younger than 48 hours, covers.
create or replace function public.varoom_booked_nights(p_listing uuid, p_from date, p_to date)
returns table (night date, booked integer, capacity integer)
language sql
stable
security definer
set search_path = public
as $$
  with listing as (
    select case when l.category = 'hotel' then greatest(coalesce(d.units_available, 1), 1) else 1 end as capacity,
           coalesce(d.price_unit = 'day', false) as daily
    from public.listings l
    left join public.listing_booking_details d on d.listing_id = l.id
    where l.id = p_listing
  )
  select n.night::date, count(*)::integer, listing.capacity
  from listing
  join public.bookings b on b.listing_id = p_listing
    and b.start_date is not null and b.end_date is not null
    and (b.status = 'approved' or (b.status = 'pending' and b.created_at > now() - interval '48 hours'))
  cross join lateral generate_series(
    greatest(b.start_date, p_from)::timestamp,
    least(b.end_date - case when listing.daily then 0 else 1 end, p_to)::timestamp,
    interval '1 day'
  ) as n(night)
  group by n.night, listing.capacity
$$;

revoke all on function public.varoom_booked_nights(uuid, date, date) from public, anon, authenticated;

-- ---- The booking page's calendar ----
create or replace function public.listing_calendar(p_listing uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with today as (select (now() at time zone 'Africa/Nairobi')::date as day)
  select jsonb_build_object(
    'open', coalesce((
      select jsonb_agg(a.date::date order by a.date)
      from public.availability a, today
      where a.listing_id = p_listing and a.date::date >= today.day
    ), '[]'::jsonb),
    'booked', coalesce((
      select jsonb_agg(jsonb_build_object('night', n.night, 'left', greatest(n.capacity - n.booked, 0)) order by n.night)
      from today, public.varoom_booked_nights(p_listing, today.day, today.day + 1095) n
    ), '[]'::jsonb)
  )
$$;

revoke all on function public.listing_calendar(uuid) from public;
grant execute on function public.listing_calendar(uuid) to anon, authenticated;

-- ---- Rules applied to every new booking (from 000085, with 1-4 above) ----
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
  last_night date;
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
  end if;

  -- Every night (or day) booked must be one the host opened. The check-out day
  -- itself is not a night of the stay.
  if new.start_date is not null then
    last_night := case when new.end_date is null then new.start_date
                       when daily then new.end_date else new.end_date - 1 end;
    if exists (
      select 1 from generate_series(new.start_date::timestamp, last_night::timestamp, interval '1 day') g(day)
      where not exists (select 1 from public.availability a where a.listing_id = new.listing_id and a.date::date = g.day::date)
    ) then
      raise exception 'booking_rule: Some of those dates are not open for booking. Please choose other dates.';
    end if;
  end if;

  if new.start_date is not null and new.end_date is not null then
    -- One booking at a time per listing, so two guests can't take the last room
    -- or the same nights.
    perform pg_advisory_xact_lock(hashtext('varoom-booking:' || new.listing_id::text));
    if exists (
      select 1 from public.varoom_booked_nights(new.listing_id, new.start_date, last_night)
      where booked >= capacity
    ) then
      raise exception 'booking_rule: Those dates were just booked. Please choose other dates.';
    end if;
  end if;
  return new;
end;
$$;

-- ---- A request can't be approved once its 48 hours are over ----
create or replace function public.varoom_refuse_expired_approval()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.status = 'pending' and new.status = 'approved' and old.created_at < now() - interval '48 hours' then
    raise exception 'booking_rule: This request expired after 48 hours. The guest can send a new one.';
  end if;
  return new;
end;
$$;

drop trigger if exists varoom_refuse_expired_approval_trigger on public.bookings;
create trigger varoom_refuse_expired_approval_trigger
  before update of status on public.bookings
  for each row execute function public.varoom_refuse_expired_approval();

-- Undo:
--   drop trigger if exists varoom_refuse_expired_approval_trigger on public.bookings;
--   drop function if exists public.varoom_refuse_expired_approval();
--   drop function if exists public.listing_calendar(uuid);
--   then re-run the varoom_apply_booking_rules function from 20261127_000085_venue_day_pricing.sql,
--   and only after that: drop function if exists public.varoom_booked_nights(uuid, date, date);
