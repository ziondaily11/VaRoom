-- Location searches without scanning every listing: the Popular destinations
-- counts (server/lib/destinationCounts.js) and the feeds' location search all
-- match `location_text ilike '%Nairobi%'`. A trigram index answers those
-- "contains" matches directly, with the same results as before, so no new
-- column, backfill or code change is needed.
-- Safe to re-run; no data changes.

create extension if not exists pg_trgm with schema extensions;

create index if not exists listings_location_text_trgm
  on public.listings using gin (location_text gin_trgm_ops);

-- Rollback:
-- drop index if exists public.listings_location_text_trgm;
