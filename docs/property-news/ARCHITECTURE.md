# Architecture

Phase 1 is a standalone modular service, not an integration into VaRoom's existing Express application.

```text
Source registry -> collector -> URL/content/title duplicate checks -> item store
      -> structured analyser -> deterministic risk policy -> publish or review
      -> public news API / Elie evidence retrieval

Private review actions and every pipeline transition -> immutable-style event audit
```

## Components

- `app/collector.py`: configurable API, RSS, Atom, sitemap, HTML, and manual-URL discovery; bounded responses, retries, exponential backoff, rate spacing, and per-source failure isolation.
- `app/normalizer.py`: canonical URL generation, HTML-to-text cleaning, and SHA-256 normalised-content hashes.
- `app/analysis.py`: a strict Pydantic schema, a conservative rules-based analyser for development, and an optional OpenAI-compatible JSON adapter. Provider output is validated before it affects storage.
- `app/risk.py`: deterministic policy. AI confidence cannot bypass source tier or risk controls.
- `app/processing.py`: moves items from discovered to archived, pending review, or published.
- `app/review.py`: records approve/reject/edit/request-more-evidence decisions and events.
- `app/retrieval.py`: database-first keyword/filter ranking for future Elie use; no vector database is required.
- `app/api.py`: separate REST surface with public rate limiting and fail-closed admin endpoints.

The memory repository makes the service demonstrable without a database. When server-only Supabase configuration is provided, the PostgREST adapter targets only the tables created by the isolated migration. The public API shapes safe fields itself; it never returns original source HTML, clean article text, review data, or pipeline events.

## Status lifecycle

`discovered -> processing -> archived | pending_review | approved -> published`

The migration also supports `analysed`, `rejected`, `failed`, and `archived` for recovery and future UI flows. Critical-risk stories cannot be approved through the Phase 1 review service until their risk is lowered with documented evidence. Approved stories are assigned a `scheduled_at` release slot; only the first available story is published immediately, and each additional story is released one hour after the previous queued/live story.

## Scheduling

Production collection is `.github/workflows/property-news-collector.yml`, which runs `python -m app.jobs --collect-due` directly on a GitHub-hosted runner. cron-job.org starts it every 30 minutes through the `workflow_dispatch` API, with GitHub's own hourly schedule as a backup; see `DEPLOYMENT.md` → Scheduling. Each run releases due publication slots, collects due sources, processes every ready item through `property_news_claim_items()`, and records itself in `collection_runs`. The protected `/api/internal/jobs/collect` endpoint on the Render service remains for manual or emergency runs; do not also run an in-process collector on the web service. Source intervals are database values (`schedule_minutes`).
