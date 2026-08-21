from __future__ import annotations

import argparse
import asyncio
import json
import logging

from .analysis import NewsAnalyzer, build_analyzer
from .collector import SourceCollector
from .config import settings
from .constants import ReviewStatus
from .processing import ProcessingService
from .repository import build_repository


async def run_collection_job(repository=None, config=settings, analyzer: NewsAnalyzer | None = None) -> dict[str, int]:
    """Collect due sources and process every newly discovered item in one run."""
    store = repository or build_repository(config)
    collector = SourceCollector(store, config)
    processor = ProcessingService(store, analyzer or build_analyzer(config))
    collected = await collector.collect_due_sources()
    result = {key: int(collected[key]) for key in ("sources_checked", "candidates", "new_items", "duplicates", "failures")}
    result.update({"processed": 0, "published": 0, "pending_review": 0, "archived": 0, "processing_failures": 0})
    for item_id in collected["new_item_ids"]:
        try:
            item = await processor.process(item_id)
            result["processed"] += 1
            if item.review_status is ReviewStatus.PUBLISHED:
                result["published"] += 1
            elif item.review_status is ReviewStatus.PENDING_REVIEW:
                result["pending_review"] += 1
            elif item.review_status is ReviewStatus.ARCHIVED:
                result["archived"] += 1
        except Exception:
            result["processing_failures"] += 1
    return result


async def run(collect_due: bool, health_check: bool) -> None:
    repository = build_repository(settings)
    try:
        if collect_due:
            print(json.dumps(await run_collection_job(repository, settings), default=str))
        if health_check:
            print(json.dumps({"sources": await repository.source_health()}, default=str))
    finally:
        if hasattr(repository, "close"):
            await repository.close()


def main() -> None:
    parser = argparse.ArgumentParser(description="Run isolated VaRoom property-news jobs.")
    parser.add_argument("--collect-due", action="store_true", help="Check sources that are due according to their database schedule.")
    parser.add_argument("--health-check", action="store_true", help="Print source-health data for a scheduler or monitor.")
    args = parser.parse_args()
    if not args.collect_due and not args.health_check:
        parser.error("Choose --collect-due and/or --health-check")
    logging.basicConfig(level=settings.log_level)
    asyncio.run(run(args.collect_due, args.health_check))


if __name__ == "__main__":
    main()
