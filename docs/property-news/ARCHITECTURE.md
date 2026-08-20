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

Run `python -m app.jobs --collect-due` from a platform cron/worker. Production scheduling is intentionally not enabled by a web request. Source intervals are database values: use 30-60 minutes for priority official sources and 1-3 hours for county/news sources after verification.
