# Elie Integration

Phase 1 provides `GET /api/elie/news-search`, which returns structured, source-backed evidence ranked by keyword match, source authority, recency, and geographic match. It accepts county, status, date, and limit filters. It intentionally does not generate the final conversational answer.

When integration is approved, the deployed FastAPI Elie service should:

1. Detect a property-news intent separately from listing search.
2. Extract location, recency, and status constraints.
3. Call the news retrieval service with server-to-server authentication.
4. Generate an answer only from returned evidence.
5. Cite the original source name and URL in the answer.
6. Preserve the stored regulatory status verbatim; a proposal is not an effective rule.

Do not query Supabase directly from `client/elie.html`, expose a service-role key, or modify the current UI in this phase. See [INTEGRATION_PLAN.md](INTEGRATION_PLAN.md) for deferred file changes.

## Search (Phase 7, 2026-11-03)

Evidence comes from `property_news_search()` (full-text search over every published story; migration `20261103_000001`), re-ranked by relevance, source authority, recency and county. Explicit `county`, `regulatory_status` and `date` parameters filter; words in the question only boost ranking.
