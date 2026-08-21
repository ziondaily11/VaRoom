# Property News Production Status

**Audited:** 21 August 2026
**Scope:** Property News only. `client/client-home.html` is explicitly out of scope and has not been changed.

## Current result

The Property News feature is **not yet production-operational**. Its host-facing interface and database migration exist, but the live public API returns `404`, no verified source is active, and no independent scheduler runs ingestion.

## Completed and verified

- The isolated FastAPI Property News service, safety/risk workflow, review gates, public read models, and tests exist in `property-news/`.
- The additive Supabase migration, including the RLS rules and the `property_news_public_items` safe projection, is versioned in the repository.
- The host dashboard module and `/property-news.html` are deployed at `varoom.co.ke`.
- The deployed `host-home.html` contains the approved Property News module.

## Incomplete or broken

- `https://varoom.co.ke/api/news/latest` returns `404`; the Vercel static deployment does not route the public news API to a backend.
- `https://varoom.onrender.com/api/news/latest` returns `404`; the deployed Render FastAPI application has not mounted the isolated Property News service.
- The collector discovers and saves items but does not process newly discovered IDs through analysis, review gating, and publication.
- The live Supabase REST API returns `PGRST205` for every Property News table/view. The migration has **not** been applied to the verified live VaRoom project (or its schema cache has not been refreshed), so ingestion cannot safely begin.
- The versioned source registry contains only inactive candidates. No verified production source is eligible for scheduled collection.
- There is no protected production collection endpoint or independent production scheduler.
- The deployed settings do not yet document/configure the Property News AI, scheduler secret, or Vercel backend route.
- No real source-to-public-UI production run has been completed.

## Production-ready code completed locally

1. The isolated Property News app is mounted in the existing Render service without changing existing VaRoom routes.
2. A secret-protected collection endpoint, per-source fetch-run telemetry, item processing, failure tracking, and Gemini adapter are implemented.
3. A GitHub Actions scheduler runs twice each hour independently of a developer machine once its two secrets are configured.
4. Vercel now has public `/api/news` rewrites to the Render origin.
5. A robots-permitted official Lands source, with narrow article filtering and no untrusted host fetching, is ready for one protected activation.

## Still blocked by privileged production configuration

1. Apply the additive migration through the authorised Supabase SQL release path and refresh PostgREST schema visibility.
2. Set `NEWS_SCHEDULER_SECRET` in Render and matching GitHub Actions secrets.
3. Allow the linked Render/Vercel deployments to complete, call the protected source-activation endpoint, and run the first scheduled collection.

## Deployment prerequisites that cannot be inferred from source control

The Supabase migration must be applied through an authorised SQL release connection; a service-role REST key cannot execute arbitrary schema changes. The Render service needs `NEWS_SCHEDULER_SECRET` (a high-entropy server secret). GitHub Actions needs matching repository secrets named `PROPERTY_NEWS_SCHEDULER_URL` and `NEWS_SCHEDULER_SECRET`. Existing Supabase credentials remain server-only; they are not added to version control or frontend code.
