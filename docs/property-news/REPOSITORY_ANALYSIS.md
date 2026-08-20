# Repository Analysis

## Inspection result

This repository has a static HTML/JavaScript client in `client/`, a minimal Node/Express backend in `server/`, and a Python FastAPI assistant service duplicated at the repository root (`main.py`) and in `chatbot/main.py`. No existing VaRoom file was changed during this analysis.

| Area | Current implementation | Phase 1 implication |
| --- | --- | --- |
| Frontend | Static HTML pages and inline JavaScript | Do not add Property Insights pages or navigation yet. |
| Node backend | Express 4, static client hosting, basic health/db-check/account-deletion routes | Do not mount news routes yet. |
| Elie | FastAPI/Gemini service; client calls deployed `/elie/search` directly | Supply a separate evidence service only. |
| Database | Supabase, accessed from browser with anon key and server/services with service key | Create additive Supabase migration only. |
| Authentication | Supabase Auth; server verifies bearer tokens for account deletion; Elie verifies tokens against Supabase | Do not change auth or roles in Phase 1. |
| Migrations | No Supabase CLI project/migration directory found; `chatbot/elie_sessions_schema.sql` is standalone SQL | Keep news migration inside its own isolated folder. |
| Tests/deployment | No committed test runner or CI configuration; `client/elie.html` points to Render for Elie | Tests run from `property-news/`; no deployment configuration is changed. |

## Relevant directories

- `client/`: Existing VaRoom UI, including `client/elie.html`. Untouched.
- `server/`: Existing Express server and server-side Supabase client. Untouched.
- `main.py`: Current deployed-capable FastAPI Elie/host-reply service. Untouched.
- `chatbot/`: A separately tracked copy/scaffold of chatbot code and its own requirements/schema. Untouched.
- `property-news/`: New isolated FastAPI service, migration, registry template, and tests.
- `docs/property-news/`: New Phase 1 documentation.

## Database and API architecture

Supabase is already connected by configuration convention. `server/lib/supabaseClient.js` expects `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`; the FastAPI Elie service also reads the URL, anon key, service-role key, and a Gemini key from environment. The Node API currently exposes only `/api/health`, `/api/db-check`, and `/api/delete-account`.

There is no confirmed production/development Supabase project identity or migration runner in the repository. The news migration is therefore supplied but not executed. It must be applied first to a verified development project, then promoted through the owner's normal Supabase process.

## Elie architecture and future integration points

The active UI calls a deployed Elie endpoint from `client/elie.html`; the Python service implements `POST /elie/search` and performs authenticated listing search. News retrieval should be added later as a separate tool call inside the FastAPI Elie service, not as a browser-side database query. See [INTEGRATION_PLAN.md](INTEGRATION_PLAN.md).

## Potential conflicts and mitigation

- `/api/news` will conflict only after the isolated service is mounted under the existing Express host. It is not mounted now.
- Existing Supabase roles are not inspected or altered. News administrator access is isolated behind a service key in Phase 1 and a future JWT `app_metadata.news_admin` policy.
- The repository has two FastAPI chatbot copies. Phase 2 must establish which service is deployed before any Elie change.
- Candidate source URLs are inactive until source-specific access, robots, terms, and parser selectors are verified.

## Recommended isolated structure

`property-news/app/` contains the API, collector, normalisation, processing, review, retrieval, and repository adapters. `property-news/supabase/migrations/` contains the additive SQL. `property-news/sources/` contains inactive source candidates. This keeps new code reviewable and independently runnable.
