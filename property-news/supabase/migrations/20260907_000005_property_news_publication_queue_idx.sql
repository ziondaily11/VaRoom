-- Keep scheduled-publication release queries indexable and bounded.

create index if not exists news_items_publication_queue_idx
  on public.news_items(scheduled_at asc)
  where review_status = 'approved' and scheduled_at is not null;
