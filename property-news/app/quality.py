from __future__ import annotations

import re
from datetime import datetime, timedelta, timezone
from urllib.parse import urlparse

INSTITUTIONAL_TERMS = (
    "about us", "vision", "mission", "values", "our history", "who we are",
    "contact us", "leadership", "departments", "our services",
)
INSTITUTIONAL_PATHS = ("/about", "/contact", "/leadership", "/departments", "/services", "/history")
EVENT_TERMS = (
    "announced", "approved", "launched", "opened", "signed", "awarded", "plans to",
    "will build", "construction", "acquired", "appointed", "increased", "reduced",
    "reported", "proposed", "gazetted", "deadline", "application",
)


def parse_source_date(value: str | None) -> datetime | None:
    if not value:
        return None
    text = value.strip().replace("Z", "+00:00")
    embedded = re.search(r"\b(\d{1,2}/\d{1,2}/\d{4})\b", text)
    if embedded:
        text = embedded.group(1)
    for parser in (
        lambda item: datetime.fromisoformat(item),
        lambda item: datetime.strptime(item, "%d/%m/%Y").replace(tzinfo=timezone.utc),
        lambda item: datetime.strptime(item, "%Y-%m-%d").replace(tzinfo=timezone.utc),
        lambda item: datetime.strptime(item, "%B %d, %Y").replace(tzinfo=timezone.utc),
    ):
        try:
            parsed = parser(text)
            return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)
        except ValueError:
            continue
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
