from __future__ import annotations

import argparse
import asyncio
import json
import re
import socket
import ssl
import time
import xml.etree.ElementTree as ET
from dataclasses import dataclass, field
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from html.parser import HTMLParser
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import urljoin, urlparse
from urllib.request import HTTPRedirectHandler, ProxyHandler, Request, build_opener
from urllib import robotparser


USER_AGENT = "VaRoomNewsBot/1.0 (+https://varoom.co.ke)"
NEWS_TERMS = ("news", "blog", "press", "media", "insights", "research", "articles", "updates", "market-report")
EXCLUDED_PATH_TERMS = (
    "listing", "listings", "properties-for-sale", "properties-for-rent", "for-sale", "for-rent",
    "property-listing", "calculator", "calculators", "service", "services", "about", "contact",
    "login", "register", "account", "agent", "property-search", "search",
)
COMMON_FEEDS = (
    "/feed", "/feed/", "/rss", "/rss.xml", "/atom.xml", "/index.xml", "/news/feed", "/blog/feed",
)
COMMON_SITEMAPS = ("/news-sitemap.xml", "/post-sitemap.xml", "/sitemap.xml")
ROOT = Path(__file__).resolve().parents[1]


class SourceProbeError(RuntimeError):
    def __init__(self, category: str, message: str, *, status: int | None = None) -> None:
        super().__init__(message)
        self.category = category
        self.status = status


@dataclass
class Page:
    url: str
    status: int
    content_type: str
    body: bytes


@dataclass
class DiscoveryResult:
    source: dict[str, Any]
    method: str | None = None
    url: str | None = None
    verified: bool = False
    item_count: int = 0
    newest_item_date: str | None = None
    http_status: int | None = None
    failure_category: str | None = None
    error_message: str | None = None
    parser_config: dict[str, Any] = field(default_factory=dict)


class _PageParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.alternates: list[str] = []
        self.links: list[tuple[str, str, bool]] = []
        self.meta: list[tuple[str, str]] = []
        self.json_ld: list[str] = []
        self._in_script = False
        self._script_type = ""
        self._script_text: list[str] = []
        self._anchor: str | None = None
        self._anchor_text: list[str] = []
        self._in_nav = False

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        values = {key.lower(): value or "" for key, value in attrs}
        if tag.lower() == "nav":
            self._in_nav = True
        if tag.lower() == "link" and values.get("rel", "").lower() == "alternate":
            feed_type = values.get("type", "").lower().split(";", 1)[0]
            if feed_type in {"application/rss+xml", "application/atom+xml"} and values.get("href"):
                self.alternates.append(values["href"])
        if tag.lower() == "meta":
            key = values.get("property") or values.get("name") or values.get("itemprop") or ""
            content = values.get("content", "")
            if key and content:
                self.meta.append((key.lower(), content))
        if tag.lower() == "script" and "ld+json" in values.get("type", "").lower():
            self._in_script = True
            self._script_type = values.get("type", "")
            self._script_text = []
        if tag.lower() == "a" and values.get("href"):
            self._anchor = values["href"]
            self._anchor_text = []

    def handle_endtag(self, tag: str) -> None:
        if tag.lower() == "script" and self._in_script:
            self.json_ld.append("".join(self._script_text))
            self._in_script = False
            self._script_type = ""
        if tag.lower() == "a" and self._anchor:
            text = " ".join(" ".join(self._anchor_text).split())
            self.links.append((self._anchor, text, self._in_nav))
            self._anchor = None
            self._anchor_text = []
        if tag.lower() == "nav":
            self._in_nav = False

    def handle_data(self, data: str) -> None:
        if self._in_script:
            self._script_text.append(data)
        if self._anchor is not None:
            self._anchor_text.append(data)


class _SameDomainRedirect(HTTPRedirectHandler):
    def __init__(self, allowed_hosts: set[str]) -> None:
        super().__init__()
        self.allowed_hosts = allowed_hosts

    def redirect_request(self, request, response, code, message, headers, new_url):
        parsed = urlparse(new_url)
        if (parsed.scheme not in {"http", "https"} or parsed.username or parsed.password
                or canonical_host(parsed.hostname or "") not in self.allowed_hosts):
            raise SourceProbeError("not_allowed_host", f"redirect to unapproved host {urlparse(new_url).hostname}", status=code)
        return super().redirect_request(request, response, code, message, headers, new_url)


def canonical_host(host: str) -> str:
    return host.lower().rstrip(".").removeprefix("www.")


def allowed_hosts(base_url: str) -> set[str]:
    apex = canonical_host(urlparse(base_url).hostname or "")
    return {apex, f"www.{apex}"} if apex else set()


def parse_date(value: Any) -> datetime | None:
    if not isinstance(value, str) or not value.strip():
        return None
    text = value.strip()
    try:
        result = datetime.fromisoformat(text.replace("Z", "+00:00"))
    except ValueError:
        try:
            result = parsedate_to_datetime(text)
        except (TypeError, ValueError, OverflowError):
            return None
    if result.tzinfo is None:
        result = result.replace(tzinfo=timezone.utc)
    result = result.astimezone(timezone.utc)
    if result.month == 1 and result.day == 1:
        return None
    return result


def domain_key(url: str) -> str:
    return canonical_host(urlparse(url).hostname or "")


class ProbeClient:
    def __init__(self, global_limit: int) -> None:
        self.global_semaphore = asyncio.Semaphore(global_limit)
        self.domain_semaphores: dict[str, asyncio.Semaphore] = {}
        self.domain_locks: dict[str, asyncio.Lock] = {}
        self.last_request: dict[str, float] = {}
        self.robots: dict[str, robotparser.RobotFileParser] = {}
        self.robots_locks: dict[str, asyncio.Lock] = {}

    async def fetch(self, url: str, hosts: set[str], *, check_robots: bool = True) -> Page:
        parsed_url = urlparse(url)
        host = canonical_host(parsed_url.hostname or "")
        if parsed_url.scheme not in {"http", "https"} or parsed_url.username or parsed_url.password:
            raise SourceProbeError("not_allowed_host", f"unsupported or credentialed URL: {url}")
        if host not in hosts:
            raise SourceProbeError("not_allowed_host", f"unapproved URL host {host}")
        semaphore = self.domain_semaphores.setdefault(host, asyncio.Semaphore(2))
        async with self.global_semaphore, semaphore:
            if check_robots and not await self._can_fetch(url, hosts):
                raise SourceProbeError("robots_disallowed", f"robots.txt disallows {url}")
            await self._throttle(host)
            return await asyncio.to_thread(self._fetch_sync, url, hosts)

    async def _throttle(self, host: str) -> None:
        lock = self.domain_locks.setdefault(host, asyncio.Lock())
        async with lock:
            delay = 1.0 - (time.monotonic() - self.last_request.get(host, 0))
            if delay > 0:
                await asyncio.sleep(delay)
            self.last_request[host] = time.monotonic()

    async def _can_fetch(self, url: str, hosts: set[str]) -> bool:
        parsed = urlparse(url)
        origin = f"{parsed.scheme}://{parsed.netloc}"
        if origin not in self.robots:
            lock = self.robots_locks.setdefault(origin, asyncio.Lock())
            async with lock:
                if origin not in self.robots:
                    robots_url = f"{origin}/robots.txt"
                    await self._throttle(canonical_host(parsed.hostname or ""))
                    try:
                        page = await asyncio.to_thread(self._fetch_sync, robots_url, hosts, 5.0)
                        parser = robotparser.RobotFileParser(robots_url)
                        parser.parse(page.body.decode("utf-8", errors="replace").splitlines())
                    except SourceProbeError as error:
                        if error.category == "blocked_403":
                            parser = robotparser.RobotFileParser(robots_url)
                            parser.parse(["User-agent: *", "Disallow: /"])
                        elif error.status == 404:
                            parser = robotparser.RobotFileParser(robots_url)
                            parser.parse([])
                        else:
                            raise
                    self.robots[origin] = parser
        return self.robots[origin].can_fetch(USER_AGENT, url)

    @staticmethod
    def _fetch_sync(url: str, hosts: set[str], timeout: float = 8.0) -> Page:
        opener = build_opener(ProxyHandler({}), _SameDomainRedirect(hosts))
        request = Request(url, headers={
            "User-Agent": USER_AGENT,
            "Accept": "application/rss+xml, application/atom+xml, application/xml, text/html, application/json;q=0.9",
        })
        try:
            with opener.open(request, timeout=timeout) as response:
                if response.status != 200:
                    raise SourceProbeError("no_feed_found", f"HTTP {response.status} at {url}", status=response.status)
                final_url = response.geturl()
                if canonical_host(urlparse(final_url).hostname or "") not in hosts:
                    raise SourceProbeError("not_allowed_host", f"redirect to unapproved host {urlparse(final_url).hostname}")
                return Page(final_url, response.status, response.headers.get("Content-Type", "").lower(), response.read(2_000_000))
        except HTTPError as error:
            if error.code == 403:
                raise SourceProbeError("blocked_403", f"HTTP 403 at {url}", status=403) from error
            if error.code >= 500:
                raise SourceProbeError("upstream_5xx", f"HTTP {error.code} at {url}", status=error.code) from error
            raise SourceProbeError("http_error", f"HTTP {error.code} at {url}", status=error.code) from error
        except ssl.SSLError as error:
            raise SourceProbeError("tls_error", f"TLS verification failed for {url}: {error}") from error
        except socket.gaierror as error:
            raise SourceProbeError("dns_error", f"DNS lookup failed for {url}: {error}") from error
        except TimeoutError as error:
            raise SourceProbeError("timeout", f"Request timed out for {url}") from error
        except URLError as error:
            if isinstance(error.reason, ssl.SSLError):
                raise SourceProbeError("tls_error", f"TLS verification failed for {url}: {error.reason}") from error
            if isinstance(error.reason, socket.gaierror):
                raise SourceProbeError("dns_error", f"DNS lookup failed for {url}: {error.reason}") from error
            if isinstance(error.reason, TimeoutError):
                raise SourceProbeError("timeout", f"Request timed out for {url}") from error
            raise SourceProbeError("no_feed_found", f"Request failed for {url}: {error.reason}") from error


class SourceDiscovery:
    def __init__(self, client: ProbeClient) -> None:
        self.client = client

    async def inspect(self, source: dict[str, Any]) -> DiscoveryResult:
        try:
            return await asyncio.wait_for(self._inspect(source), timeout=45)
        except asyncio.TimeoutError:
            result = DiscoveryResult(
                source=source, failure_category="timeout",
                error_message="Source verification exceeded the 45-second limit",
            )
            return self._failure_config(
                result, source, source["base_url"].rstrip("/"), allowed_hosts(source["base_url"]),
            )

    async def _inspect(self, source: dict[str, Any]) -> DiscoveryResult:
        base_url = source["base_url"].rstrip("/")
        hosts = allowed_hosts(base_url)
        result = DiscoveryResult(source=source)
        timed_out = False
        try:
            parsed = urlparse(base_url)
            alternate_host = parsed.hostname or ""
            alternate_host = alternate_host[4:] if alternate_host.startswith("www.") else f"www.{alternate_host}"
            alternate_netloc = alternate_host + (f":{parsed.port}" if parsed.port else "")
            alternate_url = parsed._replace(netloc=alternate_netloc).geturl()
            homepages = [base_url]
            if alternate_url != base_url and canonical_host(urlparse(alternate_url).hostname or "") in hosts:
                homepages.append(alternate_url)
            homepage = None
            last_home_error: SourceProbeError | None = None
            for candidate_url in homepages:
                result.url = candidate_url
                try:
                    homepage = await self.client.fetch(candidate_url, hosts)
                    break
                except SourceProbeError as error:
                    if error.category != "timeout":
                        raise
                    timed_out = True
                    last_home_error = error
            if homepage is None:
                return await self._discover_without_homepage(
                    source, alternate_url, hosts, result, timed_out or last_home_error is not None,
                )
            homepage_parser = self._parse_page(homepage.body)
            candidates = self._feed_candidates(homepage.url, homepage_parser)
            for index in range(0, len(candidates), 2):
                batch = candidates[index:index + 2]
                result.method = "rss"
                result.url = batch[0]
                values = await asyncio.gather(
                    *(self._verify_feed(url, hosts) for url in batch),
                    return_exceptions=True,
                )
                for url, verified in zip(batch, values):
                    if isinstance(verified, SourceProbeError):
                        if verified.category == "timeout":
                            timed_out = True
                            continue
                        result.url = url
                        raise verified
                    if isinstance(verified, BaseException):
                        if isinstance(verified, TimeoutError):
                            timed_out = True
                            continue
                        result.url = url
                        raise verified
                    if verified:
                        return self._result(result, source, "rss", url, *verified)

            wp_url = urljoin(f"{urlparse(homepage.url).scheme}://{urlparse(homepage.url).netloc}",
                             "/wp-json/wp/v2/posts?per_page=10")
            result.method, result.url = "wp_json", wp_url
            try:
                verified = await self._verify_wordpress(wp_url, hosts)
                if verified:
                    return self._result(result, source, "wp_json", wp_url, *verified)
            except SourceProbeError as error:
                if error.category == "timeout":
                    timed_out = True
                elif error.category in {
                    "blocked_403", "tls_error", "dns_error", "upstream_5xx",
                    "not_allowed_host", "robots_disallowed",
                }:
                    raise
            except (ET.ParseError, ValueError):
                pass

            sitemap_urls = await self._sitemap_candidates(homepage.url, homepage_parser, hosts)
            for url in sitemap_urls:
                result.method, result.url = "sitemap", url
                try:
                    verified = await self._verify_sitemap(url, hosts)
                except SourceProbeError as error:
                    if error.category == "timeout":
                        timed_out = True
                        continue
                    raise
                if verified:
                    return self._result(result, source, "sitemap", url, *verified)

            for listing_url in self._html_listing_candidates(homepage.url, homepage_parser):
                result.method, result.url = "html", listing_url
                try:
                    verified = await self._verify_html_listing(listing_url, hosts)
                except SourceProbeError as error:
                    if error.category == "timeout":
                        timed_out = True
                        continue
                    raise
                if verified:
                    count, newest = verified
                    config = self._html_config(source, listing_url, homepage_parser, hosts)
                    result.method, result.url, result.verified = "html", listing_url, True
                    result.item_count, result.newest_item_date = count, newest.isoformat()
                    config["verification"] = self._verification(result, "html")
                    result.parser_config = config
                    return result
            result.failure_category = "timeout" if timed_out else "no_feed_found"
            result.error_message = ("Some permitted candidate requests timed out" if timed_out
                                    else "No verified collection URL with dated same-host items was found")
            return self._failure_config(result, source, base_url, hosts)
        except SourceProbeError as error:
            result.failure_category = error.category
            result.error_message = str(error)
            result.http_status = error.status or result.http_status
            if result.failure_category not in {
                "blocked_403", "tls_error", "dns_error", "timeout", "upstream_5xx",
                "not_allowed_host", "robots_disallowed",
            }:
                result.failure_category = "no_feed_found"
            return self._failure_config(result, source, base_url, hosts)
        except (ET.ParseError, ValueError, KeyError) as error:
            result.failure_category = "no_feed_found"
            result.error_message = f"{type(error).__name__}: {error}"
            result.parser_config["discovery_error"] = f"{type(error).__name__}: {error}"
            return self._failure_config(result, source, base_url, hosts)

    async def _discover_without_homepage(self, source: dict[str, Any], preferred_base: str,
                                         hosts: set[str], result: DiscoveryResult,
                                         timed_out: bool) -> DiscoveryResult:
        feed_urls = [urljoin(preferred_base, path) for path in COMMON_FEEDS]
        for index in range(0, len(feed_urls), 2):
            batch = feed_urls[index:index + 2]
            result.method, result.url = "rss", batch[0]
            values = await asyncio.gather(
                *(self._verify_feed(url, hosts) for url in batch),
                return_exceptions=True,
            )
            for url, verified in zip(batch, values):
                if isinstance(verified, SourceProbeError):
                    if verified.category == "timeout":
                        timed_out = True
                        continue
                    raise verified
                if isinstance(verified, BaseException):
                    if isinstance(verified, TimeoutError):
                        timed_out = True
                        continue
                    raise verified
                if verified:
                    return self._result(result, source, "rss", url, *verified)

        preferred = urlparse(preferred_base)
        wp_url = urljoin(f"{preferred.scheme}://{preferred.netloc}", "/wp-json/wp/v2/posts?per_page=10")
        result.method, result.url = "wp_json", wp_url
        try:
            verified = await self._verify_wordpress(wp_url, hosts)
            if verified:
                return self._result(result, source, "wp_json", wp_url, *verified)
        except SourceProbeError as error:
            if error.category == "timeout":
                timed_out = True
            elif error.category in {"blocked_403", "tls_error", "dns_error", "upstream_5xx",
                                    "not_allowed_host", "robots_disallowed"}:
                raise
        except (ET.ParseError, ValueError):
            pass

        for path in COMMON_SITEMAPS:
            sitemap_url = urljoin(preferred_base, path)
            result.method, result.url = "sitemap", sitemap_url
            try:
                verified = await self._verify_sitemap(sitemap_url, hosts)
            except SourceProbeError as error:
                if error.category == "timeout":
                    timed_out = True
                    continue
                raise
            if verified:
                return self._result(result, source, "sitemap", sitemap_url, *verified)

        result.failure_category = "timeout" if timed_out else "no_feed_found"
        result.error_message = ("Permitted collection endpoint probes timed out" if timed_out
                                else "No verified feed or sitemap URL was found")
        return self._failure_config(result, source, source["base_url"].rstrip("/"), hosts)

    @staticmethod
    def _parse_page(body: bytes) -> _PageParser:
        parser = _PageParser()
        parser.feed(body.decode("utf-8", errors="replace"))
        return parser

    @staticmethod
    def _feed_candidates(home_url: str, page: _PageParser) -> list[str]:
        alternates = [urljoin(home_url, href) for href in page.alternates]
        category_feeds: list[str] = []
        result: list[str] = []
        result.extend(alternates)
        result.extend(urljoin(home_url, path) for path in COMMON_FEEDS)
        for href, text, _ in page.links:
            if any(word in f"{href} {text}".lower() for word in NEWS_TERMS):
                listing = urljoin(home_url, href)
                category_feeds.extend((listing.rstrip("/") + "/feed", listing.rstrip("/") + "/feed/"))
        result.extend(category_feeds[:4])
        return list(dict.fromkeys(result))

    async def _verify_feed(self, url: str, hosts: set[str]) -> tuple[int, datetime] | None:
        try:
            page = await self.client.fetch(url, hosts)
            entries = self._feed_entries(page.body, page.url)
        except ET.ParseError:
            return None
        except SourceProbeError as error:
            if error.category in {"blocked_403", "tls_error", "dns_error", "timeout", "upstream_5xx",
                                  "not_allowed_host", "robots_disallowed"}:
                raise error
            return None
        if any(canonical_host(urlparse(link).hostname or "") not in hosts for link, _ in entries if link):
            raise SourceProbeError("not_allowed_host", f"feed at {url} contains an off-host article URL")
        valid = [(link, date) for link, date in entries if date is not None]
        if not valid:
            return None
        return len(valid), max(date for _, date in valid)

    @staticmethod
    def _feed_entries(body: bytes, base_url: str) -> list[tuple[str, datetime | None]]:
        root = ET.fromstring(body)
        entries = root.findall(".//item") + root.findall(".//{http://www.w3.org/2005/Atom}entry")
        values: list[tuple[str, datetime | None]] = []
        for entry in entries:
            link_node = entry.find("link")
            link = (link_node.text or "").strip() if link_node is not None and link_node.text else ""
            if not link:
                atom_link = entry.find("{http://www.w3.org/2005/Atom}link")
                link = atom_link.attrib.get("href", "") if atom_link is not None else ""
            date_value = None
            for tag in ("pubDate", "published", "updated"):
                node = entry.find(tag)
                if node is None:
                    node = entry.find(f"{{http://www.w3.org/2005/Atom}}{tag}")
                if node is not None and node.text:
                    date_value = parse_date(node.text)
                    if date_value:
                        break
            values.append((urljoin(base_url, link), date_value))
        return values

    async def _verify_wordpress(self, url: str, hosts: set[str]) -> tuple[int, datetime] | None:
        page = await self.client.fetch(url, hosts)
        payload = json.loads(page.body.decode("utf-8", errors="replace"))
        if not isinstance(payload, list):
            return None
        items: list[datetime] = []
        for row in payload:
            if not isinstance(row, dict):
                continue
            if row.get("link") and canonical_host(urlparse(str(row["link"])).hostname or "") not in hosts:
                raise SourceProbeError("not_allowed_host", f"WordPress response at {url} contains an off-host post URL")
            date = parse_date(str(row.get("date_gmt") or row.get("date") or ""))
            if date:
                items.append(date)
        return (len(items), max(items)) if items else None

    async def _sitemap_candidates(self, home_url: str, page: _PageParser, hosts: set[str]) -> list[str]:
        result: list[str] = []
        robots_url = urljoin(home_url, "/robots.txt")
        try:
            robots_page = await self.client.fetch(robots_url, hosts, check_robots=False)
            robots_body = robots_page.body.decode("utf-8", errors="replace")
            for line in robots_body.splitlines():
                if line.lower().startswith("sitemap:"):
                    sitemap = line.split(":", 1)[1].strip()
                    if canonical_host(urlparse(sitemap).hostname or "") in hosts:
                        result.append(sitemap)
        except (SourceProbeError, RuntimeError):
            pass
        result.extend(urljoin(home_url, path) for path in COMMON_SITEMAPS)
        return list(dict.fromkeys(result))

    async def _verify_sitemap(self, url: str, hosts: set[str]) -> tuple[int, datetime] | None:
        try:
            page = await self.client.fetch(url, hosts)
            root = ET.fromstring(page.body)
        except ET.ParseError:
            return None
        except SourceProbeError as error:
            if error.category in {"blocked_403", "tls_error", "dns_error", "timeout", "upstream_5xx",
                                  "not_allowed_host", "robots_disallowed"}:
                raise error
            return None
        all_locations = [(node.text or "").strip() for node in root.findall(".//{*}loc")[:20] if node.text]
        if any(canonical_host(urlparse(location).hostname or "") not in hosts for location in all_locations):
            raise SourceProbeError("not_allowed_host", f"sitemap at {url} contains an off-host URL")
        locations = all_locations
        if root.tag.endswith("sitemapindex"):
            nested_urls = [value for value in locations if any(x in value.lower() for x in ("news", "post", "article"))]
            for nested_url in nested_urls[:5]:
                nested = await self._verify_sitemap(nested_url, hosts)
                if nested:
                    return nested
            return None
        dates: list[datetime] = []
        for article_url in locations[:5]:
            try:
                article = await self.client.fetch(article_url, hosts)
            except SourceProbeError as error:
                if error.category in {
                    "blocked_403", "tls_error", "dns_error", "timeout", "upstream_5xx",
                    "not_allowed_host", "robots_disallowed",
                }:
                    raise
                continue
            date = self._article_date(article.body)
            if date:
                dates.append(date)
        return (len(dates), max(dates)) if dates else None

    @staticmethod
    def _html_listing_candidates(home_url: str, page: _PageParser) -> list[str]:
        found = []
        for href, text, in_nav in page.links:
            if not in_nav and not any(term in f"{href} {text}".lower() for term in NEWS_TERMS):
                continue
            candidate = urljoin(home_url, href)
            if canonical_host(urlparse(candidate).hostname or "") != canonical_host(urlparse(home_url).hostname or ""):
                continue
            if any(term in urlparse(candidate).path.lower() for term in EXCLUDED_PATH_TERMS):
                continue
            found.append(candidate)
        return list(dict.fromkeys(found))

    async def _verify_html_listing(self, listing_url: str, hosts: set[str]) -> tuple[int, datetime] | None:
        try:
            page = await self.client.fetch(listing_url, hosts)
        except SourceProbeError:
            raise
        parser = self._parse_page(page.body)
        candidates: list[str] = []
        for href, text, _ in parser.links:
            article_url = urljoin(page.url, href)
            path = urlparse(article_url).path.lower()
            if canonical_host(urlparse(article_url).hostname or "") not in hosts:
                continue
            if any(term in path for term in EXCLUDED_PATH_TERMS) or not text.strip():
                continue
            if article_url.rstrip("/") == listing_url.rstrip("/"):
                continue
            if len([part for part in path.split("/") if part]) < 2:
                continue
            candidates.append(article_url)
        dated: list[datetime] = []
        for article_url in list(dict.fromkeys(candidates))[:10]:
            try:
                article = await self.client.fetch(article_url, hosts)
            except SourceProbeError as error:
                if error.category in {
                    "blocked_403", "tls_error", "dns_error", "timeout", "upstream_5xx",
                    "not_allowed_host", "robots_disallowed",
                }:
                    raise
                continue
            date = self._article_date(article.body)
            if date:
                dated.append(date)
            if len(dated) >= 3:
                break
        return (len(dated), max(dated)) if len(dated) >= 3 else None

    @classmethod
    def _article_date(cls, body: bytes) -> datetime | None:
        parser = cls._parse_page(body)
        for key, value in parser.meta:
            if key in {"article:published_time", "datepublished", "date"}:
                parsed = parse_date(value)
                if parsed:
                    return parsed
        for payload in parser.json_ld:
            try:
                value = json.loads(payload)
            except json.JSONDecodeError:
                continue
            for node in cls._walk_json(value):
                for key in ("datePublished",):
                    parsed = parse_date(node.get(key)) if isinstance(node, dict) else None
                    if parsed:
                        return parsed
        return None

    @staticmethod
    def _walk_json(value: Any):
        if isinstance(value, dict):
            yield value
            for nested in value.values():
                yield from SourceDiscovery._walk_json(nested)
        elif isinstance(value, list):
            for nested in value:
                yield from SourceDiscovery._walk_json(nested)

    def _result(self, result: DiscoveryResult, source: dict[str, Any], method: str, url: str,
                count: int, newest: datetime) -> DiscoveryResult:
        hosts = allowed_hosts(source["base_url"])
        result.method, result.url, result.verified = method, url, True
        result.item_count, result.newest_item_date = count, newest.isoformat()
        result.http_status = 200
        selectors = {
            "rss": {
                "title": "title", "url": "link",
                "published_date": ["pubDate", "published", "updated"],
                "content": ["description", "summary"],
            },
            "wp_json": {
                "title": "title.rendered", "url": "link",
                "published_date": ["date_gmt", "date"], "content": "excerpt.rendered",
            },
            "sitemap": {"url": "loc", "article_publication_date": "datePublished|article:published_time"},
        }.get(method, {})
        result.parser_config = {
            "discovery_url": url,
            "urls": [url],
            "selectors": selectors,
            "include_url_contains": [],
            "allowed_hosts": sorted(hosts),
            "max_articles": 5,
            "exclude_url_contains": list(EXCLUDED_PATH_TERMS),
            "verification": self._verification(result, method),
        }
        return result

    def _html_config(self, source: dict[str, Any], listing_url: str, page: _PageParser,
                     hosts: set[str]) -> dict[str, Any]:
        nav_paths = [
            urlparse(urljoin(source["base_url"], href)).path
            for href, text, in_nav in page.links if in_nav and any(term in f"{href} {text}".lower() for term in NEWS_TERMS)
        ]
        route = urlparse(listing_url).path.rstrip("/")
        include = next((path for path in nav_paths if path and route.startswith(path.rstrip("/"))), route)
        escaped = re.escape(include.rstrip("/"))
        return {
            "discovery_url": listing_url,
            "url_regex": f"^{escaped}/[a-z0-9][a-z0-9-]+/?$",
            "urls": [listing_url],
            "selectors": {"url_regex": f"^{escaped}/[a-z0-9][a-z0-9-]+/?$"},
            "include_url_contains": [include.rstrip("/")],
            "exclude_url_contains": list(EXCLUDED_PATH_TERMS) + ["/author", "/tag", "/category"],
            "allowed_hosts": sorted(hosts),
            "max_articles": 5,
        }

    @staticmethod
    def _verification(result: DiscoveryResult, method: str) -> dict[str, Any]:
        return {
            "checked_at": datetime.now(timezone.utc).isoformat(),
            "url": result.url,
            "http_status": result.http_status or 200,
            "item_count": result.item_count,
            "newest_item_date": result.newest_item_date,
            "method_used": method,
        }

    def _failure_config(self, result: DiscoveryResult, source: dict[str, Any], fallback_url: str,
                        hosts: set[str]) -> DiscoveryResult:
        category = result.failure_category or "no_feed_found"
        attempted_url = result.url or fallback_url
        result.method = result.method or "rss"
        result.url = attempted_url
        failure_selectors = {
            "rss": {
                "title": "title", "url": "link",
                "published_date": ["pubDate", "published", "updated"],
                "content": ["description", "summary"],
            },
            "wp_json": {
                "title": "title.rendered", "url": "link",
                "published_date": ["date_gmt", "date"], "content": "excerpt.rendered",
            },
            "sitemap": {"url": "loc", "article_publication_date": "datePublished|article:published_time"},
            "html": {"url_regex": r"(?!)"},
        }.get(result.method, {})
        result.parser_config = {
            "discovery_url": attempted_url,
            "urls": [attempted_url],
            "selectors": failure_selectors,
            "include_url_contains": [],
            "allowed_hosts": sorted(hosts),
            "max_articles": 5,
            "exclude_url_contains": list(EXCLUDED_PATH_TERMS),
            "verification": {
                "checked_at": datetime.now(timezone.utc).isoformat(),
                "url": attempted_url,
                "http_status": result.http_status,
                "item_count": result.item_count,
                "newest_item_date": result.newest_item_date,
                "method_used": result.method,
                "failure_category": category,
                "error": result.error_message,
            },
        }
        return result


def write_report(results: list[DiscoveryResult], path: Path) -> None:
    lines = [
        "# Real-estate source pool verification",
        "",
        f"Checked at: {datetime.now(timezone.utc).isoformat()}",
        "",
        "| Source | Domain | Method | URL | Verified | Item count | Newest item date | Failure category |",
        "|---|---|---|---|---|---:|---|---|",
    ]
    for result in results:
        source = result.source
        cells = (
            source["name"], domain_key(source["base_url"]), result.method or "",
            result.url or "", "yes" if result.verified else "no", str(result.item_count),
            result.newest_item_date or "", result.failure_category or "",
        )
        lines.append("| " + " | ".join(value.replace("|", "\\|").replace("\n", " ") for value in cells) + " |")
    lines.extend(("", "## Needs human action", ""))
    action_items = [item for item in results if item.failure_category in {
        "blocked_403", "robots_disallowed", "no_feed_found",
    }]
    if not action_items:
        lines.append("None.")
    else:
        for result in action_items:
            lines.append(f"- **{result.failure_category}** — {result.source['name']} (`{domain_key(result.source['base_url'])}`)")
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


async def run(args: argparse.Namespace) -> int:
    source_path = Path(args.json_path)
    if not source_path.is_absolute():
        source_path = ROOT / source_path
    original_sources = json.loads(source_path.read_text(encoding="utf-8"))
    if not isinstance(original_sources, list):
        raise ValueError("Source pool JSON must be an array")
    sources = original_sources
    if args.only:
        match = canonical_host(args.only)
        sources = [source for source in sources if domain_key(source["base_url"]) == match]
        if not sources:
            raise ValueError(f"No source matched --only {args.only}")
    discovery = SourceDiscovery(ProbeClient(args.concurrency))
    results = await asyncio.gather(*(discovery.inspect(source) for source in sources))
    for item in results:
        source = item.source
        category = item.failure_category or "none"
        print(
            f"{source['name']} | {domain_key(source['base_url'])} | {item.method} | "
            f"{item.url} | verified={item.verified} | items={item.item_count} | failure={category}"
        )
        source["active"] = bool(item.verified and item.item_count > 0)
        source["fetch_method"] = item.method or "rss"
        source["parser_config"] = dict(source.get("parser_config", {})) | item.parser_config
        source["failure_category"] = item.failure_category
        source["last_error"] = item.error_message
        source["consecutive_failures"] = 0 if item.verified else max(1, int(source.get("consecutive_failures", 0)))
        source["last_failed_fetch_at"] = None if item.verified else item.parser_config["verification"]["checked_at"]
        registry = source["parser_config"].setdefault("registry_metadata", {})
        registry["ingestion_status"] = "verified" if item.verified else category
        source["verification"] = item.parser_config["verification"]
    report_path = Path(args.report)
    if not report_path.is_absolute():
        report_path = ROOT / report_path
    write_report(results, report_path)
    print(f"Report: {report_path}")
    if args.write:
        if args.only:
            updates = {domain_key(item.source["base_url"]): item.source for item in results}
            for entry in original_sources:
                if domain_key(entry["base_url"]) in updates:
                    entry.update(updates[domain_key(entry["base_url"])])
            source_path.write_text(json.dumps(original_sources, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        else:
            source_path.write_text(json.dumps([item.source for item in results], ensure_ascii=False, indent=2) + "\n",
                                   encoding="utf-8")
        print(f"Updated: {source_path}")
    else:
        print("Dry run: source JSON was not modified.")
    return 0


def main() -> None:
    parser = argparse.ArgumentParser(description="Discover and verify collection URLs for the real-estate source pool.")
    parser.add_argument("--json-path", default="sources/real-estate-source-pool.json")
    parser.add_argument("--dry-run", action="store_true", help="Do not update the source JSON (the default).")
    parser.add_argument("--write", action="store_true", help="Write verified URLs and failure statuses to the source JSON.")
    parser.add_argument("--only", help="Inspect a single canonical source domain.")
    parser.add_argument("--concurrency", type=int, default=5)
    parser.add_argument("--report", default="reports/source-pool-verification.md")
    args = parser.parse_args()
    if args.concurrency < 1:
        parser.error("--concurrency must be at least 1")
    if args.write and args.dry_run:
        parser.error("--write and --dry-run are mutually exclusive")
    asyncio.run(run(args))


if __name__ == "__main__":
    main()
