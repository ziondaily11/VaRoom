from __future__ import annotations

from html.parser import HTMLParser
from urllib.parse import urljoin, urlparse


class _ArticleMediaParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.meta_images: list[str] = []
        self.body_images: list[tuple[str, str, str]] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        attributes = {key.lower(): value for key, value in attrs}
        if tag.lower() == "meta":
            property_name = (attributes.get("property") or attributes.get("name") or "").lower()
            if property_name in {"og:image", "twitter:image", "twitter:image:src"} and attributes.get("content"):
                self.meta_images.append(attributes["content"] or "")
        elif tag.lower() == "img" and attributes.get("src"):
            self.body_images.append((attributes["src"] or "", attributes.get("alt") or "", attributes.get("class") or ""))


def _same_source_host(value: str, source_base_url: str) -> bool:
    parsed = urlparse(value)
    source_host = (urlparse(source_base_url).hostname or "").lower()
    return parsed.scheme in {"http", "https"} and bool(parsed.hostname) and parsed.hostname.lower() == source_host


def _usable_image_url(value: str, article_url: str, source_base_url: str) -> str | None:
    candidate = urljoin(article_url, value.strip())
    if not _same_source_host(candidate, source_base_url):
        return None
    return candidate


def extract_article_image_url(original_content: str | None, article_url: str, source_base_url: str) -> str | None:
    """Return the first trusted image represented in stored source HTML.

    Image URLs remain optional and are restricted to the approved source host.
    Decorative logos, icons, and favicons are skipped for body-image fallback.
    """
    if not original_content:
        return None
    parser = _ArticleMediaParser()
    try:
        parser.feed(original_content)
    except Exception:
        return None
    for value in parser.meta_images:
        image_url = _usable_image_url(value, article_url, source_base_url)
        if image_url:
            return image_url
    for value, alt, classes in parser.body_images:
        marker = f"{value} {alt} {classes}".lower()
        if any(term in marker for term in ("logo", "favicon", "/icons/", "/icon/")):
            continue
        image_url = _usable_image_url(value, article_url, source_base_url)
        if image_url:
            return image_url
    return None
