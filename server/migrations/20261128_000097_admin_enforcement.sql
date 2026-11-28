-- Admin enforcement: timed suspensions, the record of every warning,
-- suspension and restore, and the automatic rules (server/lib/enforcement.js).
-- Only the server (service role) reads or writes these tables.

-- A suspension can end on its own (suspended_until); rule_key names the
-- automatic rule that applied it (null when an admin did).
alter table public.account_controls
  add column if not exists suspended_until timestamptz,
  add column if not exists rule_key text;

create table if not exists public.account_enforcement_actions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  action text not null check (action in ('warning', 'suspended', 'disabled', 'restored')),
  reason text not null,
  rule_key text,
  admin_id uuid references public.admins(id) on delete set null,
  suspended_until timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists account_enforcement_actions_user_idx
  on public.account_enforcement_actions (user_id, created_at desc);
alter table public.account_enforcement_actions enable row level security;

-- One row per rule. mode: off (does nothing), shadow (records what it would
-- do), enforce (acts). A rule fires when threshold events happen within
-- window_hours.
create table if not exists public.moderation_rules (
  key text primary key,
  mode text not null default 'shadow' check (mode in ('off', 'shadow', 'enforce')),
  threshold integer not null check (threshold > 0),
  window_hours integer not null check (window_hours > 0),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.admins(id) on delete set null
);
alter table public.moderation_rules enable row level security;

insert into public.moderation_rules (key, threshold, window_hours) values
  ('account_reports', 3, 168),
  ('listing_reports', 3, 168),
  ('scam_messages', 3, 168),
  ('conversation_burst', 15, 1),
  ('expired_requests', 3, 720),
  ('linked_accounts', 1, 1)
on conflict (key) do nothing;

-- What the rules saw and did: 'flagged' signals (a suspicious message, a new
-- conversation), and each action taken (or, in shadow mode, 'would_…').
create table if not exists public.moderation_rule_hits (
  id uuid primary key default gen_random_uuid(),
  rule_key text not null references public.moderation_rules(key) on delete cascade,
  target_type text not null check (target_type in ('user', 'listing')),
  target_id uuid not null,
  action text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists moderation_rule_hits_target_idx
  on public.moderation_rule_hits (rule_key, target_id, created_at desc);
create index if not exists moderation_rule_hits_created_idx
  on public.moderation_rule_hits (created_at desc);
alter table public.moderation_rule_hits enable row level security;

-- Restricted = not active, unless a timed suspension has ended (the server
-- also lifts ended suspensions, but enforcement must not wait for it).
create or replace function public.varoom_account_restricted(p_user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.account_controls
    where user_id = p_user_id and status <> 'active'
      and (suspended_until is null or suspended_until > now())
  );
$$;
revoke all on function public.varoom_account_restricted(uuid) from public, anon, authenticated;

create or replace function public.varoom_reject_suspended_activity()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and public.varoom_account_restricted(auth.uid()) then
    raise exception 'Account suspended: browsing is available but new activity is not';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create or replace function public.varoom_block_restricted_booking()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if public.varoom_account_restricted(new.client_id) or public.varoom_account_restricted(new.host_id) then
    raise exception 'This account is not allowed to make bookings';
  end if;
  return new;
end;
$$;
