# Source Registry

Sources live in `news_sources`; application code does not hard-code active feeds. The example registry at `property-news/sources/initial-sources.example.json` deliberately marks every candidate inactive. `property-news/sources/production-sources.json` contains the first technically verified official source, still inactive until the production migration and scheduler secret are live. The broader Kenyan source intake is recorded in `property-news/sources/kenya-property-sources.json`; it contains 44 additional candidates from government, media, research, property, and professional sources. The exact 100-source expansion is in `property-news/sources/real-estate-source-pool.json`, using the same registry format and importer. Its URLs and active flags are maintained by the discovery verifier.

Before activation, verify the exact page/feed/API, robots policy, rate limit, terms, copyright constraints, allowed user agent, article URL selector, and the source's authority. Record the verification in the source `parser_config` or operational log.

Register the intake file without activating any source:

```powershell
python -m app.register_additional_sources --json-path sources/kenya-property-sources.json
```

Do not use `--activate` until each source has a verified narrow feed or article selector. The intake entries intentionally point at site roots as discovery placeholders; activating them as-is would collect unrelated pages.

Verify the expanded pool without changing its JSON, then inspect the generated report:

```powershell
python scripts/discover_source_urls.py --dry-run
```

The verifier observes robots.txt using the collector User-Agent, checks approved same-domain URLs, and records HTTP/date evidence. It tries RSS/Atom, WordPress REST, sitemaps, then dated HTML listing pages. Use `--write` only when you intend to update the registry:

```powershell
python scripts/discover_source_urls.py --write
```

Register the expanded source pool in dry-run mode (the default); this writes the review-only SQL upsert file and never contacts Supabase:

```powershell
python -m app.register_additional_sources --json-path sources/real-estate-source-pool.json --dry-run
```

Every pool entry is active. Verified entries have a collection method, URL, and timestamped verification evidence. Failures remain active with a categorized failure status, and the collector retries a source every six hours after five consecutive failures. Canonical-domain upserts deduplicate `www` and apex host variants across the registry inputs and synchronize configured active flags in both directions. Apply all migrations before using `--apply`; the default is dry-run and does not contact Supabase.

To apply a configuration correction to already registered sources without changing the rest of the registry, target them explicitly and sync only their configured activation state. For the current NCA/Cytonn remediation:

```powershell
python -m app.register_additional_sources --json-path sources/kenya-property-sources.json --sync-active --name "National Construction Authority" --name "Cytonn Investments"
```

This updates NCA to its press-release route and disables Cytonn until a dated news or research feed has been verified.

Trust tiers:

1. Government ministries/departments, Parliament, Gazette/official notices, county governments: primary evidence.
2. Established Kenyan property/news publications: discovery/context; consequential claims need primary support.
3. Industry bodies/research: market analysis and trends.
4. Blogs/social/aggregators: discovery only; never authoritative alone.

Supported methods are `api`, `wp_json`, `rss`, `atom`, `sitemap`, `html`, and `manual`. The HTML discovery parser uses narrow URL patterns and exclusions. Sources are limited to five new items per run, robots.txt is checked before source requests, and collection is bounded by per-request timeouts and a 45-second source deadline.

The collector honours configured timeouts, response byte limits, bounded retries, exponential backoff, and a minimum interval per origin. It only fetches configured source hosts, never executes fetched JavaScript, deduplicates by canonical URL/content/title, records each fetch run, and cannot let a failing source stop other sources.
