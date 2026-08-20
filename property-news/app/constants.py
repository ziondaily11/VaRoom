from __future__ import annotations

from enum import StrEnum


class RegulatoryStatus(StrEnum):
    REPORTED = "reported"
    PROPOSED = "proposed"
    UNDER_CONSIDERATION = "under_consideration"
    PUBLIC_PARTICIPATION = "public_participation"
    APPROVED = "approved"
    ENACTED = "enacted"
    EFFECTIVE = "effective"
    SUSPENDED = "suspended"
    REJECTED = "rejected"
    AMENDED = "amended"
    UNKNOWN = "unknown"


class RiskLevel(StrEnum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


class ReviewStatus(StrEnum):
    DISCOVERED = "discovered"
    PROCESSING = "processing"
    ANALYSED = "analysed"
    PENDING_REVIEW = "pending_review"
    APPROVED = "approved"
    PUBLISHED = "published"
    REJECTED = "rejected"
    FAILED = "failed"
    ARCHIVED = "archived"


PROPERTY_CATEGORIES = {
    "land", "property", "housing", "construction", "development",
    "finance", "taxation", "law", "zoning", "planning",
    "administration", "market",
}

SOURCE_FETCH_METHODS = {"api", "rss", "atom", "sitemap", "html", "manual"}
