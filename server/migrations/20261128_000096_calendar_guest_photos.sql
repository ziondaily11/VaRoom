-- Calendar UI, part 1: guests' photos on the host's calendar
-- (docs/host-controls/CALENDAR_UI_PLAN.md, "Data").
--
-- host_calendar (from 000095) adds each booking's and lease's guest photo
-- (profiles.avatar_url, the same value the Bookings page shows). Nothing else
-- changes. The calendar is read with the caller's own rights, as before.
--
-- Check first (must work): select count(*) from public.profiles where avatar_url is not null;
-- Safe to re-run.

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
        'avatar', (select p.avatar_url from public.profiles p where p.id = b.client_id)) order by b.start_date, b.start_time nulls first)
      from public.bookings b
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

-- Undo: re-run host_calendar from 20261128_000095_calendar_prices_turnover.sql.
