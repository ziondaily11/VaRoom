-- Calendar part 3: the host's own planner (docs/host-controls/CALENDAR_PLAN.md).
--
-- 1. Events: a host marks dates and writes what is happening ("Wanjiku &
--    Otieno wedding, 250 guests"), with a colour, optional times, the client's
--    name and phone, guests, the amount agreed, and a weekly or monthly repeat.
--    An event can be tied to a listing or not.
--    "Booked offline" events (blocks) take their days like a booking: guests
--    can't book them, and on a hotel they take `units` rooms. Notes don't.
--    Events are private: guests only ever see that a day is taken.
--    Hosts and team managers write them directly (row-level security); a
--    blocking event that would overbook a day is refused.
-- 2. Weekly closed days: listing_booking_details.closed_weekdays (0 = Sunday).
--    Guests can't book those nights; calendar_set_weekdays sets them.
-- 3. host_calendar adds the month's events and each listing's weekly closed
--    days; listing_calendar leaves weekly closed days out of `open`.
--
-- Check first (must work and return 0 rows): no entry kind other than 'closed' yet.
--   select kind, count(*) from public.calendar_entries where kind <> 'closed' group by kind;
-- Each statement is safe to re-run.

-- ---- 1. Events ----
alter table public.calendar_entries
  alter column listing_id drop not null,
  add column if not exists title text check (title is null or char_length(title) between 1 and 120),
  add column if not exists notes text check (notes is null or char_length(notes) <= 2000),
  add column if not exists color text check (color is null or color in ('red', 'orange', 'yellow', 'green', 'blue', 'purple')),
  add column if not exists start_time time,
  add column if not exists end_time time,
  add column if not exists blocks boolean not null default false,
  add column if not exists client_name text check (client_name is null or char_length(client_name) <= 120),
  add column if not exists client_phone text check (client_phone is null or char_length(client_phone) <= 30),
  add column if not exists guest_count integer check (guest_count is null or guest_count between 1 and 100000),
  add column if not exists amount numeric(14, 2) check (amount is null or amount >= 0),
  add column if not exists units integer not null default 1 check (units between 1 and 1000),
  add column if not exists repeat text check (repeat is null or repeat in ('weekly', 'monthly')),
  add column if not exists repeat_until date;

alter table public.calendar_entries drop constraint if exists calendar_entries_kind_check;
alter table public.calendar_entries add constraint calendar_entries_kind_check check (kind in ('closed', 'event'));
alter table public.calendar_entries drop constraint if exists calendar_entries_shape;
alter table public.calendar_entries add constraint calendar_entries_shape check (
  case when kind = 'closed' then listing_id is not null and title is null and not blocks and repeat is null
       else title is not null and end_date is not null end
  and (start_time is null) = (end_time is null)
  and (start_time is null or end_date > start_date or end_time > start_time)
  and (not blocks or listing_id is not null)
  and (repeat is null or (end_date - start_date) < case repeat when 'weekly' then 7 else 28 end)
  and (repeat_until is null or (repeat is not null and repeat_until >= start_date))
);

drop policy if exists "Hosts and managers add events" on public.calendar_entries;
create policy "Hosts and managers add events" on public.calendar_entries
  for insert to authenticated with check (
    kind = 'event' and public.varoom_can_act_for(host_id, 'manager')
    and (listing_id is null or exists (select 1 from public.listings l where l.id = listing_id and l.host_id = calendar_entries.host_id))
  );
drop policy if exists "Hosts and managers change events" on public.calendar_entries;
create policy "Hosts and managers change events" on public.calendar_entries
  for update to authenticated using (kind = 'event' and public.varoom_can_act_for(host_id, 'manager'))
  with check (
    kind = 'event' and public.varoom_can_act_for(host_id, 'manager')
    and (listing_id is null or exists (select 1 from public.listings l where l.id = listing_id and l.host_id = calendar_entries.host_id))
  );
drop policy if exists "Hosts and managers remove events" on public.calendar_entries;
create policy "Hosts and managers remove events" on public.calendar_entries
  for delete to authenticated using (kind = 'event' and public.varoom_can_act_for(host_id, 'manager'));
grant insert, update, delete on public.calendar_entries to authenticated;

-- Each event's dates in a range, repeats expanded (up to 520 weeks or months).
-- Security invoker: a host reads only their own (row-level security); the
-- booking rules, which run as the owner, read every listing's.
create or replace function public.varoom_event_occurrences(p_host uuid, p_listing uuid, p_from date, p_to date)
returns table (entry_id uuid, listing_id uuid, start_date date, end_date date)
language sql
stable
set search_path = public
as $$
  select e.id, e.listing_id, o.day, o.day + (e.end_date - e.start_date)
  from public.calendar_entries e
  cross join lateral (
    select (e.start_date + k * case e.repeat when 'weekly' then interval '7 days' else interval '1 month' end)::date as day
    from generate_series(0, case when e.repeat is null then 0 else 520 end) k
  ) o
  where e.kind = 'event'
    and (p_host is null or e.host_id = p_host)
    and (p_listing is null or e.listing_id = p_listing)
    and e.start_date <= p_to
    and o.day <= p_to and o.day + (e.end_date - e.start_date) >= p_from
    and (e.repeat_until is null or o.day <= e.repeat_until)
$$;

revoke all on function public.varoom_event_occurrences(uuid, uuid, date, date) from public, anon;
grant execute on function public.varoom_event_occurrences(uuid, uuid, date, date) to authenticated;

-- ---- Booked nights now count blocking events (from 000089) ----
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
    from public.varoom_event_occurrences(null, p_listing, p_from, p_to) o
    join public.calendar_entries e on e.id = o.entry_id and e.blocks
    cross join lateral generate_series(greatest(o.start_date, p_from)::timestamp, least(o.end_date, p_to)::timestamp, interval '1 day') as n(night)
  )
  select t.night, sum(t.units)::integer, listing.capacity
  from taken t, listing
  group by t.night, listing.capacity
$$;

revoke all on function public.varoom_booked_nights(uuid, date, date) from public, anon, authenticated;

-- A blocking event can't take days a booking (or another event) already has.
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
  return null;
end;
$$;

drop trigger if exists varoom_check_event_capacity_trigger on public.calendar_entries;
create trigger varoom_check_event_capacity_trigger
  after insert or update on public.calendar_entries
  for each row execute function public.varoom_check_event_capacity();

-- ---- 2. Weekly closed days ----
alter table public.listing_booking_details
  add column if not exists closed_weekdays smallint[] not null default '{}'
    check (closed_weekdays <@ array[0, 1, 2, 3, 4, 5, 6]::smallint[]);

create or replace function public.calendar_set_weekdays(p_listing uuid, p_days smallint[])
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
  update public.listing_booking_details
    set closed_weekdays = coalesce((select array_agg(distinct d order by d) from unnest(p_days) d), '{}')
    where listing_id = p_listing;
  if not found then
    raise exception 'calendar: This listing has no booking details yet.';
  end if;
end;
$$;

revoke all on function public.calendar_set_weekdays(uuid, smallint[]) from public, anon;
grant execute on function public.calendar_set_weekdays(uuid, smallint[]) to authenticated;

-- ---- 3. The booking page's calendar (from 000090: weekly closed days too) ----
create or replace function public.listing_calendar(p_listing uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with today as (select (now() at time zone 'Africa/Nairobi')::date as day),
  rules as (
    select coalesce(d.max_advance_days, 365) as ahead, coalesce(d.closed_weekdays, '{}') as weekdays
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
    ), '[]'::jsonb)
  )
$$;

revoke all on function public.listing_calendar(uuid) from public;
grant execute on function public.listing_calendar(uuid) to anon, authenticated;

-- ---- The host's Calendar page (from 000090: events and weekly closed days) ----
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
        'closed_weekdays', coalesce(d.closed_weekdays, '{}')) order by l.created_at)
      from public.listings l
      left join public.listing_booking_details d on d.listing_id = l.id
      where l.host_id = p_host and l.category in ('airbnb', 'hotel', 'venue') and coalesce(l.supports_stay, true)
        and l.publication_state = 'published'
    ), '[]'::jsonb),
    'bookings', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', b.id, 'listing_id', b.listing_id, 'status', b.status, 'start_date', b.start_date, 'end_date', b.end_date,
        'hours', b.hours, 'guest_count', b.guest_count, 'total_price', b.total_price, 'created_at', b.created_at,
        'guest', (select p.full_name from public.profiles p where p.id = b.client_id)) order by b.start_date)
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
    ), '[]'::jsonb)
  )
$$;

revoke all on function public.host_calendar(uuid, date, date) from public, anon;
grant execute on function public.host_calendar(uuid, date, date) to authenticated;

-- ---- Rules applied to every new booking (from 000090: weekly closed days) ----
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
begin
  select d.instant_book, d.min_notice_days, d.max_advance_days, d.min_stay_nights, d.max_stay_nights, d.price_unit, d.closed_weekdays
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
    -- host's own booking) can't take the last room or the same nights.
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

-- Undo (in this order):
--   1. re-run varoom_apply_booking_rules, listing_calendar and host_calendar from 20261127_000090_host_calendar.sql,
--      and varoom_booked_nights from 20261127_000089_booking_calendar_rules.sql;
--   2. drop trigger if exists varoom_check_event_capacity_trigger on public.calendar_entries;
--      drop function if exists public.varoom_check_event_capacity();
--      drop function if exists public.calendar_set_weekdays(uuid, smallint[]);
--      drop function if exists public.varoom_event_occurrences(uuid, uuid, date, date);
--      drop policy if exists "Hosts and managers add events" on public.calendar_entries;
--      drop policy if exists "Hosts and managers change events" on public.calendar_entries;
--      drop policy if exists "Hosts and managers remove events" on public.calendar_entries;
--      revoke insert, update, delete on public.calendar_entries from authenticated;
--   3. delete from public.calendar_entries where kind = 'event';
--      alter table public.calendar_entries drop constraint if exists calendar_entries_shape;
--      alter table public.calendar_entries drop constraint if exists calendar_entries_kind_check;
--      alter table public.calendar_entries add constraint calendar_entries_kind_check check (kind in ('closed'));
--      alter table public.calendar_entries alter column listing_id set not null, drop column title, drop column notes,
--        drop column color, drop column start_time, drop column end_time, drop column blocks, drop column client_name,
--        drop column client_phone, drop column guest_count, drop column amount, drop column units, drop column repeat,
--        drop column repeat_until;
--      alter table public.listing_booking_details drop column if exists closed_weekdays;
