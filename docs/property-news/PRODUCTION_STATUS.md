# Property News Production Status

**Audited:** 21 August 2026
**Scope:** Property News only. `client/client-home.html` is explicitly out of scope and has not been changed.

## Current result

The public Property News API is live on the Supabase-backed Render service and is proxied through `varoom.co.ke`. Scheduled ingestion still requires the protected GitHub Actions collector to complete successfully.

## Completed and verified

- The isolated FastAPI Property News service, safety/risk workflow, review gates, public read models, and tests exist in `property-news/`.
- The additive Supabase migration, including the RLS rules and the `property_news_public_items` safe projection, is versioned in the repository.
- The host dashboard module and `/property-news.html` are deployed at `varoom.co.ke`.
- The deployed `host-home.html` contains the approved Property News module.

## Operational checks

- `https://varoom.co.ke/api/news/latest?limit=1` returns published data.
- `https://varoom-1.onrender.com/health` reports the isolated service and Supabase as configured.
- The collector endpoint is protected and targeted directly by GitHub Actions at `https://varoom-1.onrender.com/api/internal/jobs/collect`.
- The latest collector runs have returned Render `502` responses after the platform request timeout; inspect the Render service logs and the next workflow run after deployment before declaring ingestion recovered.

## Production-ready code completed locally

1. The isolated Property News app is mounted in the existing Render service without changing existing VaRoom routes.
2. A secret-protected collection endpoint, per-source fetch-run telemetry, item processing, failure tracking, and Gemini adapter are implemented.
3. A GitHub Actions scheduler runs twice each hour independently of a developer machine once its two secrets are configured.
4. Vercel now has public `/api/news` rewrites to the Render origin.
5. A robots-permitted official Lands source, with narrow article filtering and no untrusted host fetching, is ready for one protected activation.

## Privileged production configuration

1. Confirm the additive migrations are applied through the authorised Supabase SQL release path and visible to PostgREST.
2. Set `NEWS_SCHEDULER_SECRET` in Render and the matching GitHub Actions secret.
3. Allow the linked Render/Vercel deployments to complete, call the protected source-activation endpoint, and run the collector manually once.

## Deployment prerequisites that cannot be inferred from source control

The Supabase migration must be applied through an authorised SQL release connection; a service-role REST key cannot execute arbitrary schema changes. The Render service needs `NEWS_SCHEDULER_SECRET` (a high-entropy server secret), and GitHub Actions needs the matching `NEWS_SCHEDULER_SECRET` repository secret. Existing Supabase credentials remain server-only; they are not added to version control or frontend code.
