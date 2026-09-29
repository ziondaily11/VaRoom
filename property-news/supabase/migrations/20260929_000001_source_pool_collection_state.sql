alter table public.news_sources
  add column if not exists last_success_at timestamptz,
  add column if not exists last_error text,
  add column if not exists failure_category text,
  add column if not exists consecutive_failures integer not null default 0;

alter table public.news_sources
  drop constraint if exists news_sources_fetch_method_check;

alter table public.news_sources
  add constraint news_sources_fetch_method_check
    check (fetch_method in ('api', 'wp_json', 'rss', 'atom', 'sitemap', 'html', 'manual'));

alter table public.news_sources
  drop constraint if exists news_sources_failure_category_check;

alter table public.news_sources
  add constraint news_sources_failure_category_check
    check (failure_category is null or failure_category in (
      'blocked_403', 'tls_error', 'dns_error', 'timeout', 'upstream_5xx',
      'not_allowed_host', 'no_feed_found', 'robots_disallowed'
    ));

alter table public.news_sources
  drop constraint if exists news_sources_consecutive_failures_check;

alter table public.news_sources
  add constraint news_sources_consecutive_failures_check
    check (consecutive_failures >= 0);
