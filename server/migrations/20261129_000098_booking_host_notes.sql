-- Calendar: the host's own title, notes and colour on VaRoom bookings
-- (other arrangements made with the guest, e.g. "Decor by Zawadi, arrive 7am").
--
-- 1. booking_host_notes: one row per booking, written and read only by the
--    booking's host (and their team Managers). Guests read their bookings
--    rows, so the host's notes live in their own table, never on bookings.
-- 2. host_calendar (from 000097) returns them with each booking. Nothing else
--    changes.
--
-- Check first (must work): select count(*) from public.bookings;
-- Safe to re-run.

create table if not exists public.booking_host_notes (
  booking_id uuid primary key references public.bookings(id) on delete cascade,
  host_id uuid not null references public.profiles(id) on delete cascade,
  title text check (title is null or char_length(title) between 1 and 120),
  notes text check (notes is null or char_length(notes) <= 2000),
  color text check (color is null or color in ('red', 'orange', 'yellow', 'green', 'blue', 'purple')),
  updated_at timestamptz not null default now()
);
alter table public.booking_host_notes enable row level security;

-- The host of the booking (or their Managers); a note can only sit on that host's own booking.
drop policy if exists booking_host_notes_read on public.booking_host_notes;
create policy booking_host_notes_read on public.booking_host_notes for select to authenticated
  using (public.varoom_can_act_for(host_id, 'manager'));
drop policy if exists booking_host_notes_add on public.booking_host_notes;
create policy booking_host_notes_add on public.booking_host_notes for insert to authenticated
  with check (public.varoom_can_act_for(host_id, 'manager')
    and host_id = (select b.host_id from public.bookings b where b.id = booking_id));
drop policy if exists booking_host_notes_change on public.booking_host_notes;
create policy booking_host_notes_change on public.booking_host_notes for update to authenticated
  using (public.varoom_can_act_for(host_id, 'manager'))
  with check (public.varoom_can_act_for(host_id, 'manager')
    and host_id = (select b.host_id from public.bookings b where b.id = booking_id));
drop policy if exists booking_host_notes_remove on public.booking_host_notes;
create policy booking_host_notes_remove on public.booking_host_notes for delete to authenticated
  using (public.varoom_can_act_for(host_id, 'manager'));

revoke all on public.booking_host_notes from anon;
grant select, insert, update, delete on public.booking_host_notes to authenticated;

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
        'guest', (select p.full_name from public.profiles p where p.id = b.client_id),
        'avatar', (select p.avatar_url from public.profiles p where p.id = b.client_id),
        'event_type', b.event_type, 'event_notes', b.event_notes,
        'host_title', n.title, 'host_notes', n.notes, 'host_color', n.color) order by b.start_date, b.start_time nulls first)
      from public.bookings b
      left join public.booking_host_notes n on n.booking_id = b.id
      where b.host_id = p_host and b.start_date is not null
        and b.start_date <= p_to and coalesce(b.end_date, b.start_date) >= p_from - 7
        and (b.status in ('approved', 'completed') or (b.status = 'pending' and b.created_at > now() - interval '48 hours'))
    ), '[]'::jsonb),
    'leases', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', x.id, 'listing_id', x.listing_id, 'status', x.status, 'start', x.lease_start_date, 'months', x.lease_months,
        'end', x.lease_end, 'total_price', x.total_price,
        'guest', (select p.full_name from public.profiles p where p.id = x.client_id),
        'avatar', (select p.avatar_url from public.profiles p where p.id = x.client_id)) order by x.lease_start_date)
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

-- Undo (in this order):
--   re-run host_calendar from 20261129_000097_booking_event_types.sql;
--   drop table public.booking_host_notes;
