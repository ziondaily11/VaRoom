from __future__ import annotations

import logging
import re
from datetime import datetime, timedelta, timezone
from uuid import UUID

from .constants import RegulatoryStatus
from .models import NewsItem, RetrievalEvidence, RetrievalResponse
from .repository import MAX_NEWS_LIST_LIMIT, PUBLIC_ITEM_FIELDS, MemoryNewsRepository, SupabaseNewsRepository

Repository = MemoryNewsRepository | SupabaseNewsRepository


logger = logging.getLogger(__name__)


class NewsRetrievalService:
    def __init__(self, repository: Repository) -> None:
        self.repository = repository

    async def search(self, query: str, *, category: str | None = None, county: str | None = None,
                     town: str | None = None, regulatory_status: str | None = None, days: int | None = None,
                     limit: int = 20) -> RetrievalResponse:
        """Rank published evidence for a question.

        Explicit arguments are hard filters. Words in the question (a county,
        "housing", "proposed", ...) only boost matching stories, because a
        substring hint such as "act" in "impact" must not hide the answer.
        """
        if not query.strip():
            raise ValueError("Search query is required")
        hints = self._implicit_hints(query)
        candidates = await self._candidates(query, category=category, county=county,
                                            regulatory_status=regulatory_status, days=days)
        top_text_score = max((text_score for _, text_score in candidates), default=0) or 1
        scored: list[tuple[float, NewsItem]] = []
        for item, text_score in candidates:
            if town and town.lower() not in {value.lower() for value in item.towns}:
                continue
            item_counties = {value.lower() for value in item.counties}
            recency = self._recency_score(item.published_at)
            authority = (5 - item.source_tier) / 4
            boost = 0.0
            if (county or hints.get("county", "")).lower() in item_counties:
                boost += 0.2
            if hints.get("category") and item.category == hints["category"]:
                boost += 0.1
            if hints.get("regulatory_status") and item.regulatory_status.value == hints["regulatory_status"]:
                boost += 0.1
            scored.append(((text_score / top_text_score) * 0.55 + authority * 0.25 + recency * 0.20 + boost, item))
        ranked = sorted(scored, key=lambda row: row[0], reverse=True)[:min(max(limit, 1), 50)]
        sources_map = await self.repository.get_sources_map([item.source_id for _, item in ranked])
        evidence: list[RetrievalEvidence] = []
        for score, item in ranked:
            source = sources_map.get(item.source_id)
            evidence.append(RetrievalEvidence(
                id=item.id, title=item.varoom_title or item.source_title, summary=item.varoom_summary,
                source_name=source.name if source else "Unknown source", source_url=item.source_url,
                source_published_at=item.source_published_at, counties=item.counties, towns=item.towns, category=item.category,
                regulatory_status=item.regulatory_status, risk_level=item.risk_level, relevance_score=round(score, 3),
                source_tier=item.source_tier, image_url=item.image_url
            ))
        return RetrievalResponse(query=query, evidence=evidence, applied_filters={"category": category, "county": county, "town": town,
            "regulatory_status": regulatory_status, "days": days})

    async def _candidates(self, query: str, *, category: str | None, county: str | None,
                          regulatory_status: str | None, days: int | None) -> list[tuple[NewsItem, float]]:
        """Full-text matches over every published story; if the database search
        is unavailable, a keyword scan of the newest stories."""
        try:
            return await self.repository.search_published(
                query, county=county, category=category, regulatory_status=regulatory_status, days=days,
            )
        except Exception as error:
            logger.warning("Full-text search unavailable, scanning recent stories: %s", error)
        tokens = {token for token in re.findall(r"[a-z0-9]+", query.lower()) if len(token) > 2}
        items = await self.repository.list_items(
            published_only=True, limit=MAX_NEWS_LIST_LIMIT, select_fields=PUBLIC_ITEM_FIELDS,
        )
        now = datetime.now(timezone.utc)
        matches = []
        for item in items:
            if category and item.category != category.lower():
                continue
            if county and county.lower() not in {value.lower() for value in item.counties}:
                continue
            if regulatory_status and item.regulatory_status.value != regulatory_status.lower():
                continue
            if days and item.published_at and item.published_at < now - timedelta(days=days):
                continue
            corpus = " ".join(filter(None, [item.source_title, item.varoom_title, item.varoom_summary, item.category,
                                            *item.topics, *item.counties, *item.towns])).lower()
            matches.append((item, sum(token in corpus for token in tokens) / max(len(tokens), 1)))
        return matches

    @staticmethod
    def _recency_score(published_at: datetime | None) -> float:
        if not published_at:
            return 0
        now = datetime.now(timezone.utc)
        value = published_at if published_at.tzinfo else published_at.replace(tzinfo=timezone.utc)
        return max(0, 1 - ((now - value).days / 180))

    @staticmethod
    def _implicit_hints(query: str) -> dict[str, str]:
        """Ranking hints from whole words in the question (never filters)."""
        text = query.lower()

        def has(*phrases: str) -> bool:
            return any(re.search(r"\b" + re.escape(phrase) + r"\b", text) for phrase in phrases)

        result: dict[str, str] = {}
        for county in ("nairobi", "kiambu", "mombasa", "nakuru", "kisumu", "kajiado", "machakos"):
            if has(county):
                result["county"] = county.title()
                break
        if has("land rate", "land rates", "title deed", "title deeds", "land"):
            result["category"] = "land"
        elif has("housing"):
            result["category"] = "housing"
        elif has("law", "regulation", "regulations", "bill", "act"):
            result["category"] = "law"
        if has("approved"):
            result["regulatory_status"] = RegulatoryStatus.APPROVED.value
        elif has("effective", "in effect"):
            result["regulatory_status"] = RegulatoryStatus.EFFECTIVE.value
        elif has("proposed", "proposal"):
            result["regulatory_status"] = RegulatoryStatus.PROPOSED.value
        return result
