-- Central admin operations. These are additive so existing listings and updates
-- keep working while administrators gain reversible moderation controls.

alter table public.listings
  add column if not exists moderation_status text not null default 'active',
  add column if not exists moderation_reason text,
  add column if not exists moderated_at timestamptz,
  add column if not exists moderated_by uuid references public.admins(id) on delete set null;

alter table public.listings drop constraint if exists listings_moderation_status_check;
alter table public.listings add constraint listings_moderation_status_check
  check (moderation_status in ('active', 'hidden', 'removed'));
create index if not exists listings_moderation_status_idx
  on public.listings (moderation_status, created_at desc);

-- The existing home feeds read this table. The additional lifecycle fields let
-- an admin publish, unpublish, remove and restore the same updates.
alter table public.varoom_updates
  add column if not exists title text,
  add column if not exists status text not null default 'published',
  add column if not exists published_at timestamptz,
  add column if not exists removed_at timestamptz,
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists created_by_admin_id uuid references public.admins(id) on delete set null,
  add column if not exists moderated_by uuid references public.admins(id) on delete set null,
  add column if not exists moderation_reason text;

alter table public.varoom_updates drop constraint if exists varoom_updates_status_check;
alter table public.varoom_updates add constraint varoom_updates_status_check
  check (status in ('draft', 'published', 'unpublished', 'removed'));
create index if not exists varoom_updates_status_idx
  on public.varoom_updates (status, published_at desc, created_at desc);

create table if not exists public.account_controls (
  user_id uuid primary key references auth.users(id) on delete cascade,
  status text not null default 'active' check (status in ('active', 'suspended', 'disabled')),
  reason text,
  changed_at timestamptz not null default now(),
  changed_by uuid references public.admins(id) on delete set null
);

create table if not exists public.admin_activity (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid references public.admins(id) on delete set null,
  action text not null,
  target_type text not null,
  target_id text not null,
  reason text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists admin_activity_created_idx on public.admin_activity(created_at desc);

alter table public.listing_reports drop constraint if exists listing_reports_status_check;
alter table public.listing_reports add constraint listing_reports_status_check
  check (status in ('pending', 'reviewed', 'actioned', 'dismissed', 'resolved'));
alter table public.chat_user_reports drop constraint if exists chat_user_reports_status_check;
alter table public.chat_user_reports add constraint chat_user_reports_status_check
  check (status in ('pending', 'reviewed', 'actioned', 'dismissed', 'resolved'));

-- A suspended/disabled account is rejected by the database before it can make
-- a booking, even if a stale browser bypasses the admin UI.
create or replace function public.varoom_block_restricted_booking()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from public.account_controls where user_id = new.client_id and status <> 'active')
     or exists (select 1 from public.account_controls where user_id = new.host_id and status <> 'active') then
    raise exception 'This account is not allowed to make bookings';
  end if;
  return new;
end;
$$;
drop trigger if exists varoom_block_restricted_booking_trigger on public.bookings;
create trigger varoom_block_restricted_booking_trigger before insert on public.bookings
for each row execute function public.varoom_block_restricted_booking();
