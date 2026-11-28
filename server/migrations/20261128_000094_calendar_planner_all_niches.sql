-- Calendar part 6: the planner for every host, reminders, and occupancy from
-- the calendar (docs/host-controls/CALENDAR_PLAN.md).
--
-- 1. Property, office and shop listings join the Calendar as planner listings
--    (nothing is booked by the night there): host_calendar returns them,
--    their rental and lease requests (move-in day and lease end) and the
--    outcomes recorded on them (sold / rented / leased).
-- 2. Viewings: an event with viewing = true (a time, the client's name and
--    phone). Like a note, it never blocks anything.
-- 3. Reminders: calendar_reminders_due lists what the host should hear about:
--    the evening before a check-in, an hourly booking, a move-in, a viewing or
--    an event, and 60 days before a lease ends. The server sends them as
--    'calendar_reminder' notifications, once each (their event keys), under
--    the host's "reminders" setting.
-- 4. Occupancy (Analytics) now uses the calendar: open listing-days (closed and
--    weekly closed days left out, every hotel room counted) against booked
--    ones (VaRoom bookings, offline bookings and bookings from other sites).
--    host_analytics_period is redefined from 000057; only its two occupancy
--    figures change.
--
-- Check first (must work): select count(*) from public.listing_outcomes; select count(*) from public.calendar_entries;
-- Each statement is safe to re-run.

-- ---- 2. Viewings ----
alter table public.calendar_entries add column if not exists viewing boolean not null default false;
alter table public.calendar_entries drop constraint if exists calendar_entries_shape;
alter table public.calendar_entries add constraint calendar_entries_shape check (
  case when kind = 'closed' then listing_id is not null and title is null and not blocks and repeat is null and not viewing
       else title is not null and end_date is not null end
  and (start_time is null) = (end_time is null)
  and (start_time is null or end_date > start_date or end_time > start_time)
  and (not blocks or listing_id is not null)
  and (not viewing or not blocks)
  and (repeat is null or (end_date - start_date) < case repeat when 'weekly' then 7 else 28 end)
  and (repeat_until is null or (repeat is not null and repeat_until >= start_date))
);

-- ---- 1. The host's Calendar page (from 000093: planner listings, leases, outcomes, viewings) ----
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
        'planner', l.category in ('property', 'office', 'shop')) order by l.created_at)
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
        and b.start_date <= p_to and coalesce(b.end_date, b.start_date) >= p_from
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

-- ---- 3. Reminders (the server only) ----
-- p_tomorrow: include tomorrow's check-ins, move-ins, viewings and events
-- (the server asks in the evening); lease ends 60 days ahead are always due.
create or replace function public.calendar_reminders_due(p_tomorrow boolean)
returns table (host_id uuid, event_key text, title text, message text, listing_id uuid)
language sql
stable
security definer
set search_path = public
as $$
  with today as (select (now() at time zone 'Africa/Nairobi')::date as day),
  tomorrow as (select day + 1 as day from today)
  -- Stays and venues: approved bookings starting tomorrow.
  select b.host_id, 'calendar-reminder:booking:' || b.id, 'Tomorrow at ' || l.title,
         case when b.start_time is not null
              then coalesce(p.full_name, 'A guest') || '''s booking starts at ' || to_char(b.start_time, 'HH24:MI') || '.'
              else coalesce(p.full_name, 'A guest') || ' checks in.' end,
         b.listing_id
  from public.bookings b
  join public.listings l on l.id = b.listing_id
  left join public.profiles p on p.id = b.client_id, tomorrow
  where p_tomorrow and b.status = 'approved' and b.start_date = tomorrow.day
  union all
  -- Rentals and leases: approved move-ins tomorrow.
  select b.host_id, 'calendar-reminder:move-in:' || b.id, 'Tomorrow at ' || l.title,
         coalesce(p.full_name, 'Your tenant') || ' moves in.', b.listing_id
  from public.bookings b
  join public.listings l on l.id = b.listing_id
  left join public.profiles p on p.id = b.client_id, tomorrow
  where p_tomorrow and b.status = 'approved' and b.lease_start_date = tomorrow.day
  union all
  -- Leases ending in 60 days.
  select b.host_id, 'calendar-reminder:lease-end:' || b.id, 'A lease ends in 60 days',
         coalesce(p.full_name, 'Your tenant') || '''s lease at ' || l.title || ' ends on '
           || to_char((b.lease_start_date + make_interval(months => b.lease_months))::date, 'FMDD Mon YYYY') || '. Talk to them about renewing.',
         b.listing_id
  from public.bookings b
  join public.listings l on l.id = b.listing_id
  left join public.profiles p on p.id = b.client_id, today
  where b.status = 'approved' and b.lease_months is not null
    and (b.lease_start_date + make_interval(months => b.lease_months))::date = today.day + 60
  union all
  -- Viewings and events starting tomorrow (every repeat).
  select e.host_id, 'calendar-reminder:event:' || e.id || ':' || o.start_date,
         case when e.viewing then 'Viewing tomorrow' else 'Tomorrow' end || coalesce(' at ' || l.title, ''),
         coalesce(to_char(e.start_time, 'HH24:MI') || ' ', '') || e.title
           || case when e.viewing and e.client_name is not null then ' with ' || e.client_name else '' end
           || coalesce(' (' || e.client_phone || ')', '') || '.',
         e.listing_id
  from tomorrow, public.varoom_event_occurrences(null, null, tomorrow.day, tomorrow.day) o
  join public.calendar_entries e on e.id = o.entry_id
  left join public.listings l on l.id = e.listing_id
  where p_tomorrow and o.start_date = tomorrow.day and e.source <> 'ical'
$$;

revoke all on function public.calendar_reminders_due(boolean) from public, anon, authenticated;
grant execute on function public.calendar_reminders_due(boolean) to service_role;

-- Calendar reminders follow the host's reminders setting (from 000064).
create or replace function public.varoom_notification_wanted()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  p record;
begin
  select message_notifications, notify_bookings, notify_booking_reminders, notify_reviews, notify_account_updates
    into p from public.profiles where id = new.recipient_user_id;
  if not found then return new; end if;
  if (new.type = 'new_message' and p.message_notifications = false)
     or (new.type in ('booking_expiring', 'calendar_reminder') and p.notify_booking_reminders = false)
     or (new.type <> 'booking_expiring' and (new.type like 'booking\_%' or new.type = 'table_reservation') and p.notify_bookings = false)
     or (new.type in ('new_review', 'review_published', 'review_response') and p.notify_reviews = false)
     or ((new.type like 'payment\_%' or new.type like 'payout\_%' or new.type like 'support\_%' or new.type = 'security_alert') and p.notify_account_updates = false) then
    return null; -- turned off: not stored
  end if;
  return new;
end;
$$;

-- ---- 4. Occupancy from the calendar (host_analytics_period from 000057) ----
create or replace function public.host_analytics_period(
  p_host uuid,
  p_listing uuid,
  p_from date,
  p_to date
)
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_start timestamptz := p_from::timestamp at time zone 'Africa/Nairobi';
  v_end timestamptz := (p_to + 1)::timestamp at time zone 'Africa/Nairobi';
  v_result json;
begin
  with hl as (
    select l.id, l.category, l.supports_stay, l.created_at
    from public.listings l
    where l.host_id = p_host and (p_listing is null or l.id = p_listing)
  ),
  b as (
    select bk.*, (bk.created_at at time zone 'Africa/Nairobi')::date as created_day
    from public.bookings bk
    join hl on hl.id = bk.listing_id
    where bk.created_at >= v_start and bk.created_at < v_end
  ),
  ev as (
    select e.event_type, e.viewer_id
    from public.listing_events e
    join hl on hl.id = e.listing_id
    where e.host_id = p_host and e.created_at >= v_start and e.created_at < v_end
  ),
  conv as (
    select c.id
    from public.conversations c
    where c.host_id = p_host
      and c.client_id <> p_host
      and (p_listing is null or c.listing_id = p_listing)
      and c.created_at >= v_start and c.created_at < v_end
  ),
  -- Short-stay capacity from the calendar: each day a bookable listing was
  -- live and open (not closed on the day or every week), every hotel room.
  stay_days as (
    select hl.id, d::date as day,
           case when hl.category = 'hotel' then greatest(coalesce(det.units_available, 1), 1) else 1 end as cap,
           coalesce(det.price_unit = 'day', false) as daily
    from hl
    left join public.listing_booking_details det on det.listing_id = hl.id
    cross join lateral generate_series(greatest(p_from, (hl.created_at at time zone 'Africa/Nairobi')::date)::timestamp, p_to::timestamp, interval '1 day') d
    where (hl.category in ('airbnb', 'venue') or (hl.category = 'hotel' and hl.supports_stay))
      and not (extract(dow from d)::smallint = any (coalesce(det.closed_weekdays, '{}')))
      and not exists (
        select 1 from public.calendar_entries c
        where c.listing_id = hl.id and c.kind = 'closed'
          and c.start_date <= d::date and coalesce(c.end_date, 'infinity'::date) >= d::date
      )
  ),
  -- Booked listing-days: approved VaRoom bookings (nights; days by the day;
  -- the day of an hourly booking) and "booked offline" or other sites' bookings.
  taken as (
    select bk.listing_id, d::date as day, 1 as units
    from public.bookings bk
    join hl on hl.id = bk.listing_id
    left join public.listing_booking_details det on det.listing_id = bk.listing_id
    cross join lateral generate_series(
      greatest(bk.start_date, p_from)::timestamp,
      least(case when bk.end_date is null then bk.start_date when det.price_unit = 'day' then bk.end_date else bk.end_date - 1 end, p_to)::timestamp,
      interval '1 day'
    ) d
    where bk.status = 'approved' and bk.start_date is not null and bk.start_date <= p_to
    union all
    select o.listing_id, d::date, e.units
    from public.varoom_event_occurrences(p_host, p_listing, p_from, p_to) o
    join public.calendar_entries e on e.id = o.entry_id and e.blocks
    cross join lateral generate_series(greatest(o.start_date, p_from)::timestamp, least(o.end_date, p_to)::timestamp, interval '1 day') d
  ),
  occupied as (
    select coalesce(sum(least(t.units, s.cap)), 0)::integer as days
    from stay_days s
    join (select listing_id, day, sum(units) as units from taken group by listing_id, day) t on t.listing_id = s.id and t.day = s.day
  ),
  chat as (
    select f.asked_at, (
      select min(m.created_at)
      from public.messages m
      where m.conversation_id = f.id
        and m.sender_id = p_host
        and coalesce(m.is_auto_reply, false) = false
        and m.created_at > f.asked_at
    ) as replied_at
    from (
      select c.id, min(m.created_at) as asked_at
      from public.conversations c
      join public.messages m on m.conversation_id = c.id and m.sender_id = c.client_id
      where c.host_id = p_host
        and c.client_id <> p_host
        and (p_listing is null or c.listing_id = p_listing)
      group by c.id
    ) f
    where f.asked_at >= v_start and f.asked_at < v_end
  )
  select json_build_object(
    'views', (select count(*) from ev where event_type = 'view')::integer,
    'unique_viewers', (select count(distinct viewer_id) from ev where event_type = 'view')::integer,
    'contact_whatsapp', (select count(*) from ev where event_type = 'contact_whatsapp')::integer,
    'contact_phone', (select count(*) from ev where event_type = 'contact_phone')::integer,
    'contact_email', (select count(*) from ev where event_type = 'contact_email')::integer,
    'shares', (select count(*) from ev where event_type = 'share')::integer,
    'enquiries', (select count(*) from conv)::integer,
    'likes', (
      select count(*) from public.listing_likes ll join hl on hl.id = ll.listing_id
      where ll.created_at >= v_start and ll.created_at < v_end and ll.client_id <> p_host
    )::integer,
    'saves', (
      select count(*) from public.bookmarks bm join hl on hl.id = bm.listing_id
      where bm.created_at >= v_start and bm.created_at < v_end and bm.client_id <> p_host
    )::integer,
    'requests', (select count(*) from b)::integer,
    'by_status', coalesce((
      select json_agg(json_build_object('status', s.status, 'count', s.count) order by s.status)
      from (select status, count(*)::integer as count from b group by status) s
    ), '[]'::json),
    'approved', (select count(*) from b where status = 'approved')::integer,
    'approved_value', (select coalesce(sum(total_price), 0) from b where status = 'approved'),
    'average_value', (select avg(total_price) from b where status = 'approved'),
    'completed', (
      select count(*) from b
      where status = 'approved'
        and coalesce(
          end_date,
          start_date + 1,
          (lease_start_date + make_interval(months => coalesce(lease_months, 0)))::date
        ) <= (now() at time zone 'Africa/Nairobi')::date
    )::integer,
    'nights', (select coalesce(sum(end_date - start_date), 0) from b where status = 'approved' and end_date is not null)::integer,
    'stays', (select count(*) from b where status = 'approved' and end_date is not null)::integer,
    'stay_value', (select coalesce(sum(total_price), 0) from b where status = 'approved' and end_date is not null),
    'hours', (select coalesce(sum(hours), 0) from b where status = 'approved' and hours is not null)::integer,
    'hourly_bookings', (select count(*) from b where status = 'approved' and hours is not null)::integer,
    'lease_requests', (select count(*) from b where lease_months is not null)::integer,
    'lease_approved', (select count(*) from b where status = 'approved' and lease_months is not null)::integer,
    'lease_months', (select coalesce(sum(lease_months), 0) from b where status = 'approved' and lease_months is not null)::integer,
    'lease_monthly_value', (
      select sum(total_price) / nullif(sum(lease_months), 0) from b
      where status = 'approved' and lease_months is not null and price_unit = 'month'
    ),
    'lead_days', (
      select avg(coalesce(start_date, lease_start_date) - created_day) from b
      where status = 'approved' and coalesce(start_date, lease_start_date) is not null
    ),
    'booking_response_minutes', (
      select percentile_cont(0.5) within group (order by extract(epoch from responded_at - created_at) / 60)
      from b where status in ('approved', 'declined') and responded_at is not null
    ),
    'booking_responses', (select count(*) from b where status in ('approved', 'declined') and responded_at is not null)::integer,
    'occupied_days', (select days from occupied),
    'capacity_days', (select coalesce(sum(cap), 0) from stay_days)::integer,
    'chat_threads', (select count(*) from chat)::integer,
    'chat_replied', (select count(*) from chat where replied_at is not null)::integer,
    'chat_replied_within_hour', (select count(*) from chat where replied_at - asked_at <= interval '1 hour')::integer,
    'chat_response_minutes', (
      select percentile_cont(0.5) within group (order by extract(epoch from replied_at - asked_at) / 60)
      from chat where replied_at is not null
    )
  )
  into v_result;
  return v_result;
end;
$$;

revoke all on function public.host_analytics_period(uuid, uuid, date, date) from public, anon, authenticated;

-- Undo (in this order):
--   1. re-run host_analytics_period from 20261104_000057_host_analytics_v2.sql, varoom_notification_wanted from
--      20261112_000064_notification_preferences.sql and host_calendar from 20261128_000093_calendar_sync.sql;
--   2. drop function if exists public.calendar_reminders_due(boolean);
--   3. delete from public.calendar_entries where viewing; then re-run the calendar_entries_shape constraint
--      from 20261127_000091_calendar_planner.sql; alter table public.calendar_entries drop column if exists viewing;
