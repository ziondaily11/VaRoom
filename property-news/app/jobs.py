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
    try:
        collected = await collector.collect_due_sources()
        result = {key: int(collected[key]) for key in ("sources_checked", "candidates", "new_items", "duplicates", "failures")}
        failed_item_ids = [item.id for item in await store.list_failed_items()]
        item_ids = list(dict.fromkeys([*collected["new_item_ids"], *failed_item_ids]))
        result.update({"processed": 0, "published": 0, "pending_review": 0, "archived": 0,
                       "processing_failures": 0, "retried": len(failed_item_ids)})
        
        # Bounded concurrency for LLM/rule processing (up to 5 items concurrently)
        semaphore = asyncio.Semaphore(5)
        
        async def _bounded_process(item_id):
            async with semaphore:
                try:
                    return await processor.process(item_id)
                except Exception:
                    return None

        processed_items = await asyncio.gather(*[_bounded_process(iid) for iid in item_ids])
        for item in processed_items:
            if item is None:
                result["processing_failures"] += 1
            else:
                result["processed"] += 1
                if item.review_status is ReviewStatus.PUBLISHED:
                    result["published"] += 1
                elif item.review_status is ReviewStatus.PENDING_REVIEW:
                    result["pending_review"] += 1
                elif item.review_status is ReviewStatus.ARCHIVED:
                    result["archived"] += 1
        return result
    finally:
        await collector.close()


async def run_reprocess_job(repository=None, config=settings, analyzer: NewsAnalyzer | None = None,
                             limit: int = 20) -> dict[str, int]:
    """Re-fetch and re-clean existing items using the current extraction logic.

    Items collected before the trafilatura-based extraction fix may have
    clean_text contaminated with page chrome (nav menus, account links,
    bylines) that a naive full-page text parser picked up. This re-fetches
    each item's source_url through the same (now-fixed) _fetch_article path
    the normal collector uses, then re-runs analysis so summaries/titles are
    regenerated from the cleaned text. Capped by `limit` per call so a large
    backlog can be worked through in safe batches rather than one long run.
    """
    store = repository or build_repository(config)
    collector = SourceCollector(store, config)
    processor = ProcessingService(store, analyzer or build_analyzer(config))
    result = {"checked": 0, "reprocessed": 0, "fetch_failures": 0, "processing_failures": 0}
    items = await store.list_items(published_only=False)
    for item in items[:limit]:
        result["checked"] += 1
        source = await store.get_source(item.source_id)
        if not source:
            result["fetch_failures"] += 1
            continue
        try:
            candidate = await collector._fetch_article(source, item.source_url,
                                                        published_at=item.source_published_at)
        except Exception:
            result["fetch_failures"] += 1
            continue
        item.clean_text = candidate.clean_text
        item.original_content = candidate.original_content
        item.source_title = candidate.source_title
        await store.save_item(item)
        try:
            await processor.process(item.id)
            result["reprocessed"] += 1
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
