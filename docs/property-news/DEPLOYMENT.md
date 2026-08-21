# Production deployment

Property News is mounted in the established Render FastAPI service (`main.py`) and is reached by the VaRoom frontend through the external `/api/news` rewrites in `client/vercel.json`. The browser never receives a Supabase service-role key or a scheduler secret.

## Required release order

1. In the **verified VaRoom production Supabase project**, apply `property-news/supabase/migrations/20260820_000001_property_news.sql` through the authorised SQL release process. It is additive: it creates only Property News tables, indexes, RLS policies, and the safe public view.
2. Deploy the `main` branch to the existing Render service. The existing `main:app` entry point continues serving the chatbot; the mounted Property News routes are available at `/api/news/*` and `/api/internal/*`.
3. Set these server-side Render environment values (never in client files):
   - existing `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`
   - existing `GEMINI_API_KEY` (Property News uses it automatically), or `NEWS_AI_PROVIDER`, `NEWS_AI_API_KEY`, and `NEWS_AI_MODEL`
   - a new high-entropy `NEWS_SCHEDULER_SECRET`
   - optional `NEWS_ENVIRONMENT=production`, `NEWS_LOG_LEVEL=INFO`, and fetch limits from `.env.example`
4. Set GitHub repository secrets:
   - `PROPERTY_NEWS_SCHEDULER_URL=https://varoom.onrender.com/api/internal/jobs/collect`
   - `NEWS_SCHEDULER_SECRET` matching the Render secret exactly
5. After Render is healthy and the migration is visible through PostgREST, activate the verified official Lands source once:

   ```sh
   curl --fail --request POST \
     --header "Authorization: Bearer $NEWS_SCHEDULER_SECRET" \
     https://varoom.onrender.com/api/internal/sources/seed-official-lands
   ```

6. Run the **Property News collector** GitHub Actions workflow once from the Actions tab, then allow its twice-hourly schedule to continue independently of any laptop.
7. Verify `https://varoom.co.ke/api/news/latest?limit=1` and the host dashboard after a published low-risk item is available. High-risk and ownership-sensitive items must remain in review.

## Failure handling and rollback

- Collection is secret-protected, serialised per service instance, rate-limited, and records per-source fetch-run results plus item events.
- A source error does not stop other sources. Processing errors mark the item `failed`; high-risk material remains `pending_review`.
- To pause ingestion, disable the source (`active=false`) in `news_sources` or remove the GitHub Actions secrets. This does not delete published data.
- To remove public availability while investigating an incident, pause the Vercel deployment or remove only the two `/api/news` rewrites; do not remove the RLS controls or database evidence.
