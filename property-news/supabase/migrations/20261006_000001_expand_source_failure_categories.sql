-- Keep the database source-health allowlist aligned with collector failure
-- categories so source errors and backoff state remain persistable.
alter table public.news_sources
  drop constraint if exists news_sources_failure_category_check;

alter table public.news_sources
  add constraint news_sources_failure_category_check
    check (failure_category is null or failure_category in (
      'blocked_403', 'tls_error', 'dns_error', 'timeout', 'http_404',
      'http_4xx', 'http_5xx', 'invalid_feed_xml', 'network_error',
      'parse_error', 'upstream_5xx', 'not_allowed_host', 'no_feed_found',
      'robots_disallowed'
    ));
