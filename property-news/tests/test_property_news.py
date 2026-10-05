from __future__ import annotations

import asyncio
import json
import socket
import tempfile
import unittest
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest.mock import patch
from urllib.error import HTTPError, URLError

import httpx

from app.analysis import RulesBasedNewsAnalyzer, format_location_display
from app.api import create_app
from app.collector import CollectionFailure, SourceCollector
from app.config import Settings
from app.constants import RegulatoryStatus, ReviewStatus, RiskLevel
from app.models import CandidateArticle, NewsItem, ReviewAction, Source
from app.media import extract_article_image_url
from app.jobs import run_collection_job
from app.normalizer import canonicalise_source_url, canonicalise_url, content_hash
from app.processing import ProcessingService
from app.quality import classify_quality, parse_source_date
from app.relevance import classify_property_relevance, classify_property_sales_content
from app.repository import MemoryNewsRepository
from app.repository import SupabaseNewsRepository
from app.retrieval import NewsRetrievalService
from app.review import ReviewService
from app.seed_sources import upsert_official_lands_source
from app.register_additional_sources import canonical_domain, register_sources_from_json


def source(*, tier: int = 1, active: bool = True) -> Source:
    return Source(name=f"Test source {tier}", base_url=f"https://source{tier}.example.test", trust_tier=tier,
                  fetch_method="rss", schedule_minutes=30, active=active)


class NormalisationTests(unittest.TestCase):
    def test_sales_content_filter_rejects_inventory_but_keeps_news_and_rentals(self):
        rejected = (
            "Apartments for Sale in Nairobi, Thika & Kitengela | Pam Golding Properties Kenya",
            "Stylish 3 bedroom apartment with Dsq in Kileleshwa - Villa Care Kenya",
        )
        for title in rejected:
            with self.subTest(title=title):
                self.assertTrue(classify_property_sales_content(title)[0])

        self.assertFalse(classify_property_sales_content(
            "Office Space to let along Lusaka Road",
        )[0])
        self.assertFalse(classify_property_sales_content(
            "Kenya Property Market Report — Q3 2026 (Asking Prices)",
            text="Market analysis of construction costs, rents, supply and demand across Kenya.",
        )[0])
        self.assertFalse(classify_property_sales_content(
            "Kenya property prices rise as construction costs increase",
            text="Construction costs increased while housing supply remained constrained.",
        )[0])

    def test_sales_filter_rejects_listing_price_and_purchase_language(self):
        cases = (
            ("Three homes available for purchase in Nairobi", ""),
            ("Property listings", "3 bedroom apartment. Asking price: KSh 12 million. Contact agent."),
            ("Buy this property today", "Modern apartment with parking."),
        )
        for title, text in cases:
            with self.subTest(title=title):
                self.assertTrue(classify_property_sales_content(title, text=text)[0])

    def test_quality_gate_rejects_institutional_and_old_content(self):
        recent = datetime.now(timezone.utc) - timedelta(days=2)
        self.assertEqual(
            classify_quality("Vision, Mission & Values", "Our department describes its mandate and values. " * 20,
                             "https://source.test/about", recent)[0],
            "NON_NEWS_INSTITUTIONAL_PAGE",
        )
        old_date = parse_source_date("Investing in Kenya 12/07/2019")
        self.assertEqual(
            classify_quality("Investing in Kenya 12/07/2019",
                             "The government announced a property investment framework for developers in Kenya. " * 10,
                             "https://source.test/investing", old_date)[0],
            "TOO_OLD",
        )

    def test_quality_gate_requires_reliable_date(self):
        self.assertEqual(
            classify_quality("New housing project announced",
                             "The ministry announced a new housing project in Nairobi for tenants and developers. " * 8,
                             "https://source.test/story", None)[0],
            "MISSING_PUBLICATION_DATE",
        )

    def test_quality_gate_accepts_present_tense_official_land_events(self):
        recent = datetime.now(timezone.utc) - timedelta(days=2)
        text = (
            "The State Department opens the Kithimani land registry and issues title deeds "
            "to 750 families, improving land ownership services in the county. "
        ) * 8
        self.assertIsNone(
            classify_quality(
                "Deputy President opens Kithimani land registry and issues title deeds",
                text,
                "https://lands.example.test/kithimani-land-registry",
                recent,
            )
        )

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

    def test_article_image_rejects_placeholders_and_tracking_pixels(self):
        html = '<img src="/images/default-image.png" alt="Story"><img src="/pixel.gif" alt="Story">'
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

    async def test_expanded_source_pool_registration_preserves_canonical_existing_sources(self):
        pool_path = Path(__file__).resolve().parents[1] / "sources" / "real-estate-source-pool.json"
        legacy = Source(
            name="HassConsult Research", base_url="http://www.hassconsult.com/",
            source_type="research", trust_tier=2, fetch_method="html",
            schedule_minutes=90, active=True,
            parser_config={"discovery_url": "https://www.hassconsult.com/hassindex"},
        )
        await self.repository.upsert_source(legacy)

        registered = await register_sources_from_json(
            self.repository, str(pool_path), activate=True,
            names={"The Hass Property Index"},
        )

        self.assertEqual(len(registered), 1)
        self.assertEqual(registered[0].id, legacy.id)
        self.assertEqual(registered[0].name, "The Hass Property Index")
        self.assertEqual(registered[0].base_url, "https://hassconsult.com")
        self.assertTrue(registered[0].active)
        self.assertNotEqual(registered[0].fetch_method, "manual")
        self.assertEqual(registered[0].schedule_minutes, 240)
        self.assertIn("discovery_url", registered[0].parser_config)
        self.assertEqual(
            registered[0].parser_config["registry_metadata"]["canonical_domain"],
            "hassconsult.com",
        )
        self.assertEqual(len(await self.repository.list_sources()), 2)

    async def test_expanded_pool_records_are_active_and_have_collection_methods(self):
        pool_path = Path(__file__).resolve().parents[1] / "sources" / "real-estate-source-pool.json"
        entries = json.loads(pool_path.read_text(encoding="utf-8"))
        self.assertEqual(len(entries), 100)
        registered = await register_sources_from_json(
            self.repository, str(pool_path), activate=True,
        )

        self.assertEqual(len(registered), 100)
        self.assertEqual(len({canonical_domain(source.base_url) for source in registered}), 100)
        self.assertTrue(all(source.active for source in registered))
        self.assertTrue(all(source.fetch_method != "manual" for source in registered))
        self.assertTrue(all(source.parser_config.get("discovery_url") for source in registered))
        self.assertTrue(all(
            source.parser_config["registry_metadata"]["source_url"] == source.base_url
            for source in registered
        ))

    async def test_registry_deduplicates_www_variants_and_syncs_deactivation(self):
        existing = Source(
            name="Existing source", base_url="https://www.example.test/",
            trust_tier=2, fetch_method="rss", schedule_minutes=60, active=True,
        )
        await self.repository.upsert_source(existing)
        payload = [
            {
                "name": "Configured source", "base_url": "https://example.test",
                "source_type": "news", "trust_tier": 2, "fetch_method": "rss",
                "schedule_minutes": 60, "active": False, "parser_config": {"discovery_url": "https://example.test/feed"},
                "failure_category": "blocked_403", "last_error": "blocked_403: HTTP 403",
                "consecutive_failures": 1,
                "last_failed_fetch_at": datetime.now(timezone.utc).isoformat(),
            },
            {
                "name": "Duplicate domain", "base_url": "http://www.example.test/",
                "source_type": "news", "trust_tier": 2, "fetch_method": "rss",
                "schedule_minutes": 60, "active": True, "parser_config": {"discovery_url": "http://www.example.test/feed"},
            },
        ]
        with tempfile.TemporaryDirectory() as temp_dir:
            registry_path = Path(temp_dir) / "duplicate-source-registry.json"
            registry_path.write_text(json.dumps(payload), encoding="utf-8")
            registered = await register_sources_from_json(self.repository, str(registry_path))
        self.assertEqual(len(registered), 1)
        self.assertEqual(registered[0].id, existing.id)
        self.assertFalse(registered[0].active)
        self.assertEqual(registered[0].failure_category, "blocked_403")
        self.assertEqual(registered[0].consecutive_failures, 1)
        self.assertEqual(len(await self.repository.list_sources()), 2)

    async def test_same_source_name_on_another_domain_is_not_overwritten(self):
        pool_path = Path(__file__).resolve().parents[1] / "sources" / "real-estate-source-pool.json"
        existing = Source(
            name="People Daily", base_url="https://peopledaily.digital",
            source_type="news", trust_tier=2, fetch_method="html",
            schedule_minutes=60, active=True,
        )
        await self.repository.upsert_source(existing)

        registered = await register_sources_from_json(
            self.repository, str(pool_path), names={"People Daily"},
        )

        self.assertEqual(registered[0].base_url, "https://pd.co.ke")
        self.assertEqual((await self.repository.get_source(existing.id)).base_url, "https://peopledaily.digital")
        self.assertEqual(
            [source.name for source in await self.repository.list_sources()].count("People Daily"),
            2,
        )

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

    async def test_people_daily_uses_verified_feed_and_explicit_canonical_hosts(self):
        pool_path = Path(__file__).resolve().parents[1] / "sources" / "real-estate-source-pool.json"
        entries = json.loads(pool_path.read_text(encoding="utf-8"))
        configured = next(entry for entry in entries if entry["name"] == "People Daily")
        people_daily = Source(**configured)

        self.assertEqual(people_daily.parser_config["discovery_url"], "https://peopledaily.digital/feed")
        self.assertIn("peopledaily.digital", people_daily.parser_config["allowed_hosts"])
        self.assertTrue(SourceCollector._is_allowed_source_url(
            people_daily, "https://www.pd.co.ke/story",
        ))
        self.assertTrue(SourceCollector._is_allowed_source_url(
            people_daily, "https://peopledaily.digital/feed",
        ))
        self.assertFalse(SourceCollector._is_allowed_source_url(
            people_daily, "https://unapproved.example/story",
        ))

    async def test_source_pool_uses_verified_lapsset_feed_and_explicit_html_fallbacks(self):
        pool_path = Path(__file__).resolve().parents[1] / "sources" / "real-estate-source-pool.json"
        entries = {
            entry["name"]: entry
            for entry in json.loads(pool_path.read_text(encoding="utf-8"))
        }
        self.assertEqual(
            entries["LAPSSET Corridor Authority"]["parser_config"]["discovery_url"],
            "https://www.lapsset.go.ke/feed/",
        )
        self.assertEqual(
            entries["State Dept for Housing & Urban Development"]["parser_config"]["html_discovery_url"],
            "https://housingandurban.go.ke/news",
        )
        self.assertEqual(
            entries["The Citizen Tanzania"]["parser_config"]["html_discovery_url"],
            "https://www.thecitizen.co.tz/tanzania",
        )
        self.assertTrue(
            entries["National Housing Corporation Kenya"]["parser_config"]["html_fallback"],
        )
        self.assertNotIn(
            "html_fallback",
            entries["Archstone Kenya"]["parser_config"],
        )

    async def test_allowed_hosts_include_apex_www_and_explicit_domains(self):
        configured = Source(
            name="Configured source", base_url="https://news.example.test", trust_tier=2,
            fetch_method="rss", schedule_minutes=30,
            parser_config={"allowed_hosts": ["archive.partner.example"]},
        )
        self.assertTrue(SourceCollector._is_allowed_source_url(configured, "https://www.news.example.test/feed"))
        self.assertTrue(SourceCollector._is_allowed_source_url(configured, "https://archive.partner.example/story"))
        self.assertFalse(SourceCollector._is_allowed_source_url(configured, "https://other.example.test/story"))

    async def test_robots_fetch_uses_source_hosts_for_redirect_guard(self):
        collector = SourceCollector(self.repository, Settings())
        captured = {}

        class RobotsResponse:
            def __enter__(self):
                return self

            def __exit__(self, *_args):
                return None

            def read(self, _limit):
                return b"User-agent: *\nAllow: /\n"

        class RobotsOpener:
            def open(self, request, timeout):
                captured["url"] = request.full_url
                captured["timeout"] = timeout
                return RobotsResponse()

        def build_opener(*handlers):
            captured["redirect_guard"] = handlers[-1]
            return RobotsOpener()

        with patch("app.collector.build_opener", side_effect=build_opener):
            self.assertTrue(await collector._robots_allowed(
                self.source, "https://source1.example.test/feed",
            ))

        self.assertEqual(captured["url"], "https://source1.example.test/robots.txt")
        self.assertEqual(captured["timeout"], 10)
        self.assertIn("source1.example.test", captured["redirect_guard"].hosts)
        self.assertIn("www.source1.example.test", captured["redirect_guard"].hosts)
        with self.assertRaises(CollectionFailure):
            captured["redirect_guard"].redirect_request(
                None, None, 302, "Found", {}, "https://outside.example/robots.txt",
            )

    def test_failure_classifier_recognizes_all_source_failure_categories(self):
        cases = (
            "blocked_403", "tls_error", "dns_error", "timeout", "http_404",
            "http_4xx", "http_5xx", "invalid_feed_xml", "network_error",
            "parse_error", "not_allowed_host", "no_feed_found", "robots_disallowed",
        )
        for category in cases:
            with self.subTest(category=category):
                self.assertEqual(
                    SourceCollector.classify_failure(CollectionFailure(category, category)),
                    category,
                )
        self.assertEqual(
            SourceCollector.classify_failure(
                CollectionFailure("upstream_5xx", "robots.txt returned HTTP 503"),
            ),
            "http_5xx",
        )

    async def test_rss_parser_accepts_valid_recent_feed_and_classifies_malformed_or_html_bodies(self):
        collector = SourceCollector(self.repository, Settings())
        valid_feed = """<?xml version="1.0"?>
        <rss version="2.0"><channel><item>
          <title>Nairobi housing plan announced</title>
          <link>https://source1.example.test/nairobi-housing-plan</link>
          <pubDate>Mon, 05 Oct 2026 08:00:00 GMT</pubDate>
          <description>Recent housing update</description>
        </item></channel></rss>"""
        candidates = collector._parse_feed(self.source, valid_feed, self.source.base_url)
        self.assertEqual(len(candidates), 1)
        self.assertEqual(candidates[0].source_published_at.date().isoformat(), "2026-10-05")

        for body in ("<rss><channel><item><title>broken", "<html><body>Home page</body></html>"):
            with self.subTest(body=body):
                with self.assertRaises(CollectionFailure) as raised:
                    collector._parse_feed(self.source, body, self.source.base_url)
                self.assertEqual(raised.exception.category, "invalid_feed_xml")
        self.assertEqual(
            SourceCollector.classify_failure(ET.ParseError("syntax error")),
            "invalid_feed_xml",
        )

    async def test_rss_discovery_uses_configured_html_fallback_without_leaving_host(self):
        configured = self.source.model_copy(update={
            "fetch_method": "rss",
            "parser_config": {
                "discovery_url": "https://source1.example.test/feed",
                "html_fallback": True,
                "html_discovery_url": "https://source1.example.test/news",
            },
        })
        collector = SourceCollector(self.repository, Settings())
        calls = []
        html = (
            "<html><body><a href='/story/nairobi-housing-plan'>"
            "Nairobi housing plan announced</a></body></html>"
        )

        async def fetch(_source, url, **_kwargs):
            calls.append(url)
            return "<html><body>not xml</body></html>" if url.endswith("/feed") else html

        collector._fetch = fetch  # type: ignore[method-assign]
        candidates, used_fallback, rejected = await collector._discover_feed(
            configured, configured.parser_config["discovery_url"],
        )
        self.assertTrue(used_fallback)
        self.assertEqual(rejected, 0)
        self.assertEqual(calls, [
            "https://source1.example.test/feed",
            "https://source1.example.test/news",
        ])
        self.assertEqual(
            candidates[0].source_url,
            "https://source1.example.test/story/nairobi-housing-plan",
        )

    async def test_http_403_404_and_robots_disallow_are_distinct_and_not_retried(self):
        class FakeResponse:
            def __init__(self, status_code):
                self.status_code = status_code
                self.is_redirect = False
                self.headers = {}

        class FakeStream:
            def __init__(self, response):
                self.response = response

            async def __aenter__(self):
                return self.response

            async def __aexit__(self, *_args):
                return None

        class FakeClient:
            def __init__(self, status_code):
                self.status_code = status_code
                self.calls = 0

            def stream(self, *_args):
                self.calls += 1
                return FakeStream(FakeResponse(self.status_code))

        async def no_wait(_origin):
            return None

        for status_code, expected_category in (
            (403, "blocked_403"), (404, "http_404"), (503, "http_5xx"),
        ):
            with self.subTest(status_code=status_code):
                collector = SourceCollector(self.repository, Settings(fetch_retry_attempts=1))
                fake_client = FakeClient(status_code)

                async def allowed(_source, _url):
                    return True

                async def get_client():
                    return fake_client

                collector._robots_allowed = allowed  # type: ignore[method-assign]
                collector._wait_for_origin = no_wait  # type: ignore[method-assign]
                collector._get_client = get_client  # type: ignore[method-assign]
                with self.assertRaises(CollectionFailure) as raised:
                    await collector._fetch(self.source, f"{self.source.base_url}/feed")
                self.assertEqual(raised.exception.category, expected_category)
                self.assertEqual(fake_client.calls, 1)

        collector = SourceCollector(self.repository, Settings())

        async def disallowed(_source, _url):
            return False

        collector._robots_allowed = disallowed  # type: ignore[method-assign]
        with self.assertRaises(CollectionFailure) as raised:
            await collector._fetch(self.source, f"{self.source.base_url}/feed")
        self.assertEqual(raised.exception.category, "robots_disallowed")

    async def test_fetch_rejects_redirects_to_unconfigured_hosts(self):
        class RedirectResponse:
            status_code = 302
            is_redirect = True
            headers = {"location": "https://outside.example/story"}

        class FakeStream:
            async def __aenter__(self):
                return RedirectResponse()

            async def __aexit__(self, *_args):
                return None

        class FakeClient:
            calls = 0

            def stream(self, *_args):
                self.calls += 1
                return FakeStream()

        collector = SourceCollector(self.repository, Settings())
        client = FakeClient()

        async def allowed(_source, _url):
            return True

        async def no_wait(_origin):
            return None

        async def get_client():
            return client

        collector._robots_allowed = allowed  # type: ignore[method-assign]
        collector._wait_for_origin = no_wait  # type: ignore[method-assign]
        collector._get_client = get_client  # type: ignore[method-assign]
        with self.assertRaises(CollectionFailure) as raised:
            await collector._fetch(self.source, f"{self.source.base_url}/feed")
        self.assertEqual(raised.exception.category, "not_allowed_host")
        self.assertEqual(client.calls, 1)

    async def test_robots_dns_failure_is_classified_and_persisted_as_source_failure(self):
        class FailedOpener:
            def open(self, *_args, **_kwargs):
                raise URLError(socket.gaierror("temporary failure in name resolution"))

        collector = SourceCollector(self.repository, Settings())

        async def no_wait(_origin):
            return None

        collector._wait_for_origin = no_wait  # type: ignore[method-assign]
        with patch("app.collector.build_opener", return_value=FailedOpener()):
            with self.assertRaises(CollectionFailure) as raised:
                await collector._robots_allowed(self.source, f"{self.source.base_url}/feed")
        self.assertEqual(raised.exception.category, "dns_error")

    async def test_robots_http_403_is_reported_as_robots_disallowed_with_status(self):
        class FailedOpener:
            def open(self, *_args, **_kwargs):
                raise HTTPError(
                    "https://source1.example.test/robots.txt", 403, "Forbidden", {}, None,
                )

        collector = SourceCollector(self.repository, Settings())

        async def no_wait(_origin):
            return None

        collector._wait_for_origin = no_wait  # type: ignore[method-assign]
        with patch("app.collector.build_opener", return_value=FailedOpener()):
            with self.assertRaises(CollectionFailure) as raised:
                await collector._robots_allowed(self.source, f"{self.source.base_url}/feed")
        self.assertEqual(raised.exception.category, "robots_disallowed")
        self.assertIn("HTTP 403", str(raised.exception))

    async def test_transient_source_failures_are_backed_off_and_404s_are_retried_weekly(self):
        now = datetime.now(timezone.utc)
        collector = SourceCollector(self.repository, Settings())

        for category, delay, expected_due in (
            ("robots_disallowed", timedelta(hours=1), False),
            ("blocked_403", timedelta(hours=1), False),
            ("dns_error", timedelta(hours=1), False),
            ("http_404", timedelta(days=6), False),
            ("http_404", timedelta(days=8), True),
        ):
            with self.subTest(category=category, delay=delay):
                source_record = source().model_copy(update={
                    "last_failed_fetch_at": now - delay,
                    "failure_category": category,
                    "consecutive_failures": 1,
                })
                self.assertEqual(collector._is_due(source_record), expected_due)

    async def test_timeout_is_persisted_as_source_failure(self):
        collector = SourceCollector(self.repository, Settings())

        async def hang(_collector, _source):
            await asyncio.sleep(10)

        with patch("app.collector.SOURCE_HARD_TIMEOUT_SECONDS", 0.001), patch.object(
            SourceCollector, "_collect_source", new=hang,
        ):
            result = await collector.collect_source(self.source)

        stored = await self.repository.get_source(self.source.id)
        self.assertEqual(result["sources_failed"], 1)
        self.assertEqual(stored.failure_category, "timeout")

    async def test_source_failure_does_not_abort_collection_job(self):
        good_source = source(tier=2)
        await self.repository.upsert_source(good_source)
        candidate = CandidateArticle(
            source_id=good_source.id,
            source_url="https://source2.example.test/nairobi-housing-plan",
            source_title="Nairobi housing plan announced by county",
            source_published_at=datetime.now(timezone.utc) - timedelta(days=1),
            clean_text=(
                "The county announced a new housing plan in Nairobi to support property "
                "development, improve access to homes, and expand infrastructure. " * 8
            ),
        )

        async def discover(_collector, configured_source):
            if configured_source.id == self.source.id:
                raise CollectionFailure("blocked_403", "HTTP 403 response")
            return [candidate]

        async def materialise(_collector, _source, discovered_candidate):
            return discovered_candidate

        with patch.object(SourceCollector, "_discover", new=discover), patch.object(
            SourceCollector, "_materialise_article", new=materialise,
        ):
            result = await run_collection_job(
                self.repository, Settings(), RulesBasedNewsAnalyzer(),
            )

        self.assertEqual(result["sources_attempted"], 2)
        self.assertEqual(result["sources_failed"], 1)
        self.assertEqual(result["sources_successful"], 1)
        self.assertEqual(result["articles_inserted"], 1)
        self.assertEqual(result["collection_status"], "partial")

    def test_sources_with_five_failures_use_six_hour_retry(self):
        collector = SourceCollector(self.repository, Settings())
        recent_failure = datetime.now(timezone.utc) - timedelta(hours=5)
        source_record = source().model_copy(update={
            "last_failed_fetch_at": recent_failure,
            "consecutive_failures": 5,
        })
        self.assertFalse(collector._is_due(source_record))
        source_record.last_failed_fetch_at = datetime.now(timezone.utc) - timedelta(hours=7)
        self.assertTrue(collector._is_due(source_record))

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
                                     source_title="Land registry digitisation announced",
                                     source_published_at=datetime.now(timezone.utc) - timedelta(days=2),
                                     clean_text=("The ministry announced a land registry digitisation project in Nairobi, "
                                                 "with new online services for property owners and developers. " * 8))

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

        expected = [
            configured.name
            for configured in await self.repository.list_sources(active_only=True)
            if SourceCollector._source_group(configured, 11) == 3
        ]
        self.assertEqual(result["sources_checked"], len(expected))
        self.assertEqual(set(seen), set(expected))

    async def test_wp_json_fetch_method_parses_dated_wordpress_posts(self):
        configured = self.source.model_copy(update={
            "fetch_method": "wp_json",
            "parser_config": {
                "discovery_url": "https://source1.example.test/wp-json/wp/v2/posts?per_page=10",
                "selectors": {
                    "title": "title.rendered", "url": "link", "published_date": ["date_gmt", "date"],
                    "content": "excerpt.rendered",
                },
            },
        })
        collector = SourceCollector(self.repository, Settings())

        async def fetch(_source, _url, **_kwargs):
            return json.dumps([{
                "id": 17,
                "link": "https://www.source1.example.test/land-registry-update",
                "date_gmt": "2026-09-20T10:00:00",
                "title": {"rendered": "Land registry update"},
                "excerpt": {"rendered": "The ministry announced a land registry update."},
            }])

        collector._fetch = fetch  # type: ignore[method-assign]
        candidates, rejected, blocked = await collector._discover(configured)
        self.assertEqual((rejected, blocked), (0, 0))
        self.assertEqual(len(candidates), 1)
        self.assertEqual(candidates[0].external_post_id, "17")
        self.assertEqual(candidates[0].source_published_at.date().isoformat(), "2026-09-20")

    async def test_rss_and_sitemap_fetch_methods_filter_urls_by_source_host(self):
        collector = SourceCollector(self.repository, Settings())
        responses = {
            "rss": (
                "https://source1.example.test/feed",
                "<rss><channel><item><title>Land registry project</title>"
                "<link>/land-registry-project</link>"
                "<pubDate>Sun, 20 Sep 2026 10:00:00 GMT</pubDate></item></channel></rss>",
            ),
            "sitemap": (
                "https://source1.example.test/sitemap.xml",
                "<urlset><url><loc>https://source1.example.test/land-registry-project</loc>"
                "<lastmod>2026-09-20</lastmod></url></urlset>",
            ),
        }
        for method, (url, body) in responses.items():
            with self.subTest(method=method):
                configured = self.source.model_copy(update={
                    "fetch_method": method,
                    "parser_config": {
                        "discovery_url": url,
                        "selectors": {
                            "title": "title", "url": "link",
                            "published_date": ["pubDate", "published", "updated"],
                            "content": ["description", "summary"],
                        } if method == "rss" else {"url": "loc"},
                    },
                })

                async def fetch(_source, _url, **_kwargs):
                    return body

                collector._fetch = fetch  # type: ignore[method-assign]
                candidates, rejected, blocked = await collector._discover(configured)
                self.assertEqual((rejected, blocked), (0, 0))
                self.assertEqual(len(candidates), 1)
                self.assertEqual(candidates[0].source_url, "https://source1.example.test/land-registry-project")

    async def test_scheduled_job_processes_and_publishes_a_safe_new_item(self):
        candidate = CandidateArticle(source_id=self.source.id, source_url="https://source1.example.test/safe-update",
                                     source_title="Land registry digitisation update",
                                     source_published_at=datetime.now(timezone.utc) - timedelta(days=2),
                                     clean_text=("The ministry announced land registry digitisation in Nairobi, "
                                                 "adding online services for property owners and developers. " * 8))

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
                             source_published_at=datetime.now(timezone.utc) - timedelta(days=2),
                             clean_text=(("The ministry announced land registry digitisation in Nairobi, "
                                           "adding online services for property owners and developers. " * 8)
                                         if index == 0 else
                                         ("The county approved housing construction permits in Mombasa, "
                                          "enabling developers to begin work on new residential homes. " * 8)))
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
    async def test_manual_approval_publishes_immediately_and_retains_item(self):
        repository = MemoryNewsRepository()
        news_source = source()
        await repository.upsert_source(news_source)
        item = NewsItem(
            source_id=news_source.id, source_url="https://source1.example.test/pending",
            canonical_url="https://source1.example.test/pending", source_title="Pending property update",
            clean_text="Property update", varoom_title="Pending property update",
            varoom_summary="Summary", category="property", source_tier=1,
            content_hash="a" * 64, review_status=ReviewStatus.PENDING_REVIEW,
        )
        await repository.save_item(item)
        app = create_app(Settings(admin_api_key="admin-key", public_rate_limit_per_minute=100), repository)
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post(
                f"/api/admin/news/{item.id}/approve",
                headers={"Authorization": "Bearer admin-key"},
                json={},
            )
            public = await client.get("/api/news/latest?limit=5")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["success"], True)
        self.assertEqual(response.json()["status"], ReviewStatus.PUBLISHED.value)
        saved = await repository.get_item(item.id)
        self.assertIsNotNone(saved)
        self.assertEqual(saved.review_status, ReviewStatus.PUBLISHED)
        self.assertIsNotNone(saved.published_at)
        self.assertEqual([entry["title"] for entry in public.json()], ["Pending property update"])

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
        self.assertIn("NEWS_ADMIN_API_KEY", response.json()["detail"])

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

    async def test_collection_endpoint_parses_bearer_scheme_case_insensitively(self):
        secret = "scheduler-key"
        app = create_app(
            Settings(
                scheduler_secret=secret,
                supabase_url="https://example.test",
                supabase_service_role_key="server-only",
                public_rate_limit_per_minute=100,
            ),
            MemoryNewsRepository(),
        )
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            valid_headers = (
                f"Bearer {secret}",
                f"bearer {secret}",
                f"bEaReR {secret}",
                f"  bEaReR\t{secret}  ",
            )
            for authorization in valid_headers:
                with self.subTest(authorization=authorization.strip().split()[0]):
                    response = await client.post(
                        "/api/internal/jobs/collect",
                        headers={"Authorization": authorization},
                    )
                    self.assertEqual(response.status_code, 200)

            for authorization in (None, f"Bearer incorrect-{secret}"):
                with self.subTest(authorization=authorization):
                    headers = {} if authorization is None else {"Authorization": authorization}
                    response = await client.post("/api/internal/jobs/collect", headers=headers)
                    self.assertEqual(response.status_code, 401)

    async def test_collection_endpoint_returns_service_unavailable_when_secret_is_disabled(self):
        app = create_app(Settings(), MemoryNewsRepository())
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post(
                "/api/internal/jobs/collect",
                headers={"Authorization": "Bearer configured-secret"},
            )
        self.assertEqual(response.status_code, 503)

    async def test_admin_source_list_redacts_credentials_from_fetch_errors(self):
        private_value = "source-private-key"
        error_url = (
            "https://source1.example.test/feed?api_key="
            f"{private_value}&page=2&access_token=another-private-value"
        )
        repository = MemoryNewsRepository()
        news_source = source()
        await repository.upsert_source(news_source)

        async def fail_discovery(_collector, _source):
            raise RuntimeError(f"Fetch failed for {error_url}")

        collector = SourceCollector(repository, Settings())
        with patch.object(SourceCollector, "_discover", new=fail_discovery):
            await collector.collect_source(news_source)

        app = create_app(
            Settings(admin_api_key="admin-key", public_rate_limit_per_minute=100),
            repository,
        )
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get(
                "/api/admin/sources",
                headers={"Authorization": "Bearer admin-key"},
            )

        self.assertEqual(response.status_code, 200)
        listed_sources = response.json()
        self.assertEqual(len(listed_sources), 1)
        last_error = listed_sources[0]["last_error"]
        self.assertNotIn(private_value, last_error)
        self.assertNotIn("another-private-value", last_error)
        self.assertIn("api_key=[REDACTED]", last_error)
        self.assertIn("page=2", last_error)

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

    def test_source_identity_migration_allows_duplicate_display_names(self):
        migration = (Path(__file__).parents[1] / "supabase" / "migrations" / "20260928_000001_allow_duplicate_source_names.sql").read_text(encoding="utf-8").lower()
        self.assertIn("drop constraint if exists news_sources_name_key", migration)


class StrictPropertyRelevanceTests(unittest.TestCase):
    def test_qualifying_property_news_is_included(self):
        qualifying = [
            ("Nairobi County rolls out new land rates system", "https://news.test/nairobi-land-rates"),
            ("Ministry of Lands digitises title deed records on Ardhisasa", "https://news.test/ardhisasa-title-deeds"),
            ("National Land Commission issues advisory on communal land demarcation", "https://news.test/nlc-communal-land"),
            ("Stamp duty exemption for first-time home buyers passed by Parliament", "https://news.test/stamp-duty-exemption"),
            ("Government gazettes new regulations for affordable housing levy", "https://news.test/affordable-housing-levy"),
            ("Developers launch 500-unit residential gated community in Kiambu", "https://news.test/kiambu-residential-development"),
            ("Knight Frank index shows surge in prime office rental yields", "https://news.test/prime-office-rental-yields"),
            ("BuyRentKenya report reveals rising apartment prices in Kilimani", "https://news.test/apartment-prices-kilimani"),
            ("KMRC injects KSh 7 billion to boost low-cost mortgages", "https://news.test/kmrc-mortgages"),
            ("Banks tighten mortgage lending rules following interest rate hike", "https://news.test/mortgage-lending-rules"),
            ("Rent Restriction Tribunal bars landlord from illegal tenant eviction", "https://news.test/rent-tribunal-eviction"),
            ("Commercial tenants negotiate rent discounts in Nairobi CBD", "https://news.test/commercial-tenants-rent"),
            ("NCA orders immediate demolition of unsafe five-storey building in Ruiru", "https://news.test/nca-building-collapse-safety"),
            ("Architectural Association of Kenya updates national building code standards", "https://news.test/building-code-standards"),
            ("High Court cancels fraudulent title deed for 50-acre parcel in Mavoko", "https://news.test/title-deed-cancellation-mavoko"),
        ]
        for title, url in qualifying:
            is_rel, reason = classify_property_relevance(title, url, is_pre_fetch=True)
            self.assertTrue(is_rel, f"Expected {title!r} to be relevant, got {reason}")
            is_rel_post, post_reason = classify_property_relevance(
                title, url, f"{title}. The Ministry and property developers released market details today.", is_pre_fetch=False
            )
            self.assertTrue(is_rel_post, f"Expected post-fetch {title!r} to be relevant, got {post_reason}")

    def test_excluded_general_news_is_rejected(self):
        excluded = [
            ("Immigration department clears passport backlog for Kenyan citizens", "https://news.test/passport-backlog"),
            ("Two foreign nationals arrested for lacking valid work permits", "https://news.test/foreigners-work-permits"),
            ("Ruto and Raila hold closed-door political talks on bipartisan committee", "https://news.test/ruto-raila-political-talks"),
            ("MPs engage in heated debate over political coalition funding", "https://news.test/mps-debate-coalition"),
            ("UDA and ODM prepare candidates for upcoming by-elections", "https://news.test/by-elections-prep"),
            ("Police shoot dead three armed robbers in highway ambush", "https://news.test/police-shoot-robbers"),
            ("Detectives probe murder of businessman in Karen home", "https://news.test/murder-probe-karen"),
            ("Bandits attack village in Baringo, two dead", "https://news.test/banditry-baringo"),
            ("Kenya and Tanzania resolve bilateral aviation dispute after summit", "https://news.test/diplomatic-dispute-aviation"),
            ("US Ambassador hosts reception for civil society leaders", "https://news.test/ambassador-reception"),
            ("Gor Mahia edges AFC Leopards 1-0 in Mashemeji Derby thriller", "https://news.test/gor-mahia-afc-leopards"),
            ("Kenyan athlete breaks world marathon record in Berlin", "https://news.test/marathon-record"),
            ("Celebrity musician releases new album ahead of Nairobi concert", "https://news.test/musician-album-concert"),
            ("EPRA raises fuel prices for petrol and diesel by five shillings", "https://news.test/epra-fuel-prices"),
            ("Doctors threaten nationwide strike over collective bargaining agreement", "https://news.test/doctors-strike"),
            ("Kenya Shilling strengthens against US Dollar following eurobond payout", "https://news.test/shilling-strengthens"),
            ("Kenya Airways plane lands safely after technical failure", "https://news.test/plane-lands-safely"),
            ("Politician lands lucrative government appointment", "https://news.test/lands-appointment"),
            ("Opposition building consensus ahead of national convention", "https://news.test/building-consensus"),
            ("Developing story: traffic accident on Thika Superhighway", "https://news.test/developing-story-accident"),
            ("State House announces cabinet reshuffle", "https://news.test/state-house-reshuffle"),
        ]
        for title, url in excluded:
            is_rel, reason = classify_property_relevance(title, url, is_pre_fetch=True)
            self.assertFalse(is_rel, f"Expected {title!r} to be EXCLUDED, got {reason}")

    def test_category_metadata_rejection(self):
        self.assertFalse(classify_property_relevance("Major national update", "https://news.test/story", category="politics", is_pre_fetch=True)[0])
        self.assertFalse(classify_property_relevance("Weekend match overview", "https://news.test/story", category="sports", is_pre_fetch=True)[0])

    def test_incidental_mentions_in_body_are_rejected_post_fetch(self):
        title = "Governor addresses health workers"
        url = "https://news.test/governor-health"
        body = "The governor addressed health workers regarding clinic renovations. He mentioned that the clinic stands on public land. The rest of the speech was about nursing staff, doctors, and medical equipment."
        is_rel, reason = classify_property_relevance(title, url, body, is_pre_fetch=False)
        self.assertFalse(is_rel)


class PreFetchPipelineStrictFilterTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.repository = MemoryNewsRepository()
        self.source = source()
        await self.repository.upsert_source(self.source)

    async def test_irrelevant_candidates_are_discarded_before_materialisation(self):
        collector = SourceCollector(self.repository, Settings())
        politics = CandidateArticle(
            source_id=self.source.id, source_url="https://source1.example.test/politics",
            source_title="MPs clash over election campaign funding", clean_text="",
        )
        property_art = CandidateArticle(
            source_id=self.source.id, source_url="https://source1.example.test/land-rates",
            source_title="Nairobi County announces new land rates roll", clean_text="",
        )

        materialise_calls: list[str] = []

        async def spy_materialise(src, cand):
            materialise_calls.append(cand.source_url)
            return cand.model_copy(update={
                "clean_text": "The county government announced a new land rates valuation roll for all property owners in Nairobi. " * 8,
                "source_published_at": datetime.now(timezone.utc) - timedelta(days=1),
            })

        collector._materialise_article = spy_materialise  # type: ignore[method-assign]

        async def mock_discover(_source):
            return [politics, property_art]

        collector._discover = mock_discover  # type: ignore[method-assign]

        result = await collector.collect_due_sources()

        # COST CONTROL: politics must NEVER be fetched or materialized
        self.assertNotIn("https://source1.example.test/politics", materialise_calls)
        self.assertIn("https://source1.example.test/land-rates", materialise_calls)
        self.assertEqual(result["articles_rejected"], 1)
        self.assertEqual(result["new_items"], 1)

        # STORAGE RULE: politics must NOT exist in the database
        items = await self.repository.list_items()
        self.assertEqual(len(items), 1)
        self.assertEqual(items[0].source_url, "https://source1.example.test/land-rates")

    async def test_rejected_urls_cache_prevents_repeated_reprocessing(self):
        collector = SourceCollector(self.repository, Settings())
        non_property = CandidateArticle(
            source_id=self.source.id, source_url="https://source1.example.test/sports",
            source_title="Gor Mahia wins football championship", clean_text="",
        )

        async def mock_discover(_source):
            return [non_property]

        collector._discover = mock_discover  # type: ignore[method-assign]

        # First run
        result1 = await collector.collect_source(self.source)
        self.assertEqual(result1["articles_rejected"], 1)

        # Second run should skip immediately via _rejected_urls cache
        result2 = await collector.collect_source(self.source)
        self.assertEqual(result2["articles_rejected"], 1)
        self.assertEqual(result2["articles_fetched"], 0)

    async def test_processing_purges_item_if_analyser_determines_irrelevant(self):
        processor = ProcessingService(self.repository, RulesBasedNewsAnalyzer())
        item = NewsItem(
            source_id=self.source.id, source_url="https://source1.example.test/borderline",
            canonical_url="https://source1.example.test/borderline",
            source_title="General sports award ceremony",
            clean_text="The athletic awards honoured runners in Nairobi.",
            source_tier=1, content_hash="f" * 64,
        )
        await self.repository.save_item(item)
        self.assertIsNotNone(await self.repository.get_item(item.id))

        processed = await processor.process(item.id)
        self.assertEqual(processed.review_status, ReviewStatus.ARCHIVED)

        # STRICT STORAGE RULE: Item MUST be purged from repository
        self.assertIsNone(await self.repository.get_item(item.id))

    async def test_store_candidate_rejects_non_property_news(self):
        collector = SourceCollector(self.repository, Settings())
        non_property = CandidateArticle(
            source_id=self.source.id, source_url="https://source1.example.test/immigration",
            source_title="Immigration department clears passport backlog",
            clean_text="Passports are being processed for citizens.",
        )
        saved, duplicate = await collector._store_candidate(self.source, non_property)
        self.assertIsNone(saved)
        self.assertFalse(duplicate)
        self.assertEqual(len(await self.repository.list_items()), 0)

    async def test_store_candidate_rejects_sales_before_database_insertion(self):
        collector = SourceCollector(self.repository, Settings())
        sales_listing = CandidateArticle(
            source_id=self.source.id,
            source_url="https://source1.example.test/apartments-for-sale",
            source_title="Apartments for Sale in Nairobi",
            clean_text="Apartments for sale in Nairobi. Contact agent for viewing. KSh 12 million.",
        )
        saved, duplicate = await collector._store_candidate(self.source, sales_listing)
        self.assertIsNone(saved)
        self.assertFalse(duplicate)
        self.assertEqual(len(await self.repository.list_items()), 0)

    async def test_reprocess_job_purges_existing_non_property_items(self):
        from app.jobs import run_reprocess_job
        item = NewsItem(
            source_id=self.source.id, source_url="https://source1.example.test/old-politics",
            canonical_url="https://source1.example.test/old-politics",
            source_title="Presidential political rally in Nakuru",
            clean_text="Political rally speech about upcoming elections.",
            source_tier=1, content_hash="e" * 64,
        )
        await self.repository.save_item(item)
        self.assertEqual(len(await self.repository.list_items()), 1)

        result = await run_reprocess_job(self.repository, Settings(), limit=5)
        self.assertEqual(result.get("purged_irrelevant"), 1)
        self.assertEqual(len(await self.repository.list_items()), 0)


if __name__ == "__main__":
    unittest.main()
