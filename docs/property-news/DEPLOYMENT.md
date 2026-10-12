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
4. Set the GitHub repository secret `NEWS_SCHEDULER_SECRET` to match the Render web service secret exactly. The collector workflow targets the canonical Render service URL directly, so a stale scheduler URL secret cannot send collection to an old deployment.
   - Keep `NEWS_ENABLE_BACKGROUND_SCHEDULER` unset or `false`; collection is triggered by external schedulers.
   - Provision the hourly Render Cron Job from the repository's root `render.yaml` Blueprint. Set its `NEWS_SCHEDULER_SECRET` to the same value as the web service. The blueprint uses the lowest paid Cron plan and calls the existing protected API, so it does not need its own Supabase or AI credentials. Render charges at least $1/month per Cron service, plus prorated compute while it runs.
   - The Render Cron Job runs at minute 0 UTC each hour and calls all 11 source groups serially. It reports unhealthy groups as failed while continuing the other groups.
   - GitHub Actions remains a twice-hourly backup at minutes 17 and 47 UTC, as well as a manual dispatch path. Both schedulers use the protected, serialized collection endpoint and database due-source checks; a repeated invocation should not re-fetch sources that are not due. GitHub Actions remains best-effort and can still be delayed or skipped.
5. After Render is healthy and the migration is visible through PostgREST, activate the verified official Lands source once:

   ```sh
   curl --fail --request POST \
     --header "Authorization: Bearer $NEWS_SCHEDULER_SECRET" \
     https://property-news-pnsj.onrender.com/api/internal/sources/seed-official-lands
   ```

6. Verify the **Property News hourly Render Cron Job** appears in Render and completes its first run. The GitHub Actions workflow is retained as an independent backup and manual recovery path. Both validate per-group source/article counts and report deferred due sources, materially high source failure rates, or item-processing failures.
7. Verify `https://varoom.co.ke/api/news/latest?limit=1` and the host dashboard after a published low-risk item is available. High-risk and ownership-sensitive items must remain in review.

## Failure handling and rollback

- Collection is secret-protected, serialised per service instance, rate-limited, and records per-source fetch-run results plus item events.
- A source error does not stop other sources. Processing errors mark the item `failed`; high-risk material remains `pending_review`.
- To pause ingestion, disable the source (`active=false`) in `news_sources` or remove the GitHub Actions secrets. This does not delete published data.
- To remove public availability while investigating an incident, pause the Vercel deployment or remove only the two `/api/news` rewrites; do not remove the RLS controls or database evidence.
