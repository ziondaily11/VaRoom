-- Calendar part 7: cleaning days between stays, and prices by date
-- (docs/host-controls/CALENDAR_PLAN.md, decision C4 and per-date prices).
--
-- 1. Cleaning days: listing_booking_details.turnover_days (0-7). After every
--    stay, offline booking or other site's booking, that many days stay
--    unavailable, and a new booking must leave them free before the next one.
--    Hotels don't use it (their rooms rotate); hourly venues keep their
--    buffer in minutes.
-- 2. Prices by date (listing_prices): a weekend price (Friday and Saturday
--    nights; Saturday and Sunday for venues hired by the day or hour) and
--    prices for date ranges with a label ("Christmas"). A date price beats the
--    weekend price, which beats the normal price. varoom_day_price gives the
--    price of one night (day); the booking rules add a stay up night by night,
--    so the stored price always matches what the booking page shows.
-- 3. listing_calendar adds `prices`: the days in the booking window whose price
--    isn't the normal one. host_calendar adds the listing's normal and weekend
--    price, its cleaning days and the month's date prices.
--
-- Check first (must work and return 0): select count(*) from public.listing_booking_details where price_amount < 0;
-- Each statement is safe to re-run.

-- ---- Settings ----
alter table public.listing_booking_details
  add column if not exists turnover_days integer not null default 0 check (turnover_days between 0 and 7);

create table if not exists public.listing_prices (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings (id) on delete cascade,
  host_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null check (kind in ('weekend', 'dates')),
  price numeric not null check (price > 0 and price <= 100000000),
  start_date date,
  end_date date,
  label text check (label is null or char_length(label) <= 60),
  created_at timestamptz not null default now(),
  check ((kind = 'weekend') = (start_date is null and end_date is null)),
  check (end_date is null or end_date >= start_date)
);
create unique index if not exists listing_prices_one_weekend on public.listing_prices (listing_id) where kind = 'weekend';
create index if not exists listing_prices_listing_dates_idx on public.listing_prices (listing_id, start_date) where kind = 'dates';

alter table public.listing_prices enable row level security;
drop policy if exists "Hosts and managers read listing prices" on public.listing_prices;
create policy "Hosts and managers read listing prices" on public.listing_prices
  for select to authenticated using (public.varoom_can_act_for(host_id, 'manager'));
revoke all on public.listing_prices from anon;
grant select on public.listing_prices to authenticated;

-- The owner (or a manager) of a stay, hotel or venue listing, else an error.
create or replace function public.varoom_calendar_owner(p_listing uuid)
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  owner uuid;
begin
  select l.host_id into owner from public.listings l where l.id = p_listing and l.category in ('airbnb', 'hotel', 'venue');
  if owner is null or not public.varoom_can_act_for(owner, 'manager') then
    raise exception 'calendar: You can''t change this listing''s calendar.';
  end if;
  return owner;
end;
$$;
revoke all on function public.varoom_calendar_owner(uuid) from public, anon, authenticated;

create or replace function public.calendar_set_turnover(p_listing uuid, p_days integer)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.varoom_calendar_owner(p_listing);
  update public.listing_booking_details set turnover_days = greatest(0, least(coalesce(p_days, 0), 7)) where listing_id = p_listing;
  if not found then
    raise exception 'calendar: This listing has no booking details yet.';
  end if;
end;
$$;
revoke all on function public.calendar_set_turnover(uuid, integer) from public, anon;
grant execute on function public.calendar_set_turnover(uuid, integer) to authenticated;

-- The weekend price; null removes it.
create or replace function public.calendar_set_weekend_price(p_listing uuid, p_price numeric)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  owner uuid := public.varoom_calendar_owner(p_listing);
begin
  delete from public.listing_prices where listing_id = p_listing and kind = 'weekend';
  if p_price is not null then
    insert into public.listing_prices (listing_id, host_id, kind, price) values (p_listing, owner, 'weekend', p_price);
  end if;
end;
$$;
revoke all on function public.calendar_set_weekend_price(uuid, numeric) from public, anon;
grant execute on function public.calendar_set_weekend_price(uuid, numeric) to authenticated;

-- A price for the days p_from..p_to (null clears them back to the weekend or
-- normal price). Date prices it overlaps are cut around it. Past days are
-- left as they are.
create or replace function public.calendar_set_price(p_listing uuid, p_from date, p_to date, p_price numeric, p_label text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  owner uuid := public.varoom_calendar_owner(p_listing);
  today date := (now() at time zone 'Africa/Nairobi')::date;
  first_day date := greatest(p_from, today);
  r record;
begin
  if p_from is null or p_to is null or p_to < first_day or p_to > today + 1095 then
    return;
  end if;
  perform pg_advisory_xact_lock(hashtext('varoom-prices:' || p_listing::text));
  for r in
    delete from public.listing_prices
      where listing_id = p_listing and kind = 'dates' and start_date <= p_to and end_date >= first_day
      returning start_date, end_date, price, label
  loop
    if r.start_date < first_day then
      insert into public.listing_prices (listing_id, host_id, kind, price, start_date, end_date, label)
        values (p_listing, owner, 'dates', r.price, r.start_date, first_day - 1, r.label);
    end if;
    if r.end_date > p_to then
      insert into public.listing_prices (listing_id, host_id, kind, price, start_date, end_date, label)
        values (p_listing, owner, 'dates', r.price, p_to + 1, r.end_date, r.label);
    end if;
  end loop;
  if p_price is not null then
    insert into public.listing_prices (listing_id, host_id, kind, price, start_date, end_date, label)
      values (p_listing, owner, 'dates', p_price, first_day, p_to, nullif(trim(p_label), ''));
  end if;
end;
$$;
revoke all on function public.calendar_set_price(uuid, date, date, numeric, text) from public, anon;
grant execute on function public.calendar_set_price(uuid, date, date, numeric, text) to authenticated;

-- The price of one night (day, for venues by the day or hour).
create or replace function public.varoom_day_price(p_listing uuid, p_day date)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select p.price from public.listing_prices p
      where p.listing_id = p_listing and p.kind = 'dates' and p_day between p.start_date and p.end_date
      order by p.created_at desc limit 1),
    (select p.price from public.listing_prices p
      join public.listing_booking_details d on d.listing_id = p.listing_id
      where p.listing_id = p_listing and p.kind = 'weekend'
        and extract(dow from p_day)::integer = any (case when coalesce(d.price_unit, 'night') = 'night' then array[5, 6] else array[0, 6] end)),
    (select coalesce(d.price_amount, 0) from public.listing_booking_details d where d.listing_id = p_listing),
    0
  )
$$;
revoke all on function public.varoom_day_price(uuid, date) from public, anon, authenticated;

-- ---- 1. Booked nights (from 000092): cleaning days after each stay ----
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
           coalesce(d.price_unit = 'hour', false) as hourly,
           case when l.category = 'hotel' then 0 else coalesce(d.turnover_days, 0) end as turnover
    from public.listings l
    left join public.listing_booking_details d on d.listing_id = l.id
    where l.id = p_listing
  ), taken as (
    -- Approved bookings and requests younger than 48 hours: their nights (days,
    -- by the day), then the cleaning days.
    select n.night::date as night, 1 as units
    from listing
    join public.bookings b on b.listing_id = p_listing
      and b.start_date is not null and b.end_date is not null
      and (b.status = 'approved' or (b.status = 'pending' and b.created_at > now() - interval '48 hours'))
    cross join lateral generate_series(
      greatest(b.start_date, p_from)::timestamp,
      least(b.end_date - case when listing.daily then 0 else 1 end + listing.turnover, p_to)::timestamp,
      interval '1 day'
    ) as n(night)
    union all
    -- Bookings the host made outside VaRoom, and other sites' bookings: every
    -- day of the event, then the cleaning days.
    select n.night::date, e.units
    from listing, public.varoom_event_occurrences(null, p_listing, p_from - 7, p_to) o
    join public.calendar_entries e on e.id = o.entry_id and e.blocks
    cross join lateral generate_series(greatest(o.start_date, p_from)::timestamp, least(o.end_date + listing.turnover, p_to)::timestamp, interval '1 day') as n(night)
    where not (listing.hourly and e.start_time is not null)
  )
  select t.night, sum(t.units)::integer, listing.capacity
  from taken t, listing
  group by t.night, listing.capacity
$$;
revoke all on function public.varoom_booked_nights(uuid, date, date) from public, anon, authenticated;

-- An offline booking's own cleaning days must be free too (from 000093).
create or replace function public.varoom_check_event_capacity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  last_day date;
  turnover integer;
begin
  if new.kind <> 'event' or not new.blocks or new.listing_id is null or new.source = 'ical' then
    return null;
  end if;
  select case when l.category = 'hotel' then 0 else coalesce(d.turnover_days, 0) end into turnover
    from public.listings l left join public.listing_booking_details d on d.listing_id = l.id where l.id = new.listing_id;
  last_day := case when new.repeat is null then new.end_date
                   else least(coalesce(new.repeat_until, new.start_date + 365), new.start_date + 365) + (new.end_date - new.start_date) end
              + coalesce(turnover, 0);
  perform pg_advisory_xact_lock(hashtext('varoom-booking:' || new.listing_id::text));
  if exists (select 1 from public.varoom_booked_nights(new.listing_id, new.start_date, last_day) where booked > capacity) then
    raise exception 'calendar: Those days are already booked (or kept free for cleaning). Choose other days, or add it as a note.';
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

-- ---- 3. The booking page's calendar (from 000092: prices by date) ----
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
           coalesce(d.price_unit = 'hour', false) as hourly, coalesce(d.buffer_minutes, 0) as buffer,
           coalesce(d.price_amount, 0) as base,
           exists (select 1 from public.listing_prices p where p.listing_id = p_listing) as priced
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
    ), '[]'::jsonb),
    'prices', coalesce((
      select jsonb_agg(jsonb_build_object('day', x.day, 'price', x.price) order by x.day)
      from (
        select g.day::date as day, public.varoom_day_price(p_listing, g.day::date) as price, rules.base
        from today, rules, generate_series(today.day::timestamp, (today.day + rules.ahead)::timestamp, interval '1 day') g(day)
        where rules.priced
      ) x
      where x.price <> x.base
    ), '[]'::jsonb)
  )
$$;
revoke all on function public.listing_calendar(uuid) from public;
grant execute on function public.listing_calendar(uuid) to anon, authenticated;

-- ---- The host's Calendar page (from 000094: prices and cleaning days) ----
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
        'hire_end', to_char(d.hire_end, 'HH24:MI'), 'buffer_minutes', coalesce(d.buffer_minutes, 0),
        'planner', l.category in ('property', 'office', 'shop'),
        'price', d.price_amount, 'turnover_days', coalesce(d.turnover_days, 0),
        'weekend_price', (select p.price from public.listing_prices p where p.listing_id = l.id and p.kind = 'weekend')) order by l.created_at)
      from public.listings l
      left join public.listing_booking_details d on d.listing_id = l.id
      where l.host_id = p_host and l.publication_state = 'published'
        and (l.category in ('property', 'office', 'shop') or (l.category in ('airbnb', 'hotel', 'venue') and coalesce(l.supports_stay, true)))
    ), '[]'::jsonb),
    'bookings', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', b.id, 'listing_id', b.listing_id, 'status', b.status, 'start_date', b.start_date, 'end_date', b.end_date,
        'start_time', to_char(b.start_time, 'HH24:MI'), 'end_time', to_char(b.end_time, 'HH24:MI'),
        'hours', b.hours, 'guest_count', b.guest_count, 'total_price', b.total_price, 'created_at', b.created_at,
        'guest', (select p.full_name from public.profiles p where p.id = b.client_id)) order by b.start_date, b.start_time nulls first)
      from public.bookings b
      where b.host_id = p_host and b.start_date is not null
        and b.start_date <= p_to and coalesce(b.end_date, b.start_date) >= p_from - 7
        and (b.status in ('approved', 'completed') or (b.status = 'pending' and b.created_at > now() - interval '48 hours'))
    ), '[]'::jsonb),
    'leases', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', x.id, 'listing_id', x.listing_id, 'status', x.status, 'start', x.lease_start_date, 'months', x.lease_months,
        'end', x.lease_end, 'total_price', x.total_price,
        'guest', (select p.full_name from public.profiles p where p.id = x.client_id)) order by x.lease_start_date)
      from (
        select b.*, (b.lease_start_date + make_interval(months => coalesce(b.lease_months, 0)))::date as lease_end
        from public.bookings b
        where b.host_id = p_host and b.lease_start_date is not null
          and (b.status in ('approved', 'completed') or (b.status = 'pending' and b.created_at > now() - interval '48 hours'))
      ) x
      where x.lease_start_date between p_from and p_to or x.lease_end between p_from and p_to
    ), '[]'::jsonb),
    'outcomes', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', o.id, 'listing_id', o.listing_id, 'outcome', o.outcome, 'units', o.units, 'agreed_amount', o.agreed_amount,
        'date', (o.recorded_at at time zone 'Africa/Nairobi')::date) order by o.recorded_at)
      from public.listing_outcomes o
      where o.host_id = p_host and o.voided_at is null and o.listing_id is not null
        and (o.recorded_at at time zone 'Africa/Nairobi')::date between p_from and p_to
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
        'viewing', e.viewing, 'client_name', e.client_name, 'client_phone', e.client_phone, 'guest_count', e.guest_count,
        'amount', e.amount, 'units', e.units, 'repeat', e.repeat, 'repeat_until', e.repeat_until, 'source', e.source)
        order by o.start_date, e.start_time nulls first)
      from public.varoom_event_occurrences(p_host, null, p_from - 7, p_to) o
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
    ), '[]'::jsonb),
    'prices', coalesce((
      select jsonb_agg(jsonb_build_object('listing_id', p.listing_id, 'start_date', p.start_date, 'end_date', p.end_date, 'price', p.price, 'label', p.label) order by p.start_date)
      from public.listing_prices p
      where p.host_id = p_host and p.kind = 'dates' and p.start_date <= p_to and p.end_date >= p_from
    ), '[]'::jsonb)
  )
$$;
revoke all on function public.host_calendar(uuid, date, date) from public, anon;
grant execute on function public.host_calendar(uuid, date, date) to authenticated;

-- ---- Rules applied to every new booking (from 000092: cleaning days, prices by date) ----
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
  turnover integer := 0;
begin
  select d.instant_book, d.min_notice_days, d.max_advance_days, d.min_stay_nights, d.max_stay_nights, d.price_unit, d.closed_weekdays,
         d.hire_start, d.hire_end, d.buffer_minutes, d.price_amount, d.cleaning_fee, d.office_shop_details, d.turnover_days, l.category
    into rules
    from public.listing_booking_details d
    join public.listings l on l.id = d.listing_id
    where d.listing_id = new.listing_id;
  has_rules := found;
  -- The listing's own unit decides, never the one the browser sent.
  daily := has_rules and rules.price_unit = 'day';
  -- Stays, venues and hotels take bookings up to 365 days ahead unless the host chose otherwise.
  ahead := case when has_rules then rules.max_advance_days end;
  if ahead is null and new.start_date is not null then
    ahead := 365;
  end if;
  if has_rules and rules.category <> 'hotel' then
    turnover := coalesce(rules.turnover_days, 0);
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
    -- host's own booking) can't take the last room, the same nights or the
    -- same hours. A stay's own cleaning days must be free too.
    perform pg_advisory_xact_lock(hashtext('varoom-booking:' || new.listing_id::text));
    if exists (
      select 1 from public.varoom_booked_nights(new.listing_id, new.start_date,
        last_night + case when new.end_date is null then 0 else turnover end)
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
  -- Stays add their nights (days) one by one at each one's own price.
  rate := case when has_rules then coalesce(rules.price_amount, 0) else 0 end;
  if new.start_date is not null and new.end_date is not null then
    new.total_price := (select coalesce(sum(public.varoom_day_price(new.listing_id, g.day::date)), 0)
                          from generate_series(new.start_date::timestamp, last_night::timestamp, interval '1 day') g(day))
                       + case when has_rules then coalesce(rules.cleaning_fee, 0) else 0 end;
  elsif new.start_date is not null then
    new.total_price := public.varoom_day_price(new.listing_id, new.start_date) * new.hours;
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
--   1. re-run varoom_apply_booking_rules, varoom_booked_nights and listing_calendar from
--      20261128_000092_calendar_hours_prices.sql, varoom_check_event_capacity from 20261128_000093_calendar_sync.sql,
--      and host_calendar from 20261128_000094_calendar_planner_all_niches.sql;
--   2. drop function if exists public.calendar_set_price(uuid, date, date, numeric, text);
--      drop function if exists public.calendar_set_weekend_price(uuid, numeric);
--      drop function if exists public.calendar_set_turnover(uuid, integer);
--      drop function if exists public.varoom_day_price(uuid, date);
--      drop function if exists public.varoom_calendar_owner(uuid);
--      drop table if exists public.listing_prices;
--      alter table public.listing_booking_details drop column if exists turnover_days;
