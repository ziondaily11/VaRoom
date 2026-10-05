from __future__ import annotations

import asyncio
import hashlib
import json
import logging
import re
import ssl
import socket
import time
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from html.parser import HTMLParser
from typing import Any, Iterable
from urllib.parse import unquote_plus, urljoin, urlparse
from urllib.error import HTTPError, URLError
from urllib.request import HTTPRedirectHandler, ProxyHandler, Request, build_opener
from urllib import robotparser
from uuid import UUID

import httpx
import trafilatura
import certifi

from .config import Settings
from .media import extract_article_image_url
from .models import CandidateArticle, NewsEvent, NewsItem, Source
from .normalizer import canonicalise_url, clean_html, content_hash
from .repository import MemoryNewsRepository, SupabaseNewsRepository
from .quality import classify_quality, parse_source_date
from .relevance import classify_property_relevance, classify_property_sales_content

logger = logging.getLogger(__name__)
Repository = MemoryNewsRepository | SupabaseNewsRepository
FAILURE_RETRY_SECONDS = 15 * 60
FAILURE_BACKOFF_SECONDS = 6 * 60 * 60
MAX_CONSECUTIVE_FAILURES_BEFORE_BACKOFF = 5
MAX_NEW_ITEMS_PER_SOURCE = 5
SOURCE_HARD_TIMEOUT_SECONDS = 45
MAX_SOURCES_PER_RUN = 20
SOURCE_GROUP_COUNT = 11
COLLECTOR_USER_AGENT = "VaRoomNewsBot/1.0 (+https://varoom.co.ke)"
SENSITIVE_QUERY_PARAMETER_PATTERN = re.compile(r"(?P<prefix>[?&])(?P<name>[^=&#\s]+)=(?P<value>[^&#\s]*)")
FAILURE_CATEGORIES = {
    "blocked_403", "tls_error", "dns_error", "timeout", "http_404", "http_4xx",
    "http_5xx", "invalid_feed_xml", "network_error", "parse_error",
    "not_allowed_host", "no_feed_found", "robots_disallowed", "upstream_5xx",
}

GENERIC_LINK_TEXTS = {"read more", "click here", "learn more", "continue", "more", "here", "news"}
NON_ARTICLE_PATH_PARTS = {
    "about", "account", "author", "category", "contact", "login", "register",
    "sponsored", "search", "tag", "tags", "wp-admin", "wp-login",
}
NON_ARTICLE_PATH_PREFIXES = (
    "/cdn-cgi/",
    "/entertainment/",
    "/farmkenya/farmersmarket",
    "/farmkenya/podcasts",
    "/games/",
    "/podcasts/",
    "/results/",
    "/videos/",
)
DOCUMENT_EXTENSIONS = {
    ".7z", ".csv", ".doc", ".docx", ".gz", ".jpeg", ".jpg", ".png", ".ppt",
    ".pptx", ".rar", ".svg", ".tar", ".xls", ".xlsx", ".xml", ".zip", ".pdf",
}
ARTICLE_CONTENT_TYPES = {"text/html", "application/xhtml+xml"}
DISCOVERY_CONTENT_TYPES = ARTICLE_CONTENT_TYPES | {
    "application/atom+xml", "application/feed+json", "application/json",
    "application/rss+xml", "application/xml", "text/xml",
}


class _ArticleHTMLParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.title: list[str] = []
        self.text: list[str] = []
        self.links: list[tuple[str, str]] = []
        self._in_title = False
        self._skip_depth = 0
        self._anchor: str | None = None
        self._anchor_text: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        attributes = dict(attrs)
        if tag in {"script", "style", "noscript"}:
            self._skip_depth += 1
        if tag == "title":
            self._in_title = True
        if tag == "a" and attributes.get("href"):
            self._anchor, self._anchor_text = attributes["href"], []

    def handle_endtag(self, tag: str) -> None:
        if tag in {"script", "style", "noscript"} and self._skip_depth:
            self._skip_depth -= 1
        if tag == "title":
            self._in_title = False
        if tag == "a" and self._anchor:
            text = " ".join(self._anchor_text).strip()
            if text:
                self.links.append((self._anchor, text))
            self._anchor = None

    def handle_data(self, data: str) -> None:
        if self._skip_depth:
            return
        value = data.strip()
        if not value:
            return
        self.text.append(value)
        if self._in_title:
            self.title.append(value)
        if self._anchor is not None:
            self._anchor_text.append(value)


class CollectionFailure(RuntimeError):
    def __init__(self, category: str, message: str) -> None:
        super().__init__(message)
        if category not in FAILURE_CATEGORIES:
            raise ValueError(f"Unsupported source failure category: {category}")
        self.category = category


class _AllowedHostRedirect(HTTPRedirectHandler):
    def __init__(self, hosts: set[str]) -> None:
        super().__init__()
        self.hosts = hosts

    def redirect_request(self, request, response, code, message, headers, new_url):
        parsed = urlparse(new_url)
        hostname = SourceCollector._normalise_hostname(parsed.hostname)
        if parsed.scheme not in {"http", "https"} or hostname not in self.hosts:
            raise CollectionFailure("not_allowed_host", f"robots.txt redirect rejected host={hostname}")
        return super().redirect_request(request, response, code, message, headers, new_url)


def _redact_sensitive_query_parameters(value: str) -> str:
    def redact(match: re.Match[str]) -> str:
        name = re.sub(r"[^a-z0-9]", "", unquote_plus(match.group("name")).lower())
        sensitive = (
            name in {"auth", "authorization", "credential", "credentials", "key", "sig"}
            or name.endswith(("apikey", "credential", "password", "secret", "signature", "token"))
        )
        if not sensitive:
            return match.group(0)
        return f"{match.group('prefix')}{match.group('name')}=[REDACTED]"

    return SENSITIVE_QUERY_PARAMETER_PATTERN.sub(redact, value)


class SourceCollector:
    def __init__(self, repository: Repository, settings: Settings) -> None:
        self.repository, self.settings = repository, settings
        self._last_request_at: dict[str, float] = {}
        self._origin_semaphores: dict[str, asyncio.Semaphore] = {}
        self._origin_locks: dict[str, asyncio.Lock] = {}
        self._robots_cache: dict[str, robotparser.RobotFileParser] = {}
        self._robots_locks: dict[str, asyncio.Lock] = {}
        self._active_run_ids: dict[UUID, UUID] = {}
        self._rejected_urls: set[str] = set()
        # Use certifi's maintained CA bundle rather than the host OS store.
        # This avoids relying on an incomplete deployment CA store for official
        # government sites (including NCA). Verification remains mandatory.
        self._ssl_context = ssl.create_default_context(cafile=certifi.where())
        self._client: httpx.AsyncClient | None = None

    async def _get_client(self) -> httpx.AsyncClient:
        if self._client is None or self._client.is_closed:
            headers = {
                "User-Agent": COLLECTOR_USER_AGENT,
                "Accept": "application/rss+xml, application/atom+xml, application/xml, text/html, application/json;q=0.9"
            }
            self._client = httpx.AsyncClient(
                timeout=httpx.Timeout(connect=10.0, read=20.0, write=20.0, pool=10.0),
                follow_redirects=False,
                headers=headers,
                verify=self._ssl_context,
                limits=httpx.Limits(max_keepalive_connections=20, max_connections=50),
                trust_env=False,
            )
        return self._client

    async def close(self) -> None:
        if self._client and not self._client.is_closed:
            await self._client.aclose()

    async def collect_due_sources(self, source_group: int | None = None,
                                  source_group_count: int = SOURCE_GROUP_COUNT) -> dict[str, Any]:
        if source_group_count < 1:
            raise ValueError("source_group_count must be positive")
        if source_group is not None and not 0 <= source_group < source_group_count:
            raise ValueError("source_group must be within source_group_count")
        # Only website sources are collected; paid social-platform feeds are
        # intentionally outside the Property News ingestion scope.
        sources = [source for source in await self.repository.list_sources(active_only=True) if source.platform == "web"]
        if source_group is not None:
            sources = [source for source in sources
                       if self._source_group(source, source_group_count) == source_group]
        due_sources = [source for source in sources if self._is_due(source)]
        due_sources.sort(key=self._last_attempt_at)
        due_sources = due_sources[:MAX_SOURCES_PER_RUN]
        totals: dict[str, Any] = {
            "sources_checked": len(due_sources), "sources_attempted": len(due_sources),
            "sources_successful": 0, "sources_failed": 0, "candidates": 0,
            "articles_discovered": 0, "articles_rejected": 0, "articles_parsed": 0,
            "articles_inserted": 0, "new_items": 0, "duplicates": 0,
            "duplicates_skipped": 0, "failures": 0, "article_failures": 0,
            "urls_discovered": 0, "urls_rejected": 0, "security_blocked_urls": 0, "articles_fetched": 0,
            "timeouts": 0, "http_403": 0, "http_404": 0, "oversized_responses": 0,
            "new_item_ids": [],
        }
        if not due_sources:
            logger.info(
                "Collection summary: sources_attempted=0 sources_successful=0 sources_failed=0 "
                "urls_discovered=0 urls_rejected=0 articles_fetched=0 articles_parsed=0 "
                "articles_rejected=0 articles_inserted=0 duplicates_skipped=0 "
                "security_blocked_urls=0 timeouts=0 http_403=0 http_404=0 oversized_responses=0",
            )
            return totals

        semaphore = asyncio.Semaphore(min(MAX_SOURCES_PER_RUN, len(due_sources)))

        async def _bounded_collect(source: Source) -> dict[str, Any]:
            async with semaphore:
                return await self.collect_source(source)

        results = await asyncio.gather(*[_bounded_collect(source) for source in due_sources], return_exceptions=False)
        for result in results:
            for key in (
                "sources_successful", "sources_failed", "candidates",
                "articles_discovered", "articles_rejected", "articles_parsed",
                "articles_inserted", "new_items", "duplicates", "duplicates_skipped",
                "failures", "article_failures",
                "urls_discovered", "urls_rejected", "security_blocked_urls", "articles_fetched",
                "timeouts", "http_403", "http_404", "oversized_responses",
            ):
                totals[key] += int(result.get(key, 0))
            totals["new_item_ids"].extend(result["new_item_ids"])
        logger.info(
            "Collection summary: sources_attempted=%d sources_successful=%d sources_failed=%d "
            "urls_discovered=%d urls_rejected=%d articles_fetched=%d articles_parsed=%d "
            "articles_rejected=%d articles_inserted=%d duplicates_skipped=%d "
            "security_blocked_urls=%d timeouts=%d http_403=%d http_404=%d oversized_responses=%d",
            totals["sources_attempted"], totals["sources_successful"], totals["sources_failed"],
            totals["urls_discovered"], totals["urls_rejected"], totals["articles_fetched"],
            totals["articles_parsed"], totals["articles_rejected"], totals["articles_inserted"],
            totals["duplicates_skipped"], totals["security_blocked_urls"], totals["timeouts"],
            totals["http_403"], totals["http_404"], totals["oversized_responses"],
        )
        return totals

    async def collect_source(self, source: Source) -> dict[str, Any]:
        attempted_at = datetime.now(timezone.utc)
        discovery_url = _redact_sensitive_query_parameters(
            str(source.parser_config.get("discovery_url") or source.base_url)
        )
        try:
            return await asyncio.wait_for(
                self._collect_source(source),
                timeout=SOURCE_HARD_TIMEOUT_SECONDS,
            )
        except asyncio.TimeoutError as error:
            now = datetime.now(timezone.utc)
            source.last_failed_fetch_at = now
            source.consecutive_failures += 1
            source.failure_category = "timeout"
            source.last_error = f"Source exceeded {SOURCE_HARD_TIMEOUT_SECONDS}s collection limit"
            run_id = self._active_run_ids.pop(source.id, None)
            try:
                async def persist_timeout() -> None:
                    await self.repository.upsert_source(source)
                    await self.repository.add_event(NewsEvent(
                        source_id=source.id, event_type="source_fetch_failed",
                        payload={"error": source.last_error, "failure_category": "timeout"},
                    ))
                    if run_id:
                        await self.repository.finish_fetch_run(
                            run_id, result="failed", ended_at=now, discovered_count=0,
                            new_item_count=0, duplicate_count=0, error_message=source.last_error,
                        )

                await asyncio.wait_for(persist_timeout(), timeout=5)
            except Exception:
                logger.exception("Could not persist timeout telemetry for source=%s", source.name)
            logger.error(
                "SOURCE FAIL source=%s method=%s discovered=0 accepted=0 rejected=0 "
                "category=timeout http_status=none feed_url=%s attempted_at=%s",
                source.name, source.fetch_method, discovery_url, attempted_at.isoformat(),
            )
            return {
                "sources_successful": 0, "sources_failed": 1, "failures": 1,
                "timeouts": 1, "new_items": 0, "duplicates": 0, "new_item_ids": [],
            }

    async def _collect_source(self, source: Source) -> dict[str, Any]:
        started = datetime.now(timezone.utc)
        result: dict[str, Any] = {
            "sources_successful": 0, "sources_failed": 0, "candidates": 0,
            "articles_discovered": 0, "articles_rejected": 0, "articles_parsed": 0,
            "articles_inserted": 0, "new_items": 0, "duplicates": 0,
            "duplicates_skipped": 0, "failures": 0, "article_failures": 0,
            "urls_discovered": 0, "urls_rejected": 0, "security_blocked_urls": 0, "articles_fetched": 0,
            "timeouts": 0, "http_403": 0, "http_404": 0, "oversized_responses": 0,
            "new_item_ids": [],
        }
        run_id: UUID | None = None
        try:
            run_id = await self.repository.start_fetch_run(source.id, started)
            self._active_run_ids[source.id] = run_id
            discovered = await self._discover(source)
            if isinstance(discovered, tuple):
                raw_candidates = discovered[0]
                rejected_count = discovered[1]
                security_blocked_count = discovered[2] if len(discovered) > 2 else 0
            else:
                raw_candidates, rejected_count, security_blocked_count = discovered, 0, 0
            result["articles_discovered"] = len(raw_candidates) + rejected_count + security_blocked_count
            result["articles_rejected"] = rejected_count
            result["urls_rejected"] = rejected_count
            result["urls_discovered"] = result["articles_discovered"]
            result["security_blocked_urls"] = security_blocked_count
            if not raw_candidates and security_blocked_count:
                raise CollectionFailure(
                    "not_allowed_host",
                    f"All {security_blocked_count} discovered URLs were outside the approved source hosts",
                )

            # STAGE 2: Pre-fetch strict property relevance filter (cheapest & earliest stage)
            # Evaluates headline + source + short description/snippet + available category metadata
            # Discards non-property articles BEFORE downloading full article, images, or generating summaries
            passing_candidates: list[CandidateArticle] = []
            category_hint = str(source.parser_config.get("category", "") or "")
            for candidate in raw_candidates:
                canonical = canonicalise_url(candidate.source_url)
                if canonical in self._rejected_urls:
                    result["articles_rejected"] += 1
                    continue

                is_relevant, reason = classify_property_relevance(
                    title=candidate.source_title,
                    url=candidate.source_url,
                    text=candidate.clean_text,
                    source_name=source.name,
                    category=category_hint,
                    is_pre_fetch=True,
                )
                if not is_relevant:
                    self._rejected_urls.add(canonical)
                    result["articles_rejected"] += 1
                    logger.info(
                        "PRE-FETCH DISCARD (strict property filter): source=%s url=%s reason=%s title=%s",
                        source.name, candidate.source_url, reason, candidate.source_title,
                    )
                    continue
                is_sales, sales_reason = classify_property_sales_content(
                    candidate.source_title,
                    candidate.source_url,
                    candidate.original_content or "",
                    candidate.clean_text,
                    source_name=source.name,
                    category=f"{source.category or ''} {category_hint}",
                )
                if is_sales:
                    self._rejected_urls.add(canonical)
                    result["articles_rejected"] += 1
                    logger.info("[Property News] Rejected sales content: %s reason=%s",
                                candidate.source_title, sales_reason)
                    continue
                passing_candidates.append(candidate)

            # STAGE 4: Fetch full articles ONLY for candidates that passed pre-fetch filter
            semaphore = asyncio.Semaphore(5)

            async def _bounded_materialise(candidate: CandidateArticle) -> CandidateArticle:
                async with semaphore:
                    return await self._materialise_article(source, candidate)

            materialised = await asyncio.gather(
                *[_bounded_materialise(c) for c in passing_candidates],
                return_exceptions=True,
            )
            candidates: list[CandidateArticle] = []
            for candidate, article in zip(passing_candidates, materialised):
                if isinstance(article, Exception):
                    result["article_failures"] += 1
                    result["articles_rejected"] += 1
                    self._record_failure_kind(result, article)
                    logger.warning("Article failure for source=%s url=%s: %s", source.name, candidate.source_url, article)
                    continue
                # STAGE 4b: Post-fetch full-text verification: ensure property is the central subject, not incidental
                is_relevant, reason = classify_property_relevance(
                    article.source_title, article.source_url, article.clean_text,
                    source_name=source.name, category=source.category or "", is_pre_fetch=False,
                )
                if not is_relevant:
                    result["articles_rejected"] += 1
                    logger.info(
                        "POST-FETCH DISCARD (not central property subject): source=%s url=%s reason=%s",
                        source.name, article.source_url, reason,
                    )
                    continue
                is_sales, sales_reason = classify_property_sales_content(
                    article.source_title,
                    article.source_url,
                    article.original_content or "",
                    article.clean_text,
                    source_name=source.name,
                    category=source.category or "",
                )
                if is_sales:
                    result["articles_rejected"] += 1
                    logger.info("[Property News] Rejected sales content: %s reason=%s",
                                article.source_title, sales_reason)
                    continue

                candidates.append(article)
                result["articles_fetched"] += 1
            result["candidates"] = len(candidates)
            result["articles_parsed"] = len(candidates)
            for candidate in candidates:
                if result["new_items"] >= MAX_NEW_ITEMS_PER_SOURCE:
                    break
                rejection = classify_quality(
                    candidate.source_title, candidate.clean_text, candidate.source_url,
                    candidate.source_published_at,
                    allow_evergreen=bool(source.parser_config.get("allow_evergreen", False)),
                )
                if rejection:
                    reason, details = rejection
                    result["articles_rejected"] += 1
                    logger.warning(
                        "REJECTED NEWS ITEM source=%s url=%s reason=%s details=%s",
                        source.name, candidate.source_url, reason, details,
                    )
                    continue
                try:
                    stored, duplicate = await self._store_candidate(source, candidate)
                except Exception as error:
                    result["article_failures"] += 1
                    self._record_failure_kind(result, error)
                    logger.warning("Article failure: source=%s url=%s: %s", source.name, candidate.source_url, error)
                    continue
                result["duplicates" if duplicate else "new_items"] += 1
                if duplicate:
                    result["duplicates_skipped"] += 1
                if stored:
                    result["new_item_ids"].append(stored.id)
                    result["articles_inserted"] += 1
            source.last_success_at = datetime.now(timezone.utc)
            source.last_successful_fetch_at = source.last_success_at
            if result["security_blocked_urls"]:
                source.last_error = (
                    f"not_allowed_host: rejected {result['security_blocked_urls']} off-host discovered URLs"
                )
                source.failure_category = "not_allowed_host"
            else:
                source.last_error = None
                source.failure_category = None
            source.consecutive_failures = 0
            await self.repository.upsert_source(source)
            await self.repository.add_event(NewsEvent(source_id=source.id, event_type="source_fetch_succeeded", payload={
                "started_at": started.isoformat(), "candidates": result["candidates"], "new_items": result["new_items"],
                "duplicates": result["duplicates"],
            }))
            await self.repository.finish_fetch_run(run_id, result="succeeded", ended_at=datetime.now(timezone.utc),
                                                   discovered_count=result["candidates"], new_item_count=result["new_items"],
                                                   duplicate_count=result["duplicates"])
            result["sources_successful"] = 1
            logger.info(
                "SOURCE OK source=%s method=%s discovered=%d accepted=%d rejected=%d "
                "category=%s http_status=none feed_url=%s attempted_at=%s",
                source.name, source.fetch_method, result["articles_discovered"],
                result["new_items"], result["articles_rejected"],
                source.failure_category or "none",
                _redact_sensitive_query_parameters(
                    str(source.parser_config.get("discovery_url") or source.base_url)
                ),
                started.isoformat(),
            )
            self._active_run_ids.pop(source.id, None)
        except Exception as error:  # A source failure must never stop other sources.
            self._record_failure_kind(result, error)
            logger.warning(
                "Source failure: source=%s error=%s",
                source.name, _redact_sensitive_query_parameters(str(error)),
            )
            result["failures"] = 1
            result["sources_failed"] = 1
            source.last_failed_fetch_at = datetime.now(timezone.utc)
            source.consecutive_failures += 1
            source.failure_category = self.classify_failure(error)
            source.last_error = _redact_sensitive_query_parameters(
                f"{source.failure_category}: {error}"
            )[:1000]
            http_status = self._failure_http_status(source.last_error)
            try:
                await self.repository.upsert_source(source)
                await self.repository.add_event(NewsEvent(source_id=source.id, event_type="source_fetch_failed", payload={
                    "started_at": started.isoformat(), "error": source.last_error,
                    "failure_category": source.failure_category,
                }))
                if run_id:
                    await self.repository.finish_fetch_run(run_id, result="failed", ended_at=datetime.now(timezone.utc),
                                                           discovered_count=result["candidates"], new_item_count=result["new_items"],
                                                           duplicate_count=result["duplicates"], error_message=source.last_error)
            except Exception as persistence_error:
                logger.error("Could not persist failure telemetry for source %s: %s", source.name, persistence_error)
            logger.error(
                "SOURCE FAIL source=%s method=%s discovered=%d accepted=%d rejected=%d "
                "category=%s http_status=%s feed_url=%s attempted_at=%s",
                source.name, source.fetch_method, result["articles_discovered"],
                result["new_items"], result["articles_rejected"], source.failure_category,
                http_status or "none",
                _redact_sensitive_query_parameters(
                    str(source.parser_config.get("discovery_url") or source.base_url)
                ),
                started.isoformat(),
            )
            self._active_run_ids.pop(source.id, None)
        return result

    @staticmethod
    def _source_group(source: Source, source_group_count: int) -> int:
        hostname = SourceCollector._normalise_hostname(urlparse(source.base_url).hostname).removeprefix("www.")
        digest = hashlib.sha256(hostname.encode("utf-8")).digest()
        return int.from_bytes(digest[:8], "big") % source_group_count

    @staticmethod
    def _record_failure_kind(result: dict[str, Any], error: Exception) -> None:
        detail = f"{type(error).__name__}: {error}".lower()
        if "timeout" in detail:
            result["timeouts"] += 1
        if "403" in detail:
            result["http_403"] += 1
        if "404" in detail:
            result["http_404"] += 1
        if "news_fetch_max_bytes" in detail or "exceeded" in detail and "response" in detail:
            result["oversized_responses"] += 1

    @staticmethod
    def _failure_http_status(error: str) -> int | None:
        match = re.search(r"\bHTTP\s+(\d{3})\b", error, re.IGNORECASE)
        return int(match.group(1)) if match else None

    @staticmethod
    def classify_failure(error: BaseException) -> str:
        chain: list[BaseException] = []
        current: BaseException | None = error
        while current is not None and current not in chain:
            chain.append(current)
            current = current.__cause__ or current.__context__
        for item in chain:
            if isinstance(item, CollectionFailure):
                return "http_5xx" if item.category == "upstream_5xx" else item.category
        if any(isinstance(item, ET.ParseError) for item in chain):
            return "invalid_feed_xml"
        detail = " ".join(f"{type(item).__name__} {item}" for item in chain).lower()
        if re.search(r"\b404\b", detail):
            return "http_404"
        if re.search(r"\b5\d\d\b", detail) or "server error" in detail:
            return "http_5xx"
        if "robots" in detail and "disallow" in detail:
            return "robots_disallowed"
        if re.search(r"\b403\b", detail) or "forbidden" in detail:
            return "blocked_403"
        if "ssl" in detail or "certificate" in detail or isinstance(error, ssl.SSLError):
            return "tls_error"
        if any(isinstance(item, (socket.gaierror,)) for item in chain) or any(
            token in detail for token in (
                "name or service not known", "nodename nor servname", "getaddrinfo failed",
                "temporary failure in name resolution", "name resolution",
            )
        ):
            return "dns_error"
        if any(isinstance(item, (asyncio.TimeoutError, httpx.TimeoutException, TimeoutError)) for item in chain) \
                or "timeout" in detail:
            return "timeout"
        if "approved source host" in detail or "allowed source host" in detail:
            return "not_allowed_host"
        if any(isinstance(item, (httpx.NetworkError, URLError, ConnectionError, OSError)) for item in chain):
            return "network_error"
        if any(isinstance(item, (ET.ParseError, json.JSONDecodeError, ValueError, TypeError)) for item in chain):
            return "parse_error"
        if any(token in detail for token in (
            "invalid xml", "not well-formed", "undefined entity", "syntax error",
        )):
            return "invalid_feed_xml"
        return "network_error"

    @staticmethod
    def _aware(value: datetime | None) -> datetime | None:
        if value is None:
            return None
        return value if value.tzinfo else value.replace(tzinfo=timezone.utc)

    @staticmethod
    def _is_due(source: Source) -> bool:
        now = datetime.now(timezone.utc)
        last_success = SourceCollector._aware(source.last_success_at or source.last_successful_fetch_at)
        last_fail = SourceCollector._aware(source.last_failed_fetch_at)
        if last_fail and (not last_success or last_fail > last_success):
            if source.failure_category == "http_404":
                retry_after = 7 * 24 * 60 * 60
            elif source.failure_category in {"blocked_403", "robots_disallowed", "dns_error"}:
                retry_after = FAILURE_BACKOFF_SECONDS
            else:
                retry_after = (FAILURE_BACKOFF_SECONDS
                               if source.consecutive_failures >= MAX_CONSECUTIVE_FAILURES_BEFORE_BACKOFF
                               else FAILURE_RETRY_SECONDS)
            return (now - last_fail).total_seconds() >= retry_after
        if not last_success:
            return True
        return (now - last_success).total_seconds() >= source.schedule_minutes * 60

    @staticmethod
    def _last_attempt_at(source: Source) -> datetime:
        last_success = SourceCollector._aware(source.last_success_at or source.last_successful_fetch_at)
        last_fail = SourceCollector._aware(source.last_failed_fetch_at)
        candidates = [value for value in (last_success, last_fail) if value is not None]
        return max(candidates) if candidates else datetime.min.replace(tzinfo=timezone.utc)

    async def _discover(self, source: Source) -> tuple[list[CandidateArticle], int, int] | list[CandidateArticle]:
        config = source.parser_config
        if source.fetch_method == "manual":
            urls = config.get("urls", [])
            candidates = []
            rejected = 0
            security_blocked = 0
            for url in urls:
                if not self._is_allowed_source_url(source, url):
                    security_blocked += 1
                    continue
                try:
                    candidates.append(await self._fetch_article(source, url))
                except Exception:
                    rejected += 1
            if not candidates and not security_blocked:
                raise CollectionFailure("no_feed_found", "No manual article URLs were configured or fetched")
            return candidates, rejected, security_blocked
        configured_urls = config.get("urls", [])
        endpoint = config.get("discovery_url") or (
            configured_urls[0] if isinstance(configured_urls, list) and configured_urls else source.base_url
        )
        if not self._is_allowed_source_url(source, endpoint):
            raise CollectionFailure("not_allowed_host", "Discovery URL is not an approved source host")
        used_html_fallback = False
        rejected_count = 0
        if source.fetch_method in {"rss", "atom"}:
            candidates, used_html_fallback, rejected_count = await self._discover_feed(
                source, endpoint,
            )
        elif source.fetch_method == "wp_json":
            body = await self._fetch(source, endpoint, allowed_content_types=DISCOVERY_CONTENT_TYPES)
            candidates = self._parse_wp_json(source, body, endpoint)
        elif source.fetch_method == "sitemap":
            body = await self._fetch(source, endpoint, allowed_content_types=DISCOVERY_CONTENT_TYPES)
            candidates = self._parse_sitemap(source, body, endpoint)
        elif source.fetch_method == "api":
            body = await self._fetch(source, endpoint, allowed_content_types=DISCOVERY_CONTENT_TYPES)
            candidates = self._parse_api(source, body, endpoint)
        elif source.fetch_method == "html":
            body = await self._fetch(source, endpoint, allowed_content_types=DISCOVERY_CONTENT_TYPES)
            candidates, rejected_count = self._parse_html_discovery(source, body, endpoint)
        else:
            raise ValueError(f"Unsupported fetch method: {source.fetch_method}")
        candidates = [candidate for candidate in candidates if self._matches_source_filters(source, candidate.source_url)]
        if not candidates:
            raise CollectionFailure("no_feed_found", f"No collection items found at {endpoint}")
        if source.fetch_method == "html" or used_html_fallback:
            allowed = []
            security_blocked = 0
            for candidate in candidates:
                if self._is_allowed_source_url(source, candidate.source_url):
                    allowed.append(candidate)
                else:
                    security_blocked += 1
            return allowed, rejected_count, security_blocked
        allowed = []
        security_blocked = 0
        rejected = 0
        for candidate in candidates:
            if not self._is_allowed_source_url(source, candidate.source_url):
                security_blocked += 1
            elif self._is_likely_article_url(candidate.source_url, candidate.source_title, source.base_url):
                allowed.append(candidate)
            else:
                rejected += 1
        return allowed, rejected, security_blocked

    async def _discover_feed(
        self, source: Source, endpoint: str,
    ) -> tuple[list[CandidateArticle], bool, int]:
        configured_feed_urls = source.parser_config.get("feed_urls", [])
        if isinstance(configured_feed_urls, str):
            configured_feed_urls = [configured_feed_urls]
        if not isinstance(configured_feed_urls, list):
            configured_feed_urls = []
        feed_urls = list(dict.fromkeys(
            [url for url in configured_feed_urls if isinstance(url, str)] + [endpoint]
        ))
        last_failure: CollectionFailure | None = None
        last_body: str | None = None
        last_url: str | None = None

        for feed_url in feed_urls:
            if not self._is_allowed_source_url(source, feed_url):
                raise CollectionFailure("not_allowed_host", "Feed URL is not an approved source host")
            try:
                body = await self._fetch(
                    source, feed_url, allowed_content_types=DISCOVERY_CONTENT_TYPES,
                )
            except CollectionFailure as error:
                last_failure = error
                if error.category == "http_404":
                    continue
                raise

            last_body, last_url = body, feed_url
            try:
                candidates = self._parse_feed(source, body, feed_url)
            except CollectionFailure as error:
                last_failure = error
                continue
            if candidates:
                return candidates, False, 0
            last_failure = CollectionFailure(
                "no_feed_found", f"No collection items found at {_redact_sensitive_query_parameters(feed_url)}",
            )

        if source.parser_config.get("html_fallback") is True:
            html_url = source.parser_config.get("html_discovery_url") or source.base_url
            if not isinstance(html_url, str) or not self._is_allowed_source_url(source, html_url):
                raise CollectionFailure(
                    "not_allowed_host", "HTML discovery URL is not an approved source host",
                )
            if last_body is not None and last_url == html_url:
                html_body = last_body
            else:
                html_body = await self._fetch(
                    source, html_url, allowed_content_types=DISCOVERY_CONTENT_TYPES,
                )
            candidates, rejected_count = self._parse_html_discovery(
                source, html_body, html_url,
            )
            if candidates:
                return candidates, True, rejected_count
            if last_failure is None or last_failure.category == "no_feed_found":
                last_failure = CollectionFailure(
                    "no_feed_found",
                    f"No feed items or permitted HTML article links found at "
                    f"{_redact_sensitive_query_parameters(html_url)}",
                )

        if last_failure is not None:
            raise last_failure
        raise CollectionFailure("no_feed_found", "No feed URLs were configured or fetched")

    async def _wait_for_origin(self, origin: str) -> None:
        hostname = self._normalise_hostname(urlparse(origin).hostname).removeprefix("www.")
        lock = self._origin_locks.setdefault(hostname, asyncio.Lock())
        async with lock:
            interval = max(1.0, self.settings.min_request_interval_seconds)
            delay = interval - (
                time.monotonic() - self._last_request_at.get(hostname, 0)
            )
            if delay > 0:
                await asyncio.sleep(delay)
            self._last_request_at[hostname] = time.monotonic()

    async def _robots_allowed(self, source: Source, url: str) -> bool:
        parsed = urlparse(url)
        origin = f"{parsed.scheme}://{parsed.netloc}"
        if origin not in self._robots_cache:
            lock = self._robots_locks.setdefault(origin, asyncio.Lock())
            async with lock:
                if origin not in self._robots_cache:
                    parser = robotparser.RobotFileParser()
                    robots_url = f"{origin}/robots.txt"

                    def read_robots() -> robotparser.RobotFileParser:
                        candidate = robotparser.RobotFileParser(robots_url)
                        request = Request(robots_url, headers={"User-Agent": COLLECTOR_USER_AGENT})
                        try:
                            with build_opener(
                                ProxyHandler({}), _AllowedHostRedirect(self._allowed_hosts(source)),
                            ).open(request, timeout=10) as response:
                                candidate.parse(response.read(512_000).decode("utf-8", errors="replace").splitlines())
                        except HTTPError as error:
                            if error.code in {401, 403}:
                                raise CollectionFailure(
                                    "robots_disallowed",
                                    f"robots.txt returned HTTP {error.code}",
                                ) from error
                            elif error.code == 404:
                                candidate.parse([])
                            elif error.code >= 500:
                                raise CollectionFailure("http_5xx", f"robots.txt returned HTTP {error.code}") from error
                            else:
                                candidate.parse([])
                        except URLError as error:
                            if isinstance(error.reason, ssl.SSLError):
                                raise CollectionFailure("tls_error", f"robots.txt TLS failure: {error.reason}") from error
                            if isinstance(error.reason, socket.gaierror):
                                raise CollectionFailure("dns_error", f"robots.txt DNS failure: {error.reason}") from error
                            raise
                        return candidate

                    await self._wait_for_origin(origin)
                    parser = await asyncio.to_thread(read_robots)
                    self._robots_cache[origin] = parser
        return self._robots_cache[origin].can_fetch(COLLECTOR_USER_AGENT, url)

    async def _fetch(self, source: Source, url: str, *, allowed_content_types: set[str] | None = None) -> str:
        parsed = urlparse(url)
        if not self._is_allowed_source_url(source, url):
            raise CollectionFailure("not_allowed_host", "Fetch URL is not an approved source host")
        host = self._normalise_hostname(parsed.hostname).removeprefix("www.")
        semaphore = self._origin_semaphores.setdefault(host, asyncio.Semaphore(2))
        async with semaphore:
            if not await self._robots_allowed(source, url):
                raise CollectionFailure("robots_disallowed", f"robots.txt disallows {url}")
            client = await self._get_client()
            last_error: Exception | None = None
            for attempt in range(self.settings.fetch_retry_attempts):
                try:
                    current_url = url
                    for _ in range(5):
                        current_origin = re.sub(r"^(https?://[^/]+).*$", r"\1", current_url)
                        if not await self._robots_allowed(source, current_url):
                            raise CollectionFailure("robots_disallowed", f"robots.txt disallows {current_url}")
                        await self._wait_for_origin(current_origin)
                        async with client.stream("GET", current_url) as response:
                            if response.is_redirect:
                                location = response.headers.get("location")
                                if not location:
                                    raise ValueError("Redirect response missing Location header")
                                redirect_url = urljoin(current_url, location)
                                allowed = self._is_allowed_source_url(source, redirect_url)
                                logger.info(
                                    "Redirect: source=%s rejected_host=%s configured_host=%s result=%s",
                                    source.name,
                                    self._normalise_hostname(urlparse(redirect_url).hostname),
                                    self._normalise_hostname(urlparse(source.base_url).hostname),
                                    "ALLOWED" if allowed else "BLOCKED",
                                )
                                if not allowed:
                                    raise CollectionFailure("not_allowed_host", "Redirect target is not an approved source host")
                                current_url = redirect_url
                                continue
                            if response.status_code >= 500:
                                last_error = CollectionFailure(
                                    "http_5xx", f"HTTP {response.status_code} response",
                                )
                                if attempt + 1 < self.settings.fetch_retry_attempts:
                                    await asyncio.sleep(0.5 * (2 ** attempt))
                                    break
                                raise last_error
                            if response.status_code >= 400:
                                category = (
                                    "blocked_403" if response.status_code == 403
                                    else "http_404" if response.status_code == 404
                                    else "http_4xx"
                                )
                                raise CollectionFailure(
                                    category, f"HTTP {response.status_code} response",
                                )
                            content_type = response.headers.get("content-type", "").split(";", 1)[0].strip().lower()
                            accepted_types = allowed_content_types or DISCOVERY_CONTENT_TYPES
                            if content_type not in accepted_types:
                                raise ValueError(f"Unsupported Content-Type {content_type or '<missing>'}")
                            chunks: list[bytes] = []
                            total = 0
                            async for chunk in response.aiter_bytes():
                                total += len(chunk)
                                if total > self.settings.fetch_max_bytes:
                                    raise ValueError("Response exceeded NEWS_FETCH_MAX_BYTES")
                                chunks.append(chunk)
                            return b"".join(chunks).decode("utf-8", errors="replace")
                    else:
                        raise ValueError("Too many redirects")
                except CollectionFailure:
                    raise
                except (httpx.HTTPError, ValueError) as error:
                    last_error = error
                    if attempt + 1 < self.settings.fetch_retry_attempts:
                        await asyncio.sleep(0.5 * (2 ** attempt))

            if last_error:
                category = self.classify_failure(last_error)
                detail = _redact_sensitive_query_parameters(str(last_error))
                raise CollectionFailure(
                    category, f"Fetch failed: {type(last_error).__name__}: {detail}",
                ) from last_error
            raise CollectionFailure("network_error", "Fetch produced no response")

    async def _fetch_article(self, source: Source, url: str, title: str | None = None, published_at: datetime | None = None) -> CandidateArticle:
        if not self._is_allowed_source_url(source, url):
            raise ValueError("Article URL is not an approved source host")
        if not self._is_likely_article_url(url, title, source.base_url):
            raise ValueError("URL rejected as a non-article")
        html = await self._fetch(source, url, allowed_content_types=ARTICLE_CONTENT_TYPES)

        # Offload synchronous trafilatura extraction to threadpool to avoid blocking event loop
        extracted_text = await asyncio.to_thread(trafilatura.extract, html, include_comments=False, include_tables=False)
        metadata = await asyncio.to_thread(trafilatura.extract_metadata, html)
        extracted_title = (metadata.title if metadata else None) or None
        extracted_date = parse_source_date(getattr(metadata, "date", None) if metadata else None)
        extracted_date = extracted_date or parse_source_date(title)
        image_url = extract_article_image_url(html, url, source.base_url)

        usable_title = SourceCollector._usable_title(title)
        if extracted_text and len(extracted_text) >= 200:
            clean_text = extracted_text
            resolved_title = extracted_title or usable_title or url
        else:
            parser = _ArticleHTMLParser()
            parser.feed(html)
            clean_text = " ".join(parser.text)
            resolved_title = extracted_title or usable_title or " ".join(parser.title) or url

        return CandidateArticle(source_id=source.id, source_url=canonicalise_url(url), source_title=resolved_title,
                                source_published_at=published_at or extracted_date, original_content=html, clean_text=clean_text,
                                image_url=image_url)

    async def _materialise_article(self, source: Source, candidate: CandidateArticle) -> CandidateArticle:
        """Fetch a discovered article when only a feed excerpt/link was available."""
        if len(candidate.clean_text) >= 500:
            return candidate
        article = await self._fetch_article(source, candidate.source_url, candidate.source_title, candidate.source_published_at)
        return article if article.clean_text else candidate

    def _parse_feed(self, source: Source, body: str, base_url: str) -> list[CandidateArticle]:
        try:
            root = ET.fromstring(body)
        except ET.ParseError as error:
            raise CollectionFailure("invalid_feed_xml", "Response is not well-formed feed XML") from error
        root_name = root.tag.rsplit("}", 1)[-1].lower() if isinstance(root.tag, str) else ""
        if root_name not in {"rss", "feed", "rdf"}:
            raise CollectionFailure("invalid_feed_xml", "XML response is not an RSS or Atom feed")
        selectors = source.parser_config.get("selectors", {})
        selectors = selectors if isinstance(selectors, dict) else {}
        title_selector = selectors.get("title", "title")
        url_selector = selectors.get("url", "link")
        content_selectors = selectors.get("content", ["description", "summary"])
        date_selectors = selectors.get("published_date", ["pubDate", "published", "updated"])
        title_selector = title_selector if isinstance(title_selector, str) else "title"
        url_selector = url_selector if isinstance(url_selector, str) else "link"
        content_selectors = [content_selectors] if isinstance(content_selectors, str) else content_selectors
        date_selectors = [date_selectors] if isinstance(date_selectors, str) else date_selectors
        content_selectors = content_selectors if isinstance(content_selectors, list) else ["description", "summary"]
        date_selectors = date_selectors if isinstance(date_selectors, list) else ["pubDate", "published", "updated"]

        def selected_text(entry: ET.Element, names: list[Any]) -> str:
            for name in names:
                if isinstance(name, str):
                    value = self._element_text(entry, name)
                    if value:
                        return value
            return ""

        articles: list[CandidateArticle] = []
        for entry in root.findall(".//item") + root.findall(".//{http://www.w3.org/2005/Atom}entry"):
            title = self._element_text(entry, title_selector) or "Untitled source item"
            url = self._element_text(entry, url_selector)
            if not url:
                link = entry.find("{http://www.w3.org/2005/Atom}link")
                url = link.attrib.get("href") if link is not None else None
            if not url:
                continue
            description = selected_text(entry, content_selectors)
            date_text = selected_text(entry, date_selectors) or None
            published = self._parse_date(date_text)
            articles.append(CandidateArticle(source_id=source.id, source_url=urljoin(base_url, url), source_title=title,
                                             source_published_at=published, original_content=description, clean_text=clean_html(description)))
        return articles

    def _parse_sitemap(self, source: Source, body: str, base_url: str) -> list[CandidateArticle]:
        try:
            root = ET.fromstring(body)
        except ET.ParseError as error:
            raise CollectionFailure("invalid_feed_xml", "Response is not well-formed sitemap XML") from error
        selectors = source.parser_config.get("selectors", {})
        url_selector = selectors.get("url", "loc") if isinstance(selectors, dict) else "loc"
        articles: list[CandidateArticle] = []
        for location in root.findall(f".//{{*}}{url_selector}")[:200]:
            url = (location.text or "").strip()
            if url:
                articles.append(CandidateArticle(source_id=source.id, source_url=urljoin(base_url, url), source_title=url, clean_text=""))
        return articles

    def _parse_api(self, source: Source, body: str, base_url: str) -> list[CandidateArticle]:
        payload = json.loads(body)
        config = source.parser_config
        items = payload
        for key in config.get("items_path", "items").split("."):
            items = items.get(key, []) if isinstance(items, dict) else []
        if not isinstance(items, list):
            raise ValueError("API parser items path did not resolve to a list")
        url_key, title_key, text_key = config.get("url_key", "url"), config.get("title_key", "title"), config.get("text_key", "content")
        return [CandidateArticle(source_id=source.id, source_url=urljoin(base_url, str(row[url_key])),
                                 source_title=str(row.get(title_key) or row[url_key]), original_content=str(row.get(text_key) or ""),
                                 clean_text=clean_html(str(row.get(text_key) or "")))
                for row in items if isinstance(row, dict) and row.get(url_key)]

    def _parse_wp_json(self, source: Source, body: str, base_url: str) -> list[CandidateArticle]:
        payload = json.loads(body)
        if not isinstance(payload, list):
            raise ValueError("WordPress REST response must be an array")
        selectors = source.parser_config.get("selectors", {})
        selectors = selectors if isinstance(selectors, dict) else {}
        title_selector = selectors.get("title", "title.rendered")
        url_selector = selectors.get("url", "link")
        content_selector = selectors.get("content", "excerpt.rendered")
        date_selectors = selectors.get("published_date", ["date_gmt", "date"])
        date_selectors = [date_selectors] if isinstance(date_selectors, str) else date_selectors

        def selected_value(row: dict[str, Any], selector: str) -> Any:
            value: Any = row
            for key in selector.split("."):
                value = value.get(key) if isinstance(value, dict) else None
            return value

        articles: list[CandidateArticle] = []
        for row in payload:
            if not isinstance(row, dict):
                continue
            link = selected_value(row, url_selector) if isinstance(url_selector, str) else None
            if not link:
                continue
            title = selected_value(row, title_selector) if isinstance(title_selector, str) else None
            content = selected_value(row, content_selector) if isinstance(content_selector, str) else None
            if not content:
                content = selected_value(row, "content.rendered")
            title_text = clean_html(str(title or ""))
            content_text = clean_html(str(content or ""))
            date_value = next(
                (selected_value(row, selector) for selector in date_selectors
                 if isinstance(selector, str) and selected_value(row, selector)),
                None,
            )
            published = self._parse_date(str(date_value or ""))
            articles.append(CandidateArticle(
                source_id=source.id,
                source_url=urljoin(base_url, str(link)),
                source_title=title_text or str(link),
                source_published_at=published,
                external_post_id=str(row["id"]) if row.get("id") is not None else None,
                original_content=content_text,
                clean_text=content_text,
            ))
        return articles

    @staticmethod
    def _matches_source_filters(source: Source, url: str) -> bool:
        config = source.parser_config
        include = config.get("include_url_contains", [])
        exclude = config.get("exclude_url_contains", [])
        path = urlparse(url).path.lower()
        if isinstance(include, list) and include and not any(
            isinstance(value, str) and value.lower() in path for value in include
        ):
            return False
        if isinstance(exclude, list) and any(
            isinstance(value, str) and value.lower() in path for value in exclude
        ):
            return False
        return True

    def _parse_html_discovery(self, source: Source, body: str, base_url: str) -> tuple[list[CandidateArticle], int]:
        parser = _ArticleHTMLParser()
        parser.feed(body)
        pattern = source.parser_config.get("url_contains", "")
        selectors = source.parser_config.get("selectors", {})
        url_regex = source.parser_config.get("url_regex")
        if not isinstance(url_regex, str) and isinstance(selectors, dict):
            url_regex = selectors.get("url_regex")
        compiled_regex = re.compile(url_regex) if isinstance(url_regex, str) and url_regex else None
        excluded = [value for value in source.parser_config.get("exclude_url_contains", []) if isinstance(value, str)]
        max_articles = min(max(int(source.parser_config.get("max_articles", 100)), 1), MAX_NEW_ITEMS_PER_SOURCE)
        seen: set[str] = set()
        articles: list[CandidateArticle] = []
        rejected_count = 0
        for href, title in parser.links:
            if (pattern and pattern not in href) or any(value in href for value in excluded):
                continue
            path = urlparse(href).path or href
            if compiled_regex and not compiled_regex.search(path):
                continue
            url = urljoin(base_url, href)
            if not self._is_likely_article_url(url, title, source.base_url):
                rejected_count += 1
                continue
            canonical = canonicalise_url(url)
            if canonical in seen:
                continue
            seen.add(canonical)
            articles.append(CandidateArticle(
                source_id=source.id, source_url=url,
                source_title=self._usable_title(title) or url, clean_text="",
            ))
            if len(articles) >= max_articles:
                break
        return articles, rejected_count

    @staticmethod
    def _usable_title(value: str | None) -> str:
        stripped = " ".join((value or "").split())
        stripped = re.sub(r"\s+\d+\s+(?:hours?|minutes?|days?)\s+ago(?:\s*-\s*[\d.]+\s*min read)?$", "", stripped, flags=re.I)
        stripped = re.sub(r"\s*-\s*[\d.]+\s*min read$", "", stripped, flags=re.I)
        if not stripped or stripped.lower() in GENERIC_LINK_TEXTS:
            return ""
        return stripped

    @staticmethod
    def _is_allowed_source_url(source: Source, url: str) -> bool:
        parsed = urlparse(url)
        if parsed.scheme not in {"http", "https"} or not parsed.hostname or parsed.username or parsed.password:
            return False
        hostname = SourceCollector._normalise_hostname(parsed.hostname)
        allowed_hosts = SourceCollector._allowed_hosts(source)
        allowed = hostname in allowed_hosts
        if not allowed:
            logger.warning(
                "Rejected source URL host: source=%s rejected_host=%s configured_host=%s allowed_hosts=%s",
                source.name, hostname,
                SourceCollector._normalise_hostname(urlparse(source.base_url).hostname),
                sorted(allowed_hosts),
            )
        return allowed

    @staticmethod
    def _normalise_hostname(hostname: str | None) -> str:
        return (hostname or "").lower().rstrip(".")

    @staticmethod
    def _allowed_hosts(source: Source) -> set[str]:
        configured_host = SourceCollector._normalise_hostname(urlparse(source.base_url).hostname)
        hosts: set[str] = set()
        if configured_host:
            apex = configured_host.removeprefix("www.")
            hosts.update({apex, f"www.{apex}"})
        for configured in source.parser_config.get("allowed_hosts", []):
            if not isinstance(configured, str):
                continue
            parsed = urlparse(configured if "://" in configured else f"//{configured}")
            if parsed.hostname:
                explicit_host = SourceCollector._normalise_hostname(parsed.hostname)
                explicit_apex = explicit_host.removeprefix("www.")
                hosts.update({explicit_apex, f"www.{explicit_apex}"})
        return {host for host in hosts if host}

    @staticmethod
    def _is_likely_article_url(url: str, title: str | None, base_url: str) -> bool:
        parsed = urlparse(url)
        if parsed.scheme not in {"http", "https"} or not parsed.hostname:
            return False
        if parsed.path.rstrip("/") == urlparse(base_url).path.rstrip("/") and not parsed.path.strip("/"):
            return False
        path = parsed.path.lower()
        if any(path == prefix.rstrip("/") or path.startswith(prefix) for prefix in NON_ARTICLE_PATH_PREFIXES):
            return False
        if any(path.endswith(extension) for extension in DOCUMENT_EXTENSIONS):
            return False
        segments = {segment for segment in path.split("/") if segment}
        if segments & NON_ARTICLE_PATH_PARTS:
            return False
        if title is not None and not SourceCollector._usable_title(title):
            return False
        return len(path.strip("/")) >= 3

    @staticmethod
    def _element_text(entry: ET.Element, name: str) -> str | None:
        element = entry.find(name)
        if element is None:
            element = entry.find(f"{{http://www.w3.org/2005/Atom}}{name}")
        return (element.text or "").strip() if element is not None and element.text else None

    @staticmethod
    def _parse_date(value: str | None) -> datetime | None:
        if not value:
            return None
        try:
            return datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError:
            try:
                return parsedate_to_datetime(value)
            except (TypeError, ValueError):
                return None

    async def _store_candidate(self, source: Source, candidate: CandidateArticle) -> tuple[NewsItem | None, bool]:
        is_sales, sales_reason = classify_property_sales_content(
            candidate.source_title,
            candidate.source_url,
            candidate.original_content or "",
            candidate.clean_text,
            source_name=source.name,
            category=source.category or "",
        )
        if is_sales:
            logger.info("[Property News] Rejected sales content: %s reason=%s",
                        candidate.source_title, sales_reason)
            return None, False
        # Guard against storing any item that fails the strict property scope
        is_relevant, reason = classify_property_relevance(
            candidate.source_title, candidate.source_url, candidate.clean_text
        )
        if not is_relevant:
            logger.info("STORAGE_REJECTED non-property article: %s %s reason=%s", candidate.source_url, candidate.source_title, reason)
            return None, False

        canonical_url = canonicalise_url(candidate.source_url)
        if candidate.external_post_id and await self.repository.find_by_external_post_id(source.platform, candidate.external_post_id):
            return None, True
        text = candidate.clean_text or candidate.source_title
        digest = content_hash(text)
        duplicate = await self.repository.find_by_canonical_url(canonical_url)
        duplicate = duplicate or await self.repository.find_by_content_hash(digest)
        duplicate = duplicate or await self.repository.find_similar_title(candidate.source_title)
        if duplicate:
            await self.repository.add_event(NewsEvent(source_id=source.id, news_id=duplicate.id, event_type="duplicate_detected", payload={
                "candidate_url": candidate.source_url, "canonical_url": canonical_url,
            }))
            return None, True
        usable_title = self._usable_title(candidate.source_title)
        if len((candidate.clean_text or "").strip()) < 80 and (not usable_title or usable_title == candidate.source_url):
            return None, False
        item = NewsItem(source_id=source.id, source_url=candidate.source_url, canonical_url=canonical_url,
                        source_title=candidate.source_title[:1000], source_published_at=candidate.source_published_at,
                        external_post_id=candidate.external_post_id,
                        platform=source.platform,
                        original_content=candidate.original_content, clean_text=candidate.clean_text,
                        image_url=candidate.image_url,
                        source_tier=source.trust_tier, content_hash=digest)
        saved = await self.repository.save_item(item)
        await self.repository.add_event(NewsEvent(source_id=source.id, news_id=saved.id, event_type="item_discovered", payload={"canonical_url": canonical_url}))
        return saved, False
