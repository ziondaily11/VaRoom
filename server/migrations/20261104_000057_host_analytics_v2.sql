-- Host analytics v2: listing engagement events, a niche-aware overview, and
-- paid access enforced in the database.
--
-- * listing_events records listing views, contact taps (WhatsApp, phone,
--   email) and shares from signed-in viewers. It is written only through
--   record_listing_event (de-duplicated, never the listing's own host) and
--   read only through host_analytics_overview, which never exposes viewers.
-- * host_analytics_overview returns everything the analytics page shows in
--   one round trip: the current and previous period, trend, per-listing
--   ranking, response times, dining and reviews, scoped to the signed-in
--   host and optionally one listing.
-- * Analytics needs a live subscription (active, past_due or
--   cancel_requested, period not ended) on a plan that does not switch
--   analytics off. Without one the overview returns only { access: false }.
--   The v1 functions are locked separately in 000058, applied once the new
--   analytics page is deployed (the live page still calls them until then).

-- ---------------------------------------------------------------- events

create table if not exists public.listing_events (
  id bigint generated always as identity primary key,
  listing_id uuid not null references public.listings(id) on delete cascade,
  host_id uuid not null,
  viewer_id uuid not null references auth.users(id) on delete cascade,
  event_type text not null check (event_type in ('view', 'contact_whatsapp', 'contact_phone', 'contact_email', 'share')),
  created_at timestamptz not null default now()
);

create index if not exists listing_events_host_created_idx
  on public.listing_events (host_id, created_at);
create index if not exists listing_events_dedupe_idx
  on public.listing_events (listing_id, viewer_id, event_type, created_at desc);
create index if not exists listing_events_viewer_created_idx
  on public.listing_events (viewer_id, created_at desc);

alter table public.listing_events enable row level security;
-- No policies: rows are written and read only through the functions below.
revoke all on public.listing_events from public, anon, authenticated;

-- Indexes the overview's period filters use.
create index if not exists conversations_host_created_idx
  on public.conversations (host_id, created_at);
create index if not exists bookings_host_created_idx
  on public.bookings (host_id, created_at);
create index if not exists listing_likes_listing_created_idx
  on public.listing_likes (listing_id, created_at);
create index if not exists bookmarks_listing_created_idx
  on public.bookmarks (listing_id, created_at);

create or replace function public.record_listing_event(p_listing_id uuid, p_event_type text)
returns boolean
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_host uuid;
  v_window interval;
begin
  if v_uid is null then
    return false;
  end if;
  if p_event_type is null or p_event_type not in ('view', 'contact_whatsapp', 'contact_phone', 'contact_email', 'share') then
    raise exception 'Unsupported listing event: %', p_event_type using errcode = '22023';
  end if;

  select l.host_id into v_host
  from public.listings l
  where l.id = p_listing_id and l.publication_state = 'published';

  -- Unknown or unpublished listings, and hosts looking at their own listing.
  if v_host is null or v_host = v_uid then
    return false;
  end if;

  -- One view per viewer per listing every 30 minutes; one tap per channel every 5.
  v_window := case when p_event_type = 'view' then interval '30 minutes' else interval '5 minutes' end;
  if exists (
    select 1 from public.listing_events e
    where e.listing_id = p_listing_id
      and e.viewer_id = v_uid
      and e.event_type = p_event_type
      and e.created_at > now() - v_window
  ) then
    return false;
  end if;

  -- Bound scripted inflation from a single account.
  if (
    select count(*) from public.listing_events e
    where e.viewer_id = v_uid and e.created_at > now() - interval '1 hour'
  ) >= 300 then
    return false;
  end if;

  insert into public.listing_events (listing_id, host_id, viewer_id, event_type)
  values (p_listing_id, v_host, v_uid, p_event_type);
  return true;
end;
$$;

revoke all on function public.record_listing_event(uuid, text) from public, anon;
grant execute on function public.record_listing_event(uuid, text) to authenticated;

-- ---------------------------------------------------------------- access

create or replace function public.host_has_analytics_access(p_host uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.host_subscriptions hs
    left join public.billing_plans bp on bp.id = hs.plan_id
    where hs.host_id = p_host
      and hs.status in ('active', 'past_due', 'cancel_requested')
      and (hs.current_period_end is null or hs.current_period_end > now())
      -- Niche plans declare analytics; legacy plans include it without the key.
      and coalesce((bp.features ->> 'analytics')::boolean, true)
  );
$$;

revoke all on function public.host_has_analytics_access(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------- period metrics
-- Internal: takes the host id, so it is never callable by users.

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
  -- Short-stay capacity: listing-days each bookable listing was live in the period.
  stay_listings as (
    select hl.id,
      greatest(0, p_to - greatest(p_from, (hl.created_at at time zone 'Africa/Nairobi')::date) + 1) as days
    from hl
    where hl.category in ('airbnb', 'venue') or (hl.category = 'hotel' and hl.supports_stay)
  ),
  -- Booked listing-days by stay date (not request date): nights, or the day of an hourly booking.
  occupied as (
    select count(*)::integer as days
    from (
      select distinct bk.listing_id, d::date as day
      from public.bookings bk
      join stay_listings s on s.id = bk.listing_id
      cross join lateral generate_series(
        greatest(bk.start_date, p_from)::timestamp,
        least(coalesce(bk.end_date - 1, bk.start_date), p_to)::timestamp,
        interval '1 day'
      ) d
      where bk.status = 'approved'
        and bk.start_date is not null
        and bk.start_date <= p_to
        and coalesce(bk.end_date - 1, bk.start_date) >= p_from
    ) days
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
    'capacity_days', (select coalesce(sum(days), 0) from stay_listings)::integer,
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

-- ---------------------------------------------------------------- overview

create or replace function public.host_analytics_overview(
  p_from date,
  p_to date,
  p_granularity text,
  p_listing uuid default null
)
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_niche text;
  v_g text := lower(p_granularity);
  v_interval interval;
  v_days integer;
  v_start timestamptz;
  v_end timestamptz;
  v_has_dining boolean;
begin
  if v_uid is null then
    raise exception 'Sign in to see analytics.' using errcode = '28000';
  end if;
  if p_from is null or p_to is null or p_from > p_to or p_to - p_from > 400 then
    raise exception 'Unsupported analytics range.' using errcode = '22023';
  end if;
  if v_g is null or v_g not in ('day', 'week', 'month') then
    raise exception 'Unsupported analytics granularity: %', p_granularity using errcode = '22023';
  end if;

  select p.listing_categories[1] into v_niche
  from public.profiles p
  where p.id = v_uid and p.role = 'host';
  if not found then
    raise exception 'Analytics is available to host accounts.' using errcode = '42501';
  end if;

  if p_listing is not null and not exists (
    select 1 from public.listings l where l.id = p_listing and l.host_id = v_uid
  ) then
    raise exception 'That listing was not found on your account.' using errcode = '42501';
  end if;

  if not public.host_has_analytics_access(v_uid) then
    return json_build_object('access', false, 'niche', v_niche);
  end if;

  v_days := p_to - p_from + 1;
  v_start := p_from::timestamp at time zone 'Africa/Nairobi';
  v_end := (p_to + 1)::timestamp at time zone 'Africa/Nairobi';
  v_interval := case v_g when 'day' then interval '1 day' when 'week' then interval '1 week' else interval '1 month' end;

  select exists (
    select 1 from public.listings l
    where l.host_id = v_uid and (p_listing is null or l.id = p_listing)
      and l.category = 'hotel' and l.supports_table_reservation
  ) into v_has_dining;

  return json_build_object(
    'access', true,
    'niche', v_niche,
    'portfolio', (
      select json_build_object(
        'listings', count(*)::integer,
        'published', count(*) filter (where l.publication_state = 'published')::integer,
        'categories', coalesce(json_agg(distinct l.category) filter (where l.category is not null), '[]'::json),
        'has_stays', bool_or(l.category in ('airbnb', 'venue') or (l.category = 'hotel' and l.supports_stay)),
        'has_dining', v_has_dining,
        'has_rent', bool_or(l.category = 'property' and coalesce(l.listing_purpose, d.listing_purpose, 'rent') in ('rent', 'both')),
        'has_sale', bool_or(l.category = 'property' and coalesce(l.listing_purpose, d.listing_purpose) in ('sale', 'both')),
        'has_hourly', bool_or(d.price_unit = 'hour')
      )
      from public.listings l
      left join public.listing_booking_details d on d.listing_id = l.id
      where l.host_id = v_uid and (p_listing is null or l.id = p_listing)
        and l.publication_state not in ('discarded', 'cleanup_pending')
    ),
    'tracking_since', (
      select min(e.created_at) from public.listing_events e where e.host_id = v_uid
    ),
    'current', public.host_analytics_period(v_uid, p_listing, p_from, p_to),
    'previous', public.host_analytics_period(v_uid, p_listing, p_from - v_days, p_from - 1),
    'trend', (
      with buckets as (
        select generate_series(
          date_trunc(v_g, p_from::timestamp),
          date_trunc(v_g, p_to::timestamp),
          v_interval
        ) as bucket_start
      ),
      hl as (
        select l.id from public.listings l
        where l.host_id = v_uid and (p_listing is null or l.id = p_listing)
      ),
      bk as (
        select date_trunc(v_g, b.created_at at time zone 'Africa/Nairobi') as bucket_start,
          count(*)::integer as requests,
          count(*) filter (where b.status = 'approved')::integer as approved,
          coalesce(sum(b.total_price) filter (where b.status = 'approved'), 0) as approved_value
        from public.bookings b join hl on hl.id = b.listing_id
        where b.created_at >= v_start and b.created_at < v_end
        group by 1
      ),
      ev as (
        select date_trunc(v_g, e.created_at at time zone 'Africa/Nairobi') as bucket_start,
          count(*) filter (where e.event_type = 'view')::integer as views,
          count(*) filter (where e.event_type like 'contact_%')::integer as contacts
        from public.listing_events e join hl on hl.id = e.listing_id
        where e.host_id = v_uid and e.created_at >= v_start and e.created_at < v_end
        group by 1
      ),
      cv as (
        select date_trunc(v_g, c.created_at at time zone 'Africa/Nairobi') as bucket_start,
          count(*)::integer as enquiries
        from public.conversations c
        where c.host_id = v_uid and c.client_id <> v_uid
          and (p_listing is null or c.listing_id = p_listing)
          and c.created_at >= v_start and c.created_at < v_end
        group by 1
      )
      select coalesce(json_agg(json_build_object(
        'bucket', to_char(buckets.bucket_start, 'YYYY-MM-DD'),
        'views', coalesce(ev.views, 0),
        'contacts', coalesce(ev.contacts, 0),
        'enquiries', coalesce(cv.enquiries, 0),
        'requests', coalesce(bk.requests, 0),
        'approved', coalesce(bk.approved, 0),
        'approved_value', coalesce(bk.approved_value, 0)
      ) order by buckets.bucket_start), '[]'::json)
      from buckets
      left join bk using (bucket_start)
      left join ev using (bucket_start)
      left join cv using (bucket_start)
    ),
    'listings', (
      select coalesce(json_agg(json_build_object(
        'listing_id', r.id,
        'title', r.title,
        'category', r.category,
        'listing_purpose', r.listing_purpose,
        'publication_state', r.publication_state,
        'availability_status', r.availability_status,
        'views', r.views,
        'contacts', r.contacts,
        'enquiries', r.enquiries,
        'likes', r.likes,
        'saves', r.saves,
        'requests', r.requests,
        'approved', r.approved,
        'approved_value', r.approved_value
      ) order by r.approved_value desc, r.requests desc, r.views desc, r.title), '[]'::json)
      from (
        select l.id, l.title, l.category, coalesce(l.listing_purpose, d.listing_purpose) as listing_purpose,
          l.publication_state, l.availability_status,
          (select count(*) from public.listing_events e
            where e.listing_id = l.id and e.host_id = v_uid and e.event_type = 'view'
              and e.created_at >= v_start and e.created_at < v_end)::integer as views,
          (select count(*) from public.listing_events e
            where e.listing_id = l.id and e.host_id = v_uid and e.event_type like 'contact_%'
              and e.created_at >= v_start and e.created_at < v_end)::integer as contacts,
          (select count(*) from public.conversations c
            where c.listing_id = l.id and c.host_id = v_uid and c.client_id <> v_uid
              and c.created_at >= v_start and c.created_at < v_end)::integer as enquiries,
          (select count(*) from public.listing_likes ll
            where ll.listing_id = l.id and ll.client_id <> v_uid
              and ll.created_at >= v_start and ll.created_at < v_end)::integer as likes,
          (select count(*) from public.bookmarks bm
            where bm.listing_id = l.id and bm.client_id <> v_uid
              and bm.created_at >= v_start and bm.created_at < v_end)::integer as saves,
          (select count(*) from public.bookings b
            where b.listing_id = l.id and b.created_at >= v_start and b.created_at < v_end)::integer as requests,
          (select count(*) from public.bookings b
            where b.listing_id = l.id and b.status = 'approved'
              and b.created_at >= v_start and b.created_at < v_end)::integer as approved,
          (select coalesce(sum(b.total_price), 0) from public.bookings b
            where b.listing_id = l.id and b.status = 'approved'
              and b.created_at >= v_start and b.created_at < v_end) as approved_value
        from public.listings l
        left join public.listing_booking_details d on d.listing_id = l.id
        where l.host_id = v_uid and (p_listing is null or l.id = p_listing)
          and l.publication_state not in ('discarded', 'cleanup_pending')
      ) r
    ),
    'dining', case when v_has_dining then (
      with tr as (
        select r.status, r.guest_count, r.table_count, r.requested_date, r.requested_time, r.special_occasion
        from public.table_reservations r
        join public.listings l on l.id = r.listing_id
        where r.host_id = v_uid and l.host_id = v_uid
          and (p_listing is null or r.listing_id = p_listing)
          and r.created_at >= v_start and r.created_at < v_end
      ),
      prev as (
        select count(*)::integer as total
        from public.table_reservations r
        where r.host_id = v_uid
          and (p_listing is null or r.listing_id = p_listing)
          and r.created_at >= v_start - (v_days * interval '1 day') and r.created_at < v_start
      )
      select json_build_object(
        'total', (select count(*) from tr)::integer,
        'previous_total', (select total from prev),
        'guests', (select coalesce(sum(guest_count), 0) from tr)::integer,
        'tables', (select coalesce(sum(table_count), 0) from tr)::integer,
        'occasions', (select count(*) from tr where special_occasion)::integer,
        'by_status', coalesce((
          select json_agg(json_build_object('status', s.status, 'count', s.count) order by s.status)
          from (select status, count(*)::integer as count from tr group by status) s
        ), '[]'::json),
        'by_weekday', (
          select json_agg(coalesce(c.count, 0) order by w.n)
          from generate_series(1, 7) w(n)
          left join (
            select extract(isodow from requested_date)::integer as n, count(*)::integer as count
            from tr group by 1
          ) c using (n)
        ),
        'by_hour', coalesce((
          select json_agg(json_build_object('hour', h.hour, 'count', h.count) order by h.hour)
          from (select extract(hour from requested_time)::integer as hour, count(*)::integer as count from tr group by 1) h
        ), '[]'::json)
      )
    ) else null end,
    'reviews', (
      select json_build_object(
        'average', avg(r.rating),
        'count', count(*)::integer,
        'in_period', count(*) filter (where r.created_at >= v_start and r.created_at < v_end)::integer,
        'distribution', json_build_object(
          '1', count(*) filter (where r.rating = 1)::integer,
          '2', count(*) filter (where r.rating = 2)::integer,
          '3', count(*) filter (where r.rating = 3)::integer,
          '4', count(*) filter (where r.rating = 4)::integer,
          '5', count(*) filter (where r.rating = 5)::integer
        )
      )
      from public.reviews r
      join public.listings l on l.id = r.listing_id
      where l.host_id = v_uid and r.host_id = v_uid and r.status = 'published'
        and (p_listing is null or r.listing_id = p_listing)
    )
  );
end;
$$;

revoke all on function public.host_analytics_overview(date, date, text, uuid) from public, anon;
grant execute on function public.host_analytics_overview(date, date, text, uuid) to authenticated;
