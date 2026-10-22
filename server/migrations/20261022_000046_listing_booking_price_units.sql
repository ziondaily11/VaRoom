-- The listing API accepts the same canonical pricing units as the listing
-- form. Office and Shop pricing introduced area, desk, and turnover units;
-- these were not present in the original database's month/night values.
--
-- Read-only production inspection on 2026-10-22 found only month/night in
-- existing listing_booking_details rows. Preserve those values while making
-- the complete API-supported set valid for all niches.
do $$
declare
  price_unit_check record;
begin
  -- Also remove this migration's own single-column check on a safe rerun.
  alter table public.listing_booking_details
    drop constraint if exists listing_booking_details_price_unit_check;

  for price_unit_check in
    select conname, pg_get_constraintdef(oid) as definition
    from pg_constraint
    where conrelid = 'public.listing_booking_details'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ~* '^\s*check\s*\(\s*\(*\s*"?price_unit"?\s*\)*\s*(::\s*[a-z ]+)?\s*(=|in\b)'
      and pg_get_constraintdef(oid) !~* '\m(and|or)\M'
  loop
    execute format(
      'alter table public.listing_booking_details drop constraint %I',
      price_unit_check.conname
    );
  end loop;
end;
$$;

alter table public.listing_booking_details
  add constraint listing_booking_details_price_unit_check
  check (
    price_unit is null
    or price_unit in (
      'hour', 'day', 'week', 'night', 'month', 'year',
      'sq_ft', 'm2', 'desk', 'turnover'
    )
  ) not valid;

alter table public.listing_booking_details
  validate constraint listing_booking_details_price_unit_check;

comment on constraint listing_booking_details_price_unit_check
  on public.listing_booking_details is
  'Pricing units accepted by the listing API for property, hospitality, office, and shop listings.';
