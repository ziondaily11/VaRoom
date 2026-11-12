-- Team access, part 1: teams, and bookings for Managers.
--
-- A host invites people (their own VaRoom accounts) by username and gives them
-- roles: manager (listings and bookings), messaging (chats), finance (billing
-- and analytics). The invitee accepts or declines. The owner alone manages the
-- team; a member can leave. Changes go through the functions below, which
-- check who may do what; the table has no write policies.
--
-- varoom_can_act_for(host, role): the host themselves, or an active member
-- with that role. Bookings and listings (read) use it now; the rest of a
-- host's data follows as each part ships.
-- Each statement is safe to re-run.

create table if not exists public.host_team_members (
  host_id uuid not null references public.profiles (id) on delete cascade,
  member_id uuid not null references public.profiles (id) on delete cascade,
  roles text[] not null check (cardinality(roles) between 1 and 3 and roles <@ array['manager', 'messaging', 'finance']),
  status text not null default 'invited' check (status in ('invited', 'active')),
  invited_at timestamptz not null default now(),
  accepted_at timestamptz,
  primary key (host_id, member_id),
  check (host_id <> member_id)
);
create index if not exists host_team_members_member_idx on public.host_team_members (member_id);
alter table public.host_team_members enable row level security;

drop policy if exists "Owners and members see their team rows" on public.host_team_members;
create policy "Owners and members see their team rows" on public.host_team_members
  for select using (host_id = auth.uid() or member_id = auth.uid());
revoke all on public.host_team_members from anon;
revoke insert, update, delete on public.host_team_members from authenticated;
grant select on public.host_team_members to authenticated;

create or replace function public.varoom_can_act_for(p_host uuid, p_role text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() = p_host or exists (
    select 1 from public.host_team_members t
    where t.host_id = p_host and t.member_id = auth.uid() and t.status = 'active' and p_role = any (t.roles)
  );
$$;
revoke all on function public.varoom_can_act_for(uuid, text) from public, anon;
grant execute on function public.varoom_can_act_for(uuid, text) to authenticated, service_role;

-- ---- Managing the team ----
create or replace function public.varoom_team_invite(p_username text, p_roles text[])
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_member uuid;
  v_host_name text;
begin
  if not exists (select 1 from public.profiles where id = auth.uid() and role = 'host') then
    raise exception 'team: Only host accounts can have a team.';
  end if;
  select id into v_member from public.profiles where lower(username) = lower(regexp_replace(trim(p_username), '^@+', ''));
  if v_member is null then raise exception 'team: No VaRoom account has that username.'; end if;
  if v_member = auth.uid() then raise exception 'team: You are already the owner.'; end if;
  if (select count(*) from public.host_team_members where host_id = auth.uid()) >= 20
     and not exists (select 1 from public.host_team_members where host_id = auth.uid() and member_id = v_member) then
    raise exception 'team: A team can have up to 20 people.';
  end if;
  insert into public.host_team_members (host_id, member_id, roles)
    values (auth.uid(), v_member, p_roles)
    on conflict (host_id, member_id) do update set roles = excluded.roles;
  select coalesce(nullif(full_name, ''), '@' || username, 'A host') into v_host_name from public.profiles where id = auth.uid();
  insert into public.notifications (user_id, recipient_user_id, actor_user_id, type, title, message, related_entity_type, related_entity_id, read, event_key)
    values (v_member, v_member, auth.uid(), 'team_invite', 'Team invitation',
      format('%s invited you to their team on VaRoom. Accept it in Settings → Team.', v_host_name),
      'team', auth.uid(), false, 'team-invite:' || auth.uid() || ':' || v_member)
    on conflict (event_key) do nothing;
  return v_member;
end;
$$;

create or replace function public.varoom_team_set_roles(p_member uuid, p_roles text[])
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.host_team_members set roles = p_roles where host_id = auth.uid() and member_id = p_member;
  if not found then raise exception 'team: That person is not on your team.'; end if;
end;
$$;

-- The member accepts an invitation.
create or replace function public.varoom_team_accept(p_host uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.host_team_members set status = 'active', accepted_at = now()
    where host_id = p_host and member_id = auth.uid() and status = 'invited';
  if not found then raise exception 'team: That invitation is no longer open.'; end if;
end;
$$;

-- The owner removes someone, or a member declines or leaves.
create or replace function public.varoom_team_remove(p_host uuid, p_member uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is distinct from p_host and auth.uid() is distinct from p_member then
    raise exception 'team: Only the owner or the member can do that.';
  end if;
  delete from public.host_team_members where host_id = p_host and member_id = p_member;
  -- A new invitation later sends a new notification.
  delete from public.notifications where event_key = 'team-invite:' || p_host || ':' || p_member;
end;
$$;

revoke all on function public.varoom_team_invite(text, text[]) from public, anon;
revoke all on function public.varoom_team_set_roles(uuid, text[]) from public, anon;
revoke all on function public.varoom_team_accept(uuid) from public, anon;
revoke all on function public.varoom_team_remove(uuid, uuid) from public, anon;
grant execute on function public.varoom_team_invite(text, text[]) to authenticated;
grant execute on function public.varoom_team_set_roles(uuid, text[]) to authenticated;
grant execute on function public.varoom_team_accept(uuid) to authenticated;
grant execute on function public.varoom_team_remove(uuid, uuid) to authenticated;

-- ---- Managers: the host's bookings, and their listings (read) ----
drop policy if exists "Participants can view their own bookings" on public.bookings;
create policy "Participants can view their own bookings" on public.bookings
  for select using (auth.uid() = client_id or public.varoom_can_act_for(host_id, 'manager'));

drop policy if exists "Hosts can respond to bookings on their own listings" on public.bookings;
create policy "Hosts can respond to bookings on their own listings" on public.bookings
  for update using (public.varoom_can_act_for(host_id, 'manager'));

drop policy if exists "Team managers can view the host's listings" on public.listings;
create policy "Team managers can view the host's listings" on public.listings
  for select using (public.varoom_can_act_for(host_id, 'manager'));

-- Rollback:
-- drop policy "Team managers can view the host's listings" on public.listings;
-- drop policy "Hosts can respond to bookings on their own listings" on public.bookings;
-- create policy "Hosts can respond to bookings on their own listings" on public.bookings for update using (auth.uid() = host_id);
-- drop policy "Participants can view their own bookings" on public.bookings;
-- create policy "Participants can view their own bookings" on public.bookings for select using ((auth.uid() = host_id) or (auth.uid() = client_id));
-- drop function public.varoom_team_invite(text, text[]); drop function public.varoom_team_set_roles(uuid, text[]);
-- drop function public.varoom_team_accept(uuid); drop function public.varoom_team_remove(uuid, uuid);
-- drop function public.varoom_can_act_for(uuid, text); drop table public.host_team_members;
