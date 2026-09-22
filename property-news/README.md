# VaRoom Property News

This is VaRoom's isolated Property News and intelligence subsystem. The public API is proxied by the Express server, the host dashboard consumes published stories, and Elie consumes the source-backed evidence endpoint. The service remains isolated so its service-role credentials never reach a browser.

The service provides the complete back-office flow: source registry, collection, URL/content duplicate detection, structured analysis, deterministic risk controls, human review, controlled publishing, a public read API, and structured evidence retrieval used by Elie. Apply every migration in `supabase/migrations/` before enabling production collection.

## Run locally

```powershell
cd property-news
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
Copy-Item .env.example .env
uvicorn app.api:app --reload --port 8010
```

The in-memory store is used when Supabase credentials are absent, allowing development and tests without touching a database. Set `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` only in deployment to use the Supabase repository.

## Useful commands

```powershell
python -m unittest discover -s tests -v
python -m app.jobs --health-check
python -m app.jobs --collect-due
```

See `../docs/property-news/` for architecture, migration, operating, and future-integration documentation.

## Optional X property-news sources

Apply `supabase/migrations/20260920_000004_x_social_sources.sql` after the
existing migrations. The curated registry is seeded as **unverified and
inactive**; it is never scraped. Set `X_BEARER_TOKEN` only in the service
environment. The scheduled collector verifies each curated handle through the
official X API, activates only an exact username match, and spreads timeline
collection across the existing eleven source groups. Failed lookups remain
inactive and are retried after 24 hours. Without that server-side credential,
jobs return `X News: not_configured` and the website collector continues
unchanged.
