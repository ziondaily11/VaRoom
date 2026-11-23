-- V-Coins: the credits that pay for Elie search.
--
-- Every account (client or host, with or without a plan) can buy V-Coins and
-- search with Elie. Hosts on a plan that includes Elie (features.elie, or the
-- legacy Pro plan) search without spending coins.
--
-- elie_ledger holds one row per change: the 50 welcome coins (once per
-- account), a purchase (one row per verified Paystack payment), or a search /
-- news answer (negative). The balance is the sum of a user's rows.
-- Purchases are billing_payments rows with payment_kind 'vcoins' and the
-- number of coins bought in billing_payments.vcoins.
--
-- Only the server (service role) writes; a user may read their own rows.
-- Safe to re-run.
--
-- Check before running (read only; works before this migration):
--   1. Payment kinds in use (all must be 'subscription' or 'listing'):
--        select payment_kind, count(*) from public.billing_payments group by 1;
--   2. No table with this name exists yet (expect no row):
--        select to_regclass('public.elie_ledger');
--
-- Undo (only before any coins are bought; this deletes every balance):
--   drop function if exists public.elie_spend_vcoins(uuid, integer, text, text);
--   drop function if exists public.elie_vcoin_wallet(uuid);
--   drop table if exists public.elie_ledger;
--   alter table public.billing_payments drop constraint if exists billing_payments_vcoins_check;
--   alter table public.billing_payments drop column if exists vcoins;
--   alter table public.billing_payments drop constraint if exists billing_payments_kind_check;
--   alter table public.billing_payments add constraint billing_payments_kind_check
--     check (payment_kind in ('subscription', 'listing'));

alter table public.billing_payments drop constraint if exists billing_payments_kind_check;
alter table public.billing_payments add constraint billing_payments_kind_check
  check (payment_kind in ('subscription', 'listing', 'vcoins'));
alter table public.billing_payments add column if not exists vcoins integer;
alter table public.billing_payments drop constraint if exists billing_payments_vcoins_check;
alter table public.billing_payments add constraint billing_payments_vcoins_check
  check ((payment_kind = 'vcoins') = (vcoins is not null and vcoins > 0));

create table if not exists public.elie_ledger (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  delta integer not null check (delta <> 0),
  kind text not null check (kind in ('welcome', 'purchase', 'search', 'news', 'grant')),
  payment_id uuid unique references public.billing_payments(id) on delete restrict,
  request_id text unique,
  created_at timestamptz not null default now(),
  check ((kind = 'purchase') = (payment_id is not null)),
  check ((kind in ('search', 'news')) = (delta < 0))
);
create unique index if not exists elie_ledger_one_welcome_idx on public.elie_ledger(user_id) where kind = 'welcome';
create index if not exists elie_ledger_user_idx on public.elie_ledger(user_id, created_at desc);

alter table public.elie_ledger enable row level security;
drop policy if exists elie_ledger_select_own on public.elie_ledger;
create policy elie_ledger_select_own on public.elie_ledger for select to authenticated using (user_id = auth.uid());
revoke insert, update, delete on public.elie_ledger from anon, authenticated;

-- The user's balance, and whether their plan includes Elie. Grants the 50
-- welcome coins the first time it is called for an account.
create or replace function public.elie_vcoin_wallet(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_balance integer;
  v_included boolean;
begin
  if not exists (select 1 from public.profiles where id = p_user_id) then
    return jsonb_build_object('balance', 0, 'included', false);
  end if;
  insert into public.elie_ledger(user_id, delta, kind) values (p_user_id, 50, 'welcome')
  on conflict (user_id) where kind = 'welcome' do nothing;
  select coalesce(sum(delta), 0) into v_balance from public.elie_ledger where user_id = p_user_id;
  select exists (
    select 1
    from public.host_subscriptions hs
    join public.billing_plans bp on bp.id = hs.plan_id
    join public.profiles p on p.id = hs.host_id and p.role = 'host'
    where hs.host_id = p_user_id
      and hs.status in ('active', 'past_due', 'cancel_requested')
      and (hs.current_period_end is null or hs.current_period_end > now())
      and (hs.plan_id = 'pro' or coalesce((bp.features->>'elie')::boolean, false))
  ) into v_included;
  return jsonb_build_object('balance', v_balance, 'included', v_included);
end;
$$;

-- Spends coins for one answered request. Never takes the balance below zero:
-- when it is too low the answer is not charged (charged = 0). A request id is
-- charged once.
create or replace function public.elie_spend_vcoins(p_user_id uuid, p_coins integer, p_kind text, p_request_id text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_balance integer;
begin
  if p_coins is null or p_coins <= 0 or p_kind not in ('search', 'news') or nullif(trim(p_request_id), '') is null then
    raise exception 'Invalid V-Coin charge' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('vcoins:' || p_user_id::text, 0));
  select coalesce(sum(delta), 0) into v_balance from public.elie_ledger where user_id = p_user_id;
  if exists (select 1 from public.elie_ledger where request_id = p_request_id) or v_balance < p_coins then
    return jsonb_build_object('charged', 0, 'balance', v_balance);
  end if;
  insert into public.elie_ledger(user_id, delta, kind, request_id) values (p_user_id, -p_coins, p_kind, p_request_id);
  return jsonb_build_object('charged', p_coins, 'balance', v_balance - p_coins);
end;
$$;

revoke all on function public.elie_vcoin_wallet(uuid) from public, anon, authenticated;
revoke all on function public.elie_spend_vcoins(uuid, integer, text, text) from public, anon, authenticated;
grant execute on function public.elie_vcoin_wallet(uuid) to service_role;
grant execute on function public.elie_spend_vcoins(uuid, integer, text, text) to service_role;
