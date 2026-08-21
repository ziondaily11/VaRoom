from __future__ import annotations

import asyncio
import unittest
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import patch

import httpx

from app.analysis import RulesBasedNewsAnalyzer
from app.api import create_app
from app.collector import SourceCollector
from app.config import Settings
from app.constants import RegulatoryStatus, ReviewStatus, RiskLevel
from app.models import CandidateArticle, NewsItem, ReviewAction, Source
from app.jobs import run_collection_job
from app.normalizer import canonicalise_url, content_hash
from app.processing import ProcessingService
from app.repository import MemoryNewsRepository
from app.retrieval import NewsRetrievalService
from app.review import ReviewService
from app.seed_sources import upsert_official_lands_source


def source(*, tier: int = 1, active: bool = True) -> Source:
    return Source(name=f"Test source {tier}", base_url=f"https://source{tier}.example.test", trust_tier=tier,
                  fetch_method="rss", schedule_minutes=30, active=active)


class NormalisationTests(unittest.TestCase):
    def test_canonical_url_removes_tracking_and_fragment(self):
        value = canonicalise_url("HTTPS://Example.test/notice/?utm_source=email&b=2&a=1#top")
        self.assertEqual(value, "https://example.test/notice?a=1&b=2")

    def test_content_hash_is_whitespace_and_case_stable(self):
        self.assertEqual(content_hash("A  Property\nUpdate"), content_hash("a property update"))


class PipelineTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.repository = MemoryNewsRepository()
        self.source = source()
        await self.repository.upsert_source(self.source)

    async def test_exact_url_content_hash_and_title_duplicates_are_blocked(self):
        collector = SourceCollector(self.repository, Settings())
        first = CandidateArticle(source_id=self.source.id, source_url="https://source1.example.test/a?utm_source=x",
                                 source_title="Nairobi property update", clean_text="Property update text")
        saved, duplicate = await collector._store_candidate(self.source, first)
        self.assertFalse(duplicate)
        self.assertIsNotNone(saved)
        _, url_duplicate = await collector._store_candidate(self.source, first.model_copy(update={"source_url": "https://source1.example.test/a"}))
        self.assertTrue(url_duplicate)
        _, hash_duplicate = await collector._store_candidate(self.source, first.model_copy(update={"source_url": "https://source1.example.test/b"}))
        self.assertTrue(hash_duplicate)
        title_changed = first.model_copy(update={"source_url": "https://source1.example.test/c", "clean_text": "different evidence", "source_title": "Nairobi property update!"})
        _, title_duplicate = await collector._store_candidate(self.source, title_changed)
        self.assertTrue(title_duplicate)

    async def test_collection_persists_fetch_telemetry_and_returns_new_item_ids(self):
        collector = SourceCollector(self.repository, Settings())
        candidate = CandidateArticle(source_id=self.source.id, source_url="https://source1.example.test/digitisation",
                                     source_title="Land registry digitisation", clean_text="Land registry digitisation in Nairobi. " * 20)

        async def discover(_source):
            return [candidate]

        collector._discover = discover  # type: ignore[method-assign]
        result = await collector.collect_due_sources()
        self.assertEqual(result["new_items"], 1)
        self.assertEqual(len(result["new_item_ids"]), 1)
        self.assertEqual(len(self.repository.fetch_runs), 1)
        self.assertEqual(next(iter(self.repository.fetch_runs.values()))["result"], "succeeded")

    async def test_scheduled_job_processes_and_publishes_a_safe_new_item(self):
        candidate = CandidateArticle(source_id=self.source.id, source_url="https://source1.example.test/safe-update",
                                     source_title="Land registry digitisation update", clean_text="Land registry digitisation in Nairobi. " * 20)

        async def discover(_collector, _source):
            return [candidate]

        with patch.object(SourceCollector, "_discover", new=discover):
            result = await run_collection_job(self.repository, Settings())
        self.assertEqual(result["new_items"], 1)
        self.assertEqual(result["processed"], 1)
        self.assertEqual(result["published"], 1)

    async def test_verified_source_seed_is_idempotent(self):
        first = await upsert_official_lands_source(self.repository, activate=True)
        second = await upsert_official_lands_source(self.repository, activate=True)
        self.assertTrue(first.active)
        self.assertEqual(first.id, second.id)
        self.assertEqual(len(await self.repository.list_sources()), 2)

    async def test_regulatory_statuses_preserve_source_meaning(self):
        analyzer = RulesBasedNewsAnalyzer()
        cases = {
            "Government proposes a land rates change.": RegulatoryStatus.PROPOSED,
            "Government proposes land rates that could be effective next year.": RegulatoryStatus.PROPOSED,
            "The county approved the housing plan.": RegulatoryStatus.APPROVED,
            "The Act is now in effect from 1 January.": RegulatoryStatus.EFFECTIVE,
            "Parliament rejected the bill.": RegulatoryStatus.REJECTED,
            "The regulation was amended today.": RegulatoryStatus.AMENDED,
        }
        for text, status in cases.items():
            item = NewsItem(source_id=self.source.id, source_url=f"https://source1.example.test/{status}", canonical_url=f"https://source1.example.test/{status}",
                            source_title=text, clean_text=text, source_tier=1, content_hash=content_hash(text))
            analysis = await analyzer.analyse(item, self.source)
            self.assertEqual(analysis.regulatory_status, status)

    async def test_relevance_covers_property_topics_and_rejects_general_news(self):
        analyzer = RulesBasedNewsAnalyzer()
        relevant = NewsItem(source_id=self.source.id, source_url="https://source1.example.test/land", canonical_url="https://source1.example.test/land",
                            source_title="Land registration digitisation", clean_text="Land registry digitisation update in Nairobi.", source_tier=1, content_hash="1" * 64)
        irrelevant = relevant.model_copy(update={"id": relevant.id, "source_url": "https://source1.example.test/sport", "canonical_url": "https://source1.example.test/sport", "source_title": "Football match result", "clean_text": "The team won a football match.", "content_hash": "2" * 64})
        self.assertTrue((await analyzer.analyse(relevant, self.source)).relevant)
        self.assertFalse((await analyzer.analyse(irrelevant, self.source)).relevant)

    async def test_risk_policy_routes_low_and_high_items_correctly(self):
        processor = ProcessingService(self.repository, RulesBasedNewsAnalyzer())
        low = NewsItem(source_id=self.source.id, source_url="https://source1.example.test/digitisation", canonical_url="https://source1.example.test/digitisation",
                       source_title="Property registry digitisation announced", clean_text="A property registry digitisation update was announced in Nairobi.", source_tier=1, content_hash="3" * 64)
        high = NewsItem(source_id=self.source.id, source_url="https://source1.example.test/rates", canonical_url="https://source1.example.test/rates",
                        source_title="Proposed Nairobi land rates", clean_text="Government proposes Nairobi land rates changes for property owners.", source_tier=1, content_hash="4" * 64)
        await self.repository.save_item(low)
        await self.repository.save_item(high)
        processed_low = await processor.process(low.id)
        processed_high = await processor.process(high.id)
        self.assertEqual(processed_low.review_status, ReviewStatus.PUBLISHED)
        self.assertEqual(processed_high.risk_level, RiskLevel.HIGH)
        self.assertEqual(processed_high.review_status, ReviewStatus.PENDING_REVIEW)

    async def test_critical_item_cannot_bypass_review(self):
        item = NewsItem(source_id=self.source.id, source_url="https://source1.example.test/claim", canonical_url="https://source1.example.test/claim",
                        source_title="Rumour of title cancelled", clean_text="Unverified rumour that a title cancelled affects ownership.", source_tier=1,
                        content_hash="5" * 64, risk_level=RiskLevel.CRITICAL, review_status=ReviewStatus.PENDING_REVIEW)
        await self.repository.save_item(item)
        with self.assertRaises(ValueError):
            await ReviewService(self.repository).act(item.id, None, ReviewAction(action="approve", reason="not enough evidence"))

    async def test_elie_retrieval_filters_by_location_and_status(self):
        item = NewsItem(source_id=self.source.id, source_url="https://source1.example.test/nairobi", canonical_url="https://source1.example.test/nairobi",
                        source_title="Nairobi proposed land rates", clean_text="", varoom_title="Nairobi proposed land rates", varoom_summary="Summary",
                        category="land", counties=["Nairobi"], regulatory_status=RegulatoryStatus.PROPOSED, source_tier=1,
                        content_hash="6" * 64, review_status=ReviewStatus.PUBLISHED, published_at=datetime.now(timezone.utc))
        await self.repository.save_item(item)
        result = await NewsRetrievalService(self.repository).search("What proposed land rate change affects Nairobi?")
        self.assertEqual(len(result.evidence), 1)
        self.assertEqual(result.evidence[0].regulatory_status, RegulatoryStatus.PROPOSED)


class ApiSecurityTests(unittest.IsolatedAsyncioTestCase):
    async def test_public_news_excludes_pending_and_rejected_items(self):
        repository = MemoryNewsRepository()
        news_source = source()
        await repository.upsert_source(news_source)
        states = [
            ("published", ReviewStatus.PUBLISHED, "7" * 64),
            ("pending", ReviewStatus.PENDING_REVIEW, "8" * 64),
            ("rejected", ReviewStatus.REJECTED, "9" * 64),
        ]
        for suffix, review_status, digest in states:
            item = NewsItem(
                source_id=news_source.id, source_url=f"https://source1.example.test/{suffix}",
                canonical_url=f"https://source1.example.test/{suffix}", source_title=f"{suffix} property update",
                clean_text="Property update", varoom_title=f"{suffix} property update", varoom_summary="Summary",
                category="property", source_tier=1, content_hash=digest, review_status=review_status,
                published_at=datetime.now(timezone.utc) if review_status is ReviewStatus.PUBLISHED else None,
            )
            await repository.save_item(item)
        app = create_app(Settings(public_rate_limit_per_minute=100), repository)
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get("/api/news/latest?limit=4")
        self.assertEqual(response.status_code, 200)
        response_data = response.json()
        self.assertEqual([entry["title"] for entry in response_data], ["published property update"])
        self.assertNotIn("clean_text", response_data[0])

    async def test_unauthorised_admin_action_is_denied(self):
        repository = MemoryNewsRepository()
        app = create_app(Settings(admin_api_key="test-admin-key", public_rate_limit_per_minute=100), repository)
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get("/api/admin/news/pending")
        self.assertEqual(response.status_code, 401)

    async def test_collection_endpoint_requires_its_own_secret(self):
        repository = MemoryNewsRepository()
        app = create_app(Settings(scheduler_secret="scheduler-key", supabase_url="https://example.test",
                                  supabase_service_role_key="server-only", public_rate_limit_per_minute=100), repository)
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            denied = await client.post("/api/internal/jobs/collect")
            accepted = await client.post("/api/internal/jobs/collect", headers={"Authorization": "Bearer scheduler-key"})
        self.assertEqual(denied.status_code, 401)
        self.assertEqual(accepted.status_code, 200)
        self.assertEqual(accepted.json()["sources_checked"], 0)


class MigrationSafetyTests(unittest.TestCase):
    def test_migration_is_additive_and_contains_required_tables_and_rls(self):
        migration = (Path(__file__).parents[1] / "supabase" / "migrations" / "20260820_000001_property_news.sql").read_text(encoding="utf-8").lower()
        for table in ("news_sources", "news_items", "news_analysis", "news_locations", "news_tags", "news_reviews", "news_events", "source_fetch_runs"):
            self.assertIn(f"create table if not exists public.{table}", migration)
            self.assertIn(f"alter table public.{table} enable row level security", migration)
        self.assertNotIn("drop table", migration)
        self.assertIn("property_news_public_items", migration)


if __name__ == "__main__":
    unittest.main()
