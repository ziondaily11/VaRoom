from __future__ import annotations

import re
from datetime import datetime, timedelta, timezone
from email.utils import parsedate_to_datetime
from urllib.parse import urlparse

INSTITUTIONAL_TERMS = (
    "about us", "vision", "mission", "values", "our history", "who we are",
    "contact us", "leadership", "departments", "our services",
)
INSTITUTIONAL_PATHS = ("/about", "/contact", "/leadership", "/departments", "/services", "/history")
EVENT_TERMS = (
    "announce", "announced", "approve", "approved", "launch", "launched", "open", "opened",
    "sign", "signed", "award", "awarded", "issue", "issued", "plans to", "will build",
    "construction", "acquire", "acquired", "appoint", "appointed", "increase", "increased",
    "reduce", "reduced", "report", "reported", "propose", "proposed", "gazetted", "deadline",
    "application",
)


def parse_source_date(value: str | None) -> datetime | None:
    if not value:
        return None
    text = value.strip()
    if not text:
        return None

    candidates = [text]
    embedded = re.search(
        r"\b(?:\d{4}-\d{1,2}-\d{1,2}(?:[T ][0-9:.+-]+Z?)?"
        r"|\d{1,2}/\d{1,2}/\d{4}"
        r"|\d{1,2}\s+[A-Za-z]{3,9}\s+\d{4}"
        r"|[A-Za-z]{3,9}\s+\d{1,2},?\s+\d{4})\b",
        text,
    )
    if embedded and embedded.group(0) != text:
        candidates.append(embedded.group(0))

    formats = (
        "%d/%m/%Y", "%Y-%m-%d", "%B %d, %Y", "%b %d, %Y",
        "%d %B %Y", "%d %b %Y", "%A, %d %B %Y", "%a, %d %b %Y",
        "%B %d %Y", "%b %d %Y",
    )
    for candidate in candidates:
        normalised = candidate.strip().replace("Z", "+00:00")
        try:
            parsed = datetime.fromisoformat(normalised)
        except ValueError:
            try:
                parsed = parsedate_to_datetime(candidate)
            except (TypeError, ValueError, OverflowError):
                parsed = None
        if parsed is None:
            for date_format in formats:
                try:
                    parsed = datetime.strptime(candidate, date_format)
                    break
                except ValueError:
                    continue
        if parsed is not None:
            if parsed.tzinfo is None:
                parsed = parsed.replace(tzinfo=timezone.utc)
            return parsed.astimezone(timezone.utc)
    return None


def classify_quality(title: str, text: str, url: str, published_at: datetime | None,
                     *, now: datetime | None = None, max_age_days: int = 90,
                     allow_evergreen: bool = False) -> tuple[str, str] | None:
    title_text = " ".join(title.split()).strip()
    sample = f"{title_text}\n{text[:1600]}".lower()
    path = urlparse(url).path.lower().rstrip("/")
    if any(term in title_text.lower() for term in INSTITUTIONAL_TERMS) or any(
        term in sample for term in INSTITUTIONAL_TERMS
    ) or any(path == prefix or path.startswith(prefix + "/") for prefix in INSTITUTIONAL_PATHS):
        return "NON_NEWS_INSTITUTIONAL_PAGE", "institutional/about/contact content"
    if not published_at:
        return "MISSING_PUBLICATION_DATE", "no reliable source publication date"
    current = now or datetime.now(timezone.utc)
    date_value = published_at if published_at.tzinfo else published_at.replace(tzinfo=timezone.utc)
    if date_value > current + timedelta(days=1):
        return "INVALID_PUBLICATION_DATE", "source publication date is in the future"
    if not allow_evergreen and date_value < current - timedelta(days=max_age_days):
        return "TOO_OLD", f"source_published_at={date_value.date()} max_age_days={max_age_days}"
    words = re.findall(r"\b[\w'-]+\b", text)
    if len(words) < 40 or len(text.strip()) < 240:
        return "LOW_INFORMATION_DENSITY", f"word_count={len(words)} character_count={len(text.strip())}"
    if len(set(word.lower() for word in words)) < 12:
        return "BOILERPLATE_CONTENT", "insufficiently varied article content"
    if not any(term in sample for term in EVENT_TERMS):
        return "NOT_NEWSWORTHY", "no identifiable event or development"
    return None
