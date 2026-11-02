# Property News — Architecture Upgrade Plan

**Status:** Approved 2026-11-02 (decisions D1–D5 as recommended) · Phase 0 applied 2026-11-02 · Phase 1 implemented on `property-news-phase1`, not yet deployed

This plan turns Property News from a best-effort side system into a service that can be relied on to publish news consistently. It keeps the parts that work (Python pipeline, Supabase, Gemini, the review workflow) and changes how they are connected, scheduled and monitored.

Nothing in this plan has been implemented. Each phase is approved, built, verified and reported on its own, following `CLAUDE.md` §3 and §12.

---

## 1. Reliability targets

"Consistent" needs numbers. These targets drive every decision below.

| Target | Goal | Measured by |
|---|---|---|
| Read availability | Published news loads 99.9% of the time, even when the pipeline is down | Uptime check on `/api/news/latest` |
| Freshness | At least one new published story every 6 hours, 06:00–22:00 EAT | Age of newest `published_at` |
| Collection cadence | Every active source is attempted on schedule (±15 min) | `collection_runs` table (Phase 3) |
| Source health | ≥ 80% of active sources succeeded in the last 24 h | Source health score (Phase 5) |
| Detection | A broken pipeline is reported within 1 hour, not discovered by a reader | Alerts (Phase 6) |

## 2. Evidence: how the system behaves today

Measured on 2026-11-02 from production Supabase, Render logs and GitHub Actions history.

| Finding | Evidence |
|---|---|
| Very low output | 114 items stored in ~6 weeks (about 3 a day) from 135 active sources |
| Most sources produce nothing | 21 of 135 sources have ever produced an item. In the last 30 days, 70 sources succeeded but yielded 0 items, and 52 never succeeded |
| Gemini never ran | All 114 analyses are `rules-v1`. `GEMINI_API_KEY` was set but `NEWS_AI_PROVIDER` was not, and `config.py` defaults to `rules` |
| Scheduler unreliable | The "every 30 min" collector ran every 3–7 hours. The "every 10 min" keep-alive also ran every 4–6 hours |
| Compute keeps sleeping | 18 Render restarts in 24 h (free tier spin-down). 398 fetch runs stuck in `running` |
| CI always red | 10 of 11 groups failed the latest run on the 25% source-failure threshold (25–75% failure rates) |
| Real news rejected | 48 `NON_NEWS_INSTITUTIONAL_PAGE` rejections in 24 h, e.g. Citizen Digital "Tenants flee ten-storey Riruta building". Substring match: "commission", "values", "leadership" |
| Repeated work | The same old articles are fetched and rejected as `TOO_OLD` every run (66 in 24 h) |
| Publishing is manual | 66 manual approvals vs 13 auto-publishes. Substring risk terms ("lease" in "release") mark most stories HIGH |
| Blind operations | Only warnings and errors reach Render logs. `SOURCE OK`, discard reasons and run summaries are invisible |
| Documented schedulers not running | `DEPLOYMENT.md` describes 11 cron-job.org jobs; logs show only the GitHub runs (4 per group per day) |

## 3. Current architecture and its failure points

```text
GitHub cron (best-effort) ──curl──► Render FREE web service (FastAPI, sleeps)
                                     ├─ collection runs INSIDE the HTTP request
                                     ├─ in-memory lock, in-memory state
                                     └─ public read API
Browser ─► Vercel rewrite /api/news ─► same Render service ─► Supabase
```

Structural weaknesses:

1. **Best-effort scheduler.** GitHub scheduled workflows may be delayed or dropped. They are not a production scheduler.
2. **Sleeping compute.** The free instance spins down; every restart kills the running collection.
3. **Reads depend on the pipeline.** Readers can only see news when the Render service is awake and not busy collecting.
4. **No durable pipeline state.** A run lives in one request's memory. Nothing records what was already fetched, rejected or failed, so work repeats and failures retry forever.
5. **No definition of healthy, no alerts.** Failures are silent; the always-red CI hides real problems.

## 4. Target architecture

```text
              ┌──────────── READ PATH (always on) ────────────┐
 Browser ─► Next.js API route /api/news ─► Vercel CDN cache ─► Supabase
            (anon key, read-only)          (stale-while-       view property_news_public_items
                                            revalidate)
              └──────── no dependency on the Python service ──┘

              ┌──────────── WRITE PATH (background) ──────────┐
 Reliable scheduler ─► Python worker ─► Postgres work queue ─► Gemini
                                        (url frontier, item states,
                                         attempts, next_attempt_at)
              publish = status change in Postgres → visible on next cache refresh
              └────────────────────────────────────────────────┘

 Monitoring: freshness check + source health + dead-man switch ─► alert (email/Slack)
```

Principles:

- **Reads never wait on writes.** The site reads published news directly from the existing public view, cached at the CDN. If ingestion stops, readers still see the latest news.
- **Every unit of work is durable and idempotent.** URLs and items move through states stored in Postgres. A crash loses nothing; a restart resumes.
- **Never fetch or analyse the same thing twice.** Known URLs are skipped before download; analysis is keyed by content hash.
- **The database is the only source registry.** JSON files become seed data, not a second truth.
- **Healthy is defined and watched.** Alerts fire on freshness and source health, not on raw failure counts.

## 5. Phases

Each phase ships independently on top of the running system. Phases 0–2 give most of the visible improvement.

### Phase 0 — Configuration and triage (no code)

| Task | Notes |
|---|---|
| 0.1 Set `NEWS_AI_PROVIDER=gemini` | **Done by owner on 2026-11-02.** Verify after the next run: new rows in `news_analysis` show `model_provider=gemini` |
| 0.2 Deactivate dead sources | 16 sources with `dns_error` (domains do not resolve) |
| 0.3 Decide on off-scope sources | Uganda, Tanzania, Rwanda and Ethiopia sources are collected and published, but the pipeline is Kenya-only (see decision D4) |
| 0.4 Fix allowed hosts | People Daily (`peopledaily.digital`/`pd.co.ke`), BORAQS (`boraqs.go.ke`), Knight Frank (`knightfrank.com`) |
| 0.5 Remove unused secrets | `X_BEARER_TOKEN`, `X_API_BASE_URL`, `X_FETCH_MAX_RESULTS` on Render (83 X sources are inactive) |
| 0.6 Restrict `property_news_source_health` | The view is readable with the anon key and exposes source names and fetch statistics |
| 0.7 Rotate credentials shared during the audit | The Supabase access token and Render API key used for this investigation |

**Done when:** new analyses come from Gemini; dead sources are inactive; the three host fixes are verified by a successful fetch.

**Applied 2026-11-02:** 0.1 (Render redeployed with `NEWS_AI_PROVIDER`), 0.2–0.4 via `ops/2026-11-02-phase0-source-triage.sql` (33 sources deactivated, active web sources 135 → 102; BORAQS and People Daily turned out to be duplicate rows; Knight Frank deactivated rather than widened to the global domain), and 0.6 via migration `20261102_000001`. Still open: verify Gemini and People Daily after the next collection run; 0.5 and 0.7 are for the owner.

### Phase 1 — Correctness fixes in the current pipeline

Small, targeted code changes. Each comes with a regression test built from a real rejected article in the logs.

| Task | File | Change |
|---|---|---|
| 1.1 Quality filter | `app/quality.py` | Whole-word matching; check institutional signals in title and URL only, not the body. Keep the real checks (date, length, newsworthiness) |
| 1.2 Risk engine | `app/risk.py` | Whole-word matching, so "release" no longer matches "lease" and "taxi" no longer matches "tax" |
| 1.3 Logging | `app/api.py` | Configure app logging under uvicorn so `NEWS_LOG_LEVEL` applies and INFO telemetry reaches Render |
| 1.4 AI provider default | `app/config.py` | Use Gemini when `GEMINI_API_KEY` is set and no provider is given, as `.env.example` already documents |
| 1.5 Retry cap | `app/jobs.py`, `app/processing.py` | Failed items stop retrying after N attempts; Gemini 429/5xx back off instead of failing the item |
| 1.6 Startup seed | `app/api.py`, `app/seed_sources.py` | Seeding must not reset collection state or re-activate a source an admin disabled |
| 1.7 Stuck runs | migration / maintenance job | Mark fetch runs older than 1 hour and still `running` as `failed` |
| 1.8 Rules summaries | `app/analysis.py` | Stop cutting summaries mid-word (fallback path only once Gemini runs) |
| 1.9 CI signal (interim) | `.github/workflows/property-news-collector.yml` | Stop failing on the source-failure rate while the pool is being cleaned; report it instead |
| 1.10 Config isolation | `app/config.py` | Load only `property-news/.env`. A bare `load_dotenv()` searched parent folders and picked up the main VaRoom `.env`, including production Supabase credentials, whenever the service or its tests ran inside the main checkout |
| 1.11 Credentials out of logs | `app/config.py`, `app/analysis.py` | Enabling INFO (1.3) would have logged Gemini request URLs, which carried the API key as `?key=`. Send the key in the `x-goog-api-key` header and keep HTTP-client loggers at WARNING |
| 1.12 Log volume | `app/repository.py` | Per-request Supabase success logs move from INFO to DEBUG; timeouts and failures still log at WARNING/ERROR |

**Done when:** the 48-per-day false institutional rejections stop (verified in logs), the Python test suite passes, and a collection run reports new items with Gemini summaries.

### Phase 2 — Split the read path

| Task | Notes |
|---|---|
| 2.1 Next.js API routes `/api/news`, `/api/news/[id]`, `/api/news/latest` | Read `property_news_public_items` with the existing typed browser-safe Supabase client (anon key). Return the same JSON shape the page and host dashboard use today |
| 2.2 CDN caching | `Cache-Control: public, s-maxage=60, stale-while-revalidate=86400`. Readers get cached news instantly; a refresh happens in the background |
| 2.3 Parity tests | Compare responses field by field against the Python endpoints for the same items before switching |
| 2.4 Switch traffic | Remove the `/api/news` rewrites from `client/vercel.json` and the Express proxy routes once parity is verified |
| 2.5 Keep Python for private routes | Admin review, Elie evidence search and internal jobs stay on the Python service |
| 2.6 Rate limiting | The Python public rate limit no longer serves readers. Re-scope it to Elie and admin traffic and confirm which client IP it sees behind Render |

**Done when:** `/api/news` serves from Vercel with the Render service stopped (tested), and the Property News page and host dashboard behave exactly as before.

### Phase 3 — Durable pipeline state

| Task | Notes |
|---|---|
| 3.1 `news_urls` frontier table | One row per canonical URL: source, state (`seen`, `rejected`, `fetched`, `stored`), reason, attempts, `next_attempt_at`, timestamps |
| 3.2 Dedupe before fetch | The collector checks the frontier before downloading. Rejected and known URLs are never fetched again (rejections can expire, e.g. `TOO_OLD` never, `fetch_error` after backoff) |
| 3.3 Item processing queue | Items carry `attempts` and `next_attempt_at`. Workers claim work with `FOR UPDATE SKIP LOCKED`, so runs can overlap or restart safely |
| 3.4 `collection_runs` table | One row per run with the counts the workflow summary prints today. Replaces log scraping |
| 3.5 Analysis cache | Skip Gemini when the same `content_hash` was already analysed |

**Done when:** a run killed halfway resumes on the next run without refetching, and repeated runs over the same feeds make no duplicate article downloads.

### Phase 4 — Reliable scheduling and compute

| Task | Notes |
|---|---|
| 4.1 Choose the scheduler | See decision D1 |
| 4.2 Run collection as a worker, not an HTTP request | Entry point `python -m app.jobs --collect-due` already exists. One run covers all due sources; the 11-group matrix is retired |
| 4.3 Publication release | Release due scheduled stories on every run and on a short independent schedule, so publishing does not depend on collection |
| 4.4 Retire best-effort jobs | The GitHub collector becomes manual-dispatch only; the keep-alive workflow is removed once the read path no longer depends on Render being awake |

**Done when:** a week of production shows every source attempted within its interval ±15 minutes.

### Phase 5 — Source registry and health

| Task | Notes |
|---|---|
| 5.1 Database is the registry | Registration scripts write to the DB; JSON files are seed data only. Remove drift (the 100 pool sources are stored as `rss` pointing at homepages) |
| 5.2 Health score and quarantine | Per-source success rate and yield. After N consecutive failures a source is quarantined and re-checked weekly instead of every run |
| 5.3 Rebuild the pool | Re-verify each source against its real feed or section URL (e.g. a real-estate section, not the homepage). Prefer RSS and WordPress JSON. Focus on Kenyan property, government and major news outlets |
| 5.4 HTML discovery | Per-source URL patterns; raise the 5-link cap; support news sitemaps |
| 5.5 Trust tiers | Review tiers so reliable Kenyan outlets (Citizen, Kenyans.co.ke, Tuko produce most of today's stories) can auto-publish low-risk stories |

**Done when:** ≥ 80% of active sources succeed daily and every active source has produced an item in the last 30 days or is quarantined.

### Phase 6 — Observability and alerting

| Task | Notes |
|---|---|
| 6.1 Freshness check | Alert when no story has been published for 6 hours in the daytime window |
| 6.2 Dead-man switch | The worker pings a monitor (e.g. healthchecks.io) after each run; a missed ping alerts |
| 6.3 Daily digest | Runs, new items, published, rejected by reason, failing sources |
| 6.4 Admin health view | Protected admin page over `collection_runs` and source health (not anon-readable) |

**Done when:** a deliberately stopped worker and a deliberately broken source both raise alerts within an hour.

### Phase 7 — Search and Elie

| Task | Notes |
|---|---|
| 7.1 Postgres full-text search | `tsvector` over title, summary and topics with a GIN index. Search and Elie currently scan only the latest 100 published items |
| 7.2 Server-side filters | County, category and status filters in SQL, not after a 100-row limit |

**Done when:** Elie can find a relevant published story regardless of age.

## 6. Decisions needed from the owner

| ID | Decision | Options | Recommendation |
|---|---|---|---|
| D1 | Scheduler and worker host | (a) Render Cron Job, usage-billed; (b) Render Starter worker, always on; (c) Supabase `pg_cron` calling a protected endpoint | (a) Render Cron Job. It runs the existing Python entry point on time without keeping a web service awake |
| D2 | Keep the Python web service on the free tier? | Free (sleeps) or Starter (always on) | Free is acceptable once Phase 2 removes readers' dependency on it. Elie search and admin review would still see cold starts |
| D3 | Auto-publish policy | Keep manual review for most stories, or auto-publish low/medium risk from reviewed tier-1–2 sources | Auto-publish low/medium risk from tier 1–2 after Phase 1 fixes; keep review for high/critical |
| D4 | Geographic scope | Kenya only, or East Africa | Kenya only for now, matching the analyser and audience |
| D5 | Alert channel | Email, Slack, WhatsApp | Email first (no new integration) |

## 7. Risks and rollback

| Risk | Mitigation |
|---|---|
| Read path change breaks the page or host dashboard | Parity tests before the switch; switching back is restoring two `vercel.json` rewrites |
| Gemini cost or rate limits | Per-run budget, content-hash cache, backoff, rules fallback |
| Looser filters let irrelevant stories through | Phase 1 tests use real accepted and rejected articles; review stays on for high-risk stories |
| Schema migrations on production | Additive migrations only, applied through the existing release process |
| Deactivating sources loses coverage | Only DNS-dead and explicitly off-scope sources in Phase 0; the rest wait for health data in Phase 5 |

## 8. Suggested order

Phase 0 → Phase 1 → Phase 2 → Phase 3 → Phase 4 → Phase 5 → Phase 6 → Phase 7.

Phases 0–2 fix the visible problems (false rejections, no Gemini, slow or unavailable reads). Phases 3–4 make collection dependable. Phases 5–7 raise coverage and make failures visible.
