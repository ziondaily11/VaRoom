# Monitoring

The `source_fetch_runs` table and `news_events` audit stream support an eventual internal dashboard. `GET /api/admin/sources/health` exposes the protected Phase 1 health summary.

Track for each source: last successful/failed fetch, source age/staleness, error rate, response/parser failures, discovered count, duplicates, new items, and duration. Track the editorial pipeline: irrelevant/archived items, pending review, published/rejected items, AI/schema failures, risk distribution, average processing time, and cost per published item once an AI provider is configured.

Alert when a tier-1 source has not completed successfully within twice its configured interval, when failure rate breaches an agreed threshold, or when critical/pending content ages beyond a review SLA. Daily health jobs should read the same tables and alert a private operational channel; no alert integration is configured in Phase 1.
