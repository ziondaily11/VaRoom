-- Bounded property-news lookups and latest-feed ordering.

create index if not exists news_items_canonical_url_idx
  on public.news_items(canonical_url);

create index if not exists news_items_content_hash_idx
  on public.news_items(content_hash);

create index if not exists news_items_published_latest_order_idx
  on public.news_items(published_at desc, created_at desc)
  where review_status = 'published' and published_at is not null;
