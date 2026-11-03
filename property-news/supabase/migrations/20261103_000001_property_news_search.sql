-- Property News Phase 7: full-text search over every published story
-- (docs/property-news/ARCHITECTURE_UPGRADE_PLAN.md, tasks 7.1 and 7.2).
--
-- Additive and safe to run more than once. Search and Elie's evidence lookup
-- previously scanned only the newest 100 published stories in Python.
--
-- The text expression is identical to news_items_search_idx (migration
-- 20260820_000001), so the existing GIN index serves the match. Words are
-- combined with OR and ranked, because questions such as "What is the impact
-- of the housing levy?" rarely contain every word of a headline.

create or replace function public.property_news_search(
  p_query text,
  p_county text default null,
  p_category text default null,
  p_regulatory_status text default null,
  p_days integer default null,
  p_limit integer default 50
)
returns table (id uuid, rank real)
language sql
stable
security invoker
set search_path = public
as $$
  with query as (
    select nullif(replace(plainto_tsquery('english', coalesce(p_query, ''))::text, '&', '|'), '') as text_query
  )
  select i.id,
         ts_rank(
           to_tsvector('english', coalesce(i.varoom_title, i.source_title) || ' ' || coalesce(i.varoom_summary, '') || ' ' || coalesce(i.category, '')),
           q.text_query::tsquery
         ) as rank
    from public.news_items i, query q
   where q.text_query is not null
     and i.review_status = 'published'
     and i.published_at is not null
     and i.published_at <= now()
     and to_tsvector('english', coalesce(i.varoom_title, i.source_title) || ' ' || coalesce(i.varoom_summary, '') || ' ' || coalesce(i.category, ''))
         @@ q.text_query::tsquery
     and (p_county is null or exists (select 1 from unnest(i.counties) c where lower(c) = lower(p_county)))
     and (p_category is null or i.category = lower(p_category))
     and (p_regulatory_status is null or i.regulatory_status = lower(p_regulatory_status))
     and (p_days is null or i.published_at >= now() - make_interval(days => p_days))
   order by rank desc, i.published_at desc
   limit least(greatest(coalesce(p_limit, 50), 1), 200);
$$;

-- Only the server-side service (service role) calls this; the public news
-- feed is served from property_news_public_items.
revoke all on function public.property_news_search(text, text, text, text, integer, integer) from public;
revoke all on function public.property_news_search(text, text, text, text, integer, integer) from anon, authenticated;
grant execute on function public.property_news_search(text, text, text, text, integer, integer) to service_role;
