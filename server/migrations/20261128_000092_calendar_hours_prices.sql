-- Calendar part 4: venues by the hour, hotel rooms and dining, and prices the
-- database works out (docs/host-controls/CALENDAR_PLAN.md, P5 and P8).
--
-- 1. An hourly booking has a start and end time. It must fall within the
--    venue's hire hours (any time when not set) and end by midnight, and it
--    can't overlap another hourly booking, or a timed "booked offline" event,
--    including the venue's set-up / clean-up buffer. Before, an hourly booking
--    stored only a date and a number of hours, and nothing stopped two
--    parties booking the same hall at the same time.
--    On an hourly venue, a timed event takes only its hours, not the day.
-- 2. listing_booking_details: hire_start, hire_end, buffer_minutes
--    (calendar_set_hours sets them).
-- 3. The booking's price is worked out here, the same way the booking page
--    shows it, never taken from the browser: nights (days, hours) × price,
--    plus the cleaning fee for nights and days; a rental's months × the
--    monthly price (a twelfth of a yearly one; per area or per desk for
--    offices and shops), and 0 when the host confirms the price.
-- 4. listing_calendar adds `slots`: the taken times of an hourly venue
--    (minutes from midnight, buffer included), no names.
-- 5. host_calendar adds times, hire hours and table reservations. Hosts and
--    team managers can now read their own table reservations directly (they
--    already could through the server).
--
-- Check first (must return 0: no hourly bookings exist yet, so requiring a
-- start time breaks nothing):
--   select count(*) from public.bookings where start_date is not null and end_date is null;
-- Each statement is safe to re-run.

-- ---- 1-2. Times ----
alter table public.bookings
  add column if not exists start_time time,
  add column if not exists end_time time;

alter table public.listing_booking_details
  add column if not exists hire_start time,
  add column if not exists hire_end time,
  add column if not exists buffer_minutes integer not null default 0 check (buffer_minutes between 0 and 240);
alter table public.listing_booking_details drop constraint if exists listing_booking_details_hire_hours_check;
alter table public.listing_booking_details add constraint listing_booking_details_hire_hours_check
  check ((hire_start is null) = (hire_end is null) and (hire_start is null or hire_start < hire_end));

create or replace function public.calendar_set_hours(p_listing uuid, p_start time, p_end time, p_buffer integer)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  owner uuid;
begin
  select l.host_id into owner from public.listings l where l.id = p_listing;
  if owner is null or not public.varoom_can_act_for(owner, 'manager') then
    raise exception 'calendar: You can''t change this listing''s calendar.';
  end if;
  if (p_start is null) <> (p_end is null) or p_start >= p_end then
    raise exception 'calendar: The closing time must be after the opening time.';
  end if;
  update public.listing_booking_details
    set hire_start = p_start, hire_end = p_end, buffer_minutes = greatest(0, least(coalesce(p_buffer, 0), 240))
    where listing_id = p_listing;
  if not found then
    raise exception 'calendar: This listing has no booking details yet.';
  end if;
end;
$$;

revoke all on function public.calendar_set_hours(uuid, time, time, integer) from public, anon;
grant execute on function public.calendar_set_hours(uuid, time, time, integer) to authenticated;

-- Minutes from midnight (24:00 is 1440).
create or replace function public.varoom_minutes(p_time time)
returns integer
language sql
immutable
as $$ select (extract(epoch from p_time) / 60)::integer $$;

-- The taken times of a listing's days: hourly bookings (approved, or requests
-- younger than 48 hours) and timed "booked offline" events. A timed event
-- over several days runs from its start time on the first day to its end
-- time on the last.
create or replace function public.varoom_busy_times(p_listing uuid, p_from date, p_to date)
returns table (day date, start_min integer, end_min integer)
language sql
stable
security definer
set search_path = public
as $$
  select b.start_date, public.varoom_minutes(b.start_time), public.varoom_minutes(b.end_time)
  from public.bookings b
  where b.listing_id = p_listing and b.start_date between p_from and p_to
    and b.end_date is null and b.start_time is not null and b.end_time is not null
    and (b.status = 'approved' or (b.status = 'pending' and b.created_at > now() - interval '48 hours'))
  union all
  select d::date,
         case when d::date = o.start_date then public.varoom_minutes(e.start_time) else 0 end,
         case when d::date = o.end_date then public.varoom_minutes(e.end_time) else 1440 end
  from public.varoom_event_occurrences(null, p_listing, p_from, p_to) o
  join public.calendar_entries e on e.id = o.entry_id and e.blocks and e.start_time is not null
  cross join lateral generate_series(greatest(o.start_date, p_from)::timestamp, least(o.end_date, p_to)::timestamp, interval '1 day') d
$$;

revoke all on function public.varoom_busy_times(uuid, date, date) from public, anon, authenticated;

-- ---- Booked nights (from 000091): on an hourly venue a timed event takes its hours, not the day ----
create or replace function public.varoom_booked_nights(p_listing uuid, p_from date, p_to date)
returns table (night date, booked integer, capacity integer)
language sql
stable
security definer
set search_path = public
as $$
  with listing as (
    select case when l.category = 'hotel' then greatest(coalesce(d.units_available, 1), 1) else 1 end as capacity,
           coalesce(d.price_unit = 'day', false) as daily,
           coalesce(d.price_unit = 'hour', false) as hourly
    from public.listings l
    left join public.listing_booking_details d on d.listing_id = l.id
    where l.id = p_listing
  ), taken as (
    -- Approved bookings and requests younger than 48 hours: their nights (days, by the day).
    select n.night::date as night, 1 as units
    from listing
    join public.bookings b on b.listing_id = p_listing
      and b.start_date is not null and b.end_date is not null
      and (b.status = 'approved' or (b.status = 'pending' and b.created_at > now() - interval '48 hours'))
    cross join lateral generate_series(
      greatest(b.start_date, p_from)::timestamp,
      least(b.end_date - case when listing.daily then 0 else 1 end, p_to)::timestamp,
      interval '1 day'
    ) as n(night)
    union all
    -- Bookings the host made outside VaRoom: every day of the event, both included.
    select n.night::date, e.units
    from listing, public.varoom_event_occurrences(null, p_listing, p_from, p_to) o
    join public.calendar_entries e on e.id = o.entry_id and e.blocks
    cross join lateral generate_series(greatest(o.start_date, p_from)::timestamp, least(o.end_date, p_to)::timestamp, interval '1 day') as n(night)
    where not (listing.hourly and e.start_time is not null)
  )
  select t.night, sum(t.units)::integer, listing.capacity
  from taken t, listing
  group by t.night, listing.capacity
$$;

revoke all on function public.varoom_booked_nights(uuid, date, date) from public, anon, authenticated;

-- A blocking event can't take days (or, on an hourly venue, hours) already booked (from 000091).
create or replace function public.varoom_check_event_capacity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  last_day date;
begin
  if new.kind <> 'event' or not new.blocks or new.listing_id is null then
    return null;
  end if;
  last_day := case when new.repeat is null then new.end_date
                   else least(coalesce(new.repeat_until, new.start_date + 365), new.start_date + 365) + (new.end_date - new.start_date) end;
  perform pg_advisory_xact_lock(hashtext('varoom-booking:' || new.listing_id::text));
  if exists (select 1 from public.varoom_booked_nights(new.listing_id, new.start_date, last_day) where booked > capacity) then
    raise exception 'calendar: Those days are already booked. Choose other days, or add it as a note.';
  end if;
  if new.start_time is not null and exists (
    select 1 from (
      select t.start_min, max(t.end_min) over (partition by t.day order by t.start_min, t.end_min rows between unbounded preceding and 1 preceding) as earlier_end
      from public.varoom_busy_times(new.listing_id, new.start_date, last_day) t
    ) x
    where x.start_min < x.earlier_end
  ) then
    raise exception 'calendar: Those hours are already booked. Choose another time, or add it as a note.';
  end if;
  return null;
end;
$$;

-- ---- 5. Table reservations: hosts and managers read their own ----
drop policy if exists "Hosts and managers read their table reservations" on public.table_reservations;
create policy "Hosts and managers read their table reservations" on public.table_reservations
  for select to authenticated using (public.varoom_can_act_for(host_id, 'manager'));
grant select on public.table_reservations to authenticated;

-- ---- 4. The booking page's calendar (from 000091: taken times of hourly venues) ----
create or replace function public.listing_calendar(p_listing uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with today as (select (now() at time zone 'Africa/Nairobi')::date as day),
  rules as (
    select coalesce(d.max_advance_days, 365) as ahead, coalesce(d.closed_weekdays, '{}') as weekdays,
           coalesce(d.price_unit = 'hour', false) as hourly, coalesce(d.buffer_minutes, 0) as buffer
    from (select 1) one left join public.listing_booking_details d on d.listing_id = p_listing
  )
  select jsonb_build_object(
    'open', coalesce((
      select jsonb_agg(g.day::date order by g.day)
      from today, rules, generate_series(today.day::timestamp, (today.day + rules.ahead)::timestamp, interval '1 day') g(day)
      where exists (select 1 from public.listings l where l.id = p_listing)
        and not (extract(dow from g.day)::smallint = any (rules.weekdays))
        and not exists (
          select 1 from public.calendar_entries c
          where c.listing_id = p_listing and c.kind = 'closed'
            and c.start_date <= g.day::date and coalesce(c.end_date, 'infinity'::date) >= g.day::date
        )
    ), '[]'::jsonb),
    'booked', coalesce((
      select jsonb_agg(jsonb_build_object('night', n.night, 'left', greatest(n.capacity - n.booked, 0)) order by n.night)
      from today, public.varoom_booked_nights(p_listing, today.day, today.day + 1095) n
    ), '[]'::jsonb),
    'slots', coalesce((
      select jsonb_agg(jsonb_build_object('day', t.day, 'from', greatest(t.start_min - rules.buffer, 0), 'to', least(t.end_min + rules.buffer, 1440)) order by t.day, t.start_min)
      from today, rules, public.varoom_busy_times(p_listing, today.day, today.day + rules.ahead) t
      where rules.hourly
    ), '[]'::jsonb)
  )
$$;

revoke all on function public.listing_calendar(uuid) from public;
grant execute on function public.listing_calendar(uuid) to anon, authenticated;

-- ---- The host's Calendar page (from 000091: times, hire hours, table reservations) ----
create or replace function public.host_calendar(p_host uuid, p_from date, p_to date)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  select jsonb_build_object(
    'listings', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', l.id, 'title', l.title, 'category', l.category, 'availability_status', l.availability_status,
        'live_until', l.live_until, 'price_unit', d.price_unit, 'units', d.units_available,
        'min_notice_days', d.min_notice_days, 'max_advance_days', d.max_advance_days,
        'closed_weekdays', coalesce(d.closed_weekdays, '{}'), 'hire_start', to_char(d.hire_start, 'HH24:MI'),
        'hire_end', to_char(d.hire_end, 'HH24:MI'), 'buffer_minutes', coalesce(d.buffer_minutes, 0)) order by l.created_at)
      from public.listings l
      left join public.listing_booking_details d on d.listing_id = l.id
      where l.host_id = p_host and l.category in ('airbnb', 'hotel', 'venue') and coalesce(l.supports_stay, true)
        and l.publication_state = 'published'
    ), '[]'::jsonb),
    'bookings', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', b.id, 'listing_id', b.listing_id, 'status', b.status, 'start_date', b.start_date, 'end_date', b.end_date,
        'start_time', to_char(b.start_time, 'HH24:MI'), 'end_time', to_char(b.end_time, 'HH24:MI'),
        'hours', b.hours, 'guest_count', b.guest_count, 'total_price', b.total_price, 'created_at', b.created_at,
        'guest', (select p.full_name from public.profiles p where p.id = b.client_id)) order by b.start_date, b.start_time nulls first)
      from public.bookings b
      where b.host_id = p_host and b.start_date is not null
        and b.start_date <= p_to and coalesce(b.end_date, b.start_date) >= p_from
        and (b.status in ('approved', 'completed') or (b.status = 'pending' and b.created_at > now() - interval '48 hours'))
    ), '[]'::jsonb),
    'closed', coalesce((
      select jsonb_agg(jsonb_build_object('listing_id', c.listing_id, 'start_date', c.start_date, 'end_date', c.end_date) order by c.start_date)
      from public.calendar_entries c
      where c.host_id = p_host and c.kind = 'closed' and c.start_date <= p_to and coalesce(c.end_date, 'infinity'::date) >= p_from
    ), '[]'::jsonb),
    'events', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', e.id, 'listing_id', e.listing_id, 'start_date', o.start_date, 'end_date', o.end_date,
        'series_start', e.start_date, 'series_end', e.end_date, 'title', e.title, 'notes', e.notes, 'color', e.color,
        'start_time', to_char(e.start_time, 'HH24:MI'), 'end_time', to_char(e.end_time, 'HH24:MI'), 'blocks', e.blocks,
        'client_name', e.client_name, 'client_phone', e.client_phone, 'guest_count', e.guest_count, 'amount', e.amount,
        'units', e.units, 'repeat', e.repeat, 'repeat_until', e.repeat_until) order by o.start_date, e.start_time nulls first)
      from public.varoom_event_occurrences(p_host, null, p_from, p_to) o
      join public.calendar_entries e on e.id = o.entry_id
    ), '[]'::jsonb),
    'tables', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', r.id, 'listing_id', r.listing_id, 'restaurant_name', r.restaurant_name, 'client_name', r.client_name,
        'client_phone', r.client_phone, 'guest_count', r.guest_count, 'table_count', r.table_count, 'date', r.requested_date,
        'time', to_char(r.requested_time, 'HH24:MI'), 'occasion', case when r.special_occasion then r.occasion_details end,
        'status', r.status) order by r.requested_date, r.requested_time)
      from public.table_reservations r
      where r.host_id = p_host and r.requested_date between p_from and p_to
    ), '[]'::jsonb)
  )
$$;

revoke all on function public.host_calendar(uuid, date, date) from public, anon;
grant execute on function public.host_calendar(uuid, date, date) to authenticated;

-- ---- 1, 3. Rules applied to every new booking (from 000091: times and the price) ----
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
  ahead integer;
  from_min integer;
  to_min integer;
  rate numeric;
  monthly numeric;
  area numeric;
begin
  select d.instant_book, d.min_notice_days, d.max_advance_days, d.min_stay_nights, d.max_stay_nights, d.price_unit, d.closed_weekdays,
         d.hire_start, d.hire_end, d.buffer_minutes, d.price_amount, d.cleaning_fee, d.office_shop_details
    into rules
    from public.listing_booking_details d
    where d.listing_id = new.listing_id;
  has_rules := found;
  -- The listing's own unit decides, never the one the browser sent.
  daily := has_rules and rules.price_unit = 'day';
  -- Stays, venues and hotels take bookings up to 365 days ahead unless the host chose otherwise.
  ahead := case when has_rules then rules.max_advance_days end;
  if ahead is null and new.start_date is not null then
    ahead := 365;
  end if;

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
    if ahead is not null and first_day > today + ahead then
      raise exception 'booking_rule: This host takes bookings up to % days ahead.', ahead;
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

  -- An hourly booking: a start time and whole hours, ending by midnight,
  -- within the hire hours. Only hourly bookings keep times.
  if new.start_date is not null and new.end_date is null then
    if new.start_time is null or new.hours is null or new.hours < 1 then
      raise exception 'booking_rule: Choose a start time and how many hours.';
    end if;
    from_min := public.varoom_minutes(new.start_time);
    to_min := from_min + new.hours * 60;
    if to_min > 1440 then
      raise exception 'booking_rule: A booking must end by midnight.';
    end if;
    new.end_time := case when to_min = 1440 then time '24:00' else time '00:00' + make_interval(mins => to_min) end;
    if has_rules and rules.hire_start is not null and (new.start_time < rules.hire_start or new.end_time > rules.hire_end) then
      raise exception 'booking_rule: This place can be hired from % to %.', to_char(rules.hire_start, 'HH24:MI'), to_char(rules.hire_end, 'HH24:MI');
    end if;
  else
    new.start_time := null;
    new.end_time := null;
  end if;

  -- No night (or day) of the booking may be one the host closed, on a date or
  -- every week. The check-out day itself is not a night of the stay.
  if new.start_date is not null then
    last_night := case when new.end_date is null then new.start_date
                       when daily then new.end_date else new.end_date - 1 end;
    if exists (
      select 1 from public.calendar_entries c
      where c.listing_id = new.listing_id and c.kind = 'closed'
        and c.start_date <= last_night and coalesce(c.end_date, 'infinity'::date) >= new.start_date
    ) then
      raise exception 'booking_rule: Some of those dates are closed. Please choose other dates.';
    end if;
    if has_rules and cardinality(rules.closed_weekdays) > 0 and exists (
      select 1 from generate_series(new.start_date::timestamp, last_night::timestamp, interval '1 day') g(day)
      where extract(dow from g.day)::smallint = any (rules.closed_weekdays)
    ) then
      raise exception 'booking_rule: This place is closed on some of those days of the week. Please choose other dates.';
    end if;
  end if;

  if new.start_date is not null then
    -- One booking at a time per listing, so two guests (or a guest and the
    -- host's own booking) can't take the last room, the same nights or the same hours.
    perform pg_advisory_xact_lock(hashtext('varoom-booking:' || new.listing_id::text));
    if exists (
      select 1 from public.varoom_booked_nights(new.listing_id, new.start_date, last_night)
      where booked >= capacity
    ) then
      raise exception 'booking_rule: Those dates were just booked. Please choose other dates.';
    end if;
    if new.end_date is null and exists (
      select 1 from public.varoom_busy_times(new.listing_id, new.start_date, new.start_date) t
      where t.start_min < to_min + coalesce(rules.buffer_minutes, 0) and from_min < t.end_min + coalesce(rules.buffer_minutes, 0)
    ) then
      raise exception 'booking_rule: That time was just booked. Please choose another time.';
    end if;
  end if;

  -- The price, as the booking page shows it; never the browser's figure.
  rate := case when has_rules then coalesce(rules.price_amount, 0) else 0 end;
  if new.start_date is not null and new.end_date is not null then
    new.total_price := rate * (nights + case when daily then 1 else 0 end) + case when has_rules then coalesce(rules.cleaning_fee, 0) else 0 end;
  elsif new.start_date is not null then
    new.total_price := rate * new.hours;
  elsif new.lease_months is not null then
    area := case when has_rules and (rules.office_shop_details -> 'space' ->> 'area') ~ '^[0-9]+(\.[0-9]+)?$'
                 then (rules.office_shop_details -> 'space' ->> 'area')::numeric end;
    monthly := case coalesce(case when has_rules then rules.price_unit end, 'month')
      when 'month' then rate
      when 'year' then rate / 12
      when 'desk' then rate
      when 'sq_ft' then case when area > 0 then rate * area / case when rules.office_shop_details -> 'pricing' ->> 'area_period' = 'year' then 12 else 1 end end
      when 'm2' then case when area > 0 then rate * area / case when rules.office_shop_details -> 'pricing' ->> 'area_period' = 'year' then 12 else 1 end end
    end;
    -- No monthly figure (priced per day or by turnover): the host confirms the price.
    new.total_price := coalesce(round(monthly * new.lease_months), 0);
  end if;
  return new;
end;
$$;

-- Undo (in this order):
--   1. re-run varoom_apply_booking_rules, listing_calendar, host_calendar, varoom_booked_nights and
--      varoom_check_event_capacity from 20261127_000091_calendar_planner.sql;
--   2. drop function if exists public.varoom_busy_times(uuid, date, date);
--      drop function if exists public.varoom_minutes(time);
--      drop function if exists public.calendar_set_hours(uuid, time, time, integer);
--      drop policy if exists "Hosts and managers read their table reservations" on public.table_reservations;
--      alter table public.listing_booking_details drop constraint if exists listing_booking_details_hire_hours_check,
--        drop column if exists hire_start, drop column if exists hire_end, drop column if exists buffer_minutes;
--      alter table public.bookings drop column if exists start_time, drop column if exists end_time;
