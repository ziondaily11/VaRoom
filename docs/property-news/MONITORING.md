# Monitoring

The `source_fetch_runs` table and `news_events` audit stream support an eventual internal dashboard. `GET /api/admin/sources/health` exposes the protected Phase 1 health summary.

Track for each source: last successful/failed fetch, source age/staleness, error rate, response/parser failures, discovered count, duplicates, new items, and duration. Track the editorial pipeline: irrelevant/archived items, pending review, published/rejected items, AI/schema failures, risk distribution, average processing time, and cost per published item once an AI provider is configured.

Every collection response and GitHub Actions step summary reports active sources, due sources, attempted sources, and due sources deferred by the per-group limit. Summaries also distinguish URL discovery/rejection, article fetch/parse/rejection, insertion, duplicates, and processing failures. Failed-source names and classified failure categories are included in collection responses and the Actions summary; aggregate 403, 404, timeout, and oversized-response counts are also reported. Raw upstream error text is intentionally omitted from the workflow response. Any deferred due source fails the workflow so a group cannot silently remain partially unprocessed. Partial source failures are reported as warnings with explicit counts; they no longer fail the workflow while the source pool is being cleaned up (see `ARCHITECTURE_UPGRADE_PLAN.md`, task 1.9). Item-processing failures fail the workflow and are logged with the affected item ID and exception type. GitHub Actions serializes all scheduled and manually dispatched collector workflow runs through one concurrency group. The workflow is scheduled twice hourly at minutes 17 and 47 UTC; GitHub scheduling remains best-effort, so monitor actual run cadence rather than treating the cron expression as an execution guarantee.

## Alerts (Phase 6)

- **Daily check** (`.github/workflows/property-news-daily-check.yml`, 07:00 Nairobi, plus manual runs): `python -m app.jobs --daily-check` reads the last 24 hours and fails the run, so GitHub emails the repository owner, when no new stories were collected, when every analysis used the rules fallback although an AI provider is configured, or when there were fewer than 12 collection runs (about 48 expected). The run summary also lists the review queue and quarantined sources. One problem produces at most one email a day.
- **Collector runs** fail only for an outage: three or more sources attempted and all failed.
- **Scheduler:** cron-job.org notifies on failed calls (e.g. an expired GitHub token).
- **Records:** every run is in `collection_runs`; every URL outcome in `news_urls`.
