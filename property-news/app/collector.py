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
GENERIC_LINK_TEXTS = {"read more", "click here", "learn more", "continue", "more", "here", "news"}


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
                follow_redirects=True,
                headers=headers,
                verify=self._ssl_context,
                limits=httpx.Limits(max_keepalive_connections=20, max_connections=50)
            )
        return self._client

    async def close(self) -> None:
        if self._client and not self._client.is_closed:
            await self._client.aclose()

    async def collect_due_sources(self) -> dict[str, Any]:
        sources = await self.repository.list_sources(active_only=True)
        due_sources = [source for source in sources if self._is_due(source)]
        totals: dict[str, Any] = {"sources_checked": len(due_sources), "candidates": 0, "new_items": 0, "duplicates": 0,
                                  "failures": 0, "new_item_ids": []}
        if not due_sources:
            return totals

        semaphore = asyncio.Semaphore(4)

        async def _bounded_collect(source: Source) -> dict[str, Any]:
            async with semaphore:
                return await self.collect_source(source)

        results = await asyncio.gather(*[_bounded_collect(source) for source in due_sources], return_exceptions=False)
        for result in results:
            for key in ("candidates", "new_items", "duplicates", "failures"):
                totals[key] += result[key]
            totals["new_item_ids"].extend(result["new_item_ids"])
        return totals

    async def collect_source(self, source: Source) -> dict[str, Any]:
        started = datetime.now(timezone.utc)
        result: dict[str, Any] = {"candidates": 0, "new_items": 0, "duplicates": 0, "failures": 0, "new_item_ids": []}
        run_id: UUID | None = None
        try:
            run_id = await self.repository.start_fetch_run(source.id, started)
            raw_candidates = await self._discover(source)

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
                    logger.warning("Article fetch failed for %s: %s", candidate.source_url, article)
                    continue
                candidates.append(article)
            result["candidates"] = len(candidates)
            for candidate in candidates:
                stored, duplicate = await self._store_candidate(source, candidate)
                result["duplicates" if duplicate else "new_items"] += 1
                if stored:
                    result["new_item_ids"].append(stored.id)
            source.last_successful_fetch_at = datetime.now(timezone.utc)
            await self.repository.upsert_source(source)
            await self.repository.add_event(NewsEvent(source_id=source.id, event_type="source_fetch_succeeded", payload={
                "started_at": started.isoformat(), "candidates": result["candidates"], "new_items": result["new_items"],
                "duplicates": result["duplicates"],
            }))
            await self.repository.finish_fetch_run(run_id, result="succeeded", ended_at=datetime.now(timezone.utc),
                                                   discovered_count=result["candidates"], new_item_count=result["new_items"],
                                                   duplicate_count=result["duplicates"])
        except Exception as error:  # A source failure must never stop other sources.
            logger.warning("Source %s failed: %s", source.name, error)
            result["failures"] = 1
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

    async def _discover(self, source: Source) -> list[CandidateArticle]:
        config = source.parser_config
        if source.fetch_method == "manual":
            urls = config.get("urls", [])
            return [await self._fetch_article(source, url) for url in urls if self._is_allowed_source_url(source, url)]
        endpoint = config.get("discovery_url") or source.base_url
        if not self._is_allowed_source_url(source, endpoint):
            raise ValueError("Discovery URL is not an approved source host")
        body = await self._fetch(endpoint)
        if source.fetch_method in {"rss", "atom"}:
            candidates = self._parse_feed(source, body, endpoint)
        elif source.fetch_method == "sitemap":
            candidates = self._parse_sitemap(source, body, endpoint)
        elif source.fetch_method == "api":
            candidates = self._parse_api(source, body, endpoint)
        elif source.fetch_method == "html":
            candidates = self._parse_html_discovery(source, body, endpoint)
        else:
            raise ValueError(f"Unsupported fetch method: {source.fetch_method}")
        return [candidate for candidate in candidates if self._is_allowed_source_url(source, candidate.source_url)]

    async def _fetch(self, url: str) -> str:
        origin = re.sub(r"^(https?://[^/]+).*$", r"\1", url)
        delay = self.settings.min_request_interval_seconds - (time.monotonic() - self._last_request_at.get(origin, 0))
        if delay > 0:
            await asyncio.sleep(delay)
        client = await self._get_client()
        last_error: Exception | None = None
        for attempt in range(self.settings.fetch_retry_attempts):
            try:
                async with client.stream("GET", url) as response:
                    response.raise_for_status()
                    chunks: list[bytes] = []
                    total = 0
                    async for chunk in response.aiter_bytes():
                        total += len(chunk)
                        if total > self.settings.fetch_max_bytes:
                            raise ValueError("Response exceeded NEWS_FETCH_MAX_BYTES")
                        chunks.append(chunk)
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
        html = await self._fetch(url)

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

    def _parse_html_discovery(self, source: Source, body: str, base_url: str) -> list[CandidateArticle]:
        parser = _ArticleHTMLParser()
        parser.feed(body)
        pattern = source.parser_config.get("url_contains", "")
        url_regex = source.parser_config.get("url_regex")
        compiled_regex = re.compile(url_regex) if isinstance(url_regex, str) and url_regex else None
        excluded = [value for value in source.parser_config.get("exclude_url_contains", []) if isinstance(value, str)]
        max_articles = min(max(int(source.parser_config.get("max_articles", 100)), 1), 100)
        seen: set[str] = set()
        articles: list[CandidateArticle] = []
        for href, title in parser.links:
            if (pattern and pattern not in href) or any(value in href for value in excluded):
                continue
            path = urlparse(href).path or href
            if compiled_regex and not compiled_regex.search(path):
                continue
            url = urljoin(base_url, href)
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
        return articles

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
        source_host = urlparse(source.base_url).hostname
        extra_hosts = source.parser_config.get("allowed_hosts", [])
        allowed_hosts = {host.lower() for host in [source_host, *extra_hosts] if isinstance(host, str) and host}
        return parsed.hostname.lower() in allowed_hosts

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
