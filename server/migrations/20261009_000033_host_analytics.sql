create index if not exists bookings_listing_id_created_at_idx
  on public.bookings (listing_id, created_at);

create index if not exists bookings_status_idx
  on public.bookings (status);

create or replace function public.host_booking_summary(p_from date, p_to date)
returns json
language sql
stable
security invoker
set search_path = public
as $$
  with scoped_bookings as (
    select b.status, b.total_price, b.end_date
    from public.bookings b
    join public.listings l on l.id = b.listing_id
    where l.host_id = auth.uid()
      and (b.created_at at time zone 'Africa/Nairobi')::date between p_from and p_to
  )
  select json_build_object(
    'requests', count(*)::integer,
    'by_status', coalesce(
      (
        select json_agg(json_build_object('status', statuses.status, 'count', statuses.count))
        from (
          select sb.status, count(*)::integer as count
          from scoped_bookings sb
          group by sb.status
          order by sb.status
        ) statuses
      ),
      '[]'::json
    ),
    'approved_count', count(*) filter (where status = 'approved')::integer,
    'approved_value', coalesce(sum(total_price) filter (where status = 'approved'), 0),
    'average_approved_value', avg(total_price) filter (where status = 'approved'),
    'completed_stays', count(*) filter (
      where status = 'approved'
        and end_date < (now() at time zone 'Africa/Nairobi')::date
    )::integer
  )
  from scoped_bookings;
$$;

create or replace function public.host_booking_trend(
  p_from date,
  p_to date,
  p_granularity text
)
returns json
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  v_interval interval;
  v_granularity text := lower(p_granularity);
  v_result json;
begin
  if v_granularity is null or v_granularity not in ('day', 'week', 'month') then
    raise exception 'Unsupported analytics granularity: %', p_granularity;
  end if;

  v_interval := case v_granularity
    when 'day' then interval '1 day'
    when 'week' then interval '1 week'
    else interval '1 month'
  end;

  with buckets as (
    select generate_series(
      date_trunc(v_granularity, p_from::timestamp),
      date_trunc(v_granularity, p_to::timestamp),
      v_interval
    ) as bucket_start
  ),
  aggregates as (
    select
      date_trunc(v_granularity, b.created_at at time zone 'Africa/Nairobi') as bucket_start,
      count(*)::integer as requests,
      coalesce(sum(b.total_price) filter (where b.status = 'approved'), 0) as approved_value
    from public.bookings b
    join public.listings l on l.id = b.listing_id
    where l.host_id = auth.uid()
      and (b.created_at at time zone 'Africa/Nairobi')::date between p_from and p_to
    group by 1
  )
  select coalesce(
    json_agg(
      json_build_object(
        'bucket', to_char(buckets.bucket_start, 'YYYY-MM-DD'),
        'requests', coalesce(aggregates.requests, 0),
        'approved_value', coalesce(aggregates.approved_value, 0)
      )
      order by buckets.bucket_start
    ),
    '[]'::json
  )
  into v_result
  from buckets
  left join aggregates using (bucket_start);

  return v_result;
end;
$$;

create or replace function public.host_listing_ranking(p_from date, p_to date)
returns json
language sql
stable
security invoker
set search_path = public
as $$
  select coalesce(
    json_agg(
      json_build_object(
        'listing_id', ranked.listing_id,
        'title', ranked.title,
        'requests', ranked.requests,
        'approved', ranked.approved,
        'approved_value', ranked.approved_value
      )
      order by ranked.approved_value desc, ranked.title
    ),
    '[]'::json
  )
  from (
    select
      l.id as listing_id,
      l.title,
      count(b.id)::integer as requests,
      count(b.id) filter (where b.status = 'approved')::integer as approved,
      coalesce(sum(b.total_price) filter (where b.status = 'approved'), 0) as approved_value
    from public.listings l
    left join public.bookings b
      on b.listing_id = l.id
      and (b.created_at at time zone 'Africa/Nairobi')::date between p_from and p_to
    where l.host_id = auth.uid()
    group by l.id, l.title
  ) ranked;
$$;

create or replace function public.host_reservation_summary(p_from date, p_to date)
returns json
language sql
stable
security definer
set search_path = public
as $$
  with host_hotels as (
    select l.id
    from public.listings l
    where l.host_id = auth.uid()
      and l.category = 'hotel'
  ),
  scoped_reservations as (
    select r.status, r.guest_count, r.table_count, r.requested_date
    from public.table_reservations r
    join host_hotels h on h.id = r.listing_id
    where r.host_id = auth.uid()
      and (r.created_at at time zone 'Africa/Nairobi')::date between p_from and p_to
  ),
  status_counts as (
    select status, count(*)::integer as count
    from scoped_reservations
    group by status
    order by status
  ),
  weekday_counts as (
    select weekday.day_number, count(reservations.requested_date)::integer as count
    from generate_series(1, 7) as weekday(day_number)
    left join scoped_reservations reservations
      on extract(isodow from reservations.requested_date) = weekday.day_number
    group by weekday.day_number
  )
  select case when exists (select 1 from host_hotels) then
    json_build_object(
      'total', count(*)::integer,
      'guests', coalesce(sum(guest_count), 0)::integer,
      'tables', coalesce(sum(table_count), 0)::integer,
      'by_status', coalesce(
        (select json_agg(json_build_object('status', status, 'count', count)) from status_counts),
        '[]'::json
      ),
      'by_weekday', coalesce(
        (select json_agg(count order by day_number) from weekday_counts),
        '[0,0,0,0,0,0,0]'::json
      )
    )
  else null end
  from scoped_reservations;
$$;

create or replace function public.host_review_summary()
returns json
language sql
stable
security invoker
set search_path = public
as $$
  with host_reviews as (
    select r.rating
    from public.reviews r
    join public.listings l on l.id = r.listing_id
    where l.host_id = auth.uid()
      and r.host_id = auth.uid()
      and r.status = 'published'
  ),
  distribution as (
    select rating, count(*)::integer as count
    from host_reviews
    group by rating
  )
  select json_build_object(
    'average', avg(rating),
    'count', count(*)::integer,
    'distribution', json_build_object(
      '1', coalesce((select count from distribution where rating = 1), 0),
      '2', coalesce((select count from distribution where rating = 2), 0),
      '3', coalesce((select count from distribution where rating = 3), 0),
      '4', coalesce((select count from distribution where rating = 4), 0),
      '5', coalesce((select count from distribution where rating = 5), 0)
    )
  )
  from host_reviews;
$$;

create or replace function public.host_plan_payments()
returns json
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    json_agg(
      json_build_object(
        'id', payments.id,
        'paid_at', payments.paid_at,
        'plan', payments.plan,
        'amount', payments.amount,
        'status', payments.status
      )
      order by payments.sort_at desc
    ),
    '[]'::json
  )
  from (
    select
      bp.id,
      bp.paid_at,
      plans.display_name as plan,
      bp.amount_minor / 100.0 as amount,
      bp.status,
      coalesce(bp.paid_at, bp.created_at) as sort_at
    from public.billing_payments bp
    join public.host_subscriptions hs
      on hs.id = bp.subscription_id
      and hs.host_id = auth.uid()
    join public.billing_plans plans on plans.id = bp.plan_id
    where bp.host_id = auth.uid()
    order by coalesce(bp.paid_at, bp.created_at) desc
    limit 24
  ) payments;
$$;

revoke all on function public.host_booking_summary(date, date) from public, anon;
revoke all on function public.host_booking_trend(date, date, text) from public, anon;
revoke all on function public.host_listing_ranking(date, date) from public, anon;
revoke all on function public.host_reservation_summary(date, date) from public, anon;
revoke all on function public.host_review_summary() from public, anon;
revoke all on function public.host_plan_payments() from public, anon;

grant execute on function public.host_booking_summary(date, date) to authenticated;
grant execute on function public.host_booking_trend(date, date, text) to authenticated;
grant execute on function public.host_listing_ranking(date, date) to authenticated;
grant execute on function public.host_reservation_summary(date, date) to authenticated;
grant execute on function public.host_review_summary() to authenticated;
grant execute on function public.host_plan_payments() to authenticated;
