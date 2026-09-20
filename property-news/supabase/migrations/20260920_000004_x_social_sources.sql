-- Additive multi-source extension. Existing website sources and items are preserved.
alter table public.news_sources add column if not exists platform text not null default 'web' check (platform in ('web', 'x'));
alter table public.news_sources add column if not exists source_account text;
alter table public.news_sources add column if not exists verified boolean not null default true;
alter table public.news_sources add column if not exists category text;
alter table public.news_sources drop constraint if exists news_sources_source_type_check;
alter table public.news_sources add constraint news_sources_source_type_check check (source_type in ('government', 'parliamentary', 'gazette', 'county', 'news', 'property_publication', 'research', 'industry', 'manual', 'social'));
create unique index if not exists news_sources_platform_account_unique on public.news_sources(platform, lower(source_account)) where source_account is not null;

alter table public.news_items add column if not exists platform text not null default 'web' check (platform in ('web', 'x'));
alter table public.news_items add column if not exists external_post_id text;
create unique index if not exists news_items_platform_external_post_unique on public.news_items(platform, external_post_id) where external_post_id is not null;
create index if not exists news_items_source_published_latest_idx on public.news_items(source_published_at desc nulls last, published_at desc);

comment on column public.news_sources.verified is 'X sources start unverified/inactive and are activated only after official X API validation.';
comment on column public.news_items.external_post_id is 'External social ID; unique with platform so imports are idempotent.';

create or replace view public.property_news_source_health
with (security_barrier = true) as
select s.id as source_id, s.name, s.active, s.verified, s.platform, s.source_account, s.category,
  s.last_successful_fetch_at, s.last_failed_fetch_at,
  max(r.ended_at) as last_sync_at,
  coalesce(sum(r.discovered_count), 0)::integer as items_found,
  coalesce(sum(r.new_item_count), 0)::integer as relevant_items,
  coalesce(sum(r.duplicate_count), 0)::integer as duplicates,
  coalesce(sum(greatest(r.discovered_count - r.new_item_count - r.duplicate_count, 0)), 0)::integer as rejected_items,
  (array_agg(r.error_message order by r.ended_at desc) filter (where r.error_message is not null))[1] as last_error
from public.news_sources s
left join public.source_fetch_runs r on r.source_id = s.id
group by s.id;
grant select on public.property_news_source_health to authenticated;
