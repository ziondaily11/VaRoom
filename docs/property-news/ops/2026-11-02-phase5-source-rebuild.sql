-- Property News Phase 5 source rebuild (2026-11-02).
-- docs/property-news/ARCHITECTURE_UPGRADE_PLAN.md, tasks 5.1 and 5.3.
-- Rollback: 2026-11-02-phase5-source-rebuild-rollback.sql
-- Each statement is atomic and safe to re-run: only rows that actually change
-- get an audit event in news_events.
--
-- Evidence: production source_fetch_runs (30 days) plus a read-only audit of
-- every source with the production collector on 2026-11-02.

-- 1. Deactivate sources with no successful production fetch in 30 days
--    (blocked, robots.txt, TLS, 404, timeouts) and two duplicates.
with changes(id, reason) as (values
  ('3285fd18-965f-4c50-9298-79d9ffda47f5'::uuid, 'blocked_403: no successful fetch in 30 days'),
  ('098b9923-7410-4253-913e-edb23a544545'::uuid, 'blocked_403: no successful fetch in 30 days'),
  ('b46705a6-dc74-445e-8a50-5ad8a83c1f51'::uuid, 'blocked_403: no successful fetch in 30 days'),
  ('4be5f539-1417-48b7-8558-b1eaab880335'::uuid, 'robots_disallowed: no successful fetch in 30 days'),
  ('2c4d3cfb-f37b-4884-a6e4-63a07d808bba'::uuid, 'duplicate: Capital FM is collected from capitalfm.africa/business/feed'),
  ('32d0c431-ccf9-4bd3-b5ac-12370012e643'::uuid, 'http_404: no successful fetch in 30 days'),
  ('fc510099-0ddc-4f6b-b87f-39e671d63b99'::uuid, 'robots_disallowed: no successful fetch in 30 days'),
  ('bb742745-fff1-40e5-aec9-4e4357dc9364'::uuid, 'robots_disallowed: no successful fetch in 30 days'),
  ('81cf69c3-82cf-4719-bd50-90935b46e93b'::uuid, 'blocked_403: no successful fetch in 30 days'),
  ('d0764785-bb8e-4f03-ae4d-027d985992dc'::uuid, 'blocked_403: no successful fetch in 30 days'),
  ('98efc9bd-4df4-454b-bfda-3d18166f0d58'::uuid, 'blocked_403: no successful fetch in 30 days'),
  ('76279adb-6fea-4c58-9883-c786166c6b66'::uuid, 'tls_error: no successful fetch in 30 days'),
  ('4503968a-34b1-425c-97d7-1ce4f9c0be9f'::uuid, 'blocked_403/oversized: 3 successes in 94 fetches'),
  ('022bfc19-72b2-4d71-987e-57b8a49fc717'::uuid, 'blocked_403: no successful fetch in 30 days'),
  ('6266230a-d349-4f23-ab86-2fda2a4c09b3'::uuid, 'not_allowed_host: no successful fetch in 30 days'),
  ('4cec8013-48fc-40c9-9803-b7b06cd6aa4d'::uuid, 'tls_error: no successful fetch in 30 days'),
  ('39676654-a3be-449c-b97b-a6b533da8e59'::uuid, 'tls_error (incomplete certificate chain): no successful fetch in 30 days'),
  ('e2c00614-659f-4501-905f-8879aa49f9bb'::uuid, 'blocked_403: no successful fetch in 30 days'),
  ('283e26f7-8b53-4155-b30c-3b8d37c78ed3'::uuid, 'robots_disallowed: no successful fetch in 30 days'),
  ('1c24af58-7c18-46bc-accc-398da9c7d974'::uuid, 'invalid_feed_xml: portal, no successful fetch in 30 days'),
  ('a115eda8-cb10-465a-9242-66c37a84558c'::uuid, 'not_allowed_host: no successful fetch in 30 days'),
  ('6988cf6f-70f3-4b63-bcc0-1c954fcac761'::uuid, 'timeout: no successful fetch in 30 days'),
  ('8014174d-81ed-479d-b148-ac98866e19b5'::uuid, 'tls_error (incomplete certificate chain): no successful fetch in 30 days'),
  ('00196009-88a3-4b4a-a474-74567ef06448'::uuid, 'robots_disallowed: peopledaily.digital robots.txt returns 403'),
  ('bb931f30-4a4e-4de9-a519-549debcd3eea'::uuid, 'tls_error: no successful fetch in 30 days'),
  ('461b9c87-a452-4ee2-a812-ec26dee3091c'::uuid, 'blocked_403: no successful fetch in 30 days'),
  ('b50cf225-91a5-4fb3-8bf7-9ae8aec79512'::uuid, 'timeout: no successful fetch in 30 days'),
  ('160e70f2-088a-4d04-9fcc-e3f5c9d4c0d3'::uuid, 'duplicate: The Standard is collected from its business RSS feed'),
  ('a3a6fe85-7c9f-4ec9-81db-108100cf76f7'::uuid, 'blocked_403: no successful fetch in 30 days'),
  ('463a8f77-207a-409a-9fea-bd4bf030aa15'::uuid, 'http_404: no successful fetch in 30 days')
), deactivated as (
  update news_sources s
     set active = false, updated_at = now()
    from changes c
   where s.id = c.id and s.active
  returning s.id, c.reason
)
insert into news_events(source_id, event_type, payload)
select id, 'source_deactivated', jsonb_build_object('reason', reason, 'change', 'phase5-2026-11-02')
  from deactivated;

-- 2. Point sources at feeds that work (verified 2026-11-02). Each is reset so
--    it is due on the next run.
-- The Standard - Real Estate: https://www.standardmedia.co.ke/rss/business.php
with updated as (
  update news_sources
     set fetch_method = 'rss',
         parser_config = '{"discovery_url": "https://www.standardmedia.co.ke/rss/business.php", "allowed_hosts": ["standardmedia.co.ke"]}'::jsonb,
         failure_category = null,
         last_error = null,
         consecutive_failures = 0,
         last_failed_fetch_at = null,
         updated_at = now()
   where id = '8c88f603-d838-4a10-a465-cd4f7a0ab1c0'
     and parser_config->>'discovery_url' is distinct from 'https://www.standardmedia.co.ke/rss/business.php'
  returning id
)
insert into news_events(source_id, event_type, payload)
select id, 'source_config_updated', jsonb_build_object('change', 'phase5-2026-11-02', 'previous', '{"fetch_method": "rss", "base_url": "https://standardmedia.co.ke", "parser_config": {"urls": ["https://standardmedia.co.ke"], "selectors": {"url": "link", "title": "title", "content": ["description", "summary"], "published_date": ["pubDate", "published", "updated"]}, "max_articles": 5, "verification": {"url": "https://standardmedia.co.ke", "error": "Source verification exceeded the 45-second limit", "checked_at": "2026-09-29T14:29:15.165384+00:00", "item_count": 0, "http_status": null, "method_used": "rss", "failure_category": "timeout", "newest_item_date": null}, "allowed_hosts": ["standardmedia.co.ke", "www.standardmedia.co.ke"], "discovery_url": "https://standardmedia.co.ke", "registry_metadata": {"region": "Kenya", "source_url": "https://standardmedia.co.ke", "canonical_domain": "standardmedia.co.ke", "ingestion_status": "timeout", "content_categories": ["real estate", "housing", "land", "construction"]}, "exclude_url_contains": ["listing", "listings", "properties-for-sale", "properties-for-rent", "for-sale", "for-rent", "property-listing", "calculator", "calculators", "service", "services", "about", "contact", "login", "register", "account", "agent", "property-search", "search"], "include_url_contains": []}}'::jsonb)
  from updated;

-- Kenyans.co.ke: https://www.kenyans.co.ke/feeds/news
with updated as (
  update news_sources
     set fetch_method = 'rss',
         parser_config = '{"discovery_url": "https://www.kenyans.co.ke/feeds/news"}'::jsonb,
         failure_category = null,
         last_error = null,
         consecutive_failures = 0,
         last_failed_fetch_at = null,
         updated_at = now()
   where id = 'f1990710-a863-4a58-8259-ae819330f770'
     and parser_config->>'discovery_url' is distinct from 'https://www.kenyans.co.ke/feeds/news'
  returning id
)
insert into news_events(source_id, event_type, payload)
select id, 'source_config_updated', jsonb_build_object('change', 'phase5-2026-11-02', 'previous', '{"fetch_method": "html", "base_url": "https://www.kenyans.co.ke", "parser_config": {"discovery_url": "https://www.kenyans.co.ke"}}'::jsonb)
  from updated;

-- Capital FM Business: https://www.capitalfm.africa/business/feed/
with updated as (
  update news_sources
     set base_url = 'https://www.capitalfm.africa',
         fetch_method = 'rss',
         parser_config = '{"discovery_url": "https://www.capitalfm.africa/business/feed/", "allowed_hosts": ["capitalfm.africa", "capitalfm.co.ke"]}'::jsonb,
         failure_category = null,
         last_error = null,
         consecutive_failures = 0,
         last_failed_fetch_at = null,
         updated_at = now()
   where id = '53761029-859e-4c20-a242-c0b292d65982'
     and parser_config->>'discovery_url' is distinct from 'https://www.capitalfm.africa/business/feed/'
  returning id
)
insert into news_events(source_id, event_type, payload)
select id, 'source_config_updated', jsonb_build_object('change', 'phase5-2026-11-02', 'previous', '{"fetch_method": "rss", "base_url": "https://capitalfm.co.ke", "parser_config": {"urls": ["https://capitalfm.co.ke"], "selectors": {"url": "link", "title": "title", "content": ["description", "summary"], "published_date": ["pubDate", "published", "updated"]}, "max_articles": 5, "verification": {"url": "https://capitalfm.co.ke", "error": "redirect to unapproved host capitalfm.africa", "checked_at": "2026-09-29T14:28:35.459466+00:00", "item_count": 0, "http_status": 301, "method_used": "rss", "failure_category": "not_allowed_host", "newest_item_date": null}, "allowed_hosts": ["capitalfm.co.ke", "www.capitalfm.co.ke"], "discovery_url": "https://capitalfm.co.ke", "registry_metadata": {"region": "Kenya", "source_url": "https://capitalfm.co.ke", "canonical_domain": "capitalfm.co.ke", "ingestion_status": "not_allowed_host", "content_categories": ["business", "property markets", "investment"]}, "exclude_url_contains": ["listing", "listings", "properties-for-sale", "properties-for-rent", "for-sale", "for-rent", "property-listing", "calculator", "calculators", "service", "services", "about", "contact", "login", "register", "account", "agent", "property-search", "search"], "include_url_contains": []}}'::jsonb)
  from updated;

-- 3. New source: Tuko's business feed (verified: 30 items, property stories
--    such as "KRA targets 1m landlords who collect rent"). Tuko News keeps
--    collecting the homepage.
with inserted as (
  insert into news_sources (name, base_url, source_type, trust_tier, fetch_method, schedule_minutes, active, platform, category, parser_config)
  values ('Tuko Business & Economy', 'https://www.tuko.co.ke/business-economy', 'news', 3, 'rss', 120, true, 'web', null,
          '{"discovery_url": "https://www.tuko.co.ke/rss/business-economy.rss", "allowed_hosts": ["tuko.co.ke"]}'::jsonb)
  on conflict (base_url) do nothing
  returning id
)
insert into news_events(source_id, event_type, payload)
select id, 'source_registered', jsonb_build_object('change', 'phase5-2026-11-02') from inserted;

select count(*) as active_web_sources_after from news_sources where active and platform = 'web';
