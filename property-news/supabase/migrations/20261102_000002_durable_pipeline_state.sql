-- Property News Phase 3: durable pipeline state
-- (docs/property-news/ARCHITECTURE_UPGRADE_PLAN.md, tasks 3.1-3.4).
--
-- Additive only, and safe to run more than once. The current collector
-- ignores everything added here, so it can be applied before the Phase 3
-- code is deployed.
--
-- 1. news_urls          one row per canonical article URL the collector has
--                       seen, with what happened to it, so known and rejected
--                       URLs are never downloaded again.
-- 2. news_items columns  processing attempts and a retry time, so failed or
--                       interrupted items are retried with backoff and a cap.
-- 3. property_news_claim_items()
--                       hands items to a worker with FOR UPDATE SKIP LOCKED,
--                       so overlapping or restarted runs never process the
--                       same item twice.
-- 4. collection_runs    one row per collection run with its counts.

-- 1. URL frontier -----------------------------------------------------------

create table if not exists public.news_urls (
  canonical_url text primary key check (canonical_url ~* '^https?://'),
  source_id uuid not null references public.news_sources(id) on delete cascade,
  state text not null check (state in ('seen', 'rejected', 'fetch_failed', 'stored')),
  -- Why the URL was rejected or failed, e.g. TOO_OLD, EXCLUDED_GENERAL_POLITICS.
  reason text check (reason is null or char_length(reason) <= 200),
  news_id uuid references public.news_items(id) on delete set null,
  attempts integer not null default 0 check (attempts >= 0),
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  last_attempt_at timestamptz,
  -- When a failed fetch may be retried. Null means never (rejected, stored).
  next_attempt_at timestamptz,
  updated_at timestamptz not null default now()
);

create index if not exists news_urls_source_state_idx on public.news_urls(source_id, state);
create index if not exists news_urls_retry_idx on public.news_urls(next_attempt_at)
  where state = 'fetch_failed';

drop trigger if exists property_news_urls_updated_at on public.news_urls;
create trigger property_news_urls_updated_at before update on public.news_urls
  for each row execute procedure public.property_news_set_updated_at();

alter table public.news_urls enable row level security;
drop policy if exists property_news_urls_admin on public.news_urls;
create policy property_news_urls_admin on public.news_urls for all to authenticated
  using (public.property_news_is_admin()) with check (public.property_news_is_admin());

-- Every article already stored is a known URL, so the first Phase 3 run does
-- not re-download them.
insert into public.news_urls (canonical_url, source_id, state, news_id, first_seen_at, last_seen_at)
select i.canonical_url, i.source_id, 'stored', i.id, i.created_at, i.created_at
  from public.news_items i
 where i.canonical_url ~* '^https?://'
on conflict (canonical_url) do nothing;

-- 2. Item processing state ---------------------------------------------------

alter table public.news_items
  add column if not exists processing_attempts integer not null default 0,
  add column if not exists next_attempt_at timestamptz,
  add column if not exists last_processing_error text;

alter table public.news_items
  drop constraint if exists news_items_processing_attempts_check;
alter table public.news_items
  add constraint news_items_processing_attempts_check check (processing_attempts >= 0);

alter table public.news_items
  drop constraint if exists news_items_last_processing_error_check;
alter table public.news_items
  add constraint news_items_last_processing_error_check
    check (last_processing_error is null or char_length(last_processing_error) <= 1000);

create index if not exists news_items_processing_queue_idx
  on public.news_items(next_attempt_at, created_at)
  where review_status in ('discovered', 'processing', 'failed');

-- 3. Claiming work -----------------------------------------------------------

-- Claims up to p_limit items that are ready to process: new items, failed
-- items whose retry time has passed, and items left in 'processing' by a
-- worker that stopped (their lease expired). Each claimed item moves to
-- 'processing', its attempt count goes up and it is leased for p_lease, so no
-- other worker takes it in the meantime. Items at p_max_attempts are skipped.
create or replace function public.property_news_claim_items(
  p_limit integer default 25,
  p_lease interval default interval '15 minutes',
  p_max_attempts integer default 3
)
returns setof uuid
language sql
security invoker
set search_path = public
as $$
  update public.news_items i
     set review_status = 'processing',
         processing_attempts = i.processing_attempts + 1,
         next_attempt_at = now() + p_lease
   where i.id in (
     select c.id
       from public.news_items c
      where c.processing_attempts < p_max_attempts
        and (
          c.review_status = 'discovered'
          or (c.review_status in ('failed', 'processing')
              and coalesce(c.next_attempt_at, '-infinity'::timestamptz) <= now())
        )
      order by c.created_at
      limit greatest(p_limit, 0)
      for update skip locked
   )
  returning i.id;
$$;

-- Only the server-side worker (service role) may claim work.
revoke all on function public.property_news_claim_items(integer, interval, integer) from public;
revoke all on function public.property_news_claim_items(integer, interval, integer) from anon, authenticated;
grant execute on function public.property_news_claim_items(integer, interval, integer) to service_role;

-- 4. Collection runs ---------------------------------------------------------

create table if not exists public.collection_runs (
  id uuid primary key default gen_random_uuid(),
  run_trigger text not null default 'schedule' check (run_trigger in ('schedule', 'manual', 'api')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null default 'running' check (status in (
    'running', 'succeeded', 'partial', 'failed', 'empty', 'no_sources_due', 'abandoned'
  )),
  -- The same counts the workflow summary prints (sources attempted, articles
  -- fetched, inserted, published, ...).
  counts jsonb not null default '{}'::jsonb check (jsonb_typeof(counts) = 'object'),
  source_failures jsonb not null default '[]'::jsonb check (jsonb_typeof(source_failures) = 'array'),
  error_message text check (error_message is null or char_length(error_message) <= 1000)
);

create index if not exists collection_runs_started_idx on public.collection_runs(started_at desc);

alter table public.collection_runs enable row level security;
drop policy if exists property_news_collection_runs_admin on public.collection_runs;
create policy property_news_collection_runs_admin on public.collection_runs for all to authenticated
  using (public.property_news_is_admin()) with check (public.property_news_is_admin());

-- Supabase's default privileges grant new tables to anon and authenticated.
-- RLS already blocks them; revoking keeps these tables off the public API.
revoke all on public.news_urls from anon;
revoke all on public.collection_runs from anon;
