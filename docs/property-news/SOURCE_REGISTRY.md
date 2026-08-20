# Source Registry

Sources live in `news_sources`; application code does not hard-code active feeds. The example registry at `property-news/sources/initial-sources.example.json` deliberately marks every candidate inactive.

Before activation, verify the exact page/feed/API, robots policy, rate limit, terms, copyright constraints, allowed user agent, article URL selector, and the source's authority. Record the verification in the source `parser_config` or operational log.

Trust tiers:

1. Government ministries/departments, Parliament, Gazette/official notices, county governments: primary evidence.
2. Established Kenyan property/news publications: discovery/context; consequential claims need primary support.
3. Industry bodies/research: market analysis and trends.
4. Blogs/social/aggregators: discovery only; never authoritative alone.

Supported methods are `api`, `rss`, `atom`, `sitemap`, `html`, and `manual`. The HTML discovery parser is intentionally generic. A verified source should receive a narrow, tested selector/configuration before being enabled.

The collector honours configured timeouts, response byte limits, bounded retries, exponential backoff, and a minimum interval per origin. It never executes fetched JavaScript and a failing source only records failure; it cannot stop other sources.
