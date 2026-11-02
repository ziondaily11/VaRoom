from __future__ import annotations

import hashlib
import html
import re
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit


TRACKING_PARAMETERS = {"fbclid", "gclid", "mc_cid", "mc_eid", "ref", "source"}


def canonicalise_url(url: str) -> str:
    """Remove fragments and known tracking parameters without fetching the URL."""
    parts = urlsplit(url.strip())
    query = [(key, value) for key, value in parse_qsl(parts.query, keep_blank_values=True)
             if not key.lower().startswith("utm_") and key.lower() not in TRACKING_PARAMETERS]
    path = re.sub(r"/{2,}", "/", parts.path or "/")
    if path != "/":
        path = path.rstrip("/")
    return urlunsplit((parts.scheme.lower(), parts.netloc.lower(), path, urlencode(sorted(query)), ""))


def canonicalise_source_url(url: str) -> str:
    """Normalise a source URL for registry matching, independent of scheme and www."""
    parts = urlsplit(url.strip())
    hostname = (parts.hostname or "").lower().rstrip(".")
    if hostname.startswith("www."):
        hostname = hostname[4:]
    port = parts.port
    if port and not ((parts.scheme.lower() == "http" and port == 80)
                     or (parts.scheme.lower() == "https" and port == 443)):
        hostname = f"{hostname}:{port}"
    path = re.sub(r"/{2,}", "/", parts.path or "/").rstrip("/")
    return f"{hostname}{path}"


def clean_html(value: str) -> str:
    without_scripts = re.sub(r"<(script|style|noscript)[^>]*>.*?</\1>", " ", value, flags=re.I | re.S)
    text = re.sub(r"<[^>]+>", " ", without_scripts)
    return re.sub(r"\s+", " ", html.unescape(text)).strip()


# Whole lines that publishers insert into articles: Tuko's "PAY ATTENTION:" and
# "READ ALSO:" promos and source credit, newsletter prompts, and lines that are
# only a social or advert label. Matched as complete lines in their exact
# format, so ordinary sentences ("...pay attention to...") are kept.
PROMOTIONAL_LINE_PATTERNS = (
    re.compile(r"^\s*(?:PAY ATTENTION|READ ALSO|ALSO READ|READ MORE)\s*:"),
    re.compile(r"^\s*Source:\s*TUKO\.co\.ke\s*$", re.IGNORECASE),
    re.compile(r"^\s*Proofread by\b.{0,80}$", re.IGNORECASE),
    re.compile(r"^\s*(?:Stay informed\.\s*)?Subscribe to (?:our|the) newsletter\b.{0,80}$", re.IGNORECASE),
    re.compile(r"^\s*(?:Follow us(?: on [A-Za-z ]{1,30})?|WhatsApp|Telegram|Facebook|Twitter|Instagram|YouTube|"
               r"TikTok|LinkedIn|Share(?: this(?: article)?)?|Advertisement|Sponsored)\s*:?\s*$", re.IGNORECASE),
)
# Phrases from paywall boxes; two or more together mean the page is a paywall,
# not the article.
PAYWALL_MARKERS = (
    "premium article", "already a subscriber", "subscribe for full access",
    "unlimited access to all premium content", "continue reading", "secure payments",
)


def strip_promotional_text(text: str) -> str:
    """Drop publisher promo lines (see PROMOTIONAL_LINE_PATTERNS) from article text."""
    if not text:
        return text
    kept = [line for line in text.split("\n")
            if not any(pattern.search(line) for pattern in PROMOTIONAL_LINE_PATTERNS)]
    return "\n".join(kept).strip()


def is_paywalled(text: str) -> bool:
    lowered = (text or "").lower()
    return sum(marker in lowered for marker in PAYWALL_MARKERS) >= 2


def normalise_text(value: str) -> str:
    return re.sub(r"\s+", " ", value.lower()).strip()


def content_hash(value: str) -> str:
    return hashlib.sha256(normalise_text(value).encode("utf-8")).hexdigest()
