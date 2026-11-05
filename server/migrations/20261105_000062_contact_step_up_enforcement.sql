-- Enforce the Your Account lock (see 20261105_000061): contact details,
-- and the account's full name, username and phone.
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

-- The account's identity and phone: full name, username and phone are
-- changed in Settings → Your Account only. Accounts still in onboarding are
-- exempt (someone may finish onboarding days after signing up, on the same
-- session); the sign-in callback writes the name from a fresh session.
drop trigger if exists profiles_guard_contact_columns on public.profiles;
drop function if exists public.varoom_guard_contact_columns();

create or replace function public.varoom_guard_account_details()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if coalesce(auth.role(), '') in ('anon', 'authenticated')
     and coalesce(old.onboarding_completed, false)
     and (new.phone is distinct from old.phone
          or new.full_name is distinct from old.full_name
          or new.username is distinct from old.username)
     and not public.varoom_session_unlocked() then
    raise exception 'step_up_required: verify your identity to change your account details';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_guard_account_details on public.profiles;
create trigger profiles_guard_account_details
  before update on public.profiles
  for each row execute function public.varoom_guard_account_details();

-- Rollback:
-- drop trigger profiles_guard_account_details on public.profiles; drop function public.varoom_guard_account_details();
-- drop policy "Owners change their contact settings" on public.profile_contact_settings;
-- create policy "Owners change their contact settings" on public.profile_contact_settings for update using (profile_id = auth.uid()) with check (profile_id = auth.uid());
-- drop policy "Owners add their contact settings" on public.profile_contact_settings;
-- create policy "Owners add their contact settings" on public.profile_contact_settings for insert with check (profile_id = auth.uid());
