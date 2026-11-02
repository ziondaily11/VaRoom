"""Read-only audit of what each news source yields, using the production collector.

For every source in a JSON export of news_sources, run the collector's real
discovery (same parsing, robots.txt rules and host checks as production) and
put each discovered headline through the production pre-download filters.
Nothing is written to any database.

    python -m scripts.audit_sources sources.json --out report.json [--uncapped]
    python -m scripts.audit_sources sources.json --overrides candidates.json

--uncapped lifts the per-page HTML link cap to show what a page could yield.
--overrides maps a source name to parser_config/fetch_method changes to try
instead of the stored configuration.
"""
from __future__ import annotations

import argparse
import asyncio
import json
from pathlib import Path
from typing import Any

from app import collector as collector_module
from app.collector import CollectionFailure, SourceCollector
from app.config import Settings
from app.models import Source
from app.relevance import classify_property_relevance, classify_property_sales_content
from app.repository import MemoryNewsRepository

SOURCE_TIMEOUT_SECONDS = 60
SAMPLE_SIZE = 4


async def audit_source(collector: SourceCollector, source: Source) -> dict[str, Any]:
    fetched: list[str] = []
    original_fetch = collector._fetch

    async def recording_fetch(src, url, **kwargs):
        if src.id == source.id:
            fetched.append(url)
        return await original_fetch(src, url, **kwargs)

    collector._fetch = recording_fetch  # type: ignore[method-assign]
    report: dict[str, Any] = {
        "name": source.name, "fetch_method": source.fetch_method, "trust_tier": source.trust_tier,
        "discovery_url": source.parser_config.get("discovery_url") or source.base_url,
    }
    try:
        discovered = await asyncio.wait_for(collector._discover(source), timeout=SOURCE_TIMEOUT_SECONDS)
        candidates = discovered[0] if isinstance(discovered, tuple) else discovered
        relevant, rejected = [], []
        category = str(source.parser_config.get("category", "") or "")
        for candidate in candidates:
            ok, reason = classify_property_relevance(
                candidate.source_title, candidate.source_url, candidate.clean_text,
                source_name=source.name, category=category, is_pre_fetch=True,
            )
            if ok and classify_property_sales_content(candidate.source_title, candidate.source_url,
                                                      candidate.original_content or "", candidate.clean_text,
                                                      source_name=source.name)[0]:
                ok, reason = False, "SALES_LISTING"
            (relevant if ok else rejected).append((candidate.source_title, candidate.source_url, reason))
        report.update({
            "status": "ok", "discovered": len(candidates), "relevant": len(relevant),
            "relevant_samples": [title for title, _, _ in relevant[:SAMPLE_SIZE]],
            "rejected_samples": [f"{title} [{reason}]" for title, _, reason in rejected[:SAMPLE_SIZE]],
        })
    except CollectionFailure as error:
        report.update({"status": error.category, "error": str(error)[:200], "discovered": 0, "relevant": 0})
    except asyncio.TimeoutError:
        report.update({"status": "timeout", "discovered": 0, "relevant": 0})
    except Exception as error:  # report every source, never stop the audit
        report.update({"status": SourceCollector.classify_failure(error), "error": str(error)[:200],
                       "discovered": 0, "relevant": 0})
    finally:
        collector._fetch = original_fetch  # type: ignore[method-assign]
    report["fetched_urls"] = list(dict.fromkeys(fetched))
    return report


def load_sources(path: Path, overrides: dict[str, dict[str, Any]]) -> list[Source]:
    sources = []
    for row in json.loads(path.read_text(encoding="utf-8")):
        if isinstance(row.get("parser_config"), str):
            row["parser_config"] = json.loads(row["parser_config"])
        change = overrides.get(row["name"], {})
        row = row | {key: value for key, value in change.items() if key != "parser_config"}
        row["parser_config"] = {**(row.get("parser_config") or {}), **change.get("parser_config", {})}
        if overrides and row["name"] not in overrides:
            continue
        sources.append(Source.model_validate(row))
    return sources


async def run(args: argparse.Namespace) -> list[dict[str, Any]]:
    if args.uncapped:
        collector_module.MAX_NEW_ITEMS_PER_SOURCE = 100
    overrides = json.loads(Path(args.overrides).read_text(encoding="utf-8")) if args.overrides else {}
    sources = load_sources(Path(args.sources), overrides)
    collector = SourceCollector(MemoryNewsRepository(), Settings())
    semaphore = asyncio.Semaphore(args.concurrency)

    async def bounded(source: Source) -> dict[str, Any]:
        async with semaphore:
            result = await audit_source(collector, source)
            print(f"{result['status']:>18}  {result['relevant']:>3}/{result['discovered']:<3}  {source.name}", flush=True)
            return result

    try:
        return await asyncio.gather(*(bounded(source) for source in sources))
    finally:
        await collector.close()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("sources", help="JSON array of news_sources rows")
    parser.add_argument("--out", help="Write the full report as JSON")
    parser.add_argument("--uncapped", action="store_true", help="Lift the per-page HTML link cap")
    parser.add_argument("--overrides", help="JSON object: source name -> configuration changes to test")
    parser.add_argument("--concurrency", type=int, default=5)
    args = parser.parse_args()
    results = asyncio.run(run(args))
    if args.out:
        Path(args.out).write_text(json.dumps(results, indent=1, ensure_ascii=False), encoding="utf-8")


if __name__ == "__main__":
    main()
