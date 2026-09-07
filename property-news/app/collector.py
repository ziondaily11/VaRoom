from __future__ import annotations

import asyncio
import json
import logging
import re
import ssl
import time
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from html.parser import HTMLParser
from typing import Any, Iterable
from urllib.parse import urljoin, urlparse
from uuid import UUID

import httpx
import trafilatura
import truststore

from .config import Settings
from .media import extract_article_image_url
from .models import CandidateArticle, NewsEvent, NewsItem, Source
from .normalizer import canonicalise_url, clean_html, content_hash
from .repository import MemoryNewsRepository, SupabaseNewsRepository

logger = logging.getLogger(__name__)
Repository = MemoryNewsRepository | SupabaseNewsRepository
FAILURE_RETRY_SECONDS = 15 * 60
MAX_SOURCES_PER_RUN = 20
SOURCE_GROUP_COUNT = 11

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


class SourceCollector:
    def __init__(self, repository: Repository, settings: Settings) -> None:
        self.repository, self.settings = repository, settings
        self._last_request_at: dict[str, float] = {}
        # Keep certificate verification enabled while using the deployment
        # host's maintained CA store for official government sources.
        self._ssl_context = truststore.SSLContext(ssl.PROTOCOL_TLS_CLIENT)
        self._client: httpx.AsyncClient | None = None

    async def _get_client(self) -> httpx.AsyncClient:
        if self._client is None or self._client.is_closed:
            headers = {
                "User-Agent": self.settings.fetch_user_agent,
                "Accept": "application/rss+xml, application/atom+xml, application/xml, text/html, application/json;q=0.9"
            }
            self._client = httpx.AsyncClient(
                timeout=self.settings.fetch_timeout_seconds,
                follow_redirects=False,
                headers=headers,
                verify=self._ssl_context,
                limits=httpx.Limits(max_keepalive_connections=20, max_connections=50)
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
        sources = await self.repository.list_sources(active_only=True)
        if source_group is not None:
            # Stable name ordering keeps a source in the same group between runs.
            sources = [source for index, source in enumerate(sources)
                       if index % source_group_count == source_group]
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

        semaphore = asyncio.Semaphore(4)

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

            # Materialize articles with bounded concurrency (up to 5 concurrently per source)
            semaphore = asyncio.Semaphore(5)

            async def _bounded_materialise(candidate: CandidateArticle) -> CandidateArticle:
                async with semaphore:
                    return await self._materialise_article(source, candidate)

            materialised = await asyncio.gather(
                *[_bounded_materialise(c) for c in raw_candidates],
                return_exceptions=True,
            )
            candidates: list[CandidateArticle] = []
            for candidate, article in zip(raw_candidates, materialised):
                if isinstance(article, Exception):
                    result["article_failures"] += 1
                    result["articles_rejected"] += 1
                    self._record_failure_kind(result, article)
                    logger.warning("Article failure for source=%s url=%s: %s", source.name, candidate.source_url, article)
                    continue
                candidates.append(article)
                result["articles_fetched"] += 1
            result["candidates"] = len(candidates)
            result["articles_parsed"] = len(candidates)
            for candidate in candidates:
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
            source.last_successful_fetch_at = datetime.now(timezone.utc)
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
                "Source succeeded: source=%s urls_discovered=%d rejected=%d security_blocked=%d "
                "articles_fetched=%d parsed=%d inserted=%d duplicates=%d",
                source.name, result["articles_discovered"], result["articles_rejected"],
                result["security_blocked_urls"], result["articles_fetched"],
                result["articles_parsed"], result["articles_inserted"], result["duplicates_skipped"],
            )
        except Exception as error:  # A source failure must never stop other sources.
            self._record_failure_kind(result, error)
            logger.warning("Source failure: source=%s error=%s", source.name, error)
            result["failures"] = 1
            result["sources_failed"] = 1
            source.last_failed_fetch_at = datetime.now(timezone.utc)
            try:
                await self.repository.upsert_source(source)
                await self.repository.add_event(NewsEvent(source_id=source.id, event_type="source_fetch_failed", payload={
                    "started_at": started.isoformat(), "error": str(error)[:1000],
                }))
                if run_id:
                    await self.repository.finish_fetch_run(run_id, result="failed", ended_at=datetime.now(timezone.utc),
                                                           discovered_count=result["candidates"], new_item_count=result["new_items"],
                                                           duplicate_count=result["duplicates"], error_message=str(error)[:1000])
            except Exception as persistence_error:
                logger.error("Could not persist failure telemetry for source %s: %s", source.name, persistence_error)
        return result

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
    def _aware(value: datetime | None) -> datetime | None:
        if value is None:
            return None
        return value if value.tzinfo else value.replace(tzinfo=timezone.utc)

    @staticmethod
    def _is_due(source: Source) -> bool:
        now = datetime.now(timezone.utc)
        last_success = SourceCollector._aware(source.last_successful_fetch_at)
        last_fail = SourceCollector._aware(source.last_failed_fetch_at)
        if last_fail and (not last_success or last_fail > last_success):
            retry_after = min(FAILURE_RETRY_SECONDS, source.schedule_minutes * 60)
            return (now - last_fail).total_seconds() >= retry_after
        if not last_success:
            return True
        return (now - last_success).total_seconds() >= source.schedule_minutes * 60

    @staticmethod
    def _last_attempt_at(source: Source) -> datetime:
        last_success = SourceCollector._aware(source.last_successful_fetch_at)
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
            return candidates, rejected, security_blocked
        endpoint = config.get("discovery_url") or source.base_url
        if not self._is_allowed_source_url(source, endpoint):
            raise ValueError("Discovery URL is not an approved source host")
        body = await self._fetch(source, endpoint, allowed_content_types=DISCOVERY_CONTENT_TYPES)
        if source.fetch_method in {"rss", "atom"}:
            candidates = self._parse_feed(source, body, endpoint)
        elif source.fetch_method == "sitemap":
            candidates = self._parse_sitemap(source, body, endpoint)
        elif source.fetch_method == "api":
            candidates = self._parse_api(source, body, endpoint)
        elif source.fetch_method == "html":
            candidates, rejected_count = self._parse_html_discovery(source, body, endpoint)
        else:
            raise ValueError(f"Unsupported fetch method: {source.fetch_method}")
        if source.fetch_method == "html":
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

    async def _fetch(self, source: Source, url: str, *, allowed_content_types: set[str] | None = None) -> str:
        origin = re.sub(r"^(https?://[^/]+).*$", r"\1", url)
        delay = self.settings.min_request_interval_seconds - (time.monotonic() - self._last_request_at.get(origin, 0))
        if delay > 0:
            await asyncio.sleep(delay)
        client = await self._get_client()
        last_error: Exception | None = None
        for attempt in range(self.settings.fetch_retry_attempts):
            try:
                current_url = url
                for _ in range(5):
                    async with client.stream("GET", current_url) as response:
                        if response.is_redirect:
                            location = response.headers.get("location")
                            if not location:
                                raise ValueError("Redirect response missing Location header")
                            redirect_url = urljoin(current_url, location)
                            allowed = self._is_allowed_source_url(source, redirect_url)
                            logger.info(
                                "Redirect: %s -> %s -> %s -> %s",
                                source.name,
                                self._normalise_hostname(urlparse(current_url).hostname),
                                self._normalise_hostname(urlparse(redirect_url).hostname),
                                "ALLOWED" if allowed else "BLOCKED",
                            )
                            if not allowed:
                                raise ValueError("Redirect target is not an approved source host")
                            current_url = redirect_url
                            continue
                        response.raise_for_status()
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
                        break
                else:
                    raise ValueError("Too many redirects")
                self._last_request_at[origin] = time.monotonic()
                return b"".join(chunks).decode("utf-8", errors="replace")
            except (httpx.HTTPError, ValueError) as error:
                last_error = error
                if attempt + 1 < self.settings.fetch_retry_attempts:
                    await asyncio.sleep(0.5 * (2 ** attempt))

        raise RuntimeError(f"Fetch failed for {url}: {type(last_error).__name__}: {last_error}") from last_error

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

        return CandidateArticle(source_id=source.id, source_url=url, source_title=resolved_title,
                                source_published_at=published_at, original_content=html, clean_text=clean_text,
                                image_url=image_url)

    async def _materialise_article(self, source: Source, candidate: CandidateArticle) -> CandidateArticle:
        """Fetch a discovered article when only a feed excerpt/link was available."""
        if len(candidate.clean_text) >= 500:
            return candidate
        article = await self._fetch_article(source, candidate.source_url, candidate.source_title, candidate.source_published_at)
        return article if article.clean_text else candidate

    def _parse_feed(self, source: Source, body: str, base_url: str) -> list[CandidateArticle]:
        root = ET.fromstring(body)
        articles: list[CandidateArticle] = []
        for entry in root.findall(".//item") + root.findall(".//{http://www.w3.org/2005/Atom}entry"):
            title = self._element_text(entry, "title") or "Untitled source item"
            url = self._element_text(entry, "link")
            if not url:
                link = entry.find("{http://www.w3.org/2005/Atom}link")
                url = link.attrib.get("href") if link is not None else None
            if not url:
                continue
            description = self._element_text(entry, "description") or self._element_text(entry, "summary") or ""
            published = self._parse_date(self._element_text(entry, "pubDate") or self._element_text(entry, "published") or self._element_text(entry, "updated"))
            articles.append(CandidateArticle(source_id=source.id, source_url=urljoin(base_url, url), source_title=title,
                                             source_published_at=published, original_content=description, clean_text=clean_html(description)))
        return articles

    def _parse_sitemap(self, source: Source, body: str, base_url: str) -> list[CandidateArticle]:
        root = ET.fromstring(body)
        articles: list[CandidateArticle] = []
        for location in root.findall(".//{*}loc")[:200]:
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

    def _parse_html_discovery(self, source: Source, body: str, base_url: str) -> tuple[list[CandidateArticle], int]:
        parser = _ArticleHTMLParser()
        parser.feed(body)
        pattern = source.parser_config.get("url_contains", "")
        url_regex = source.parser_config.get("url_regex")
        compiled_regex = re.compile(url_regex) if isinstance(url_regex, str) and url_regex else None
        excluded = [value for value in source.parser_config.get("exclude_url_contains", []) if isinstance(value, str)]
        max_articles = min(max(int(source.parser_config.get("max_articles", 100)), 1), 100)
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
        if parsed.scheme not in {"http", "https"} or not parsed.hostname:
            return False
        hostname = SourceCollector._normalise_hostname(parsed.hostname)
        allowed_hosts = SourceCollector._allowed_hosts(source)
        allowed = hostname in allowed_hosts
        if not allowed:
            logger.warning(
                "Blocked source URL: source=%s host=%s allowed_hosts=%s",
                source.name, hostname, sorted(allowed_hosts),
            )
        return allowed

    @staticmethod
    def _normalise_hostname(hostname: str | None) -> str:
        return (hostname or "").lower().rstrip(".").removeprefix("www.")

    @staticmethod
    def _allowed_hosts(source: Source) -> set[str]:
        hosts = {SourceCollector._normalise_hostname(urlparse(source.base_url).hostname)}
        for configured in source.parser_config.get("allowed_hosts", []):
            if not isinstance(configured, str):
                continue
            parsed = urlparse(configured if "://" in configured else f"//{configured}")
            if parsed.hostname:
                hosts.add(SourceCollector._normalise_hostname(parsed.hostname))
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
        canonical_url = canonicalise_url(candidate.source_url)
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
                        original_content=candidate.original_content, clean_text=candidate.clean_text,
                        image_url=candidate.image_url,
                        source_tier=source.trust_tier, content_hash=digest)
        saved = await self.repository.save_item(item)
        await self.repository.add_event(NewsEvent(source_id=source.id, news_id=saved.id, event_type="item_discovered", payload={"canonical_url": canonical_url}))
        return saved, False
