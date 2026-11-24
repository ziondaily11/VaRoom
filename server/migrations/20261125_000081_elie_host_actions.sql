-- Host Elie: the Elie tools of the plans that include Elie (features.elie:
-- Airbnb Business, Hotel Plus, Venue Premium; or the legacy Pro plan).
--
-- Elie's away answers, @reply, reply drafts and "Write with Elie" each use one
-- Elie action; a host has 300 a month (the limit is passed in by the server),
-- counted from the 1st, Nairobi time. The host's own away message is free and
-- is not counted.
--
-- elie_host_actions holds one row per action. The server reserves an action
-- before Elie writes (elie_use_host_action, under a per-host lock, so the
-- limit holds when requests overlap) and gives it back if Elie fails
-- (elie_release_host_action).
--
-- elie_host_included() is the one place that decides whether a plan includes
-- Elie; elie_vcoin_wallet (migration 000079) now uses it too, unchanged in
-- behaviour.
--
-- Only the server (service role) writes; a host may read their own rows.
-- Safe to re-run.
--
-- Check before running (read only; works before this migration):
--   1. The V-Coin wallet from migration 000079 exists (expect one row):
--        select to_regprocedure('public.elie_vcoin_wallet(uuid)');
--   2. No table with this name exists yet (expect null):
--        select to_regclass('public.elie_host_actions');
--   3. The hosts whose plan includes Elie today (these keep Elie's answers):
--        select hs.host_id, hs.plan_id, hs.status, hs.current_period_end
--        from public.host_subscriptions hs join public.billing_plans bp on bp.id = hs.plan_id
--        where hs.status in ('active', 'past_due', 'cancel_requested')
--          and (hs.current_period_end is null or hs.current_period_end > now())
--          and (hs.plan_id = 'pro' or coalesce((bp.features->>'elie')::boolean, false));
--
-- Undo (in this order):
--   1. Re-run the "create or replace function public.elie_vcoin_wallet" block
--      from 20261123_000079_elie_vcoins.sql (it no longer calls the helper).
--   2. drop function if exists public.elie_host_usage(uuid, integer);
--      drop function if exists public.elie_release_host_action(bigint, uuid);
--      drop function if exists public.elie_use_host_action(uuid, text, integer);
--      drop function if exists public.elie_host_month_start();
--      drop function if exists public.elie_host_included(uuid);
--      drop table if exists public.elie_host_actions;

create table if not exists public.elie_host_actions (
  id bigint generated always as identity primary key,
  host_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null check (kind in ('away', 'reply', 'draft', 'write')),
  created_at timestamptz not null default now()
);

create index if not exists elie_host_actions_host_idx on public.elie_host_actions(host_id, created_at desc);

alter table public.elie_host_actions enable row level security;
drop policy if exists elie_host_actions_select_own on public.elie_host_actions;
create policy elie_host_actions_select_own on public.elie_host_actions for select to authenticated using (host_id = auth.uid());
revoke insert, update, delete on public.elie_host_actions from anon, authenticated;

-- Whether the account is a host on a live plan that includes Elie.
create or replace function public.elie_host_included(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.host_subscriptions hs
    join public.billing_plans bp on bp.id = hs.plan_id
    join public.profiles p on p.id = hs.host_id and p.role = 'host'
    where hs.host_id = p_user_id
      and hs.status in ('active', 'past_due', 'cancel_requested')
      and (hs.current_period_end is null or hs.current_period_end > now())
      and (hs.plan_id = 'pro' or coalesce((bp.features->>'elie')::boolean, false))
  );
$$;

-- The start of this month in Nairobi.
create or replace function public.elie_host_month_start()
returns timestamptz
language sql
stable
set search_path = public, pg_temp
as $$
  select date_trunc('month', now() at time zone 'Africa/Nairobi') at time zone 'Africa/Nairobi';
$$;

-- Same result as in 000079; the plan rule now lives in elie_host_included.
create or replace function public.elie_vcoin_wallet(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_balance integer;
begin
  if not exists (select 1 from public.profiles where id = p_user_id) then
    return jsonb_build_object('balance', 0, 'included', false);
  end if;
  insert into public.elie_ledger(user_id, delta, kind) values (p_user_id, 50, 'welcome')
  on conflict (user_id) where kind = 'welcome' do nothing;
  select coalesce(sum(delta), 0) into v_balance from public.elie_ledger where user_id = p_user_id;
  return jsonb_build_object('balance', v_balance, 'included', public.elie_host_included(p_user_id));
end;
$$;

-- Reserves one Elie action: allowed only on a plan with Elie and under the
-- monthly limit. Returns the action id to give back if Elie fails.
create or replace function public.elie_use_host_action(p_host_id uuid, p_kind text, p_limit integer)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_used integer;
  v_id bigint;
begin
  if p_kind is null or p_kind not in ('away', 'reply', 'draft', 'write') or p_limit is null or p_limit <= 0 then
    raise exception 'Invalid Elie action' using errcode = '22023';
  end if;
  if not public.elie_host_included(p_host_id) then
    return jsonb_build_object('allowed', false, 'reason', 'plan', 'used', 0, 'limit', p_limit);
  end if;
  perform pg_advisory_xact_lock(hashtextextended('elie-host:' || p_host_id::text, 0));
  select count(*) into v_used from public.elie_host_actions
  where host_id = p_host_id and created_at >= public.elie_host_month_start();
  if v_used >= p_limit then
    return jsonb_build_object('allowed', false, 'reason', 'limit', 'used', v_used, 'limit', p_limit);
  end if;
  insert into public.elie_host_actions(host_id, kind) values (p_host_id, p_kind) returning id into v_id;
  return jsonb_build_object('allowed', true, 'action_id', v_id, 'used', v_used + 1, 'limit', p_limit);
end;
$$;

-- Gives back an action Elie could not complete.
create or replace function public.elie_release_host_action(p_action_id bigint, p_host_id uuid)
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  delete from public.elie_host_actions where id = p_action_id and host_id = p_host_id;
$$;

-- Whether the host's plan includes Elie, and the actions used this month.
create or replace function public.elie_host_usage(p_host_id uuid, p_limit integer)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'included', public.elie_host_included(p_host_id),
    'used', (select count(*) from public.elie_host_actions where host_id = p_host_id and created_at >= public.elie_host_month_start()),
    'limit', p_limit
  );
$$;

revoke all on function public.elie_host_included(uuid) from public, anon, authenticated;
revoke all on function public.elie_use_host_action(uuid, text, integer) from public, anon, authenticated;
revoke all on function public.elie_release_host_action(bigint, uuid) from public, anon, authenticated;
revoke all on function public.elie_host_usage(uuid, integer) from public, anon, authenticated;
grant execute on function public.elie_host_included(uuid) to service_role;
grant execute on function public.elie_use_host_action(uuid, text, integer) to service_role;
grant execute on function public.elie_release_host_action(bigint, uuid) to service_role;
grant execute on function public.elie_host_usage(uuid, integer) to service_role;
