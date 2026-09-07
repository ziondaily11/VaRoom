from __future__ import annotations

import asyncio
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest.mock import patch

import httpx

from app.analysis import RulesBasedNewsAnalyzer, format_location_display
from app.api import create_app
from app.collector import SourceCollector
from app.config import Settings
from app.constants import RegulatoryStatus, ReviewStatus, RiskLevel
from app.models import CandidateArticle, NewsItem, ReviewAction, Source
from app.media import extract_article_image_url
from app.jobs import run_collection_job
from app.normalizer import canonicalise_url, content_hash
from app.processing import ProcessingService
from app.repository import MemoryNewsRepository
from app.repository import SupabaseNewsRepository
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

    def test_article_image_uses_trusted_source_media_and_skips_logo(self):
        html = '<img class="logo-site" src="/logo.png"><img src="/sites/default/files/story.jpeg" alt="Registry">'
        self.assertEqual(
            extract_article_image_url(html, "https://source1.example.test/story", "https://source1.example.test"),
            "https://source1.example.test/sites/default/files/story.jpeg",
        )

    def test_article_image_is_optional_and_rejects_external_media(self):
        html = '<meta property="og:image" content="https://cdn.example.test/story.jpeg">'
        self.assertIsNone(extract_article_image_url(html, "https://source1.example.test/story", "https://source1.example.test"))

    def test_article_image_rejects_unqualified_document_images(self):
        html = '<img src="/uploads/budget-screenshot.png" alt="Budget document screenshot">'
        self.assertIsNone(extract_article_image_url(html, "https://source1.example.test/story", "https://source1.example.test"))

    def test_location_formatting_summarizes_when_over_five_locations(self):
        self.assertEqual(format_location_display(["Nairobi", "Kiambu"], ["Thika"]), "Nairobi · Kiambu · Thika")
        self.assertEqual(format_location_display([], []), "Kenya")
        self.assertEqual(
            format_location_display(["Nairobi", "Kiambu", "Machakos", "Nakuru", "Mombasa", "Kisumu"], []),
            "National · Kenya"
        )


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

    async def test_html_discovery_rejects_documents_and_non_article_paths(self):
        collector = SourceCollector(self.repository, Settings())
        body = """
        <html><body>
          <a href="/story/real-estate-update">Real estate update</a>
          <a href="/cdn-cgi/l/email-protection/abc">Contact</a>
          <a href="/wp-content/uploads/report.pdf">Annual report</a>
          <a href="/category/real-estate">Real estate</a>
          <a href="/sponsored">Sponsored</a>
        </body></html>
        """
        candidates, rejected = collector._parse_html_discovery(self.source, body, self.source.base_url)
        self.assertEqual([candidate.source_url for candidate in candidates],
                         ["https://source1.example.test/story/real-estate-update"])
        self.assertEqual(rejected, 4)

    async def test_source_hosts_are_normalized_without_allowing_external_hosts(self):
        configured = Source(
            name="People Daily", base_url="https://peopledaily.digital.",
            trust_tier=2, fetch_method="html", schedule_minutes=30, active=True,
            parser_config={"allowed_hosts": ["www.peopledaily.digital"]},
        )
        collector = SourceCollector(self.repository, Settings())
        self.assertTrue(collector._is_allowed_source_url(configured, "https://WWW.PeopleDaily.Digital./story"))
        self.assertTrue(collector._is_allowed_source_url(configured, "https://peopledaily.digital/story"))
        self.assertFalse(collector._is_allowed_source_url(configured, "https://evil.example/story"))

    async def test_article_classifier_rejects_indexes_documents_and_media(self):
        collector = SourceCollector(self.repository, Settings())
        rejected = (
            "/cdn-cgi/l/email-protection/x", "/videos/", "/entertainment/",
            "/farmkenya/podcasts", "/farmkenya/farmersmarket", "/games",
            "/sponsored/", "/category/real-estate", "/results/farms-and-small-holdings/",
            "/report.pdf", "/image.jpg", "/contact/",
        )
        for path in rejected:
            self.assertFalse(collector._is_likely_article_url(
                f"https://source1.example.test{path}", "A real title", self.source.base_url
            ), path)

    async def test_collection_result_reports_empty_success_and_article_rejections(self):
        collector = SourceCollector(self.repository, Settings())
        async def discover(_source):
            return ([], 3)
        collector._discover = discover  # type: ignore[method-assign]
        result = await collector.collect_due_sources()
        self.assertEqual(result["sources_successful"], 1)
        self.assertEqual(result["articles_rejected"], 3)
        self.assertEqual(result["articles_parsed"], 0)
        from app.jobs import _collection_status
        self.assertEqual(_collection_status({
            "sources_attempted": 1, "sources_failed": 0, "articles_parsed": 0,
        }), "empty")

    async def test_supabase_get_retries_transient_read_timeouts(self):
        repository = SupabaseNewsRepository(
            Settings(supabase_url="https://supabase.example.test", supabase_service_role_key="server-only")
        )

        class RetryingClient:
            def __init__(self):
                self.calls = 0

            async def request(self, method, url, **kwargs):
                self.calls += 1
                if self.calls < 3:
                    raise httpx.ReadTimeout("temporary read timeout")
                return httpx.Response(
                    200, json=[{"ok": True}],
                    request=httpx.Request(method, url),
                )

            async def aclose(self):
                return None

        client = RetryingClient()
        repository.client = client
        try:
            self.assertEqual(
                await repository._request("GET", "news_items", params={"limit": "2"}),
                [{"ok": True}],
            )
            self.assertEqual(client.calls, 3)
        finally:
            await repository.close()

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

    async def test_source_group_selects_only_its_stable_bucket(self):
        for index in range(11):
            grouped_source = Source(
                name=f"Grouped source {index:02d}",
                base_url=f"https://grouped{index}.example.test",
                trust_tier=1, fetch_method="rss", schedule_minutes=30, active=True,
            )
            await self.repository.upsert_source(grouped_source)

        collector = SourceCollector(self.repository, Settings())
        seen: list[str] = []

        async def collect_source(grouped_source):
            seen.append(grouped_source.name)
            return {"candidates": 0, "new_items": 0, "duplicates": 0, "failures": 0, "new_item_ids": []}

        collector.collect_source = collect_source  # type: ignore[method-assign]
        result = await collector.collect_due_sources(source_group=3)

        self.assertEqual(result["sources_checked"], 1)
        self.assertEqual(seen, ["Grouped source 03"])

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

    async def test_safe_items_are_released_one_hour_apart(self):
        candidates = [
            CandidateArticle(source_id=self.source.id, source_url=f"https://source1.example.test/safe-{index}",
                             source_title=("Land registry digitisation update in Nairobi"
                                           if index == 0 else "County housing construction permits in Mombasa"),
                             clean_text=(("Land registry digitisation in Nairobi. " * 20)
                                         if index == 0 else ("County housing construction permits in Mombasa. " * 20)))
            for index in range(2)
        ]

        async def discover(_collector, _source):
            return candidates

        with patch.object(SourceCollector, "_discover", new=discover):
            result = await run_collection_job(self.repository, Settings())

        items = sorted(await self.repository.list_items(), key=lambda item: item.source_url)
        self.assertEqual(result["published"], 1)
        self.assertEqual(items[0].review_status, ReviewStatus.PUBLISHED)
        self.assertEqual(items[1].review_status, ReviewStatus.APPROVED)
        self.assertIsNotNone(items[1].scheduled_at)
        self.assertEqual(items[1].scheduled_at - items[0].published_at, timedelta(hours=1))

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

    async def test_processing_failure_redacts_sensitive_url_parameters(self):
        class FailingAnalyzer:
            async def analyse(self, _item, _source):
                raise RuntimeError("Provider failed at https://example.test/?key=secret-value&mode=json")

        item = NewsItem(source_id=self.source.id, source_url="https://source1.example.test/failure",
                        canonical_url="https://source1.example.test/failure", source_title="Land registry update",
                        clean_text="Land registry update in Nairobi.", source_tier=1, content_hash="a" * 64)
        await self.repository.save_item(item)
        with self.assertRaises(RuntimeError):
            await ProcessingService(self.repository, FailingAnalyzer()).process(item.id)
        event = self.repository.events[-1]
        self.assertEqual(event.event_type, "item_processing_failed")
        self.assertNotIn("secret-value", event.payload["error"])
        self.assertIn("key=[redacted]", event.payload["error"])

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

    async def test_batch_source_mapping_in_repository(self):
        source2 = source(tier=2)
        await self.repository.upsert_source(source2)
        source_map = await self.repository.get_sources_map([self.source.id, source2.id])
        self.assertEqual(len(source_map), 2)
        self.assertIn(self.source.id, source_map)
        self.assertIn(source2.id, source_map)


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
                original_content='<img src="/story.jpeg" alt="Story">' if review_status is ReviewStatus.PUBLISHED else None,
                image_url="https://source1.example.test/story.jpeg" if review_status is ReviewStatus.PUBLISHED else None,
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
        self.assertEqual(response_data[0]["source"]["name"], news_source.name)
        self.assertEqual(response_data[0]["image_url"], "https://source1.example.test/story.jpeg")
        self.assertEqual(response_data[0]["location_summary"], "Kenya")

    async def test_latest_news_defaults_to_two_items(self):
        repository = MemoryNewsRepository()
        news_source = source()
        await repository.upsert_source(news_source)
        for i in range(5):
            item = NewsItem(
                source_id=news_source.id, source_url=f"https://source1.example.test/item{i}",
                canonical_url=f"https://source1.example.test/item{i}", source_title=f"Property update {i}",
                clean_text="Property update", varoom_title=f"Property update {i}", varoom_summary="Summary",
                category="property", source_tier=1, content_hash=f"{i}" * 64, review_status=ReviewStatus.PUBLISHED,
                published_at=datetime.now(timezone.utc),
            )
            await repository.save_item(item)
        app = create_app(Settings(public_rate_limit_per_minute=100), repository)
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get("/api/news/latest")
        self.assertEqual(response.status_code, 200)
        response_data = response.json()
        self.assertEqual(len(response_data), 2)

    async def test_latest_news_excludes_published_items_without_publication_time(self):
        repository = MemoryNewsRepository()
        news_source = source()
        await repository.upsert_source(news_source)
        for suffix, published_at in (("visible", datetime.now(timezone.utc)), ("missing-date", None)):
            item = NewsItem(
                source_id=news_source.id, source_url=f"https://source1.example.test/{suffix}",
                canonical_url=f"https://source1.example.test/{suffix}", source_title=f"{suffix} property update",
                clean_text="Property update", varoom_title=f"{suffix} property update", varoom_summary="Summary",
                category="property", source_tier=1, content_hash=("a" if suffix == "visible" else "b") * 64,
                review_status=ReviewStatus.PUBLISHED, published_at=published_at,
            )
            await repository.save_item(item)
        app = create_app(Settings(public_rate_limit_per_minute=100), repository)
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get("/api/news/latest?limit=4")
        self.assertEqual(response.status_code, 200)
        self.assertEqual([entry["title"] for entry in response.json()], ["visible property update"])

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

    async def test_latest_news_uses_a_small_public_select(self):
        class CapturingRepository(MemoryNewsRepository):
            def __init__(self):
                super().__init__()
                self.select_fields = None

            async def list_items(self, **kwargs):
                self.select_fields = kwargs.get("select_fields")
                return []

        repository = CapturingRepository()
        app = create_app(Settings(public_rate_limit_per_minute=100), repository)
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get("/api/news/latest?limit=50")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(repository.select_fields, (
            "id,source_id,source_url,canonical_url,source_title,source_published_at,varoom_title,"
            "varoom_summary,category,topics,counties,towns,regulatory_status,affected_groups,"
            "risk_level,source_tier,published_at,image_url"
        ))

    async def test_public_projection_does_not_require_internal_content_hash(self):
        repository = MemoryNewsRepository()
        source_record = source()
        await repository.upsert_source(source_record)
        item = NewsItem(
            source_id=source_record.id, source_url="https://source1.example.test/story",
            canonical_url="https://source1.example.test/story", source_title="Property update",
            clean_text="Property update", varoom_title="Property update", varoom_summary="Summary",
            category="property", source_tier=1, content_hash="a" * 64,
            review_status=ReviewStatus.PUBLISHED, published_at=datetime.now(timezone.utc),
        )
        await repository.save_item(item)
        public_items = await repository.list_items(
            published_only=True, limit=2,
            select_fields="id,source_id,source_url,canonical_url,source_title,source_published_at,"
                          "varoom_title,varoom_summary,category,topics,counties,towns,regulatory_status,"
                          "affected_groups,risk_level,source_tier,published_at,image_url",
        )
        self.assertEqual(public_items[0].source_title, "Property update")
        self.assertFalse(hasattr(public_items[0], "content_hash"))

    async def test_latest_news_surfaces_timeout_as_service_unavailable(self):
        class TimeoutRepository(MemoryNewsRepository):
            async def list_items(self, **kwargs):
                raise httpx.ReadTimeout("Supabase read timed out")

        app = create_app(Settings(public_rate_limit_per_minute=100), TimeoutRepository())
        transport = httpx.ASGITransport(app=app, raise_app_exceptions=False)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get("/api/news/latest?limit=2")
        self.assertEqual(response.status_code, 503)
        self.assertIn("temporarily unavailable", response.json()["detail"])


class MigrationSafetyTests(unittest.TestCase):
    def test_migration_is_additive_and_contains_required_tables_and_rls(self):
        migration = (Path(__file__).parents[1] / "supabase" / "migrations" / "20260820_000001_property_news.sql").read_text(encoding="utf-8").lower()
        for table in ("news_sources", "news_items", "news_analysis", "news_locations", "news_tags", "news_reviews", "news_events", "source_fetch_runs"):
            self.assertIn(f"create table if not exists public.{table}", migration)
            self.assertIn(f"alter table public.{table} enable row level security", migration)
        self.assertNotIn("drop table", migration)
        self.assertIn("property_news_public_items", migration)

    def test_performance_migration_file_exists_and_adds_image_column(self):
        migration = (Path(__file__).parents[1] / "supabase" / "migrations" / "20260828_000002_property_news_performance.sql").read_text(encoding="utf-8").lower()
        self.assertIn("add column if not exists image_url", migration)
        latest_index = (Path(__file__).parents[1] / "supabase" / "migrations" / "20260907_000003_property_news_latest_index.sql").read_text(encoding="utf-8").lower()
        self.assertIn("news_items_published_latest_idx", latest_index)


if __name__ == "__main__":
    unittest.main()
