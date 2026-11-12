-- Team access, part 3b: Finance staff, and team notifications.
--
-- 1. varoom_acting_host(role): the company named in the X-VaRoom-Host request
--    header when the signed-in person may act for it with that role,
--    otherwise the person. Analytics and plan payments use it for Finance.
-- 2. Finance staff can read the company's listings (the analytics picker).
-- 3. A copy of the host's own notifications goes to the team members whose
--    role covers it: bookings, table reservations and reviews to Managers,
--    new messages to Messaging, payments to Finance. Each copy names the
--    company and follows the member's own notification switches.
-- Each statement is safe to re-run.

create or replace function public.varoom_acting_host(p_role text)
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_host uuid;
begin
  begin
    v_host := nullif(current_setting('request.headers', true)::json ->> 'x-varoom-host', '')::uuid;
  exception when others then
    v_host := null;
  end;
  if v_host is not null and public.varoom_can_act_for(v_host, p_role) then
    return v_host;
  end if;
  return auth.uid();
end;
$$;
revoke all on function public.varoom_acting_host(text) from public, anon;
grant execute on function public.varoom_acting_host(text) to authenticated, service_role;

drop policy if exists "Team finance can view the host's listings" on public.listings;
create policy "Team finance can view the host's listings" on public.listings
  for select using (public.varoom_can_act_for(host_id, 'finance'));

-- ---- Analytics and plan payments act for the company (Finance) ----
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
$function$;

CREATE OR REPLACE FUNCTION public.host_plan_payments()
 RETURNS json
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$

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

      and hs.host_id = public.varoom_acting_host('finance')

    join public.billing_plans plans on plans.id = bp.plan_id

    where bp.host_id = public.varoom_acting_host('finance')

    order by coalesce(bp.paid_at, bp.created_at) desc

    limit 24

  ) payments;

$function$;


-- ---- Team notifications ----
create or replace function public.varoom_notify_team()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
  v_host_name text;
begin
  if coalesce(new.metadata, '{}'::jsonb) ? 'team_host' then
    return new; -- already a team copy
  end if;
  v_role := case
    when new.type in ('booking_request', 'booking_cancelled', 'booking_expiring', 'table_reservation', 'new_review') then 'manager'
    when new.type = 'new_message' and new.related_entity_type = 'conversation' and exists (
      select 1 from public.conversations c where c.id = new.related_entity_id and c.host_id = new.recipient_user_id
    ) then 'messaging'
    when new.type in ('payment_success', 'payment_failed') then 'finance'
  end;
  if v_role is null then
    return new;
  end if;
  select coalesce(nullif(full_name, ''), '@' || username, 'Your team') into v_host_name
    from public.profiles where id = new.recipient_user_id;
  insert into public.notifications (user_id, recipient_user_id, actor_user_id, type, title, message,
    related_entity_type, related_entity_id, booking_id, metadata, read, event_key)
  select t.member_id, t.member_id, new.actor_user_id, new.type, v_host_name || ' · ' || new.title, new.message,
    new.related_entity_type, new.related_entity_id, new.booking_id,
    coalesce(new.metadata, '{}'::jsonb) || jsonb_build_object('team_host', new.recipient_user_id, 'team_host_name', v_host_name),
    false, new.event_key || ':team:' || t.member_id
  from public.host_team_members t
  where t.host_id = new.recipient_user_id and t.status = 'active' and v_role = any (t.roles)
  on conflict (event_key) do nothing;
  return new;
exception when others then
  raise warning 'Team notification failed for %: %', new.id, sqlerrm; -- never blocks the original
  return new;
end;
$$;

drop trigger if exists varoom_notify_team_trigger on public.notifications;
create trigger varoom_notify_team_trigger
  after insert on public.notifications
  for each row execute function public.varoom_notify_team();

-- Rollback:
-- drop trigger varoom_notify_team_trigger on public.notifications; drop function public.varoom_notify_team();
-- redefine host_analytics_overview / host_plan_payments with auth.uid() in place of varoom_acting_host('finance');
-- drop policy "Team finance can view the host's listings" on public.listings; drop function public.varoom_acting_host(text);
