# Production deployment

Property News is mounted in the established Render FastAPI service (`main.py`) and is reached by the VaRoom frontend through the external `/api/news` rewrites in `client/vercel.json`. The browser never receives a Supabase service-role key or a scheduler secret.

## Required release order

1. In the **verified VaRoom production Supabase project**, apply `property-news/supabase/migrations/20260820_000001_property_news.sql` through the authorised SQL release process. It is additive: it creates only Property News tables, indexes, RLS policies, and the safe public view.
2. Deploy the `main` branch to the existing Render service. The existing `main:app` entry point continues serving the chatbot; the mounted Property News routes are available at `/api/news/*` and `/api/internal/*`.
3. Set these server-side Render environment values (never in client files):
   - existing `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`
   - existing `GEMINI_API_KEY` (Property News uses it automatically), or `NEWS_AI_PROVIDER`, `NEWS_AI_API_KEY`, and `NEWS_AI_MODEL`
   - `PROPERTY_NEWS_API_URL=https://property-news-pnsj.onrender.com` and `PROPERTY_NEWS_ADMIN_API_KEY`, where the latter exactly matches the Property News service's `NEWS_ADMIN_API_KEY`
   - a new high-entropy `NEWS_SCHEDULER_SECRET`
   - optional `NEWS_ENVIRONMENT=production`, `NEWS_LOG_LEVEL=INFO`, and fetch limits from `.env.example`
4. Configure the external schedulers with the same high-entropy `NEWS_SCHEDULER_SECRET` set on the Render web service. The GitHub collector workflow targets the canonical Render service URL directly, so a stale scheduler URL secret cannot send collection to an old deployment.
   - Keep `NEWS_ENABLE_BACKGROUND_SCHEDULER` unset or `false`; collection is triggered by external schedulers.
   - For cron-job.org, create 11 hourly POST jobs targeting `https://property-news-pnsj.onrender.com/api/internal/jobs/collect?source_group=N`, replacing `N` with each integer from `0` through `10`. Stagger the jobs five minutes apart in UTC to avoid concurrent requests. Select its Bearer authorization scheme and provide the exact `NEWS_SCHEDULER_SECRET` value configured on the Render service; do not put the secret in the URL. Set `Accept: application/json`; no request body is needed. Confirm the cron-job.org request timeout accommodates the Render response time.
   - The collector partitions due sources into 11 deterministic groups. Calling only one group each hour would leave the other groups unprocessed, so all 11 group jobs are needed for hourly coverage. Each call uses the protected, serialized collection endpoint and database due-source checks.
   - GitHub Actions remains a twice-hourly backup at minutes 17 and 47 UTC, as well as a manual dispatch path. Its scheduled runs are best-effort and may be delayed or skipped.
5. After Render is healthy and the migration is visible through PostgREST, activate the verified official Lands source once:

   ```sh
   curl --fail --request POST \
     --header "Authorization: Bearer $NEWS_SCHEDULER_SECRET" \
     https://property-news-pnsj.onrender.com/api/internal/sources/seed-official-lands
   ```

6. Verify all 11 cron-job.org jobs are enabled and their request history shows successful responses. An HTTP 200 can still contain source failures, so also check Render logs and per-source fetch telemetry. Review the GitHub Actions workflow, retained as an independent backup and manual recovery path; it validates per-group counts and reports deferred due sources, materially high source failure rates, or item-processing failures.
7. Verify `https://varoom.co.ke/api/news/latest?limit=1` and the host dashboard after a published low-risk item is available. High-risk and ownership-sensitive items must remain in review.

## Failure handling and rollback

- Collection is secret-protected, serialised per service instance, rate-limited, and records per-source fetch-run results plus item events.
- A source error does not stop other sources. Processing errors mark the item `failed`; high-risk material remains `pending_review`.
- To pause ingestion, disable the source (`active=false`) in `news_sources` or remove the GitHub Actions secrets. This does not delete published data.
- To remove public availability while investigating an incident, pause the Vercel deployment or remove only the two `/api/news` rewrites; do not remove the RLS controls or database evidence.

## Source configuration and access policy

- `property-news/sources/real-estate-source-pool.json` is a repository-side candidate catalog, not proof of the live Supabase `news_sources` contents. The catalog now uses RSS only for explicit feed-like endpoints; homepage/category endpoints use HTML discovery, which checks declared RSS/Atom alternate links before extracting article links. Apply and verify corresponding changes in the production registry separately.
- Scraper requests use an identifiable VaRoom User-Agent with feed/HTML Accept types and an English/Kenyan-language preference. The collector respects `robots.txt` and source host boundaries. It does not impersonate browser clients, rotate proxies, or use headless browsers to evade 403s or other access restrictions.
- 429 and 5xx responses are retried with bounded backoff, honoring `Retry-After` up to 10 seconds. A 403 remains a source failure and is not bypassed.
- Publication dates accept ISO-8601, RFC-style, and common human-readable forms. If an article has no publication date, a valid HTTP `Last-Modified` value may be used as a lower-confidence fallback. Ingestion time is never substituted for publication time; missing-date items without a usable header remain rejected.
