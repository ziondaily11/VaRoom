# Production deployment

The Property News pipeline (collection, analysis, review, Elie evidence search) is the FastAPI service on Render. Readers do not go through it: since Phase 2, `/api/news`, `/api/news/latest` and `/api/news/:id` are Next.js API routes on Vercel (`client/pages/api/news`) that read the public Supabase view `property_news_public_items` with the anon key. The browser never receives a Supabase service-role key or a scheduler secret.

## Required release order

1. In the **verified VaRoom production Supabase project**, apply `property-news/supabase/migrations/20260820_000001_property_news.sql` through the authorised SQL release process. It is additive: it creates only Property News tables, indexes, RLS policies, and the safe public view.
2. Deploy the `main` branch to the existing Render service. The existing `main:app` entry point continues serving the chatbot; the mounted Property News routes are available at `/api/news/*` and `/api/internal/*`.
3. Set these server-side Render environment values (never in client files):
   - existing `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`
   - existing `GEMINI_API_KEY` (Property News uses it automatically), or `NEWS_AI_PROVIDER`, `NEWS_AI_API_KEY`, and `NEWS_AI_MODEL`
   - `PROPERTY_NEWS_API_URL=https://property-news-pnsj.onrender.com` and `PROPERTY_NEWS_ADMIN_API_KEY`, where the latter exactly matches the Property News service's `NEWS_ADMIN_API_KEY`
   - a new high-entropy `NEWS_SCHEDULER_SECRET`
   - optional `NEWS_ENVIRONMENT=production`, `NEWS_LOG_LEVEL=INFO`, and fetch limits from `.env.example`
4. Configure scheduled collection (free tier; see "Scheduling" below). Collection runs on GitHub Actions, not on the Render web service. Keep `NEWS_ENABLE_BACKGROUND_SCHEDULER` unset or `false`.
5. After Render is healthy and the migration is visible through PostgREST, activate the verified official Lands source once:

   ```sh
   curl --fail --request POST \
     --header "Authorization: Bearer $NEWS_SCHEDULER_SECRET" \
     https://property-news-pnsj.onrender.com/api/internal/sources/seed-official-lands
   ```

6. Verify scheduling: cron-job.org's history shows `204` responses from GitHub every 30 minutes, the Actions tab shows a "Property News collector" run for each, and `collection_runs` gains a row per run with `run_trigger = schedule`.
7. Verify `https://varoom.co.ke/api/news/latest?limit=1` and the host dashboard after a published low-risk item is available. High-risk and ownership-sensitive items must remain in review.

## Scheduling (free tier)

Decided 2026-11-02 (plan decisions D1/D2, revised for free tier): no paid Render services.

- **Collection** runs in `.github/workflows/property-news-collector.yml` on a GitHub-hosted runner (free and unlimited for this public repository). It runs `python -m app.jobs --collect-due --trigger schedule` directly against Supabase, so it does not depend on the Render web service being awake. Phase 3 state (`news_urls`, item claims, `collection_runs`) makes interrupted or overlapping runs safe.
- **Secrets** are environment secrets of the GitHub `Production` environment: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `GEMINI_API_KEY`, `NEWS_FETCH_USER_AGENT` (optional). Restrict the environment to the `main` branch (Settings → Environments → Production → Deployment branches) so no other branch's workflow can read the service-role key.
- **On-time trigger:** GitHub may delay or drop scheduled runs (observed: every 3–7 hours instead of 30 minutes), so cron-job.org starts the workflow. GitHub's own hourly schedule remains as a backup.
  - Create a GitHub fine-grained personal access token: Repository access *Only select repositories* → `ziondaily11/VaRoom`; Permissions → Repository → *Actions: Read and write*; nothing else. Note its expiry date and renew it before then.
  - cron-job.org job "Property News collector": every 30 minutes; `POST https://api.github.com/repos/ziondaily11/VaRoom/actions/workflows/property-news-collector.yml/dispatches`; headers `Authorization: Bearer <token>`, `Accept: application/vnd.github+json`, `X-GitHub-Api-Version: 2022-11-28`, `Content-Type: application/json`; body `{"ref":"main","inputs":{"trigger":"schedule"}}`. A successful call returns `204`.
- **Keeping the Render web service warm** (Elie news search and admin review): cron-job.org job "Property News health": every 10 minutes, `GET https://property-news-pnsj.onrender.com/health`. Render's free 750 instance-hours a month cover one always-on service. Readers do not depend on this; `/api/news` is served by Vercel from the public Supabase view.
- **Manual run:** Actions → Property News collector → Run workflow.
- **Upgrade path:** a Render Cron Job running the same command can replace cron-job.org + GitHub Actions later.

## Failure handling and rollback

- Collection is secret-protected, serialised per service instance, rate-limited, and records per-source fetch-run results plus item events.
- A source error does not stop other sources. Processing errors mark the item `failed`; high-risk material remains `pending_review`.
- To pause ingestion, disable the source (`active=false`) in `news_sources`, or pause the cron-job.org job and disable the collector workflow. This does not delete published data.
- To remove public availability while investigating an incident, unpublish the affected stories (set `review_status` away from `published`) or revoke `select` on `property_news_public_items` from `anon`; the Vercel routes then return 503. Do not remove the RLS controls or database evidence.

## Source configuration and access policy

- `property-news/sources/real-estate-source-pool.json` is a repository-side candidate catalog, not proof of the live Supabase `news_sources` contents. The catalog now uses RSS only for explicit feed-like endpoints; homepage/category endpoints use HTML discovery, which checks declared RSS/Atom alternate links before extracting article links. Apply and verify corresponding changes in the production registry separately.
- Scraper requests use an identifiable VaRoom User-Agent with feed/HTML Accept types and an English/Kenyan-language preference. The collector respects `robots.txt` and source host boundaries. It does not impersonate browser clients, rotate proxies, or use headless browsers to evade 403s or other access restrictions.
- 429 and 5xx responses are retried with bounded backoff, honoring `Retry-After` up to 10 seconds. A 403 remains a source failure and is not bypassed.
- Publication dates accept ISO-8601, RFC-style, and common human-readable forms. If an article has no publication date, a valid HTTP `Last-Modified` value may be used as a lower-confidence fallback. Ingestion time is never substituted for publication time; missing-date items without a usable header remain rejected.
