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

`discovered -> processing -> archived | pending_review | published`

The migration also supports `analysed`, `approved`, `rejected`, `failed`, and `archived` for recovery and future UI flows. Critical-risk stories cannot be approved through the Phase 1 review service until their risk is lowered with documented evidence.

## Scheduling

Production collection is the GitHub Actions workflow `.github/workflows/property-news-collector.yml` (wake the Render service, then POST `/api/internal/jobs/collect`). Do not also run an in-process hourly collector on the web service; the two jobs share a lock and GitHub `curl --fail` treated 409 as a failed run. Local/ops can still run `python -m app.jobs --collect-due`. Source intervals are database values: use 30-60 minutes for priority official sources and 1-3 hours for county/news sources after verification. After a failed fetch, the collector retries that source after 15 minutes rather than waiting the full interval.
