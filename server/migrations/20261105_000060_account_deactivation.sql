-- Account deactivation (Privacy Policy and Terms → "Account Deletion").
--
-- Deleting an account first deactivates it for 30 days; "Deactivate account"
-- does the same with no deadline. While deactivated, the profile, listings
-- and other content are not available to other users; signing in again
-- restores everything. The server permanently deletes accounts whose
-- deletion_scheduled_for has passed (server/lib/accountDeactivation.js).
--
-- Each statement is safe to re-run.

alter table public.profiles add column if not exists deactivated_at timestamptz;
alter table public.profiles add column if not exists deletion_scheduled_for timestamptz;

alter table public.profiles drop constraint if exists profiles_deletion_needs_deactivation;
alter table public.profiles add constraint profiles_deletion_needs_deactivation
  check (deletion_scheduled_for is null or deactivated_at is not null);

create index if not exists profiles_deletion_due_idx
  on public.profiles (deletion_scheduled_for) where deletion_scheduled_for is not null;
create index if not exists profiles_deactivated_idx
  on public.profiles (id) where deactivated_at is not null;

-- Only the server (service role) changes these: a signed-in person cannot
-- schedule, clear or fake a deactivation through the public API.
create or replace function public.varoom_guard_deactivation_columns()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if coalesce(auth.role(), '') in ('anon', 'authenticated')
     and (new.deactivated_at is distinct from old.deactivated_at
          or new.deletion_scheduled_for is distinct from old.deletion_scheduled_for) then
    raise exception 'Account deactivation is managed by VaRoom';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_guard_deactivation_columns on public.profiles;
create trigger profiles_guard_deactivation_columns
  before update on public.profiles
  for each row execute function public.varoom_guard_deactivation_columns();

-- Whether an account is active (not deactivated). Security definer so
-- policies can use it whatever the profiles read rules become.
create or replace function public.varoom_account_active(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select not exists (
    select 1 from public.profiles where id = p_user_id and deactivated_at is not null
  );
$$;

revoke all on function public.varoom_account_active(uuid) from public;
grant execute on function public.varoom_account_active(uuid) to anon, authenticated, service_role;

-- Published listings and their photos: hidden while the host is deactivated.
drop policy if exists "listings_published_public_select" on public.listings;
create policy "listings_published_public_select" on public.listings
  for select to anon, authenticated
  using (publication_state = 'published' and moderation_status = 'active' and public.varoom_account_active(host_id));

drop policy if exists "listing_photos_published_select" on public.listing_photos;
create policy "listing_photos_published_select" on public.listing_photos
  for select to anon, authenticated
  using (exists (
    select 1 from public.listings l
    where l.id = listing_photos.listing_id
      and l.publication_state = 'published'
      and l.moderation_status = 'active'
      and public.varoom_account_active(l.host_id)
  ));

-- No new booking requests to a deactivated host.
drop policy if exists "Clients can create a booking request" on public.bookings;
create policy "Clients can create a booking request" on public.bookings
  for insert to public
  with check (auth.uid() = client_id and public.varoom_account_active(host_id));

-- Rollback:
-- drop policy "Clients can create a booking request" on public.bookings;
-- create policy "Clients can create a booking request" on public.bookings for insert with check (auth.uid() = client_id);
-- drop policy "listing_photos_published_select" on public.listing_photos;
-- create policy "listing_photos_published_select" on public.listing_photos for select to anon, authenticated
--   using (exists (select 1 from public.listings l where l.id = listing_photos.listing_id and l.publication_state = 'published' and l.moderation_status = 'active'));
-- drop policy "listings_published_public_select" on public.listings;
-- create policy "listings_published_public_select" on public.listings for select to anon, authenticated
--   using (publication_state = 'published' and moderation_status = 'active');
-- drop trigger profiles_guard_deactivation_columns on public.profiles;
-- drop function public.varoom_guard_deactivation_columns(); drop function public.varoom_account_active(uuid);
-- alter table public.profiles drop column deletion_scheduled_for, drop column deactivated_at;
