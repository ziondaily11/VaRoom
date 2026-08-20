# Database

The additive migration is [20260820_000001_property_news.sql](../../property-news/supabase/migrations/20260820_000001_property_news.sql). It creates only new `news_*` and `property_news_*` objects.

## Tables

| Table | Responsibility |
| --- | --- |
| `news_sources` | Configurable source registry, trust tier, fetch method, schedule, parser configuration, health timestamps. |
| `news_items` | Source evidence plus VaRoom-safe editorial fields, typed arrays, lifecycle, risk, hash, and publishing state. |
| `news_analysis` | Validated AI/rules output, model metadata, risks, and reasons. |
| `news_locations` | Normalised county/town/area/region evidence. |
| `news_tags` | Filter/search tags. |
| `news_reviews` | Administrator decisions, rationale, edits, and timestamp. |
| `news_events` | Pipeline and audit events. |
| `source_fetch_runs` | Source health and fetch statistics. |
| `news_story_timelines`, `news_timeline_entries` | Future grouping of related policy/regulatory updates. |

`news_items` uses native PostgreSQL arrays, JSONB arrays/objects, numeric confidence, timestamp with time zone, UUID foreign keys, check constraints, unique canonical URLs, and unique content hashes. GIN and B-tree indexes cover public filtering, full-text search, arrays, status, review queue, and operational lookups.

## Security

All underlying tables have RLS enabled. Authenticated administrators require `app_metadata.news_admin=true`; the migration does not modify VaRoom profiles or `auth.users`. Service-role workers bypass RLS only from server-side environment configuration. A restricted `property_news_public_items` view exposes only published editorial fields and source attribution, omitting fetched content, clean text, analysis, review, and event data.

## Apply and rollback

1. Confirm the target is a development Supabase project, back it up, and review the SQL.
2. Apply the migration with the project's established Supabase migration process.
3. Verify tables, indexes, RLS, and the public view before loading a source.
4. Promote the same migration to production only after controlled testing.

There is no automatic rollback because deleting news evidence/audit data can be destructive. For a development rollback, have the database owner create a separately reviewed rollback migration that drops only these explicitly named Phase 1 objects, after backing up any collected data. Do not alter existing VaRoom tables.
