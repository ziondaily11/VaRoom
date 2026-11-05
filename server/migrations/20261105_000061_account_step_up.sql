-- Settings → Your Account: risk-based lock for contact details.
--
-- A session is "unlocked" when it was signed into (password, Google or code)
-- within the last 12 hours, or when it verified (password or Google) within
-- the last 24 hours; that verification belongs to the session and ends with
-- it. Otherwise it is locked: the contact details buyers use (Reach Out phone,
-- WhatsApp and email, and the account phone) can't be changed until the
-- person verifies. Enforced here, so going around the page doesn't help.
--
-- The sign-in time comes from the session's own token (`amr` timestamps),
-- which token refreshes don't move. Verifications are written by the server
-- only (server/lib/stepUp.js).
--
-- This file only adds the verification table and the check; it changes
-- nothing for the current app and is safe to apply before the code ships.
-- The rules that use the check are in 20261105_000062_contact_step_up_enforcement.sql.
-- Each statement is safe to re-run.

create table if not exists public.account_step_ups (
  session_id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  method text not null check (method in ('password', 'google')),
  verified_at timestamptz not null default now()
);
create index if not exists account_step_ups_user_idx on public.account_step_ups (user_id);
alter table public.account_step_ups enable row level security;
-- No policies: only the server (service role) reads and writes verifications.

-- Whether the current request's session may change protected details.
create or replace function public.varoom_session_unlocked()
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  claims jsonb := auth.jwt();
  signed_in_at double precision;
  sid uuid;
begin
  if claims is null or coalesce(claims ->> 'role', '') <> 'authenticated' then
    return false;
  end if;
  select max((entry ->> 'timestamp')::double precision) into signed_in_at
    from jsonb_array_elements(coalesce(claims -> 'amr', '[]'::jsonb)) as entry;
  if signed_in_at is not null and signed_in_at >= extract(epoch from now()) - 12 * 3600 then
    return true;
  end if;
  begin
    sid := (claims ->> 'session_id')::uuid;
  exception when others then
    return false;
  end;
  return exists (
    select 1 from public.account_step_ups s
    where s.session_id = sid and s.user_id = auth.uid() and s.verified_at > now() - interval '24 hours'
  );
end;
$$;

revoke all on function public.varoom_session_unlocked() from public, anon;
grant execute on function public.varoom_session_unlocked() to authenticated, service_role;

-- Rollback:
-- drop function public.varoom_session_unlocked(); drop table public.account_step_ups;
