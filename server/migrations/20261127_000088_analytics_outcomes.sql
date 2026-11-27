-- Host analytics counts places sold, rented and leased (docs/host-controls/OUTCOME_CONTROLS_PLAN.md, part 2).
--
-- 1. listings.on_market_since: when the listing went on the market. Set when it is created and
--    by Relist (server/routes/listingRoutes.js). Unlike live_since, plan payments never move it,
--    so time on market spans renewals. A new outcome record takes listed_since from it.
-- 2. host_analytics_outcomes: per period, units sold / rented / leased, the agreed sale value
--    and the median days on the market. Voided records are left out; deleted listings still count.
-- 3. host_analytics_overview (latest body: 20261113_000068) adds those to current and previous,
--    an 'outcomes' series to the trend and an 'outcomes' column to each listing row.
--    host_analytics_period is unchanged.
--
-- Needs 000087. Each statement is safe to re-run.

alter table public.listings add column if not exists on_market_since timestamptz;
update public.listings set on_market_since = created_at where on_market_since is null;
alter table public.listings alter column on_market_since set default now();

create or replace function public.listing_outcome_listed_since()
returns trigger
language plpgsql
set search_path to 'public', 'pg_temp'
as $function$
begin
  new.listed_since := coalesce((select l.on_market_since from public.listings l where l.id = new.listing_id), new.listed_since);
  return new;
end;
$function$;

drop trigger if exists listing_outcomes_listed_since on public.listing_outcomes;
create trigger listing_outcomes_listed_since before insert on public.listing_outcomes
  for each row execute function public.listing_outcome_listed_since();

-- Records made before this migration took live_since.
update public.listing_outcomes o set listed_since = l.on_market_since
from public.listings l where l.id = o.listing_id and o.listed_since is distinct from l.on_market_since;

-- Internal: takes the host id, so it is never callable by users.
create or replace function public.host_analytics_outcomes(p_host uuid, p_listing uuid, p_from date, p_to date)
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $function$
  select jsonb_build_object(
    'sold', coalesce(sum(o.units) filter (where o.outcome = 'sold'), 0)::integer,
    'rented', coalesce(sum(o.units) filter (where o.outcome = 'rented'), 0)::integer,
    'leased', coalesce(sum(o.units) filter (where o.outcome = 'leased'), 0)::integer,
    'sold_value', coalesce(sum(o.agreed_amount) filter (where o.outcome = 'sold'), 0),
    'market_days', percentile_cont(0.5) within group (order by extract(epoch from o.recorded_at - o.listed_since) / 86400)
      filter (where o.listed_since is not null)
  )
  from public.listing_outcomes o
  where o.host_id = p_host and o.voided_at is null
    and (p_listing is null or o.listing_id = p_listing)
    and o.recorded_at >= p_from::timestamp at time zone 'Africa/Nairobi'
    and o.recorded_at < (p_to + 1)::timestamp at time zone 'Africa/Nairobi';
$function$;

revoke all on function public.host_analytics_outcomes(uuid, uuid, date, date) from public, anon, authenticated;

CREATE OR REPLACE FUNCTION public.host_analytics_overview(p_from date, p_to date, p_granularity text, p_listing uuid DEFAULT NULL::uuid)
 RETURNS json
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := public.varoom_acting_host('finance'); -- the host, or the company a Finance member works as
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
    'current', public.host_analytics_period(v_uid, p_listing, p_from, p_to)::jsonb
      || public.host_analytics_outcomes(v_uid, p_listing, p_from, p_to),
    'previous', public.host_analytics_period(v_uid, p_listing, p_from - v_days, p_from - 1)::jsonb
      || public.host_analytics_outcomes(v_uid, p_listing, p_from - v_days, p_from - 1),
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
      ),
      oc as (
        select date_trunc(v_g, o.recorded_at at time zone 'Africa/Nairobi') as bucket_start,
          sum(o.units)::integer as outcomes
        from public.listing_outcomes o
        where o.host_id = v_uid and o.voided_at is null
          and (p_listing is null or o.listing_id = p_listing)
          and o.recorded_at >= v_start and o.recorded_at < v_end
        group by 1
      )
      select coalesce(json_agg(json_build_object(
        'bucket', to_char(buckets.bucket_start, 'YYYY-MM-DD'),
        'views', coalesce(ev.views, 0),
        'contacts', coalesce(ev.contacts, 0),
        'enquiries', coalesce(cv.enquiries, 0),
        'requests', coalesce(bk.requests, 0),
        'approved', coalesce(bk.approved, 0),
        'approved_value', coalesce(bk.approved_value, 0),
        'outcomes', coalesce(oc.outcomes, 0)
      ) order by buckets.bucket_start), '[]'::json)
      from buckets
      left join bk using (bucket_start)
      left join ev using (bucket_start)
      left join cv using (bucket_start)
      left join oc using (bucket_start)
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
        'approved_value', r.approved_value,
        'outcomes', r.outcomes
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
              and b.created_at >= v_start and b.created_at < v_end) as approved_value,
          (select coalesce(sum(o.units), 0) from public.listing_outcomes o
            where o.listing_id = l.id and o.host_id = v_uid and o.voided_at is null
              and o.recorded_at >= v_start and o.recorded_at < v_end)::integer as outcomes
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
$function$;

revoke all on function public.host_analytics_overview(date, date, text, uuid) from public, anon;
grant execute on function public.host_analytics_overview(date, date, text, uuid) to authenticated;

-- Undo:
--   1. Re-run the host_analytics_overview definition from 20261113_000068_team_finance_notifications.sql.
--   2. drop function if exists public.host_analytics_outcomes(uuid, uuid, date, date);
--      drop trigger if exists listing_outcomes_listed_since on public.listing_outcomes;
--      drop function if exists public.listing_outcome_listed_since();
--      alter table public.listings drop column if exists on_market_since;
