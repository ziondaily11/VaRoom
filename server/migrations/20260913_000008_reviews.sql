-- Reviews table for VaRoom
-- 1. Core reviews table
create table if not exists public.reviews (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  listing_id uuid not null references public.listings(id),
  host_id uuid not null references public.profiles(id),
  client_id uuid not null references public.profiles(id),
  rating smallint not null check (rating >= 1 and rating <= 5),
  comment text not null,
  status text not null default 'published' check (status in ('published','removed','pending')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists reviews_booking_id_key on public.reviews (booking_id);
create index if not exists reviews_listing_id_idx on public.reviews (listing_id, created_at);
create index if not exists reviews_host_id_idx on public.reviews (host_id, created_at);

-- 2. Auto-update updated_at
create or replace function public.varoom_update_reviews_timestamp()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists varoom_update_reviews_timestamp_trigger on public.reviews;
create trigger varoom_update_reviews_timestamp_trigger
  before update on public.reviews
  for each row
  execute function public.varoom_update_reviews_timestamp();

-- 3. Row-level security: enable and policies
alter table public.reviews enable row level security;

-- Public read access: anyone can read reviews
drop policy if exists reviews_public_select on public.reviews;
create policy reviews_public_select
  on public.reviews for select to public
  using (true);

-- Insert guard: only an authenticated user who is the booking client for the
-- referenced booking and the booking is in an eligible status may insert.
drop policy if exists reviews_insert_allowed on public.reviews;
create policy reviews_insert_allowed
  on public.reviews for insert to authenticated
  with check (
    client_id = auth.uid()
    and status = 'published'
    and exists (
      select 1 from public.bookings b
      where b.id = public.reviews.booking_id
        and b.client_id = auth.uid()
        and b.listing_id = public.reviews.listing_id
        and b.status in ('approved','completed')
    )
    and exists (
      select 1 from public.listings l
      where l.id = public.reviews.listing_id
        and l.host_id = public.reviews.host_id
    )
  );

-- Update/delete: only the original client may modify their review.
drop policy if exists reviews_owner_update on public.reviews;
create policy reviews_owner_update
  on public.reviews for update to authenticated
  using (client_id = auth.uid())
  with check (client_id = auth.uid());

drop policy if exists reviews_owner_delete on public.reviews;
create policy reviews_owner_delete
  on public.reviews for delete to authenticated
  using (client_id = auth.uid());

-- Note: administrative/service-role operations using the server-side service key bypass RLS.

comment on table public.reviews is $$Verified reviews tied to completed bookings. Insert policy ensures only the booking's client can create a review for an eligible booking.$$;
comment on column public.reviews.comment is $$User-provided written review text. Stored as plain text.$$;
