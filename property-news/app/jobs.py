from __future__ import annotations

import argparse
import asyncio
import json
import logging
from datetime import datetime, timedelta, timezone
from typing import Any

from .analysis import NewsAnalyzer, build_analyzer
from .collector import SourceCollector
from .config import configure_logging, settings
from .constants import ReviewStatus
from .models import NewsEvent
from .processing import ProcessingService
from .relevance import classify_property_relevance, classify_property_sales_content
from .repository import build_repository

# A failed item is retried on later runs at most this many times in total.
MAX_PROCESSING_ATTEMPTS = 3
# No source run lasts this long, so a run still "running" after it was abandoned.
STALE_FETCH_RUN_AGE = timedelta(hours=1)


async def _retryable_failed_item_ids(store) -> list:
    """Failed items still under the attempt cap. Items at the cap are archived
    so they stop occupying the failed-item batch."""
    item_ids = []
    for item in await store.list_failed_items():
        failures = await store.count_item_events(item.id, "item_processing_failed", MAX_PROCESSING_ATTEMPTS)
        if failures < MAX_PROCESSING_ATTEMPTS:
            item_ids.append(item.id)
            continue
        full_item = await store.get_item(item.id)
        if full_item is None:
            continue
        full_item.review_status = ReviewStatus.ARCHIVED
        await store.save_item(full_item)
        await store.add_event(NewsEvent(news_id=item.id, source_id=item.source_id,
                                        event_type="item_processing_abandoned",
                                        payload={"failed_attempts": failures}))
    return item_ids


async def run_collection_job(repository=None, config=settings, analyzer: NewsAnalyzer | None = None,
                             source_group: int | None = None) -> dict[str, Any]:
    """Collect due sources and process every newly discovered item in one run."""
    store = repository or build_repository(config)
    collector = SourceCollector(store, config)
    processor = ProcessingService(store, analyzer or build_analyzer(config))
    try:
        try:
            released = await store.release_due_publications()
        except Exception as error:
            logging.getLogger(__name__).error("Publication release failed; continuing collection: %s", error)
            released = 0
        try:
            abandoned = await store.fail_stale_fetch_runs(datetime.now(timezone.utc) - STALE_FETCH_RUN_AGE)
            if abandoned:
                logging.getLogger(__name__).info("Marked %d abandoned fetch runs as failed", abandoned)
        except Exception as error:
            logging.getLogger(__name__).error("Stale fetch-run cleanup failed; continuing collection: %s", error)
        collected = await collector.collect_due_sources(source_group=source_group)
        result = {key: int(collected.get(key, 0)) for key in (
            "sources_active", "sources_due", "sources_deferred", "sources_checked",
            "sources_attempted", "sources_successful", "sources_failed",
            "candidates", "articles_discovered", "articles_rejected", "articles_parsed",
            "articles_inserted", "new_items", "duplicates", "duplicates_skipped",
            "failures", "article_failures", "urls_discovered", "urls_rejected",
            "security_blocked_urls", "articles_fetched",
            "timeouts", "http_403", "http_404", "oversized_responses",
        )}
        result["source_failures"] = collected.get("source_failures", [])
        result["collection_status"] = _collection_status(result)
        failed_item_ids = await _retryable_failed_item_ids(store)
        item_ids = list(dict.fromkeys([*collected["new_item_ids"], *failed_item_ids]))
        result.update({"processed": 0, "published": released, "pending_review": 0, "archived": 0,
                       "processing_failures": 0, "retried": len(failed_item_ids), "released": released})
        
        # Bounded concurrency for LLM/rule processing (up to 5 items concurrently)
        semaphore = asyncio.Semaphore(5)
        
        async def _bounded_process(item_id):
            async with semaphore:
                try:
                    return await processor.process(item_id)
                except Exception as error:
                    logging.getLogger(__name__).error(
                        "Item processing failed item_id=%s error_type=%s",
                        item_id, type(error).__name__,
                    )
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


def _collection_status(result: dict[str, Any]) -> str:
    attempted = result.get("sources_attempted", result.get("sources_checked", 0))
    failed = result.get("sources_failed", result.get("failures", 0))
    parsed = result.get("articles_parsed", result.get("candidates", 0))
    if not attempted:
        return "no_sources_due"
    if failed == attempted:
        return "failed"
    if failed:
        return "partial"
    if not parsed:
        return "empty"
    return "succeeded"


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
    items = await store.list_items(published_only=False, limit=min(limit, 25))
    for item in items[:limit]:
        result["checked"] += 1
        source = await store.get_source(item.source_id)
        if not source:
            result["fetch_failures"] += 1
            continue

        is_sales, sales_reason = classify_property_sales_content(
            item.varoom_title or item.source_title,
            item.source_url,
            item.original_content or "",
            item.clean_text,
            source_name=source.name,
            category=source.category or "",
        )
        if is_sales:
            await store.delete_item(item.id)
            result["purged_sales"] = result.get("purged_sales", 0) + 1
            logging.getLogger(__name__).info(
                "[Property News] Rejected sales content: %s reason=%s",
                item.source_title, sales_reason,
            )
            continue

        # COST CONTROL: Check relevance on existing metadata before fetching/reprocessing
        is_relevant, reason = classify_property_relevance(
            item.varoom_title or item.source_title,
            item.source_url,
            item.clean_text,
            source_name=source.name,
            is_pre_fetch=True,
        )
        if not is_relevant:
            await store.delete_item(item.id)
            result["purged_irrelevant"] = result.get("purged_irrelevant", 0) + 1
            logging.getLogger(__name__).info("Reprocess job purged non-property item: id=%s url=%s reason=%s", item.id, item.source_url, reason)
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
        is_sales, sales_reason = classify_property_sales_content(
            candidate.source_title,
            candidate.source_url,
            candidate.original_content or "",
            candidate.clean_text,
            source_name=source.name,
            category=source.category or "",
        )
        if is_sales:
            await store.delete_item(item.id)
            result["purged_sales"] = result.get("purged_sales", 0) + 1
            logging.getLogger(__name__).info(
                "[Property News] Rejected sales content: %s reason=%s",
                candidate.source_title, sales_reason,
            )
            continue
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
    configure_logging(settings.log_level)
    asyncio.run(run(args.collect_due, args.health_check))


if __name__ == "__main__":
    main()
