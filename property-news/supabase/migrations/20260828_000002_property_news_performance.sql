-- VaRoom Property News: Performance & Image Persistence Migration
-- Additive migration: adds image_url column to news_items and news_analysis,
-- and updates the public projection view to include image_url.

alter table if exists public.news_items
  add column if not exists image_url text;

alter table if exists public.news_items
  add column if not exists scheduled_at timestamptz;

create index if not exists news_items_publication_queue_idx
  on public.news_items (scheduled_at)
  where review_status = 'approved';

alter table if exists public.news_analysis
  add column if not exists image_url text;

-- Drop existing view first so column structure can be updated without 42P16 error
drop view if exists public.property_news_public_items cascade;

-- Update the public projection view to include image_url
create view public.property_news_public_items
with (security_barrier = true)
as
select
  n.id,
  n.varoom_title as title,
  n.varoom_summary as summary,
  n.varoom_body as body,
  n.category,
  n.topics,
  n.counties,
  n.towns,
  n.regulatory_status,
  n.affected_groups,
  n.risk_level,
  n.source_url,
  n.image_url,
  n.source_published_at,
  n.published_at,
  s.name as source_name,
  n.source_tier
from public.news_items n
join public.news_sources s on s.id = n.source_id
where n.review_status = 'published' and n.published_at is not null and n.published_at <= now();

grant select on public.property_news_public_items to anon, authenticated;
