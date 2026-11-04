-- Reach Out: how prospective clients contact a listing owner from the
-- booking page (WhatsApp, email, phone).
-- Review and apply manually; the application never runs migrations.
-- Apply before deploying the client that calls listing_contact.
--
-- The contact details live in their own owner-only table, not on profiles:
-- profiles is readable by everyone, and a contact email must not be.
-- No row, or an empty value, means "use the account's details": the
-- registration phone (profiles.phone) and the login email (auth.users).
-- Nothing is copied, so existing accounts need no backfill and a value the
-- owner customised is never overwritten.
create table if not exists public.profile_contact_settings (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  phone text,
  whatsapp text,
  email text,
  whatsapp_enabled boolean not null default true,
  email_enabled boolean not null default true,
  phone_enabled boolean not null default true,
  updated_at timestamptz not null default now(),
  constraint profile_contact_settings_phone_format check (phone is null or phone ~ '^\+[0-9]{9,15}$'),
  constraint profile_contact_settings_whatsapp_format check (whatsapp is null or whatsapp ~ '^\+[0-9]{9,15}$'),
  constraint profile_contact_settings_email_format check (email is null or (length(email) <= 254 and email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'))
);

alter table public.profile_contact_settings enable row level security;

drop policy if exists "Owners read their contact settings" on public.profile_contact_settings;
create policy "Owners read their contact settings"
  on public.profile_contact_settings for select to authenticated
  using (profile_id = auth.uid());

drop policy if exists "Owners add their contact settings" on public.profile_contact_settings;
create policy "Owners add their contact settings"
  on public.profile_contact_settings for insert to authenticated
  with check (profile_id = auth.uid());

drop policy if exists "Owners change their contact settings" on public.profile_contact_settings;
create policy "Owners change their contact settings"
  on public.profile_contact_settings for update to authenticated
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

revoke all on public.profile_contact_settings from anon;
grant select, insert, update on public.profile_contact_settings to authenticated;

-- What the booking page may show for a listing: the owner's details for each
-- channel they left on, null for a channel that is off or has no value. A
-- channel that is off never leaves the database. WhatsApp falls back to the
-- contact phone, then the registration phone. Signed-in people only, and
-- only for listings they can see (published and active, or their own).
create or replace function public.listing_contact(p_listing_id uuid)
returns table (whatsapp text, email text, phone text)
language sql
stable
security definer
set search_path = ''
as $$
  select
    case when coalesce(s.whatsapp_enabled, true)
      then coalesce(nullif(btrim(s.whatsapp), ''), nullif(btrim(s.phone), ''), nullif(btrim(p.phone), '')) end,
    case when coalesce(s.email_enabled, true)
      then coalesce(nullif(btrim(s.email), ''), nullif(btrim(u.email), '')) end,
    case when coalesce(s.phone_enabled, true)
      then coalesce(nullif(btrim(s.phone), ''), nullif(btrim(p.phone), '')) end
  from public.listings l
  join public.profiles p on p.id = l.host_id
  left join auth.users u on u.id = l.host_id
  left join public.profile_contact_settings s on s.profile_id = l.host_id
  where l.id = p_listing_id
    and auth.uid() is not null
    and ((l.publication_state = 'published' and l.moderation_status = 'active') or l.host_id = auth.uid());
$$;

revoke all on function public.listing_contact(uuid) from public, anon;
grant execute on function public.listing_contact(uuid) to authenticated;

-- Rollback (run only to undo this migration):
-- drop function if exists public.listing_contact(uuid);
-- drop table if exists public.profile_contact_settings;
