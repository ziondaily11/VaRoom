from __future__ import annotations

import re
from datetime import datetime, timedelta, timezone
from uuid import UUID

from .constants import RegulatoryStatus
from .models import NewsItem, RetrievalEvidence, RetrievalResponse
from .repository import MemoryNewsRepository, SupabaseNewsRepository

Repository = MemoryNewsRepository | SupabaseNewsRepository


class NewsRetrievalService:
    def __init__(self, repository: Repository) -> None:
        self.repository = repository

    async def search(self, query: str, *, category: str | None = None, county: str | None = None,
                     town: str | None = None, regulatory_status: str | None = None, days: int | None = None,
                     limit: int = 20) -> RetrievalResponse:
        if not query.strip():
            raise ValueError("Search query is required")
        implicit = self._implicit_filters(query)
        category = category or implicit.get("category")
        county = county or implicit.get("county")
        regulatory_status = regulatory_status or implicit.get("regulatory_status")
        tokens = {token for token in re.findall(r"[a-z0-9]+", query.lower()) if len(token) > 2}
        candidates = await self.repository.list_items(published_only=True)
        scored: list[tuple[float, NewsItem]] = []
        for item in candidates:
            if category and item.category != category.lower():
                continue
            if county and county.lower() not in {value.lower() for value in item.counties}:
                continue
            if town and town.lower() not in {value.lower() for value in item.towns}:
                continue
            if regulatory_status and item.regulatory_status.value != regulatory_status.lower():
                continue
            if days and item.published_at and item.published_at < datetime.now(timezone.utc) - timedelta(days=days):
                continue
            corpus = " ".join(filter(None, [item.source_title, item.varoom_title, item.varoom_summary, item.category, *item.topics, *item.counties, *item.towns])).lower()
            keyword_score = sum(token in corpus for token in tokens) / max(len(tokens), 1)
            recency = self._recency_score(item.published_at)
            authority = (5 - item.source_tier) / 4
            geography = 0.2 if county and county.lower() in {value.lower() for value in item.counties} else 0
            scored.append((keyword_score * 0.55 + authority * 0.25 + recency * 0.20 + geography, item))
        evidence: list[RetrievalEvidence] = []
        for score, item in sorted(scored, key=lambda row: row[0], reverse=True)[:min(max(limit, 1), 50)]:
            source = await self.repository.get_source(item.source_id)
            evidence.append(RetrievalEvidence(id=item.id, title=item.varoom_title or item.source_title, summary=item.varoom_summary,
                source_name=source.name if source else "Unknown source", source_url=item.source_url,
                source_published_at=item.source_published_at, counties=item.counties, towns=item.towns, category=item.category,
                regulatory_status=item.regulatory_status, risk_level=item.risk_level, relevance_score=round(score, 3), source_tier=item.source_tier))
        return RetrievalResponse(query=query, evidence=evidence, applied_filters={"category": category, "county": county, "town": town,
            "regulatory_status": regulatory_status, "days": days})

    @staticmethod
    def _recency_score(published_at: datetime | None) -> float:
        if not published_at:
            return 0
        now = datetime.now(timezone.utc)
        value = published_at if published_at.tzinfo else published_at.replace(tzinfo=timezone.utc)
        return max(0, 1 - ((now - value).days / 180))

    @staticmethod
    def _implicit_filters(query: str) -> dict[str, str]:
        text = query.lower()
        result: dict[str, str] = {}
        for county in ("nairobi", "kiambu", "mombasa", "nakuru", "kisumu", "kajiado", "machakos"):
            if county in text:
                result["county"] = county.title()
                break
        if any(word in text for word in ("land rate", "title", "land")):
            result["category"] = "land"
        elif "housing" in text:
            result["category"] = "housing"
        elif any(word in text for word in ("law", "regulation", "bill", "act")):
            result["category"] = "law"
        if "approved" in text:
            result["regulatory_status"] = RegulatoryStatus.APPROVED.value
        elif any(word in text for word in ("effective", "in effect")):
            result["regulatory_status"] = RegulatoryStatus.EFFECTIVE.value
        elif any(word in text for word in ("proposed", "proposal")):
            result["regulatory_status"] = RegulatoryStatus.PROPOSED.value
        return result
