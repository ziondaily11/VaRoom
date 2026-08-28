-- VaRoom Property News, Phase 1
-- Additive migration only. It creates new property-news tables and never alters
-- or drops an existing VaRoom table. Apply only to a verified development
-- project before promoting through the normal Supabase release process.

create extension if not exists pgcrypto;

create or replace function public.property_news_set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Roles are deliberately based on Supabase JWT app_metadata, so this migration
-- does not modify the existing profiles or auth tables. Grant news_admin only
-- with a privileged server-side administrative operation during deployment.
create or replace function public.property_news_is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((auth.jwt() -> 'app_metadata' ->> 'news_admin')::boolean, false);
$$;

create table if not exists public.news_sources (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) >= 2),
  base_url text not null check (base_url ~* '^https?://'),
  source_type text not null default 'government' check (source_type in ('government', 'parliamentary', 'gazette', 'county', 'news', 'property_publication', 'research', 'industry', 'manual')),
  trust_tier smallint not null check (trust_tier between 1 and 4),
  fetch_method text not null check (fetch_method in ('api', 'rss', 'atom', 'sitemap', 'html', 'manual')),
  schedule_minutes integer not null check (schedule_minutes between 5 and 10080),
  active boolean not null default false,
  parser_config jsonb not null default '{}'::jsonb check (jsonb_typeof(parser_config) = 'object'),
  last_successful_fetch_at timestamptz,
  last_failed_fetch_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (name),
  unique (base_url)
);

create table if not exists public.news_story_timelines (
  id uuid primary key default gen_random_uuid(),
  canonical_title text not null,
  description text,
  current_regulatory_status text not null default 'unknown' check (current_regulatory_status in ('reported', 'proposed', 'under_consideration', 'public_participation', 'approved', 'enacted', 'effective', 'suspended', 'rejected', 'amended', 'unknown')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (canonical_title)
);

create table if not exists public.news_items (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.news_sources(id) on delete restrict,
  timeline_id uuid references public.news_story_timelines(id) on delete set null,
  source_url text not null check (source_url ~* '^https?://'),
  canonical_url text not null check (canonical_url ~* '^https?://'),
  source_title text not null check (char_length(trim(source_title)) >= 1),
  source_published_at timestamptz,
  fetched_at timestamptz not null default now(),
  -- Retained for evidence and review only; it is never exposed by the public view.
  original_content text,
  clean_text text not null default '',
  varoom_title text,
  varoom_summary text,
  varoom_body text,
  category text check (category is null or category in ('land', 'property', 'housing', 'construction', 'development', 'finance', 'taxation', 'law', 'zoning', 'planning', 'administration', 'market')),
  topics text[] not null default '{}',
  counties text[] not null default '{}',
  towns text[] not null default '{}',
  regulatory_status text not null default 'unknown' check (regulatory_status in ('reported', 'proposed', 'under_consideration', 'public_participation', 'approved', 'enacted', 'effective', 'suspended', 'rejected', 'amended', 'unknown')),
  affected_groups text[] not null default '{}',
  key_facts jsonb not null default '[]'::jsonb check (jsonb_typeof(key_facts) = 'array'),
  risk_level text not null default 'medium' check (risk_level in ('low', 'medium', 'high', 'critical')),
  confidence_score numeric(4,3) not null default 0 check (confidence_score between 0 and 1),
  source_tier smallint not null check (source_tier between 1 and 4),
  review_status text not null default 'discovered' check (review_status in ('discovered', 'processing', 'analysed', 'pending_review', 'approved', 'published', 'rejected', 'failed', 'archived')),
  reviewed_by uuid references auth.users(id) on delete set null,
  published_at timestamptz,
  image_url text,
  content_hash text not null check (content_hash ~ '^[a-f0-9]{64}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (canonical_url),
  unique (content_hash),
  check ((review_status <> 'published') or published_at is not null)
);

create table if not exists public.news_analysis (
  id uuid primary key default gen_random_uuid(),
  news_id uuid not null unique references public.news_items(id) on delete cascade,
  relevant boolean not null,
  category text,
  topics text[] not null default '{}',
  counties text[] not null default '{}',
  towns text[] not null default '{}',
  regulatory_status text not null default 'unknown' check (regulatory_status in ('reported', 'proposed', 'under_consideration', 'public_participation', 'approved', 'enacted', 'effective', 'suspended', 'rejected', 'amended', 'unknown')),
  affected_groups text[] not null default '{}',
  key_facts jsonb not null default '[]'::jsonb check (jsonb_typeof(key_facts) = 'array'),
  varoom_title text,
  varoom_summary text,
  varoom_body text,
  confidence_score numeric(4,3) not null check (confidence_score between 0 and 1),
  source_tier smallint not null check (source_tier between 1 and 4),
  risk_level text not null check (risk_level in ('low', 'medium', 'high', 'critical')),
  risk_reasons jsonb not null default '[]'::jsonb check (jsonb_typeof(risk_reasons) = 'array'),
  model_provider text not null,
  model_version text not null,
  image_url text,
  created_at timestamptz not null default now()
);

create table if not exists public.news_locations (
  id uuid primary key default gen_random_uuid(),
  news_id uuid not null references public.news_items(id) on delete cascade,
  county text,
  town text,
  area text,
  region text,
  confidence_score numeric(4,3) check (confidence_score between 0 and 1),
  created_at timestamptz not null default now(),
  check (county is not null or town is not null or area is not null or region is not null),
  unique nulls not distinct (news_id, county, town, area, region)
);

create table if not exists public.news_tags (
  id uuid primary key default gen_random_uuid(),
  news_id uuid not null references public.news_items(id) on delete cascade,
  tag text not null check (char_length(trim(tag)) between 2 and 80),
  created_at timestamptz not null default now(),
  unique (news_id, tag)
);

create table if not exists public.news_reviews (
  id uuid primary key default gen_random_uuid(),
  news_id uuid not null references public.news_items(id) on delete cascade,
  reviewer_id uuid references auth.users(id) on delete set null,
  decision text not null check (decision in ('approve', 'reject', 'edit', 'request_more_evidence')),
  reason text,
  edits jsonb not null default '{}'::jsonb check (jsonb_typeof(edits) = 'object'),
  reviewed_at timestamptz not null default now()
);

create table if not exists public.news_events (
  id uuid primary key default gen_random_uuid(),
  news_id uuid references public.news_items(id) on delete cascade,
  source_id uuid references public.news_sources(id) on delete cascade,
  event_type text not null check (char_length(trim(event_type)) between 2 and 100),
  payload jsonb not null default '{}'::jsonb check (jsonb_typeof(payload) = 'object'),
  created_at timestamptz not null default now()
);

create table if not exists public.source_fetch_runs (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.news_sources(id) on delete cascade,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  result text not null check (result in ('running', 'succeeded', 'failed', 'partial')),
  discovered_count integer not null default 0 check (discovered_count >= 0),
  new_item_count integer not null default 0 check (new_item_count >= 0),
  duplicate_count integer not null default 0 check (duplicate_count >= 0),
  error_message text,
  duration_ms integer check (duration_ms is null or duration_ms >= 0)
);

create table if not exists public.news_timeline_entries (
  id uuid primary key default gen_random_uuid(),
  timeline_id uuid not null references public.news_story_timelines(id) on delete cascade,
  news_id uuid not null unique references public.news_items(id) on delete cascade,
  occurred_at timestamptz,
  regulatory_status text not null check (regulatory_status in ('reported', 'proposed', 'under_consideration', 'public_participation', 'approved', 'enacted', 'effective', 'suspended', 'rejected', 'amended', 'unknown')),
  created_at timestamptz not null default now()
);

create index if not exists news_items_source_idx on public.news_items(source_id, source_published_at desc);
create index if not exists news_items_public_idx on public.news_items(review_status, published_at desc);
create index if not exists news_items_category_idx on public.news_items(category, published_at desc);
create index if not exists news_items_status_idx on public.news_items(regulatory_status, published_at desc);
create index if not exists news_items_counties_gin_idx on public.news_items using gin(counties);
create index if not exists news_items_towns_gin_idx on public.news_items using gin(towns);
create index if not exists news_items_topics_gin_idx on public.news_items using gin(topics);
create index if not exists news_items_search_idx on public.news_items using gin(to_tsvector('english', coalesce(varoom_title, source_title) || ' ' || coalesce(varoom_summary, '') || ' ' || coalesce(category, '')));
create index if not exists news_locations_news_idx on public.news_locations(news_id);
create index if not exists news_tags_tag_idx on public.news_tags(tag);
create index if not exists news_reviews_news_idx on public.news_reviews(news_id, reviewed_at desc);
create index if not exists news_events_news_idx on public.news_events(news_id, created_at desc);
create index if not exists news_events_source_idx on public.news_events(source_id, created_at desc);
create index if not exists source_fetch_runs_source_idx on public.source_fetch_runs(source_id, started_at desc);
create index if not exists news_timeline_entries_timeline_idx on public.news_timeline_entries(timeline_id, occurred_at);

create trigger property_news_sources_updated_at before update on public.news_sources for each row execute procedure public.property_news_set_updated_at();
create trigger property_news_items_updated_at before update on public.news_items for each row execute procedure public.property_news_set_updated_at();
create trigger property_news_timelines_updated_at before update on public.news_story_timelines for each row execute procedure public.property_news_set_updated_at();

alter table public.news_sources enable row level security;
alter table public.news_story_timelines enable row level security;
alter table public.news_items enable row level security;
alter table public.news_analysis enable row level security;
alter table public.news_locations enable row level security;
alter table public.news_tags enable row level security;
alter table public.news_reviews enable row level security;
alter table public.news_events enable row level security;
alter table public.source_fetch_runs enable row level security;
alter table public.news_timeline_entries enable row level security;

create policy property_news_sources_admin on public.news_sources for all to authenticated using (public.property_news_is_admin()) with check (public.property_news_is_admin());
create policy property_news_timelines_admin on public.news_story_timelines for all to authenticated using (public.property_news_is_admin()) with check (public.property_news_is_admin());
create policy property_news_items_admin on public.news_items for all to authenticated using (public.property_news_is_admin()) with check (public.property_news_is_admin());
create policy property_news_analysis_admin on public.news_analysis for all to authenticated using (public.property_news_is_admin()) with check (public.property_news_is_admin());
create policy property_news_locations_admin on public.news_locations for all to authenticated using (public.property_news_is_admin()) with check (public.property_news_is_admin());
create policy property_news_tags_admin on public.news_tags for all to authenticated using (public.property_news_is_admin()) with check (public.property_news_is_admin());
create policy property_news_reviews_admin on public.news_reviews for all to authenticated using (public.property_news_is_admin()) with check (public.property_news_is_admin());
create policy property_news_events_admin on public.news_events for all to authenticated using (public.property_news_is_admin()) with check (public.property_news_is_admin());
create policy property_news_fetch_runs_admin on public.source_fetch_runs for all to authenticated using (public.property_news_is_admin()) with check (public.property_news_is_admin());
create policy property_news_timeline_entries_admin on public.news_timeline_entries for all to authenticated using (public.property_news_is_admin()) with check (public.property_news_is_admin());

-- The public projection intentionally omits original_content, clean_text,
-- analysis metadata, review data, and pipeline audit data.
create or replace view public.property_news_public_items
with (security_barrier = true)
as
select
  n.id, n.varoom_title as title, n.varoom_summary as summary, n.varoom_body as body,
  n.category, n.topics, n.counties, n.towns, n.regulatory_status, n.affected_groups,
  n.risk_level, n.source_url, n.image_url, n.source_published_at, n.published_at,
  s.name as source_name, n.source_tier
from public.news_items n
join public.news_sources s on s.id = n.source_id
where n.review_status = 'published' and n.published_at is not null;

grant select on public.property_news_public_items to anon, authenticated;

comment on view public.property_news_public_items is 'Read-only safe public projection for published property news. Private pipeline and review data remain RLS-protected.';
