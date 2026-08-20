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


def clean_html(value: str) -> str:
    without_scripts = re.sub(r"<(script|style|noscript)[^>]*>.*?</\1>", " ", value, flags=re.I | re.S)
    text = re.sub(r"<[^>]+>", " ", without_scripts)
    return re.sub(r"\s+", " ", html.unescape(text)).strip()


def normalise_text(value: str) -> str:
    return re.sub(r"\s+", " ", value.lower()).strip()


def content_hash(value: str) -> str:
    return hashlib.sha256(normalise_text(value).encode("utf-8")).hexdigest()
