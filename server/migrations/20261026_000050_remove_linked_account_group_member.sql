-- Remove one saved account association without deleting either auth user or
-- application data. Only the server's service role may execute this function.
create or replace function public.varoom_remove_account_group_member(
  p_current_user uuid,
  p_removed_user uuid
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_group_id uuid;
  v_removed_group_id uuid;
begin
  if p_current_user is null or p_removed_user is null then
    raise exception 'invalid_account_group_members' using errcode = '22023';
  end if;
  if p_current_user = p_removed_user then
    raise exception 'cannot_remove_current_account' using errcode = '22023';
  end if;

  -- Coordinate with linking and membership-limit checks so the target cannot
  -- change groups between authorization and deletion.
  perform pg_advisory_xact_lock(hashtextextended('varoom-account-group-membership', 0));

  select group_id into v_group_id
    from public.account_group_members
   where user_id = p_current_user;
  select group_id into v_removed_group_id
    from public.account_group_members
   where user_id = p_removed_user;

  if v_group_id is null or v_removed_group_id is null or v_group_id <> v_removed_group_id then
    raise exception 'account_group_member_not_linked' using errcode = 'P0001';
  end if;

  delete from public.account_group_members
   where user_id = p_removed_user
     and group_id = v_group_id;
end;
$$;

revoke all on function public.varoom_remove_account_group_member(uuid, uuid) from public, anon, authenticated;
grant execute on function public.varoom_remove_account_group_member(uuid, uuid) to service_role;
