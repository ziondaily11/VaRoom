from __future__ import annotations

import copy
from datetime import datetime, timezone
from difflib import SequenceMatcher
from typing import Any
from uuid import UUID

import httpx

from .config import Settings
from .constants import ReviewStatus
from .models import NewsAnalysis, NewsEvent, NewsItem, Source


def _now() -> datetime:
    return datetime.now(timezone.utc)


class MemoryNewsRepository:
    """A deterministic development repository; never selected in deployed production."""

    def __init__(self) -> None:
        self.sources: dict[UUID, Source] = {}
        self.items: dict[UUID, NewsItem] = {}
        self.events: list[NewsEvent] = []
        self.analyses: dict[UUID, NewsAnalysis] = {}
        self.reviews: list[dict[str, Any]] = []

    async def upsert_source(self, source: Source) -> Source:
        source.updated_at = _now()
        self.sources[source.id] = copy.deepcopy(source)
        return copy.deepcopy(source)

    async def list_sources(self, active_only: bool = False) -> list[Source]:
        values = list(self.sources.values())
        if active_only:
            values = [source for source in values if source.active]
        return [copy.deepcopy(source) for source in sorted(values, key=lambda source: source.name.lower())]

    async def get_source(self, source_id: UUID) -> Source | None:
        source = self.sources.get(source_id)
        return copy.deepcopy(source) if source else None

    async def save_item(self, item: NewsItem) -> NewsItem:
        item.updated_at = _now()
        self.items[item.id] = copy.deepcopy(item)
        return copy.deepcopy(item)

    async def get_item(self, item_id: UUID) -> NewsItem | None:
        item = self.items.get(item_id)
        return copy.deepcopy(item) if item else None

    async def find_by_canonical_url(self, canonical_url: str) -> NewsItem | None:
        for item in self.items.values():
            if item.canonical_url == canonical_url:
                return copy.deepcopy(item)
        return None

    async def find_by_content_hash(self, content_hash: str) -> NewsItem | None:
        for item in self.items.values():
            if item.content_hash == content_hash:
                return copy.deepcopy(item)
        return None

    async def find_similar_title(self, title: str, threshold: float = 0.92) -> NewsItem | None:
        candidate = title.lower().strip()
        for item in self.items.values():
            similarity = SequenceMatcher(None, candidate, item.source_title.lower().strip()).ratio()
            if similarity >= threshold:
                return copy.deepcopy(item)
        return None

    async def save_analysis(self, news_id: UUID, analysis: NewsAnalysis) -> None:
        self.analyses[news_id] = copy.deepcopy(analysis)

    async def add_event(self, event: NewsEvent) -> NewsEvent:
        self.events.append(copy.deepcopy(event))
        return copy.deepcopy(event)

    async def add_review(self, review: dict[str, Any]) -> None:
        self.reviews.append(copy.deepcopy(review))

    async def list_items(self, *, published_only: bool = False) -> list[NewsItem]:
        values = list(self.items.values())
        if published_only:
            values = [item for item in values if item.review_status is ReviewStatus.PUBLISHED and item.published_at]
        return [copy.deepcopy(item) for item in sorted(values, key=lambda item: item.published_at or item.created_at, reverse=True)]

    async def list_pending_review(self) -> list[NewsItem]:
        return [item for item in await self.list_items() if item.review_status is ReviewStatus.PENDING_REVIEW]

    async def source_health(self) -> list[dict[str, Any]]:
        result: list[dict[str, Any]] = []
        for source in await self.list_sources():
            source_events = [event for event in self.events if event.source_id == source.id]
            result.append({
                "source_id": str(source.id), "name": source.name, "active": source.active,
                "last_successful_fetch_at": source.last_successful_fetch_at,
                "last_failed_fetch_at": source.last_failed_fetch_at,
                "events": len(source_events),
            })
        return result


class SupabaseNewsRepository:
    """Small PostgREST adapter for the isolated migration tables only.

    It uses a server-only service-role key. Public responses are shaped by the
    API layer, never passed through from this repository.
    """

    def __init__(self, settings: Settings) -> None:
        if not settings.supabase_configured:
            raise ValueError("SupabaseNewsRepository requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY")
        self.url = settings.supabase_url.rstrip("/")
        self.headers = {
            "apikey": settings.supabase_service_role_key,
            "Authorization": f"Bearer {settings.supabase_service_role_key}",
            "Content-Type": "application/json",
        }
        self.client = httpx.AsyncClient(timeout=20.0, headers=self.headers)

    async def close(self) -> None:
        await self.client.aclose()

    async def _request(self, method: str, table: str, *, params: dict[str, str] | None = None,
                       payload: Any = None, prefer: str | None = None) -> Any:
        headers = {"Prefer": prefer} if prefer else None
        response = await self.client.request(method, f"{self.url}/rest/v1/{table}", params=params, json=payload, headers=headers)
        response.raise_for_status()
        if not response.content:
            return None
        return response.json()

    @staticmethod
    def _source(data: dict[str, Any]) -> Source:
        return Source.model_validate(data)

    @staticmethod
    def _item(data: dict[str, Any]) -> NewsItem:
        return NewsItem.model_validate(data)

    async def upsert_source(self, source: Source) -> Source:
        data = source.model_dump(mode="json")
        rows = await self._request("POST", "news_sources", payload=data, prefer="resolution=merge-duplicates,return=representation")
        return self._source(rows[0])

    async def list_sources(self, active_only: bool = False) -> list[Source]:
        params = {"select": "*", "order": "name.asc"}
        if active_only:
            params["active"] = "eq.true"
        return [self._source(row) for row in await self._request("GET", "news_sources", params=params)]

    async def get_source(self, source_id: UUID) -> Source | None:
        rows = await self._request("GET", "news_sources", params={"select": "*", "id": f"eq.{source_id}", "limit": "1"})
        return self._source(rows[0]) if rows else None

    async def save_item(self, item: NewsItem) -> NewsItem:
        data = item.model_dump(mode="json")
        rows = await self._request("POST", "news_items", payload=data, prefer="resolution=merge-duplicates,return=representation")
        return self._item(rows[0])

    async def get_item(self, item_id: UUID) -> NewsItem | None:
        rows = await self._request("GET", "news_items", params={"select": "*", "id": f"eq.{item_id}", "limit": "1"})
        return self._item(rows[0]) if rows else None

    async def find_by_canonical_url(self, canonical_url: str) -> NewsItem | None:
        rows = await self._request("GET", "news_items", params={"select": "*", "canonical_url": f"eq.{canonical_url}", "limit": "1"})
        return self._item(rows[0]) if rows else None

    async def find_by_content_hash(self, content_hash: str) -> NewsItem | None:
        rows = await self._request("GET", "news_items", params={"select": "*", "content_hash": f"eq.{content_hash}", "limit": "1"})
        return self._item(rows[0]) if rows else None

    async def find_similar_title(self, title: str, threshold: float = 0.92) -> NewsItem | None:
        # Exact/title similarity is deliberately evaluated in the application so
        # PostgreSQL extensions are not a migration prerequisite.
        candidates = await self._request("GET", "news_items", params={"select": "*", "limit": "250", "order": "created_at.desc"})
        return next((self._item(row) for row in candidates
                     if SequenceMatcher(None, title.lower(), row["source_title"].lower()).ratio() >= threshold), None)

    async def save_analysis(self, news_id: UUID, analysis: NewsAnalysis) -> None:
        payload = analysis.model_dump(mode="json") | {"news_id": str(news_id)}
        await self._request("POST", "news_analysis", params={"on_conflict": "news_id"}, payload=payload,
                            prefer="resolution=merge-duplicates,return=minimal")

    async def add_event(self, event: NewsEvent) -> NewsEvent:
        rows = await self._request("POST", "news_events", payload=event.model_dump(mode="json"), prefer="return=representation")
        return NewsEvent.model_validate(rows[0])

    async def add_review(self, review: dict[str, Any]) -> None:
        await self._request("POST", "news_reviews", payload=review, prefer="return=minimal")

    async def list_items(self, *, published_only: bool = False) -> list[NewsItem]:
        params = {"select": "*", "order": "published_at.desc.nullslast,created_at.desc"}
        if published_only:
            params["review_status"] = "eq.published"
        return [self._item(row) for row in await self._request("GET", "news_items", params=params)]

    async def list_pending_review(self) -> list[NewsItem]:
        rows = await self._request("GET", "news_items", params={"select": "*", "review_status": "eq.pending_review", "order": "risk_level.desc,created_at.desc"})
        return [self._item(row) for row in rows]

    async def source_health(self) -> list[dict[str, Any]]:
        rows = await self._request("GET", "news_sources", params={"select": "id,name,active,last_successful_fetch_at,last_failed_fetch_at", "order": "name.asc"})
        return rows


def build_repository(settings: Settings) -> MemoryNewsRepository | SupabaseNewsRepository:
    return SupabaseNewsRepository(settings) if settings.supabase_configured else MemoryNewsRepository()
