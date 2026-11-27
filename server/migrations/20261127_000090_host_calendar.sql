-- Calendar part 2: the host's Calendar page, and listings open by default
-- (docs/host-controls/CALENDAR_PLAN.md, decision C1).
--
-- 1. calendar_entries: the days a host closed on a listing, as date ranges.
--    A range without an end is closed from its first day onwards. Hosts and
--    team managers read them; every write goes through calendar_set_closed.
-- 2. A stay, venue or hotel listing is now bookable on every day of its
--    booking window (minimum notice to "book up to N days ahead", 365 days
--    when the host set nothing), except closed and full days. Before, a host
--    had to open each day, and a listing whose opened days ran out could not
--    be booked although it showed as available.
-- 3. A one-time conversion keeps every listing exactly as bookable as it is
--    today: the days between its open days, and everything after the last
--    one, become closed ranges. A published listing with no open day ahead is
--    closed from today. Its host reopens it from the Calendar page.
--    The availability table is no longer read; it stays for the undo.
-- 4. listing_calendar returns the same shape: `open` is now the window minus
--    closed days.
-- 5. host_calendar(host, from, to): the Calendar page's data in one call
--    (listings, bookings, closed ranges), read with the caller's own rights.
-- 6. "calendar" becomes a reserved username (the page is varoom.co.ke/calendar).
--
-- Check first (both must work; the second must return 0):
--   select count(*) from public.availability;
--   select count(*) from public.profiles where lower(username) = 'calendar';
-- Each statement is safe to re-run.

-- ---- 1. Closed days ----
create table if not exists public.calendar_entries (
  id uuid primary key default gen_random_uuid(),
  host_id uuid not null references public.profiles (id) on delete cascade,
  listing_id uuid not null references public.listings (id) on delete cascade,
  kind text not null default 'closed' check (kind in ('closed')),
  start_date date not null,
  end_date date check (end_date is null or end_date >= start_date),
  source text not null default 'host' check (source in ('host', 'conversion')),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists calendar_entries_listing_start_idx on public.calendar_entries (listing_id, start_date);
create index if not exists calendar_entries_host_start_idx on public.calendar_entries (host_id, start_date);

alter table public.calendar_entries enable row level security;
drop policy if exists "Hosts and managers read calendar entries" on public.calendar_entries;
create policy "Hosts and managers read calendar entries" on public.calendar_entries
  for select to authenticated using (public.varoom_can_act_for(host_id, 'manager'));
revoke all on public.calendar_entries from anon;
grant select on public.calendar_entries to authenticated;

-- Close (p_closed) or reopen the days p_from..p_to of a listing (p_to null:
-- onwards). Closed ranges that touch are merged; reopening part of a range
-- splits it. Days before today are left as they are.
create or replace function public.calendar_set_closed(p_listing uuid, p_from date, p_to date, p_closed boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  owner uuid;
  today date := (now() at time zone 'Africa/Nairobi')::date;
  first_day date := greatest(p_from, today);
  last_day date := coalesce(p_to, 'infinity'::date);
  merged_start date;
  merged_end date;
  r record;
begin
  select l.host_id into owner from public.listings l where l.id = p_listing;
  if owner is null or not public.varoom_can_act_for(owner, 'manager') then
    raise exception 'calendar: You can''t change this listing''s calendar.';
  end if;
  if p_from is null or last_day < first_day then
    return;
  end if;
  perform pg_advisory_xact_lock(hashtext('varoom-calendar:' || p_listing::text));

  if p_closed then
    -- Every closed range that overlaps or touches the new one joins it.
    select least(first_day, min(c.start_date)), greatest(last_day, max(coalesce(c.end_date, 'infinity'::date)))
      into merged_start, merged_end
      from public.calendar_entries c
      where c.listing_id = p_listing and c.kind = 'closed'
        and c.start_date <= last_day + 1 and coalesce(c.end_date, 'infinity'::date) >= first_day - 1;
    delete from public.calendar_entries c
      where c.listing_id = p_listing and c.kind = 'closed'
        and c.start_date <= last_day + 1 and coalesce(c.end_date, 'infinity'::date) >= first_day - 1;
    insert into public.calendar_entries (host_id, listing_id, start_date, end_date, created_by)
      values (owner, p_listing, coalesce(merged_start, first_day), nullif(coalesce(merged_end, last_day), 'infinity'::date), auth.uid());
  else
    for r in
      delete from public.calendar_entries c
        where c.listing_id = p_listing and c.kind = 'closed'
          and c.start_date <= last_day and coalesce(c.end_date, 'infinity'::date) >= first_day
        returning c.start_date, coalesce(c.end_date, 'infinity'::date) as end_date, c.source
    loop
      if r.start_date < first_day then
        insert into public.calendar_entries (host_id, listing_id, start_date, end_date, source, created_by)
          values (owner, p_listing, r.start_date, first_day - 1, r.source, auth.uid());
      end if;
      if r.end_date > last_day then
        insert into public.calendar_entries (host_id, listing_id, start_date, end_date, source, created_by)
          values (owner, p_listing, last_day + 1, nullif(r.end_date, 'infinity'::date), r.source, auth.uid());
      end if;
    end loop;
  end if;
end;
$$;

revoke all on function public.calendar_set_closed(uuid, date, date, boolean) from public, anon;
grant execute on function public.calendar_set_closed(uuid, date, date, boolean) to authenticated;

-- ---- 3. One-time conversion of opened days to closed ranges ----
-- Only listings with no calendar entries yet, so a re-run changes nothing,
-- and whose host account still exists (production has a few listings left
-- behind by deleted accounts; guests can't see or book them).
with today as (
  select (now() at time zone 'Africa/Nairobi')::date as day
), targets as (
  select l.id, l.host_id
  from public.listings l
  where l.category in ('airbnb', 'hotel', 'venue')
    and not exists (select 1 from public.calendar_entries c where c.listing_id = l.id)
    and exists (select 1 from public.profiles p where p.id = l.host_id)
    and (l.publication_state = 'published'
      or exists (select 1 from public.availability a, today where a.listing_id = l.id and a.date >= today.day))
), open_days as (
  select a.listing_id, a.date, lag(a.date) over (partition by a.listing_id order by a.date) as previous
  from (select distinct a.listing_id, a.date from public.availability a join targets t on t.id = a.listing_id, today where a.date >= today.day) a
), closed as (
  -- before the first open day
  select o.listing_id, (select day from today) as start_date, min(o.date) - 1 as end_date
    from open_days o group by o.listing_id having min(o.date) > (select day from today)
  union all
  -- between two open days
  select o.listing_id, o.previous + 1, o.date - 1 from open_days o where o.previous is not null and o.date > o.previous + 1
  union all
  -- after the last open day
  select o.listing_id, max(o.date) + 1, null from open_days o group by o.listing_id
  union all
  -- no open day ahead at all
  select t.id, (select day from today), null from targets t where not exists (select 1 from open_days o where o.listing_id = t.id)
)
insert into public.calendar_entries (host_id, listing_id, start_date, end_date, source)
select t.host_id, c.listing_id, c.start_date, c.end_date, 'conversion'
from closed c join targets t on t.id = c.listing_id;

-- ---- 4. The booking page's calendar ----
create or replace function public.listing_calendar(p_listing uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with today as (select (now() at time zone 'Africa/Nairobi')::date as day),
  window_end as (
    select today.day + coalesce((select d.max_advance_days from public.listing_booking_details d where d.listing_id = p_listing), 365) as day from today
  )
  select jsonb_build_object(
    'open', coalesce((
      select jsonb_agg(g.day::date order by g.day)
      from today, window_end, generate_series(today.day::timestamp, window_end.day::timestamp, interval '1 day') g(day)
      where exists (select 1 from public.listings l where l.id = p_listing)
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

-- ---- 5. The host's Calendar page ----
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
        'min_notice_days', d.min_notice_days, 'max_advance_days', d.max_advance_days) order by l.created_at)
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
    ), '[]'::jsonb)
  )
$$;

revoke all on function public.host_calendar(uuid, date, date) from public, anon;
grant execute on function public.host_calendar(uuid, date, date) to authenticated;

-- ---- 2. Rules applied to every new booking (from 000089: closed days replace opened days) ----
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
  select d.instant_book, d.min_notice_days, d.max_advance_days, d.min_stay_nights, d.max_stay_nights, d.price_unit
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

  -- No night (or day) of the booking may be one the host closed. The check-out
  -- day itself is not a night of the stay.
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

-- ---- 6. Reserved username (also in client/lib/profile/usernames.ts) ----
create or replace function public.varoom_username_reserved(p_username text)
returns boolean
language sql
immutable
parallel safe
as $$
  select lower(p_username) = any (array[
    '404', '500', '_app', '_document', '_error', '_next', 'index', 'admin',
    'analytics', 'api', 'booking', 'bookings', 'calendar', 'chats', 'host', 'list',
    'map', 'marketplace', 'notifications', 'onboarding', 'pricing',
    'privacy', 'profile', 'properties', 'settings', 'support', 'terms',
    'chat', 'elie', 'login', 'register', 'varoomadmin', 'assets', 'favicon',
    'about', 'account', 'accounts', 'auth', 'billing', 'blog',
    'callback', 'careers', 'checkout', 'contact', 'dashboard', 'discover',
    'download', 'explore', 'faq', 'feed', 'guest', 'guests', 'help', 'home',
    'hosts', 'inbox', 'legal', 'listing', 'listings', 'logout', 'messages',
    'new', 'news', 'null', 'official', 'payments', 'press', 'property',
    'reviews', 'root', 'search', 'security', 'signin', 'signout', 'signup',
    'static', 'staff', 'status', 'system', 'team', 'transactions',
    'undefined', 'user', 'users', 'varoom', 'verify', 'wallet', 'www'
  ]::text[]);
$$;

-- Undo (in this order):
--   1. re-run varoom_apply_booking_rules and listing_calendar from 20261127_000089_booking_calendar_rules.sql
--      (bookings check opened days again; the availability table was left as it was);
--   2. drop function if exists public.host_calendar(uuid, date, date);
--      drop function if exists public.calendar_set_closed(uuid, date, date, boolean);
--      drop table if exists public.calendar_entries;
--   3. re-run varoom_username_reserved from 20261118_000072_reserved_usernames.sql.
