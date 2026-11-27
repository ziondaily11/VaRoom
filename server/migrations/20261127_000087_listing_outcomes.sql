-- Host controls by niche: a property is rented or sold, an office leased, a shop rented
-- (docs/host-controls/OUTCOME_CONTROLS_PLAN.md).
--
-- 1. listings.availability_status takes 'sold', 'rented' and 'leased'. Like 'paused',
--    they keep a listing off Discover, the marketplace and new booking requests.
-- 2. listings.under_offer: a sale property with an offer in progress stays live, with a badge.
-- 3. listing_outcomes: one permanent record per outcome (units, optional agreed price,
--    since when it was live), for analytics. Undo voids a record; nothing is deleted.
-- 4. record_listing_outcome / void_listing_outcome: called by the server (service role)
--    after it has resolved the acting host; each runs in one transaction with the listing locked.
--
-- Check before running (read only; every value must be one of the five current ones):
--   select availability_status, count(*) from public.listings group by 1 order by 1;

alter table public.listings drop constraint if exists listings_availability_status_check;
alter table public.listings add constraint listings_availability_status_check
  check (availability_status in ('available', 'booked', 'unavailable', 'paused', 'draft', 'sold', 'rented', 'leased'));

alter table public.listings add column if not exists under_offer boolean not null default false;
comment on column public.listings.under_offer is
  'Sale property with an offer in progress: still live and contactable, shown with an Under offer badge. Cleared when sold.';

create table if not exists public.listing_outcomes (
  id uuid primary key default gen_random_uuid(),
  -- Kept when the listing is deleted, so the host's counts never go backwards.
  listing_id uuid references public.listings(id) on delete set null,
  host_id uuid not null references public.profiles(id) on delete cascade,
  category text not null check (category in ('property', 'office', 'shop')),
  outcome text not null check (outcome in ('sold', 'rented', 'leased')),
  units integer not null default 1 check (units >= 1),
  -- What the host entered: the monthly rent for rented / leased, the total for sold.
  agreed_amount numeric(14, 2) check (agreed_amount is null or agreed_amount >= 0),
  listed_since timestamptz,
  booking_id uuid references public.bookings(id) on delete set null,
  -- For Undo: the listing's status before this record.
  previous_status text not null,
  recorded_at timestamptz not null default now(),
  voided_at timestamptz
);

create index if not exists listing_outcomes_host_recorded_idx
  on public.listing_outcomes (host_id, recorded_at) where voided_at is null;
create index if not exists listing_outcomes_listing_idx on public.listing_outcomes (listing_id, recorded_at);
-- One outcome per approved request.
create unique index if not exists listing_outcomes_booking_once_idx
  on public.listing_outcomes (booking_id) where booking_id is not null and voided_at is null;

alter table public.listing_outcomes enable row level security;
drop policy if exists "Hosts read their own listing outcomes" on public.listing_outcomes;
create policy "Hosts read their own listing outcomes" on public.listing_outcomes
  for select to authenticated using (host_id = auth.uid());
revoke insert, update, delete on public.listing_outcomes from anon, authenticated;

create or replace function public.record_listing_outcome(
  p_host uuid, p_listing uuid, p_outcome text, p_units integer default 1, p_amount numeric default null, p_booking uuid default null
) returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_listing public.listings%rowtype;
  v_purpose text;
  v_units integer;
  v_left integer;
  v_status text;
  v_id uuid;
begin
  select * into v_listing from public.listings where id = p_listing and host_id = p_host for update;
  if not found then
    return jsonb_build_object('code', 'LISTING_NOT_FOUND', 'error', 'Listing not found');
  end if;
  if v_listing.publication_state is distinct from 'published' or v_listing.availability_status in ('draft', 'sold', 'rented', 'leased') then
    return jsonb_build_object('code', 'LISTING_NOT_MARKABLE', 'error', 'Only a published listing that is not already marked can be marked.');
  end if;
  select coalesce(v_listing.listing_purpose, d.listing_purpose, 'rent'), d.units_available
    into v_purpose, v_units
    from (select 1) one left join public.listing_booking_details d on d.listing_id = p_listing;
  if not (
    (v_listing.category = 'property' and ((p_outcome = 'rented' and v_purpose in ('rent', 'both')) or (p_outcome = 'sold' and v_purpose in ('sale', 'both'))))
    or (v_listing.category = 'office' and p_outcome = 'leased')
    or (v_listing.category = 'shop' and p_outcome = 'rented')
  ) then
    return jsonb_build_object('code', 'OUTCOME_NOT_ALLOWED', 'error', 'This listing cannot be marked that way.');
  end if;
  -- Only properties count units; offices and shops are marked as a whole.
  v_units := case when v_listing.category = 'property' then coalesce(v_units, 1) else 1 end;
  if p_units is null or p_units < 1 or p_units > v_units then
    return jsonb_build_object('code', 'UNITS_INVALID', 'error', format('Choose between 1 and %s units.', v_units));
  end if;
  if p_amount is not null and (p_amount < 0 or p_amount >= 1000000000000) then
    return jsonb_build_object('code', 'AMOUNT_INVALID', 'error', 'Enter a valid price.');
  end if;
  if p_booking is not null and not exists (
    select 1 from public.bookings b where b.id = p_booking and b.listing_id = p_listing and b.host_id = p_host
      and b.status = 'approved' and b.lease_months is not null
  ) then
    return jsonb_build_object('code', 'BOOKING_INVALID', 'error', 'That request is not an approved rental for this listing.');
  end if;
  if p_booking is not null and exists (select 1 from public.listing_outcomes o where o.booking_id = p_booking and o.voided_at is null) then
    return jsonb_build_object('code', 'BOOKING_ALREADY_COUNTED', 'error', 'That request has already been counted.');
  end if;

  v_left := v_units - p_units;
  v_status := case when v_left = 0 then p_outcome else v_listing.availability_status end;
  insert into public.listing_outcomes (listing_id, host_id, category, outcome, units, agreed_amount, listed_since, booking_id, previous_status)
  values (p_listing, p_host, v_listing.category, p_outcome, p_units, p_amount, v_listing.live_since, p_booking, v_listing.availability_status)
  returning id into v_id;
  -- The last unit takes the listing off the marketplace; earlier units count down.
  if v_left = 0 then
    update public.listings set availability_status = p_outcome, under_offer = false where id = p_listing;
  else
    update public.listing_booking_details set units_available = v_left where listing_id = p_listing;
    if p_outcome = 'sold' then update public.listings set under_offer = false where id = p_listing; end if;
  end if;
  return jsonb_build_object('outcome', jsonb_build_object('id', v_id, 'outcome', p_outcome, 'units', p_units),
    'listing', jsonb_build_object('id', p_listing, 'availability_status', v_status,
      'under_offer', case when v_left = 0 or p_outcome = 'sold' then false else v_listing.under_offer end,
      'units_available', case when v_left = 0 then v_units else v_left end));
end;
$function$;

-- Undo within 10 minutes: only the listing's latest record, so units and status restore exactly.
create or replace function public.void_listing_outcome(p_host uuid, p_outcome uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_outcome public.listing_outcomes%rowtype;
  v_listing public.listings%rowtype;
  v_units integer;
  v_status text;
begin
  -- The listing is locked first, in the same order as record_listing_outcome.
  select l.* into v_listing from public.listings l
    join public.listing_outcomes o on o.listing_id = l.id
    where o.id = p_outcome and o.host_id = p_host
    for update of l;
  select * into v_outcome from public.listing_outcomes where id = p_outcome and host_id = p_host and voided_at is null for update;
  if not found or v_listing.id is null then
    return jsonb_build_object('code', 'OUTCOME_NOT_FOUND', 'error', 'Nothing to undo.');
  end if;
  if v_outcome.recorded_at < now() - interval '10 minutes' then
    return jsonb_build_object('code', 'UNDO_EXPIRED', 'error', 'It is too late to undo this.');
  end if;
  if exists (select 1 from public.listing_outcomes o where o.listing_id = v_outcome.listing_id and o.voided_at is null
      and (o.recorded_at, o.id) > (v_outcome.recorded_at, v_outcome.id)) then
    return jsonb_build_object('code', 'UNDO_NOT_LATEST', 'error', 'Undo the most recent change first.');
  end if;
  update public.listing_outcomes set voided_at = now() where id = p_outcome;
  select units_available into v_units from public.listing_booking_details where listing_id = v_outcome.listing_id;
  if v_listing.availability_status = v_outcome.outcome then
    -- The last unit went: units were left as they were, so only the status comes back.
    -- A listing whose online period ended meanwhile comes back paused.
    v_status := case when v_outcome.previous_status = 'available' and not (v_listing.live_until > now()) then 'paused' else v_outcome.previous_status end;
    update public.listings set availability_status = v_status where id = v_listing.id;
  else
    v_status := v_listing.availability_status;
    v_units := coalesce(v_units, 0) + v_outcome.units;
    update public.listing_booking_details set units_available = v_units where listing_id = v_listing.id;
  end if;
  return jsonb_build_object('listing', jsonb_build_object('id', v_listing.id, 'availability_status', v_status,
    'under_offer', v_listing.under_offer, 'units_available', v_units));
end;
$function$;

revoke all on function public.record_listing_outcome(uuid, uuid, text, integer, numeric, uuid) from public, anon, authenticated;
revoke all on function public.void_listing_outcome(uuid, uuid) from public, anon, authenticated;
grant execute on function public.record_listing_outcome(uuid, uuid, text, integer, numeric, uuid) to service_role;
grant execute on function public.void_listing_outcome(uuid, uuid) to service_role;

-- Undo (only while nothing has been marked: listings marked sold / rented / leased must be set back first):
--   drop function if exists public.void_listing_outcome(uuid, uuid);
--   drop function if exists public.record_listing_outcome(uuid, uuid, text, integer, numeric, uuid);
--   drop table if exists public.listing_outcomes;
--   alter table public.listings drop column if exists under_offer;
--   update public.listings set availability_status = 'paused' where availability_status in ('sold', 'rented', 'leased');
--   alter table public.listings drop constraint if exists listings_availability_status_check;
--   alter table public.listings add constraint listings_availability_status_check
--     check (availability_status in ('available', 'booked', 'unavailable', 'paused', 'draft'));
