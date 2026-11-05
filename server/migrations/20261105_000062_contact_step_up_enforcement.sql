-- Enforce the Your Account lock for contact details (see 20261105_000061).
--
-- Apply AFTER the code that records verifications (POST /api/account/verify-password)
-- is deployed: the app before it checks passwords in the browser only, so a
-- verified stale session would still be refused here.
-- Each statement is safe to re-run.

-- Reach Out contact details: owners change them only from an unlocked session.
drop policy if exists "Owners add their contact settings" on public.profile_contact_settings;
create policy "Owners add their contact settings" on public.profile_contact_settings
  for insert with check (profile_id = auth.uid() and public.varoom_session_unlocked());

drop policy if exists "Owners change their contact settings" on public.profile_contact_settings;
create policy "Owners change their contact settings" on public.profile_contact_settings
  for update using (profile_id = auth.uid())
  with check (profile_id = auth.uid() and public.varoom_session_unlocked());

-- The account phone (onboarding sets it from a fresh session, so that still works).
create or replace function public.varoom_guard_contact_columns()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if coalesce(auth.role(), '') in ('anon', 'authenticated')
     and new.phone is distinct from old.phone
     and not public.varoom_session_unlocked() then
    raise exception 'step_up_required: verify your identity to change your phone number';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_guard_contact_columns on public.profiles;
create trigger profiles_guard_contact_columns
  before update on public.profiles
  for each row execute function public.varoom_guard_contact_columns();

-- Rollback:
-- drop trigger profiles_guard_contact_columns on public.profiles; drop function public.varoom_guard_contact_columns();
-- drop policy "Owners change their contact settings" on public.profile_contact_settings;
-- create policy "Owners change their contact settings" on public.profile_contact_settings for update using (profile_id = auth.uid()) with check (profile_id = auth.uid());
-- drop policy "Owners add their contact settings" on public.profile_contact_settings;
-- create policy "Owners add their contact settings" on public.profile_contact_settings for insert with check (profile_id = auth.uid());
