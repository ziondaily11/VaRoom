-- VaRoom Property News: latest published retrieval index
-- Additive migration for the public latest-news query.

create index if not exists news_items_published_latest_idx
  on public.news_items (published_at desc)
  where review_status = 'published' and published_at is not null;
