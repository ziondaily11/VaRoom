-- Calendar events: what a venue booking is for
-- (docs/host-controls/CALENDAR_EVENTS_PLAN.md, part B).
--
-- 1. bookings gains event_type (one of the list below) and event_notes (up to
--    500 characters): the guest picks the type of event when booking a venue
--    and may add what the host should know.
-- 2. A trigger before each new booking: venues must say the type of event
--    (from 7 December 2026; until then a page still open from before may send
--    none), notes are trimmed, and other listings keep neither field.
--    Guests insert bookings from the browser, so the page alone can't be trusted.
-- 3. The host's new-request notification names the event and the day.
-- 4. host_calendar (from 000096) returns both fields with each booking.
--    Nothing else changes.
--
-- Check first (must work): select count(*) from public.bookings b join public.listings l on l.id = b.listing_id where l.category = 'venue';
-- Safe to re-run.

alter table public.bookings
  add column if not exists event_type text,
  add column if not exists event_notes text;

alter table public.bookings drop constraint if exists bookings_event_type_check;
alter table public.bookings add constraint bookings_event_type_check check (event_type is null or event_type in (
  'wedding', 'traditional', 'graduation', 'birthday', 'corporate', 'conference', 'religious',
  'baby_shower', 'memorial', 'concert', 'shoot', 'party', 'other'));
alter table public.bookings drop constraint if exists bookings_event_notes_check;
alter table public.bookings add constraint bookings_event_notes_check check (event_notes is null or char_length(event_notes) <= 500);

-- The words for each type (notifications; the app has the same list in lib/booking/eventTypes.ts).
create or replace function public.varoom_event_label(p_type text)
returns text
language sql
immutable
set search_path = public
as $$
  select case p_type
    when 'wedding' then 'Wedding' when 'traditional' then 'Traditional ceremony' when 'graduation' then 'Graduation'
    when 'birthday' then 'Birthday' when 'corporate' then 'Corporate event' when 'conference' then 'Conference or meeting'
    when 'religious' then 'Church or religious event' when 'baby_shower' then 'Baby shower' when 'memorial' then 'Memorial'
    when 'concert' then 'Concert or show' when 'shoot' then 'Photo or video shoot' when 'party' then 'Party' when 'other' then 'Event'
  end
$$;

create or replace function public.varoom_booking_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  venue boolean;
begin
  select l.category = 'venue' into venue from public.listings l where l.id = new.listing_id;
  new.event_notes := nullif(btrim(coalesce(new.event_notes, '')), '');
  if not coalesce(venue, false) then
    new.event_type := null;
    new.event_notes := null;
  elsif new.event_type is null and now() >= timestamptz '2026-12-07 00:00:00+03' then
    raise exception 'booking_rule: Choose the type of event.';
  end if;
  return new;
end;
$$;

drop trigger if exists varoom_booking_event_trigger on public.bookings;
create trigger varoom_booking_event_trigger
  before insert on public.bookings
  for each row execute function public.varoom_booking_event();

-- The new-request notification (000064's, naming the event and the day).
create or replace function public.varoom_notify_booking()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  listing_title text;
  guest_name text;
  recipient uuid;
  actor uuid;
  kind text;
  heading text;
  body text;
begin
  select coalesce(title, 'this listing') into listing_title from public.listings where id = new.listing_id;
  listing_title := coalesce(listing_title, 'this listing');
  if tg_op = 'INSERT' then
    select coalesce(nullif(full_name, ''), 'A guest') into guest_name from public.profiles where id = new.client_id;
    recipient := new.host_id; actor := new.client_id; kind := 'booking_request';
    if new.status = 'approved' then
      heading := 'New booking';
      body := format('"%s" booked "%s"%s.', coalesce(guest_name, 'A guest'), listing_title,
        case when new.event_type is not null then format(' (%s, %s)', public.varoom_event_label(new.event_type), to_char(new.start_date, 'FMDD Mon')) else '' end);
    else
      heading := 'New booking request';
      body := format('"%s" requested to book "%s"%s.', coalesce(guest_name, 'A guest'), listing_title,
        case when new.event_type is not null then format(' (%s, %s)', public.varoom_event_label(new.event_type), to_char(new.start_date, 'FMDD Mon')) else '' end);
    end if;
  elsif new.status is not distinct from old.status then
    return new;
  elsif new.status = 'approved' then
    recipient := new.client_id; actor := new.host_id; kind := 'booking_approved';
    heading := 'Booking confirmed'; body := format('Your booking for "%s" has been confirmed.', listing_title);
  elsif new.status = 'declined' then
    recipient := new.client_id; actor := new.host_id; kind := 'booking_declined';
    heading := 'Booking declined'; body := format('Your booking request for "%s" was declined.', listing_title);
  elsif new.status = 'cancelled' then
    select coalesce(nullif(full_name, ''), 'A guest') into guest_name from public.profiles where id = new.client_id;
    recipient := new.host_id; actor := new.client_id; kind := 'booking_cancelled';
    heading := 'Booking cancelled'; body := format('"%s" cancelled their booking for "%s".', coalesce(guest_name, 'A guest'), listing_title);
  elsif new.status = 'expired' then
    recipient := new.client_id; actor := null; kind := 'booking_expired';
    heading := 'Booking request expired';
    body := format('Your booking request for "%s" expired because the host didn''t respond in time.', listing_title);
  else
    return new;
  end if;

  begin
    insert into public.notifications (user_id, recipient_user_id, actor_user_id, type, title, message,
      related_entity_type, related_entity_id, booking_id, metadata, read, event_key)
    values (recipient, recipient, actor, kind, heading, body, 'booking', new.id, new.id,
      jsonb_build_object('booking_id', new.id, 'listing_id', new.listing_id, 'listing_name', listing_title),
      false, replace(kind, '_', '-') || ':' || new.id)
    on conflict (event_key) do nothing;
  exception when others then
    raise warning 'Booking notification failed for %: %', new.id, sqlerrm; -- never blocks the booking
  end;
  return new;
end;
$$;

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
        'event_type', b.event_type, 'event_notes', b.event_notes) order by b.start_date, b.start_time nulls first)
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

-- Undo (in this order):
--   re-run host_calendar from 20261128_000096_calendar_guest_photos.sql;
--   re-run varoom_notify_booking from 20261112_000064_notification_preferences.sql;
--   drop trigger varoom_booking_event_trigger on public.bookings; drop function public.varoom_booking_event(); drop function public.varoom_event_label(text);
--   alter table public.bookings drop constraint bookings_event_notes_check, drop constraint bookings_event_type_check,
--     drop column event_notes, drop column event_type;
