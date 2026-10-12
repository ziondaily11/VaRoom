from __future__ import annotations

import asyncio
import logging
import os
from typing import Any

import httpx

from .collector import SOURCE_GROUP_COUNT
from .config import settings

logger = logging.getLogger("property_news.hourly_scheduler")
DEFAULT_SERVICE_URL = "https://property-news-pnsj.onrender.com"
REQUIRED_COUNTS = (
    "sources_active", "sources_due", "sources_deferred",
    "sources_attempted", "sources_successful", "sources_failed",
    "articles_discovered", "articles_parsed", "articles_inserted", "processed",
    "published", "pending_review", "processing_failures",
)


def _validate_result(result: Any, source_group: int) -> list[str]:
    if not isinstance(result, dict):
        return [f"Group {source_group}: collector returned an unexpected response shape"]

    counts = {key: result.get(key) for key in REQUIRED_COUNTS}
    if any(not isinstance(value, int) or isinstance(value, bool) for value in counts.values()):
        return [f"Group {source_group}: collector response is missing valid collection counts"]
    if any(value < 0 for value in counts.values()):
        return [f"Group {source_group}: collector response contains negative counts"]

    if (
        counts["sources_due"] > counts["sources_active"]
        or counts["sources_attempted"] + counts["sources_deferred"] != counts["sources_due"]
        or counts["sources_attempted"] != counts["sources_successful"] + counts["sources_failed"]
        or counts["articles_inserted"] > counts["articles_parsed"]
    ):
        return [f"Group {source_group}: collector response counts are inconsistent"]

    status = result.get("collection_status")
    if not isinstance(status, str):
        return [f"Group {source_group}: collector response is missing a valid status"]
    if counts["sources_attempted"] == 0:
        expected_status = "no_sources_due"
    elif counts["sources_failed"] == counts["sources_attempted"]:
        expected_status = "failed"
    elif counts["sources_failed"]:
        expected_status = "partial"
    elif counts["articles_parsed"] == 0:
        expected_status = "empty"
    else:
        expected_status = "succeeded"

    errors = []
    if status != expected_status:
        errors.append(
            f"Group {source_group}: status {status!r} conflicts with counts; "
            f"expected {expected_status!r}"
        )
    if status in {"failed", "already_running"}:
        errors.append(f"Group {source_group}: collector did not complete successfully ({status})")
    if counts["sources_deferred"]:
        errors.append(
            f"Group {source_group}: {counts['sources_deferred']} due sources were not attempted"
        )
    if (
        status == "partial"
        and counts["sources_attempted"]
        and counts["sources_failed"] / counts["sources_attempted"] >= 0.25
    ):
        errors.append(
            f"Group {source_group}: source failure rate "
            f"{counts['sources_failed'] / counts['sources_attempted']:.0%} "
            "meets/exceeds the 25% threshold"
        )
    if counts["processing_failures"]:
        errors.append(
            f"Group {source_group}: {counts['processing_failures']} item processing failures"
        )
    return errors


async def run_hourly_collection(client: httpx.AsyncClient, service_url: str, scheduler_secret: str) -> list[str]:
    base_url = service_url.rstrip("/")
    health_response = await client.get(f"{base_url}/health")
    health_response.raise_for_status()

    errors = []
    for source_group in range(SOURCE_GROUP_COUNT):
        try:
            response = await client.post(
                f"{base_url}/api/internal/jobs/collect",
                params={"source_group": source_group},
                headers={"Authorization": f"Bearer {scheduler_secret}"},
            )
            response.raise_for_status()
            result = response.json()
            group_errors = _validate_result(result, source_group)
            if isinstance(result, dict):
                logger.info(
                    "Collection group %s status=%s attempted=%s failed=%s inserted=%s",
                    source_group,
                    result.get("collection_status"),
                    result.get("sources_attempted"),
                    result.get("sources_failed"),
                    result.get("articles_inserted"),
                )
            errors.extend(group_errors)
        except (httpx.HTTPError, ValueError) as error:
            message = f"Group {source_group}: collection request failed: {error}"
            logger.error("%s", message)
            errors.append(message)
    return errors


async def _run() -> int:
    scheduler_secret = settings.scheduler_secret
    if not scheduler_secret:
        logger.error("NEWS_SCHEDULER_SECRET is required to run the hourly collector")
        return 1

    service_url = os.getenv("PROPERTY_NEWS_SERVICE_URL", DEFAULT_SERVICE_URL).strip()
    if not service_url:
        logger.error("PROPERTY_NEWS_SERVICE_URL must not be empty")
        return 1

    timeout = httpx.Timeout(timeout=840, connect=20)
    async with httpx.AsyncClient(timeout=timeout) as client:
        try:
            errors = await run_hourly_collection(client, service_url, scheduler_secret)
        except httpx.HTTPError as error:
            logger.error("Property News health check failed: %s", error)
            return 1

    for error in errors:
        logger.error("%s", error)
    return 1 if errors else 0


def main() -> None:
    logging.basicConfig(level=settings.log_level)
    raise SystemExit(asyncio.run(_run()))


if __name__ == "__main__":
    main()
