-- Persist explicit account-switcher groups. Credentials remain in the
-- authenticated browser session and are never stored in this membership table.
create table if not exists public.account_group_members (
  user_id uuid primary key references auth.users(id) on delete cascade,
  group_id uuid not null,
  joined_at timestamptz not null default now()
);

create index if not exists account_group_members_group_id_idx
  on public.account_group_members(group_id, joined_at, user_id);

alter table public.account_group_members enable row level security;
revoke all on table public.account_group_members from public, anon, authenticated;
grant all on table public.account_group_members to service_role;

-- Serialize all membership writes. Linking is infrequent; a single lock keeps
-- group merges and concurrent add attempts simple and makes the limit strict.
create or replace function public.enforce_varoom_account_group_limit()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_member_count integer;
begin
  if tg_op = 'UPDATE' and old.group_id is not distinct from new.group_id then
    return new;
  end if;

  perform pg_advisory_xact_lock(hashtextextended('varoom-account-group-membership', 0));

  select count(*) into v_member_count
    from public.account_group_members
   where group_id = new.group_id
     and user_id <> new.user_id;

  if v_member_count >= 3 then
    raise exception 'account_group_limit_reached' using errcode = 'P0001';
  end if;

  return new;
end;
$$;

drop trigger if exists account_group_members_limit on public.account_group_members;
create trigger account_group_members_limit
before insert or update on public.account_group_members
for each row execute function public.enforce_varoom_account_group_limit();

revoke all on function public.enforce_varoom_account_group_limit() from public, anon, authenticated;

-- The API verifies a live access token for each user before calling this
-- service-role-only operation. It is atomic and safely merges existing groups
-- only when the combined membership still fits the three-account maximum.
create or replace function public.varoom_link_account_group_users(
  p_user_a uuid,
  p_user_b uuid
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_group_a uuid;
  v_group_b uuid;
  v_target_group uuid;
  v_count integer;
begin
  if p_user_a is null or p_user_b is null or p_user_a = p_user_b then
    raise exception 'invalid_account_group_members' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('varoom-account-group-membership', 0));

  select group_id into v_group_a from public.account_group_members where user_id = p_user_a;
  select group_id into v_group_b from public.account_group_members where user_id = p_user_b;

  if v_group_a is not null and v_group_a = v_group_b then
    return v_group_a;
  elsif v_group_a is null and v_group_b is null then
    v_target_group := gen_random_uuid();
    insert into public.account_group_members(user_id, group_id)
      values (p_user_a, v_target_group), (p_user_b, v_target_group);
    return v_target_group;
  elsif v_group_a is null then
    select count(*) into v_count from public.account_group_members where group_id = v_group_b;
    if v_count >= 3 then
      raise exception 'account_group_limit_reached' using errcode = 'P0001';
    end if;
    insert into public.account_group_members(user_id, group_id) values (p_user_a, v_group_b);
    return v_group_b;
  elsif v_group_b is null then
    select count(*) into v_count from public.account_group_members where group_id = v_group_a;
    if v_count >= 3 then
      raise exception 'account_group_limit_reached' using errcode = 'P0001';
    end if;
    insert into public.account_group_members(user_id, group_id) values (p_user_b, v_group_a);
    return v_group_a;
  else
    select count(*) into v_count
      from public.account_group_members
     where group_id in (v_group_a, v_group_b);
    if v_count > 3 then
      raise exception 'account_group_limit_reached' using errcode = 'P0001';
    end if;

    update public.account_group_members
       set group_id = v_group_a
     where group_id = v_group_b;
    return v_group_a;
  end if;
end;
$$;

revoke all on function public.varoom_link_account_group_users(uuid, uuid) from public, anon, authenticated;
grant execute on function public.varoom_link_account_group_users(uuid, uuid) to service_role;
