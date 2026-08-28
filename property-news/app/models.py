from __future__ import annotations

from datetime import datetime, timezone
from typing import Any
from uuid import UUID, uuid4

from pydantic import BaseModel, Field, HttpUrl, field_validator

from .constants import RegulatoryStatus, ReviewStatus, RiskLevel


class Source(BaseModel):
    id: UUID = Field(default_factory=uuid4)
    name: str = Field(min_length=2, max_length=200)
    base_url: str
    source_type: str = Field(default="government", max_length=50)
    trust_tier: int = Field(ge=1, le=4)
    fetch_method: str
    schedule_minutes: int = Field(ge=5, le=10080)
    active: bool = False
    parser_config: dict[str, Any] = Field(default_factory=dict)
    last_successful_fetch_at: datetime | None = None
    last_failed_fetch_at: datetime | None = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class CandidateArticle(BaseModel):
    source_id: UUID
    source_url: str
    source_title: str
    source_published_at: datetime | None = None
    original_content: str | None = None
    clean_text: str = ""
    image_url: str | None = None


class NewsAnalysis(BaseModel):
    relevant: bool
    category: str | None = None
    topics: list[str] = Field(default_factory=list)
    counties: list[str] = Field(default_factory=list)
    towns: list[str] = Field(default_factory=list)
    regulatory_status: RegulatoryStatus = RegulatoryStatus.UNKNOWN
    affected_groups: list[str] = Field(default_factory=list)
    key_facts: list[dict[str, Any]] = Field(default_factory=list)
    varoom_title: str | None = None
    varoom_summary: str | None = None
    varoom_body: str | None = None
    confidence_score: float = Field(ge=0, le=1)
    source_tier: int = Field(ge=1, le=4)
    risk_level: RiskLevel = RiskLevel.MEDIUM
    risk_reasons: list[str] = Field(default_factory=list)
    image_url: str | None = None
    model_provider: str = "rules"
    model_version: str = "rules-v1"

    @field_validator("category")
    @classmethod
    def normalise_category(cls, value: str | None) -> str | None:
        return value.lower().strip() if value else None


class NewsItem(BaseModel):
    id: UUID = Field(default_factory=uuid4)
    source_id: UUID
    source_url: str
    canonical_url: str
    source_title: str
    source_published_at: datetime | None = None
    fetched_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    original_content: str | None = None
    clean_text: str = ""
    varoom_title: str | None = None
    varoom_summary: str | None = None
    varoom_body: str | None = None
    category: str | None = None
    topics: list[str] = Field(default_factory=list)
    counties: list[str] = Field(default_factory=list)
    towns: list[str] = Field(default_factory=list)
    regulatory_status: RegulatoryStatus = RegulatoryStatus.UNKNOWN
    affected_groups: list[str] = Field(default_factory=list)
    key_facts: list[dict[str, Any]] = Field(default_factory=list)
    risk_level: RiskLevel = RiskLevel.MEDIUM
    confidence_score: float = 0
    source_tier: int = Field(ge=1, le=4)
    review_status: ReviewStatus = ReviewStatus.DISCOVERED
    reviewed_by: UUID | None = None
    published_at: datetime | None = None
    image_url: str | None = None
    content_hash: str
    timeline_id: UUID | None = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class NewsEvent(BaseModel):
    id: UUID = Field(default_factory=uuid4)
    news_id: UUID | None = None
    source_id: UUID | None = None
    event_type: str
    payload: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class ReviewAction(BaseModel):
    action: str = ""
    reason: str | None = Field(default=None, max_length=2000)
    edits: dict[str, Any] = Field(default_factory=dict)


class RetrievalEvidence(BaseModel):
    id: UUID
    title: str
    summary: str | None
    source_name: str
    source_url: str
    source_published_at: datetime | None
    counties: list[str]
    towns: list[str]
    category: str | None
    regulatory_status: RegulatoryStatus
    risk_level: RiskLevel
    relevance_score: float
    source_tier: int
    image_url: str | None = None


class RetrievalResponse(BaseModel):
    query: str
    evidence: list[RetrievalEvidence]
    applied_filters: dict[str, Any]
    safety_note: str = "Regulatory statuses describe the source record and are not legal advice."
