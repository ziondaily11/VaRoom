# VaRoom Property News collection failure investigation

**Date:** 3 October 2026  
**Scope:** Property News source registration, scheduled collection, ingestion, processing, and publication  
**Conclusion:** The reported failure was a real production ingestion outage. The strongest confirmed immediate cause is a collector bug that prevented source fetches before feed discovery. The bug is fixed in the checked-in code and a regression test passes, but this checkout does not prove that the fix is deployed or that production collection has recovered.

**Implementation update (3 October):** The collector now reports active/due/attempted/deferred sources per group; the workflow fails on deferred due sources or a group failure rate of at least 25%, and serializes workflow runs on the same ref. Registry import and discovery no longer activate sources without a successful, non-empty verification record. A read-only `--audit` mode compares production rows with local JSON registries. These changes require deployment and, for the source deactivation reconciliation, an authorized audit followed by an explicitly reviewed `--apply`.

## Executive summary

The 2 October production investigation documented a clear collection outage: all 135 active production sources were stale by more than 48 hours, 132 had a failure newer than their last success, and 94 had never succeeded. The latest recorded fetches had zero new items and logged `name 'source' is not defined`; no items had been fetched in the preceding 48 hours. The latest published item was dated 29 September 2026. These are dated production observations from the earlier investigation, not a fresh production query made for this report.

The defect was in the robots.txt check. On a cold robots cache, the nested robots reader referenced `source` without receiving it, throwing `NameError` before it could fetch a feed or page. The current code passes the source into `_robots_allowed()` and uses it to retain the per-source redirect restrictions; the existing regression test exercises that path. Thus, the cause is supported by production logs and the fix is present locally, but deployment and recovery are still unverified.

The collector jobs do **not** load every source represented in source JSON. They query the database for `active=true`, then collect only `platform=web` sources that are due and assigned to the requested group. The workflow dispatches all 11 groups, but each group is capped at 20 due sources. Sources in a candidate JSON file only become job inputs if registration has actually written them to the production `news_sources` table. Some records in the 100-source pool are marked active despite not having a verified feed. So the precise answer is: **the job is designed to cover every eligible active web source in the production table across the 11 groups; the evidence does not show that every candidate source is registered, eligible, due, attempted, or working.**

## What the current code does

1. The GitHub Actions workflow runs at minutes 17 and 47 of each hour and explicitly requests source groups 0 through 10. The production workflow is [`property-news-collector.yml`](../../.github/workflows/property-news-collector.yml); a duplicate file also exists at [`workflows/property-news-collector.yml`](../../workflows/property-news-collector.yml).
2. The protected collection endpoint validates the scheduler secret and serializes collection requests with an in-process lock. It invokes the collection job with the requested group.
3. [`run_collection_job()`](../../property-news/app/jobs.py#L18) constructs the collector, records collection counts/status, then sends new and previously failed items to processing. It counts published, pending-review, archived, and processing-failure outcomes separately.
4. [`collect_due_sources()`](../../property-news/app/collector.py#L176) asks the repository for active sources, filters to web, assigns the source to a stable SHA-256 hostname group, keeps only sources whose retry/schedule is due, sorts by previous attempt, and caps the attempt list at 20 per request.
5. The fetcher checks the configured URL against source-host policy, checks robots.txt, retrieves the configured endpoint, parses by `fetch_method`, filters candidate article URLs, and records source-fetch telemetry. New items then pass through property relevance, quality/risk analysis, and review/publication controls.

The workflow parses and validates the job's JSON response and includes per-group coverage counts in its step summary. Fully failed jobs and lock-contention (`already_running`) fail the action; any due-but-deferred source or source failure rate of at least 25% also fails it. Lower-rate partial collection and processing failures remain warnings.

## Findings

### 1. Confirmed incident root cause: robots.txt exception blocked collection

**Impact:** Every source whose robots cache was cold could fail before the feed/page request, producing zero discovered articles. The incident report records the same `NameError` across source logs, not just a hypothetical code defect.

`_robots_allowed(source, url)` now receives the `Source` and uses its approved hosts when creating the robots redirect handler. `_fetch()` supplies the source at both the initial URL and redirect checks. The earlier incident report records that the old version referred to an undefined `source` inside `read_robots()`, and that Render logs showed the exception at the time.

The existing regression test `test_robots_fetch_uses_source_hosts_for_redirect_guard` passes. The repository also contains a stable-group selection test. These establish local behavior, not deployment state.

**Deployment caveat:** The October 2 incident report explicitly marked deployment and production recovery as outstanding. Neither the source snapshot nor local tests establish that Render is running the fixed revision.

### 2. Source-pool records are not synonymous with production job inputs

The active workflow does not load `sources/*.json`; the importer must apply records to Supabase. The source importer defaults to a dry run and explicitly reports that Supabase was not contacted unless `--apply` is used. The committed [`source-pool-registration-dry-run.txt`](../../property-news/reports/source-pool-registration-dry-run.txt) is registration planning evidence, not proof that all planned rows exist in production.

The registry contains:

| Registry / candidate file | Entries | Marked active in file | What that proves |
|---|---:|---:|---|
| [`real-estate-source-pool.json`](../../property-news/sources/real-estate-source-pool.json) | 100 | 100 | These 100 configurations request activation if applied; not proof of production registration or successful collection. |
| [`kenya-property-sources.json`](../../property-news/sources/kenya-property-sources.json) | 44 | 43 | Candidate/intake records; the registry documentation says to verify narrow source routes before activation. |
| [`additional-sources.json`](../../property-news/sources/additional-sources.json) | 7 | 7 | Local configuration only; no production enrollment proof from this file. |
| [`production-sources.json`](../../property-news/sources/production-sources.json) | 1 | 1 | Configuration entry only; does not establish the current production row or its health. |

The 100-source pool verification file, [`source-pool-verification.md`](../../property-news/reports/source-pool-verification.md), records 11 entries with HTTP 200 and non-empty feed items. The other 89 have no such successful verification record: 81 have no recorded HTTP status, one recorded 403, one 500, three 301, two 404, and one 406. When this audit began, all 100 pool entries were marked active in the local registry despite only 11 successful, non-empty verification records. This implementation has changed the checked-in pool to leave those 11 verified entries active and the other 89 inactive; all other candidate JSON files now default inactive. A status 200 is a point-in-time endpoint check, not proof of continuing production fetch success. For example, some reported “successful” feeds already had old newest-item dates.

All 100 entries in that pool currently declare `fetch_method: "rss"`. For RSS/Atom sources, the collector parses the configured `discovery_url`, first configured `urls` entry, or else the source's `base_url` as a feed endpoint; it does not turn an arbitrary site root into an RSS feed. An endpoint that serves HTML or lacks feed items therefore fails or returns no usable stories. Keep unverified sources inactive until each has a suitable, permitted feed/API/sitemap/HTML route and matching parser settings.

The October 2 production query recorded 135 active database sources, all web sources. This confirms that there was a substantial live source inventory at that time, but the available evidence does not include a current production export mapping those 135 rows to the JSON files or confirming that all candidate entries were registered.

### 3. “All sources are in the jobs” needs qualification

The job machinery partitions sources into all 11 configured groups, and the workflow enumerates each group. This means the workflow is not intentionally limited to a hard-coded subset of source names. However, a source is actually attempted only if it:

- exists in the production `news_sources` table;
- is marked active;
- has `platform == "web"` (other platforms are intentionally excluded from this web collector);
- is due under its schedule or failure retry/backoff policy; and
- falls within the first 20 due sources selected for its group.

The pool's 100 hostnames alone distribute across the 11 groups with a maximum of 13 per group, below the per-request cap. Production has 135 active sources, however, and no current production per-group distribution is available here. If any production group has more than 20 due sources, the cap could defer some until a later run. That is a capacity edge to validate from the live table, not an observed truncation.

Thus, “all sources” is true only for **eligible production web rows** in a full set of group runs, and subject to the per-group cap and due filter. It is not true for every candidate in the local files, inactive rows, non-web sources, or sources that have not yet been registered/applied.

### 4. The production source pool itself contains many likely non-collectors

Even after deploying the robots fix, the verification data predicts continuing per-source failures. Only 11 of the 100 pool entries have a recorded successful feed response with items; many others are unresolved or have endpoint/network/permission failures. The source registry documentation says to verify route, robots policy, legal terms, and parser selectors before activation. The local registry activation mismatch has been corrected, and the importer now enforces the successful, non-empty endpoint evidence. Production may still have rows activated by the earlier registry and requires the read-only audit followed by a reviewed reconciliation.

When individual sources continue to fail, inspect each recorded `failure_category`, `last_error`, `source_fetch_runs`, effective discovery URL, robots response, redirects, content type, and parser method. The existing October 2 report specifically noted off-host discovery failures for some sources. Do not solve those by loosening host restrictions without verifying the official host.

### 5. Freshness and volume failures can occur downstream of fetching

The public latest-news endpoint reads already published items; a successful HTTP 200 does not prove new content is being fetched or published. If collection recovers, items can still be rejected as irrelevant/low-quality, fail processing, remain pending review, or be archived. Compare discovered → inserted → processed → pending review → published counts before deciding that collection is healthy.

The October 2 production evidence points first to collection, not only the editorial stage: zero items were fetched in the prior 48 hours and the source failures occurred before feed discovery. The latest publication timestamp was also stale. After collection is repaired, the editorial and publication metrics still need independent verification.

### 6. Scheduler/operational risks remain to be verified

- The two-per-hour cron declaration does not prove scheduled runs occurred at that cadence. The October 2 report observed several-hour gaps in the run history it reviewed.
- The workflow runs its 11 matrix groups with `max-parallel: 1`; groups execute sequentially within a workflow invocation. The implementation now serializes scheduled and manually dispatched workflows through one global workflow concurrency group. Render's in-process lock still waits up to 120 seconds, then reports `already_running`; it does not coordinate independent callers across multiple Render instances.
- The current workflow fails when due sources are deferred by the 20-source group cap or when a group's source failure rate is at least 25%. Lower partial source failure rates and processing failures remain warnings in the step summary.

These were risks identified from configuration, not claims that each caused the 2 October outage. The configured GitHub Actions path is serialized; direct protected API callers are not protected by a distributed lock.

The later user-provided Render excerpt (3 October, about 19:23–19:35 UTC) shows a complete sequence of collection POSTs for groups 0–10 with HTTP 200 responses, plus an earlier partial group sequence. It also shows a quality-filter rejection for a National Land Commission item, off-host links being blocked for the Central Bank source, an admin approval action, and subsequent public latest-news reads. The user reports three news samples that day. This is encouraging evidence of recovery and editorial activity, but the excerpt contains no response JSON/source counts and therefore cannot establish source coverage, funnel yield, or sustained scheduler health.

## Answer: are all available news sources actively part of the jobs?

**No—not in the broad sense of every available/configured candidate.** The scheduled workflow targets all 11 group IDs, and the collector queries every active web source in its production database before applying due/group/cap filters. But local candidate registries do not automatically become jobs: they must be applied to the production database. Several files describe candidates rather than proven active production rows, and the 100-source pool's own verification shows only 11 entries with successful, non-empty feed responses. Any non-web source is deliberately omitted by this collector.

**What can be said about production as of the evidence available:** a 2 October read-only production query found 135 active sources, all web. It also found widespread failures, with every active source stale over 48 hours. This proves that those active web rows were within the collector's source inventory, not that each source was actually attempted successfully during every scheduled run.

**What cannot be said from this checkout:** the present-day production row list, whether the 100-source pool and the other registries were fully applied, whether all 11 groups ran after the fix was deployed, and whether new articles have since been published. Verify those with a fresh authorized read-only production query and current Render/GitHub run logs.

## Prioritized recovery actions

1. **Confirm deployment and current health:** verify the deployed Render revision contains the `_robots_allowed(source, url)` fix; dispatch groups 0–10 once; inspect each group's JSON counts and source failure telemetry.
2. **Reconcile desired vs actual source inventory:** after deploying the read-only `--audit` mode, export active production rows with `name`, `base_url`, `platform`, `fetch_method`, group ID, and latest fetch outcome. Review domains missing from registries, unregistered candidates, and active sources without verified endpoints before applying any deactivation.
3. **Audit source quality before expanding activation:** keep sources with unverified/invalid/blocked endpoints inactive; fix their feed URLs/parser configurations only after validation. Do not activate site-root placeholders as RSS feeds.
4. **Check group capacity and scheduler overlap:** count due active web rows per group against the 20-source cap, review complete Actions history, and decide whether sequential 11-group runs fit the desired cadence. Add run-level serialization or another durable schedule/lock strategy only if runtime evidence shows overlap.
5. **Verify end-to-end content flow:** confirm fresh source successes and fetch-run records, then verify nonzero items inserted and processed; separately inspect published and pending-review counts and the public latest endpoint's newest publication timestamp.
6. **Set explicit freshness alerts:** use the existing source health API/data to alert on stale tier-1 sources, high failure rates, and a lack of recently published items. The monitoring documentation notes that no alert integration is configured in Phase 1.

## Evidence and validation boundaries

- The production counts and dated log excerpts above are transcribed from [`NEWS_ABSENCE_INVESTIGATION_2026-10-02.md`](./NEWS_ABSENCE_INVESTIGATION_2026-10-02.md); they have not been refreshed in this investigation.
- The current collector and source-group behavior was inspected in [`collector.py`](../../property-news/app/collector.py), the job flow in [`jobs.py`](../../property-news/app/jobs.py), and the route/lock in [`api.py`](../../property-news/app/api.py).
- The source-candidate counts and verification results were computed from the checked-in JSON files and checked against [`source-pool-verification.md`](../../property-news/reports/source-pool-verification.md). They are not live-database counts.
- Validation run: `python -m unittest discover -s tests -p test_property_news.py -q` from `property-news/` — **62 tests passed**. This includes the robots redirect-guard and stable source-group tests. It does not validate live credentials, production configuration, GitHub schedule execution, or Render deployment.
