-- Chat Settings → Elie (hosts): when Elie answers guests for the host.
--
--   elie_away_replies     While away, Elie answers after the away message (on),
--                         or only the away message goes out (off).
--   elie_away_drafts      Elie's automatic answers wait as drafts for the host
--                         to use or dismiss, instead of being sent (off).
--   elie_new_enquiries    Elie also answers the first message of a new
--                         enquiry when the host is not away (off).
--   elie_suggest_listings Elie may add up to 3 of the host's other listings
--                         to its answers (on).
--
-- elie_away_drafts holds one waiting draft per conversation, encrypted like
-- messages. Only the server (service role) reads and writes it.
-- Safe to re-run. Apply before deploying the server, which reads these.
--
-- Check before running (read only; works before this migration):
--   1. The columns don't exist yet (expect 0):
--        select count(*) from information_schema.columns
--        where table_schema = 'public' and table_name = 'profiles' and column_name like 'elie\_%';
--   2. No table with this name exists yet (expect null):
--        select to_regclass('public.elie_away_drafts');
--
-- Undo:
--   drop table if exists public.elie_away_drafts;
--   alter table public.profiles
--     drop column if exists elie_away_replies,
--     drop column if exists elie_away_drafts,
--     drop column if exists elie_new_enquiries,
--     drop column if exists elie_suggest_listings;

alter table public.profiles
  add column if not exists elie_away_replies boolean not null default true,
  add column if not exists elie_away_drafts boolean not null default false,
  add column if not exists elie_new_enquiries boolean not null default false,
  add column if not exists elie_suggest_listings boolean not null default true;

create table if not exists public.elie_away_drafts (
  conversation_id uuid primary key references public.conversations(id) on delete cascade,
  host_id uuid not null references public.profiles(id) on delete cascade,
  ciphertext text not null,
  iv text not null,
  key_version integer not null,
  created_at timestamptz not null default now()
);

alter table public.elie_away_drafts enable row level security;
