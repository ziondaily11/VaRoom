-- A BEFORE DELETE trigger must return OLD to allow the row to be deleted.
-- Returning NEW (which is null for DELETE) silently suppresses the deletion.
create or replace function public.varoom_reject_suspended_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null and exists (
    select 1 from public.account_controls
    where user_id = auth.uid() and status <> 'active'
  ) then
    raise exception 'Account suspended: browsing is available but new activity is not';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;
