from __future__ import annotations

import unittest

from app.collector import SOURCE_GROUP_COUNT
from app.hourly_scheduler import _validate_result, run_hourly_collection


def collection_result(*, status: str = "no_sources_due", group: int = 0) -> dict:
    attempted = 4 if group == 0 and status == "partial" else 0
    failed = 1 if attempted else 0
    return {
        "collection_status": status,
        "sources_active": 4,
        "sources_due": attempted,
        "sources_deferred": 0,
        "sources_attempted": attempted,
        "sources_successful": attempted - failed,
        "sources_failed": failed,
        "articles_discovered": 0,
        "articles_parsed": 0,
        "articles_inserted": 0,
        "processed": 0,
        "published": 0,
        "pending_review": 0,
        "processing_failures": 0,
    }


class FakeResponse:
    def __init__(self, payload: dict | None = None) -> None:
        self.payload = payload

    def raise_for_status(self) -> None:
        return None

    def json(self) -> dict:
        return self.payload


class FakeClient:
    def __init__(self) -> None:
        self.groups: list[int] = []

    async def get(self, _url: str) -> FakeResponse:
        return FakeResponse({"status": "ok"})

    async def post(self, _url: str, *, params: dict, headers: dict) -> FakeResponse:
        self.groups.append(params["source_group"])
        self.assert_scheduler_auth(headers)
        group = params["source_group"]
        if group == 0:
            return FakeResponse(collection_result(status="partial", group=group))
        return FakeResponse(collection_result())

    @staticmethod
    def assert_scheduler_auth(headers: dict) -> None:
        if headers.get("Authorization") != "Bearer test-secret":
            raise AssertionError("Scheduler request did not include the bearer token")


class HourlySchedulerTests(unittest.IsolatedAsyncioTestCase):
    def test_source_failure_threshold_fails_at_25_percent(self):
        result = collection_result(status="partial", group=0)

        errors = _validate_result(result, source_group=0)

        self.assertTrue(any("25% threshold" in error for error in errors))

    def test_low_rate_source_failure_remains_a_warning_not_a_job_failure(self):
        result = collection_result(status="partial", group=0)
        result.update({
            "sources_active": 5,
            "sources_attempted": 5,
            "sources_successful": 4,
            "sources_failed": 1,
            "sources_due": 5,
        })

        self.assertEqual(_validate_result(result, source_group=0), [])

    async def test_hourly_run_continues_all_groups_after_a_failed_group(self):
        client = FakeClient()

        errors = await run_hourly_collection(
            client, "https://property-news.example/", "test-secret",
        )

        self.assertEqual(client.groups, list(range(SOURCE_GROUP_COUNT)))
        self.assertTrue(any("25% threshold" in error for error in errors))
