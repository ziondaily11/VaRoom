-- Booking defaults and booking rules.
--
-- 1. Hosts keep booking defaults (Settings → Bookings) that pre-fill new listings.
-- 2. Each stay listing (airbnb, hotel, venue) can take bookings instantly and set
--    minimum notice, how far ahead guests can book, and a maximum stay.
-- 3. The database enforces the rules when a booking is created (guests insert
--    bookings from the browser, so the page alone can't be trusted): notice,
--    booking window, minimum and maximum stay, and no overlap with a pending or
--    approved booking. The status is decided here, so a guest can no longer
--    create a booking that is already approved.
-- 4. The status list gains 'cancelled' and 'completed', which the app already
--    writes and shows (a guest's cancellation was refused by the old list).
-- Each statement is safe to re-run.

-- ---- Listing rules ----
alter table public.listing_booking_details
  add column if not exists instant_book boolean not null default false,
  add column if not exists min_notice_days integer,
  add column if not exists max_advance_days integer,
  add column if not exists max_stay_nights integer;

alter table public.listing_booking_details drop constraint if exists listing_booking_details_min_notice_days_check;
alter table public.listing_booking_details add constraint listing_booking_details_min_notice_days_check
  check (min_notice_days is null or min_notice_days between 0 and 365);
alter table public.listing_booking_details drop constraint if exists listing_booking_details_max_advance_days_check;
alter table public.listing_booking_details add constraint listing_booking_details_max_advance_days_check
  check (max_advance_days is null or max_advance_days between 1 and 1095);
alter table public.listing_booking_details drop constraint if exists listing_booking_details_max_stay_nights_check;
alter table public.listing_booking_details add constraint listing_booking_details_max_stay_nights_check
  check (max_stay_nights is null or max_stay_nights between 1 and 100000);

-- ---- Host defaults ----
create table if not exists public.host_booking_defaults (
  host_id uuid primary key references public.profiles (id) on delete cascade,
  instant_book boolean not null default false,
  min_notice_days integer check (min_notice_days is null or min_notice_days between 0 and 365),
  max_advance_days integer check (max_advance_days is null or max_advance_days between 1 and 1095),
  min_stay_nights integer check (min_stay_nights is null or min_stay_nights between 1 and 100000),
  max_stay_nights integer check (max_stay_nights is null or max_stay_nights between 1 and 100000),
  checkin_time text check (checkin_time is null or checkin_time ~ '^\d{2}:\d{2}$'),
  checkout_time text check (checkout_time is null or checkout_time ~ '^\d{2}:\d{2}$'),
  cancellation_policy text not null default 'moderate' check (cancellation_policy in ('flexible', 'moderate', 'strict')),
  updated_at timestamptz not null default now(),
  check (min_stay_nights is null or max_stay_nights is null or min_stay_nights <= max_stay_nights)
);
alter table public.host_booking_defaults enable row level security;

drop policy if exists "Hosts read their booking defaults" on public.host_booking_defaults;
create policy "Hosts read their booking defaults" on public.host_booking_defaults
  for select using (host_id = auth.uid());
drop policy if exists "Hosts add their booking defaults" on public.host_booking_defaults;
create policy "Hosts add their booking defaults" on public.host_booking_defaults
  for insert with check (host_id = auth.uid());
drop policy if exists "Hosts change their booking defaults" on public.host_booking_defaults;
create policy "Hosts change their booking defaults" on public.host_booking_defaults
  for update using (host_id = auth.uid()) with check (host_id = auth.uid());

revoke all on public.host_booking_defaults from anon;
grant select, insert, update on public.host_booking_defaults to authenticated;

-- ---- Statuses the app uses ----
alter table public.bookings drop constraint if exists bookings_status_check;
alter table public.bookings add constraint bookings_status_check
  check (status in ('pending', 'approved', 'declined', 'expired', 'cancelled', 'completed'));

-- ---- Rules applied to every new booking ----
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
  nights integer;
  has_rules boolean;
begin
  select d.instant_book, d.min_notice_days, d.max_advance_days, d.min_stay_nights, d.max_stay_nights
    into rules
    from public.listing_booking_details d
    where d.listing_id = new.listing_id;
  has_rules := found;

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
    if has_rules and rules.max_advance_days is not null and first_day > today + rules.max_advance_days then
      raise exception 'booking_rule: This host takes bookings up to % days ahead.', rules.max_advance_days;
    end if;
  end if;

  -- Nightly stays: a check-in and a check-out.
  if new.start_date is not null and new.end_date is not null then
    if new.end_date <= new.start_date then
      raise exception 'booking_rule: Check-out must be after check-in.';
    end if;
    nights := new.end_date - new.start_date;
    if has_rules and rules.min_stay_nights is not null and nights < rules.min_stay_nights then
      raise exception 'booking_rule: The minimum stay is % night(s).', rules.min_stay_nights;
    end if;
    if has_rules and rules.max_stay_nights is not null and nights > rules.max_stay_nights then
      raise exception 'booking_rule: The maximum stay is % night(s).', rules.max_stay_nights;
    end if;
    -- One booking at a time per listing, so two guests can't take the same nights.
    perform pg_advisory_xact_lock(hashtext('varoom-booking:' || new.listing_id::text));
    if exists (
      select 1 from public.bookings b
      where b.listing_id = new.listing_id
        and b.status in ('pending', 'approved')
        and b.start_date is not null and b.end_date is not null
        and b.start_date <= new.end_date and b.end_date >= new.start_date
    ) then
      raise exception 'booking_rule: Those dates were just booked. Please choose other dates.';
    end if;
  end if;
  return new;
end;
$$;

-- BEFORE triggers run in name order: the rules, then the existing checks, then
-- the location snapshot (which now also covers instantly approved bookings).
drop trigger if exists varoom_apply_booking_rules_trigger on public.bookings;
create trigger varoom_apply_booking_rules_trigger
  before insert on public.bookings
  for each row execute function public.varoom_apply_booking_rules();

drop trigger if exists varoom_snapshot_booking_location_trigger on public.bookings;
create trigger varoom_snapshot_booking_location_trigger
  before insert or update on public.bookings
  for each row execute function public.varoom_snapshot_booking_location();

-- ---- Guests cancel their own bookings ----
-- Only hosts could update bookings, so the guest's Cancel always failed
-- ("This booking can no longer be cancelled"). A guest may now move their own
-- pending or approved booking to 'cancelled', and change nothing else.
drop policy if exists "Guests can cancel their own bookings" on public.bookings;
create policy "Guests can cancel their own bookings" on public.bookings
  for update using (auth.uid() = client_id and status in ('pending', 'approved'))
  with check (auth.uid() = client_id and status = 'cancelled');

create or replace function public.varoom_guard_guest_booking_update()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if auth.uid() is not null and auth.uid() = old.client_id and auth.uid() is distinct from old.host_id
     and (to_jsonb(new) - 'status') is distinct from (to_jsonb(old) - 'status') then
    raise exception 'booking_rule: Only the booking status can be changed.';
  end if;
  return new;
end;
$$;

drop trigger if exists varoom_guard_guest_booking_update_trigger on public.bookings;
create trigger varoom_guard_guest_booking_update_trigger
  before update on public.bookings
  for each row execute function public.varoom_guard_guest_booking_update();

-- Rollback:
-- drop policy "Guests can cancel their own bookings" on public.bookings;
-- drop trigger varoom_guard_guest_booking_update_trigger on public.bookings; drop function public.varoom_guard_guest_booking_update();
-- drop trigger varoom_apply_booking_rules_trigger on public.bookings; drop function public.varoom_apply_booking_rules();
-- drop trigger varoom_snapshot_booking_location_trigger on public.bookings;
-- create trigger varoom_snapshot_booking_location_trigger before update on public.bookings for each row execute function public.varoom_snapshot_booking_location();
-- drop table public.host_booking_defaults;
-- alter table public.listing_booking_details drop column instant_book, drop column min_notice_days, drop column max_advance_days, drop column max_stay_nights;
