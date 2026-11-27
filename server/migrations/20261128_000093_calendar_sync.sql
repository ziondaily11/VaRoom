-- Calendar part 5: syncing with other sites through calendar links (iCal)
-- (docs/host-controls/CALENDAR_PLAN.md).
--
-- 1. Export: each Airbnb, hotel and venue listing can have a private link
--    (calendar_exports.token) that lists the days it can't be booked on
--    VaRoom, for Airbnb.com, Booking.com or Google Calendar to read. The link
--    carries dates only: listing_ical(token) returns the listing's title and
--    its listing_calendar, nothing about guests.
-- 2. Import: a host adds other sites' calendar links (calendar_feeds). The
--    server reads them every 30 minutes and calls calendar_sync_feed, which
--    replaces that link's days with "booked" entries (calendar_entries,
--    source 'ical'). They take their days like a "booked offline" event, so
--    guests can't book them. A clash with a VaRoom booking is kept (refusing
--    it would hide a real double booking) and returned so the host is told.
--    A failed read keeps the days already imported.
-- 3. Imported entries can't be edited or deleted by hand: removing the link
--    removes them.
-- 4. host_calendar returns each event's source.
--
-- Check first (both must work; the second must return null: the tables don't exist yet):
--   select count(*) from public.calendar_entries;
--   select to_regclass('public.calendar_feeds');
-- Each statement is safe to re-run.

-- ---- Links ----
create table if not exists public.calendar_feeds (
  id uuid primary key default gen_random_uuid(),
  host_id uuid not null references public.profiles (id) on delete cascade,
  listing_id uuid not null references public.listings (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  url text not null check (url ~ '^https://' and char_length(url) <= 2000),
  last_synced_at timestamptz,
  last_error text,
  last_count integer,
  created_at timestamptz not null default now(),
  unique (listing_id, url)
);
create index if not exists calendar_feeds_host_idx on public.calendar_feeds (host_id);

alter table public.calendar_feeds enable row level security;
drop policy if exists "Hosts and managers read calendar links" on public.calendar_feeds;
create policy "Hosts and managers read calendar links" on public.calendar_feeds
  for select to authenticated using (public.varoom_can_act_for(host_id, 'manager'));
drop policy if exists "Hosts and managers add calendar links" on public.calendar_feeds;
create policy "Hosts and managers add calendar links" on public.calendar_feeds
  for insert to authenticated with check (
    public.varoom_can_act_for(host_id, 'manager')
    and exists (select 1 from public.listings l where l.id = listing_id and l.host_id = calendar_feeds.host_id and l.category in ('airbnb', 'hotel', 'venue'))
    and (select count(*) from public.calendar_feeds f where f.listing_id = calendar_feeds.listing_id) < 5
  );
drop policy if exists "Hosts and managers remove calendar links" on public.calendar_feeds;
create policy "Hosts and managers remove calendar links" on public.calendar_feeds
  for delete to authenticated using (public.varoom_can_act_for(host_id, 'manager'));
revoke all on public.calendar_feeds from anon;
grant select, insert, delete on public.calendar_feeds to authenticated;

create table if not exists public.calendar_exports (
  listing_id uuid primary key references public.listings (id) on delete cascade,
  token text not null unique,
  created_at timestamptz not null default now()
);
alter table public.calendar_exports enable row level security;
revoke all on public.calendar_exports from anon, authenticated;

-- ---- Imported days ----
alter table public.calendar_entries
  add column if not exists feed_id uuid references public.calendar_feeds (id) on delete cascade;
alter table public.calendar_entries drop constraint if exists calendar_entries_source_check;
alter table public.calendar_entries add constraint calendar_entries_source_check check (source in ('host', 'conversion', 'ical'));
create index if not exists calendar_entries_feed_idx on public.calendar_entries (feed_id) where feed_id is not null;

-- Hosts add, change and remove their own events only, never imported days.
drop policy if exists "Hosts and managers add events" on public.calendar_entries;
create policy "Hosts and managers add events" on public.calendar_entries
  for insert to authenticated with check (
    kind = 'event' and source = 'host' and feed_id is null and public.varoom_can_act_for(host_id, 'manager')
    and (listing_id is null or exists (select 1 from public.listings l where l.id = listing_id and l.host_id = calendar_entries.host_id))
  );
drop policy if exists "Hosts and managers change events" on public.calendar_entries;
create policy "Hosts and managers change events" on public.calendar_entries
  for update to authenticated using (kind = 'event' and source = 'host' and public.varoom_can_act_for(host_id, 'manager'))
  with check (
    kind = 'event' and source = 'host' and feed_id is null and public.varoom_can_act_for(host_id, 'manager')
    and (listing_id is null or exists (select 1 from public.listings l where l.id = listing_id and l.host_id = calendar_entries.host_id))
  );
drop policy if exists "Hosts and managers remove events" on public.calendar_entries;
create policy "Hosts and managers remove events" on public.calendar_entries
  for delete to authenticated using (kind = 'event' and source = 'host' and public.varoom_can_act_for(host_id, 'manager'));

-- Imported days are never refused (from 000092): a clash is reported instead.
create or replace function public.varoom_check_event_capacity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  last_day date;
begin
  if new.kind <> 'event' or not new.blocks or new.listing_id is null or new.source = 'ical' then
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

-- ---- Export ----
-- The listing's private link, made on first use; p_reset gives a new one (the old stops working).
create or replace function public.calendar_export_token(p_listing uuid, p_reset boolean default false)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  owner uuid;
  fresh text := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  result text;
begin
  select l.host_id into owner from public.listings l where l.id = p_listing and l.category in ('airbnb', 'hotel', 'venue');
  if owner is null or not public.varoom_can_act_for(owner, 'manager') then
    raise exception 'calendar: You can''t change this listing''s calendar.';
  end if;
  insert into public.calendar_exports (listing_id, token) values (p_listing, fresh)
  on conflict (listing_id) do update set token = case when p_reset then excluded.token else calendar_exports.token end,
    created_at = case when p_reset then now() else calendar_exports.created_at end
  returning token into result;
  return result;
end;
$$;

revoke all on function public.calendar_export_token(uuid, boolean) from public, anon;
grant execute on function public.calendar_export_token(uuid, boolean) to authenticated;

-- What a calendar link shows: the listing's title, booking window and calendar (dates only).
create or replace function public.listing_ical(p_token text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'title', l.title,
    'ahead', coalesce(d.max_advance_days, 365),
    'calendar', public.listing_calendar(l.id)
  )
  from public.calendar_exports x
  join public.listings l on l.id = x.listing_id
  left join public.listing_booking_details d on d.listing_id = l.id
  where x.token = p_token and char_length(p_token) = 64
$$;

revoke all on function public.listing_ical(text) from public;
grant execute on function public.listing_ical(text) to anon, authenticated;

-- ---- Import (the server only) ----
-- p_events: [{start, end, start_time, end_time, title}], days inclusive.
-- Returns the listing's double-booked nights ahead, for the host's alert.
create or replace function public.calendar_sync_feed(p_feed uuid, p_events jsonb, p_error text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  f record;
  today date := (now() at time zone 'Africa/Nairobi')::date;
  clashes jsonb;
begin
  select * into f from public.calendar_feeds where id = p_feed;
  if not found then
    return null;
  end if;
  if p_error is not null then
    update public.calendar_feeds set last_error = left(p_error, 300) where id = p_feed;
    return '[]'::jsonb;
  end if;
  perform pg_advisory_xact_lock(hashtext('varoom-booking:' || f.listing_id::text));
  delete from public.calendar_entries where feed_id = p_feed;
  insert into public.calendar_entries (kind, source, blocks, host_id, listing_id, feed_id, title, color, start_date, end_date, start_time, end_time)
  select 'event', 'ical', true, f.host_id, f.listing_id, p_feed, left(coalesce(nullif(trim(e ->> 'title'), ''), f.name), 120), 'orange',
         (e ->> 'start')::date, (e ->> 'end')::date, nullif(e ->> 'start_time', '')::time, nullif(e ->> 'end_time', '')::time
  from jsonb_array_elements(coalesce(p_events, '[]'::jsonb)) e
  where (e ->> 'end')::date >= today and (e ->> 'start')::date <= today + 730;
  update public.calendar_feeds
    set last_synced_at = now(), last_error = null,
        last_count = (select count(*) from public.calendar_entries c where c.feed_id = p_feed)
    where id = p_feed;
  select coalesce(jsonb_agg(n.night order by n.night), '[]'::jsonb) into clashes
    from public.varoom_booked_nights(f.listing_id, today, today + 730) n
    where n.booked > n.capacity;
  return clashes;
end;
$$;

revoke all on function public.calendar_sync_feed(uuid, jsonb, text) from public, anon, authenticated;
grant execute on function public.calendar_sync_feed(uuid, jsonb, text) to service_role;

-- ---- The host's Calendar page (from 000092: each event's source) ----
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
        'units', e.units, 'repeat', e.repeat, 'repeat_until', e.repeat_until, 'source', e.source) order by o.start_date, e.start_time nulls first)
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

-- Undo (in this order):
--   1. re-run host_calendar and varoom_check_event_capacity from 20261128_000092_calendar_hours_prices.sql,
--      and the three "events" policies from 20261127_000091_calendar_planner.sql;
--   2. drop function if exists public.calendar_sync_feed(uuid, jsonb, text);
--      drop function if exists public.listing_ical(text);
--      drop function if exists public.calendar_export_token(uuid, boolean);
--   3. delete from public.calendar_entries where source = 'ical';
--      alter table public.calendar_entries drop column if exists feed_id;
--      alter table public.calendar_entries drop constraint if exists calendar_entries_source_check;
--      alter table public.calendar_entries add constraint calendar_entries_source_check check (source in ('host', 'conversion'));
--      drop table if exists public.calendar_exports; drop table if exists public.calendar_feeds;
