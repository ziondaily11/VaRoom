# Property News absence investigation and recovery plan

**Date:** 2 October 2026
**Scope:** Property News collection and the public latest-news endpoint
**Status:** Production Supabase data confirms the publication gap and widespread source failures. Collector bug fixed locally and regression-tested; deployment and production recovery verification remain outstanding.

## Executive summary

The strongest confirmed cause is a collector bug in the robots.txt handling path. `SourceCollector._robots_allowed()` starts a worker function that references `source`, but that variable is not defined in the function's scope. The first robots.txt request for a source therefore raises `NameError: name 'source' is not defined` before the feed or source page can be fetched. The supplied collector logs show this exact exception for many sources.

The failure is easy to miss operationally: the internal collection endpoint returns HTTP 200 with per-source failure details, and the GitHub Actions workflow only checks the HTTP status. Consequently, workflow runs can be marked successful even when every source in a group fails.

There is a second availability concern: the GitHub Actions workflow is configured for two runs per hour, but the recent run history returned during this investigation is much sparser. That can leave feeds unchecked even after the collector defect is fixed.

## Changes applied

- `_robots_allowed()` now receives the relevant `Source`, preserving the source-specific redirect allowlist when retrieving robots.txt. Its regression test exercises a cold robots cache and verifies an off-host redirect remains blocked.
- Both collector workflow copies now parse the job response, append status and collection/processing counts to the GitHub Actions step summary, fail on `failed` or `already_running`, and emit warnings for `partial` collection or processing failures.
- Local regression and YAML parsing checks passed. The updated collector has not yet been deployed to Render, so production recovery is unverified.
- Read-only queries against the authenticated `varoom` Supabase project's primary database confirm the outage. No database rows or schema were changed: the required collection telemetry columns and `source_fetch_runs` table already exist.

## Production database findings (2 October 2026)

The `varoom` project's primary database returned:

- **135 active sources**, all web sources.
- **135/135 active sources stale for more than 48 hours** by `last_success_at` / `last_successful_fetch_at`.
- **132/135** had a failure timestamp newer than their last success; **94/135** had never succeeded.
- The latest fetch runs were on **2 October around 01:07 UTC**; the newest run records show `no_feed_found: name 'source' is not defined`, with zero discovered/new items.
- **No items were fetched in the preceding 48 hours.**
- Latest `published_at` was **29 September 2026 13:20:27 UTC**.

This establishes a real ingestion outage, not merely stale display content or a failing latest-news read. The migration that adds `last_success_at`, `last_error`, `failure_category`, and `consecutive_failures` is already reflected in the production schema. Applying it again, resetting collection telemetry, deactivating sources, or editing news rows would not fix the Python runtime defect and could erase or misrepresent operational evidence, so none of those database writes were made.

## Evidence

- The supplied Render collector output around **2 October 2026 01:06-01:07 UTC** repeatedly reports `name 'source' is not defined`, followed by source failures (often categorized as `no_feed_found`). It includes collection POSTs for source groups 6-10 returning HTTP 200.
- The bug is visible in [`collector.py`](../../property-news/app/collector.py#L639): `_robots_allowed(url)` defines `read_robots()` and constructs `_AllowedHostRedirect(self._allowed_hosts(source))` at line 654, but no `source` is available in that scope. `_fetch()` calls this check before making the feed request at lines 686 and 695.
- Each collection request creates a new `SourceCollector` in [`jobs.py`](../../property-news/app/jobs.py#L18). Its robots cache is instance-local, so a previous request cannot warm the cache for the next source-group request.
- The exception classifier falls back to `no_feed_found` for unrecognized exceptions in [`collector.py`](../../property-news/app/collector.py#L507). This obscures the distinction between this programming error and a genuinely missing or unusable feed.
- The collection route returns the job result directly from [`api.py`](../../property-news/app/api.py#L330); source failures are result fields, not necessarily HTTP errors. The [`collector workflow`](../../.github/workflows/property-news-collector.yml#L25) uses `curl --fail`, which validates the HTTP status but does not inspect those fields.
- The GitHub Actions run history shows completed runs marked `success` even though the corresponding Render collector output records source failures. The returned recent run list also has multi-hour gaps, despite the workflow's `17,47 * * * *` schedule.
- The later Render excerpt (04:34-06:33 UTC) shows successful `GET /api/news/latest` responses and an item-detail response, but no collection POSTs in that excerpt. A 200 from the public latest endpoint means the read succeeded; it does not establish that a new story was collected or published.

## Diagnosis

### Confirmed collection blocker

For a cold origin, `_fetch()` checks `robots.txt`. `_robots_allowed()` launches `read_robots()` in a thread, where an undefined `source` is used to build the allowed-host redirect guard. This raises `NameError`; the error is caught by the source-level handler and recorded as a failed run. No feed request or article discovery is reached for that source.

The recent logs show that this is not just a theoretical defect: the exception text appears for many named sources. The reported `no_feed_found` category is misleading for these particular failures because the fallback classifier maps unknown exceptions to that category.

### Why the service and workflow can look healthy

The internal endpoint can return a normal HTTP response containing a failed or partial collection result. The workflow currently treats that HTTP response as success, so successful GitHub checks and Render POST `200 OK` entries are not evidence of successful ingestion.

The public latest endpoint is a read-only query over already-published items. It can return HTTP 200 with an empty list or old items while collection is failing, or while newly collected items remain pending review, failed, or archived.

### Secondary reliability concern

The workflow requests collection twice per hour, but the recent Actions history available in this investigation shows much less frequent scheduled runs, with gaps of several hours. GitHub scheduled workflows can be delayed or skipped; the configured cron expression alone is not a guarantee of execution frequency. Check additional run history and repository Actions settings before choosing whether to keep GitHub Actions as the sole scheduler.

## Fix plan

### P0 - Repair robots.txt source context

1. **Done:** Pass the `Source` into `_robots_allowed()` and use its configured allowed-host set to constrain robots.txt redirects.
2. **Done:** Update both `_fetch()` call sites without weakening host restrictions.
3. **Done:** Add and run a cold-cache regression test that verifies robots retrieval and blocks a disallowed redirect.

### P1 - Make collection failures visible to automation

1. **Done:** Capture and parse each collection response and add group status/counts to the GitHub Actions summary.
2. **Done:** Malformed responses and fully failed/overlapping jobs now fail the workflow; partial collection and item-processing failures emit warnings.
3. **Remaining:** Exercise the workflow validation against representative failed and partial response payloads in CI.

### P1 - Verify scheduler cadence and production configuration

1. Review the complete Actions run history, including skipped/cancelled runs, and confirm the collector workflow is enabled for the default branch.
2. Confirm Render has the intended `NEWS_SCHEDULER_SECRET`, Supabase service credentials, and the background scheduler remains disabled if Actions is the chosen scheduler.
3. If GitHub's schedule continues to miss the required freshness target, use a dependable external scheduler or another monitored trigger. Keep only one active scheduler unless collection locking and duplicate dispatch behavior are deliberately designed.

### P2 - Revalidate sources and publication flow after recovery

1. Dispatch the collector manually after deploying the fix and inspect all 11 source groups.
2. For errors that remain after the `NameError` is gone, validate each source's feed/discovery URL, method, robots policy, redirects, and configured allowed hosts. The supplied log also includes off-host discoveries (for example, People Daily resolving to a host outside its configured allowlist); verify the correct official host before changing that allowlist.
3. Disable sources that have no verified collection endpoint rather than leaving broken or placeholder sources active.
4. Compare discovered, inserted, processed, pending-review, failed, and published counts. If collection resumes but no new stories appear publicly, inspect publication and review statuses separately; high-risk stories may correctly require human review.

## Recovery verification checklist

- The collector no longer logs `name 'source' is not defined`.
- A manual run completes for each source group; the API result's counts are inspected, not just its HTTP status.
- Active priority sources have recent successful fetch timestamps and fetch-run telemetry records the outcome.
- At least one genuinely new, relevant item proceeds through processing; confirm whether it is published automatically or waiting for review.
- The newest `published_at` is checked in the database and through `/api/news/latest`; an HTTP 200 alone is not the acceptance criterion.
- Scheduled runs execute at the agreed operational cadence, and a failed or stale priority source produces a visible alert.

## Read-only production checks

Run these against the verified production Supabase project using an authorized SQL session:

```sql
-- Latest fetch outcome for each source.
select s.name, s.active, s.last_success_at, s.last_failed_fetch_at,
       s.failure_category, s.consecutive_failures,
       r.started_at, r.result, r.discovered_count, r.new_item_count, r.error_message
from public.news_sources s
left join lateral (
  select started_at, result, discovered_count, new_item_count, error_message
  from public.source_fetch_runs
  where source_id = s.id
  order by started_at desc
  limit 1
) r on true
order by s.active desc, s.name;

-- Distinguish newly fetched content from newly published content.
select review_status, count(*) as item_count,
       max(fetched_at) as latest_fetch,
       max(published_at) as latest_publication
from public.news_items
where fetched_at >= now() - interval '48 hours'
group by review_status
order by review_status;

select max(published_at) as latest_published_at
from public.news_items
where review_status = 'published';
```

These checks establish whether the outage is confined to source collection or whether a downstream processing/review/publication bottleneck remains after the collector is repaired.
