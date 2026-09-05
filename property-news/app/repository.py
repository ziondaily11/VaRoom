from __future__ import annotations

import copy
from datetime import datetime, timedelta, timezone
from difflib import SequenceMatcher
from typing import Any
from uuid import UUID, uuid4

import httpx

from .config import Settings
from .constants import ReviewStatus
from .models import NewsAnalysis, NewsEvent, NewsItem, Source


def _now() -> datetime:
    return datetime.now(timezone.utc)


class PropertyNewsRepositoryUnavailable(RuntimeError):
    """The additive schema is missing or has not reached PostgREST's cache yet."""


class MemoryNewsRepository:
    """A deterministic development repository; never selected in deployed production."""

    def __init__(self) -> None:
        self.sources: dict[UUID, Source] = {}
        self.items: dict[UUID, NewsItem] = {}
        self.events: list[NewsEvent] = []
        self.analyses: dict[UUID, NewsAnalysis] = {}
        self.reviews: list[dict[str, Any]] = []
        self.fetch_runs: dict[UUID, dict[str, Any]] = {}

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

    async def get_sources_map(self, source_ids: Iterable[UUID]) -> dict[UUID, Source]:
        unique_ids = set(source_ids)
        return {sid: copy.deepcopy(self.sources[sid]) for sid in unique_ids if sid in self.sources}

    async def save_item(self, item: NewsItem) -> NewsItem:
        item.updated_at = _now()
        self.items[item.id] = copy.deepcopy(item)
        return copy.deepcopy(item)

    async def schedule_publication(self, item: NewsItem, now: datetime | None = None) -> NewsItem:
        now = now or _now()
        queued = [
            value for value in self.items.values()
            if value.id != item.id and value.review_status in {ReviewStatus.APPROVED, ReviewStatus.PUBLISHED}
        ]
        latest = max(
            (value.scheduled_at or value.published_at for value in queued if value.scheduled_at or value.published_at),
            default=None,
        )
        slot = max(now, latest + timedelta(hours=1)) if latest else now
        item.review_status = ReviewStatus.PUBLISHED if slot <= now else ReviewStatus.APPROVED
        item.published_at = now if item.review_status is ReviewStatus.PUBLISHED else None
        item.scheduled_at = None if item.review_status is ReviewStatus.PUBLISHED else slot
        return await self.save_item(item)

    async def release_due_publications(self, now: datetime | None = None) -> int:
        now = now or _now()
        released = 0
        for item in list(self.items.values()):
            if item.review_status is ReviewStatus.APPROVED and item.scheduled_at and item.scheduled_at <= now:
                item.review_status = ReviewStatus.PUBLISHED
                item.published_at = now
                item.scheduled_at = None
                await self.save_item(item)
                await self.add_event(NewsEvent(news_id=item.id, source_id=item.source_id,
                                               event_type="item_published", payload={"published_at": now.isoformat()}))
                released += 1
        return released

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

    async def start_fetch_run(self, source_id: UUID, started_at: datetime) -> UUID:
        run_id = uuid4()
        self.fetch_runs[run_id] = {"id": run_id, "source_id": source_id, "started_at": started_at, "result": "running"}
        return run_id

    async def finish_fetch_run(self, run_id: UUID, *, result: str, ended_at: datetime, discovered_count: int,
                               new_item_count: int, duplicate_count: int, error_message: str | None = None) -> None:
        run = self.fetch_runs[run_id]
        run.update({"result": result, "ended_at": ended_at, "discovered_count": discovered_count,
                    "new_item_count": new_item_count, "duplicate_count": duplicate_count,
                    "error_message": error_message,
                    "duration_ms": max(0, int((ended_at - run["started_at"]).total_seconds() * 1000))})

    async def list_items(self, *, published_only: bool = False, limit: int | None = None,
                         offset: int = 0, select_fields: str | None = None) -> list[NewsItem]:
        values = list(self.items.values())
        if published_only:
            values = [item for item in values if item.review_status is ReviewStatus.PUBLISHED and item.published_at]
        sorted_items = [copy.deepcopy(item) for item in sorted(values, key=lambda item: item.published_at or item.created_at, reverse=True)]
        if offset:
            sorted_items = sorted_items[offset:]
        if limit is not None:
            sorted_items = sorted_items[:limit]
        return sorted_items

    async def list_pending_review(self) -> list[NewsItem]:
        return [item for item in await self.list_items() if item.review_status is ReviewStatus.PENDING_REVIEW]

    async def list_failed_items(self, limit: int = 25) -> list[NewsItem]:
        return [item for item in await self.list_items() if item.review_status is ReviewStatus.FAILED][:limit]

    async def archive_all_published(self) -> int:
        count = 0
        for item in self.items.values():
            if item.review_status == ReviewStatus.PUBLISHED:
                item.review_status = ReviewStatus.ARCHIVED
                count += 1
        return count

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
        if response.status_code == 404:
            try:
                code = response.json().get("code")
            except ValueError:
                code = None
            if code == "PGRST205":
                raise PropertyNewsRepositoryUnavailable(
                    "Property News tables are unavailable. Apply the additive migration and refresh PostgREST schema visibility."
                )
        # If a query fails with 400 on an explicit select (e.g. image_url column not yet applied on Supabase), fallback to select=*
        if response.status_code == 400 and params and "select" in params and params["select"] != "*":
            fallback_params = dict(params)
            fallback_params["select"] = "*"
            response = await self.client.request(method, f"{self.url}/rest/v1/{table}", params=fallback_params, json=payload, headers=headers)

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

    async def get_sources_map(self, source_ids: Iterable[UUID]) -> dict[UUID, Source]:
        unique_ids = [str(sid) for sid in set(source_ids) if sid]
        if not unique_ids:
            return {}
        ids_param = f"in.({','.join(unique_ids)})"
        rows = await self._request("GET", "news_sources", params={"select": "*", "id": ids_param})
        return {UUID(row["id"]): self._source(row) for row in rows}

    async def save_item(self, item: NewsItem) -> NewsItem:
        data = item.model_dump(mode="json")
        try:
            rows = await self._request("POST", "news_items", payload=data, prefer="resolution=merge-duplicates,return=representation")
        except httpx.HTTPStatusError as error:
            if error.response.status_code == 400 and "image_url" in data:
                data_no_img = {k: v for k, v in data.items() if k != "image_url"}
                rows = await self._request("POST", "news_items", payload=data_no_img, prefer="resolution=merge-duplicates,return=representation")
            else:
                raise
        return self._item(rows[0])

    async def schedule_publication(self, item: NewsItem, now: datetime | None = None) -> NewsItem:
        now = now or _now()
        items = await self.list_items()
        queued = [
            value for value in items
            if value.id != item.id and value.review_status in {ReviewStatus.APPROVED, ReviewStatus.PUBLISHED}
        ]
        latest = max(
            (value.scheduled_at or value.published_at for value in queued if value.scheduled_at or value.published_at),
            default=None,
        )
        slot = max(now, latest + timedelta(hours=1)) if latest else now
        item.review_status = ReviewStatus.PUBLISHED if slot <= now else ReviewStatus.APPROVED
        item.published_at = now if item.review_status is ReviewStatus.PUBLISHED else None
        item.scheduled_at = None if item.review_status is ReviewStatus.PUBLISHED else slot
        return await self.save_item(item)

    async def release_due_publications(self, now: datetime | None = None) -> int:
        now = now or _now()
        items = await self.list_items()
        due = [
            item for item in items
            if item.review_status is ReviewStatus.APPROVED and item.scheduled_at and item.scheduled_at <= now
        ]
        for item in due:
            item.review_status = ReviewStatus.PUBLISHED
            item.published_at = now
            item.scheduled_at = None
            await self.save_item(item)
            await self.add_event(NewsEvent(news_id=item.id, source_id=item.source_id,
                                           event_type="item_published", payload={"published_at": now.isoformat()}))
        return len(due)

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
        # Fetch id and source_title with fallback if needed
        try:
            candidates = await self._request("GET", "news_items", params={"select": "id,source_title", "limit": "100", "order": "created_at.desc"})
        except Exception:
            candidates = await self._request("GET", "news_items", params={"select": "*", "limit": "100", "order": "created_at.desc"})
        for row in candidates:
            if SequenceMatcher(None, title.lower(), str(row.get("source_title", "")).lower()).ratio() >= threshold:
                return await self.get_item(UUID(row["id"]))
        return None

    async def save_analysis(self, news_id: UUID, analysis: NewsAnalysis) -> None:
        payload = analysis.model_dump(mode="json") | {"news_id": str(news_id)}
        try:
            await self._request("POST", "news_analysis", params={"on_conflict": "news_id"}, payload=payload,
                                prefer="resolution=merge-duplicates,return=minimal")
        except httpx.HTTPStatusError as error:
            if error.response.status_code == 400 and "image_url" in payload:
                payload_no_img = {k: v for k, v in payload.items() if k != "image_url"}
                await self._request("POST", "news_analysis", params={"on_conflict": "news_id"}, payload=payload_no_img,
                                    prefer="resolution=merge-duplicates,return=minimal")
            else:
                raise

    async def add_event(self, event: NewsEvent) -> NewsEvent:
        rows = await self._request("POST", "news_events", payload=event.model_dump(mode="json"), prefer="return=representation")
        return NewsEvent.model_validate(rows[0])

    async def add_review(self, review: dict[str, Any]) -> None:
        await self._request("POST", "news_reviews", payload=review, prefer="return=minimal")

    async def start_fetch_run(self, source_id: UUID, started_at: datetime) -> UUID:
        rows = await self._request("POST", "source_fetch_runs", payload={"source_id": str(source_id), "started_at": started_at.isoformat(), "result": "running"},
                                   prefer="return=representation")
        return UUID(rows[0]["id"])

    async def finish_fetch_run(self, run_id: UUID, *, result: str, ended_at: datetime, discovered_count: int,
                               new_item_count: int, duplicate_count: int, error_message: str | None = None) -> None:
        await self._request("PATCH", "source_fetch_runs", params={"id": f"eq.{run_id}"}, payload={
            "result": result, "ended_at": ended_at.isoformat(), "discovered_count": discovered_count,
            "new_item_count": new_item_count, "duplicate_count": duplicate_count, "error_message": error_message,
        }, prefer="return=minimal")

    async def list_items(self, *, published_only: bool = False, limit: int | None = None,
                         offset: int = 0, select_fields: str | None = None) -> list[NewsItem]:
        fields = select_fields or "id,source_id,source_url,canonical_url,source_title,source_published_at,fetched_at,clean_text,varoom_title,varoom_summary,varoom_body,category,topics,counties,towns,regulatory_status,affected_groups,key_facts,risk_level,confidence_score,source_tier,review_status,reviewed_by,published_at,scheduled_at,image_url,content_hash,timeline_id,created_at,updated_at"
        params = {"select": fields, "order": "published_at.desc.nullslast,created_at.desc"}
        if published_only:
            params["review_status"] = "eq.published"
            params["published_at"] = "not.is.null"
        if limit is not None:
            params["limit"] = str(limit)
        if offset:
            params["offset"] = str(offset)
        return [self._item(row) for row in await self._request("GET", "news_items", params=params)]

    async def list_pending_review(self) -> list[NewsItem]:
        fields = "id,source_id,source_url,canonical_url,source_title,source_published_at,fetched_at,clean_text,varoom_title,varoom_summary,varoom_body,category,topics,counties,towns,regulatory_status,affected_groups,key_facts,risk_level,confidence_score,source_tier,review_status,reviewed_by,published_at,image_url,content_hash,timeline_id,created_at,updated_at"
        rows = await self._request("GET", "news_items", params={"select": fields, "review_status": "eq.pending_review", "order": "risk_level.desc,created_at.desc"})
        return [self._item(row) for row in rows]

    async def list_failed_items(self, limit: int = 25) -> list[NewsItem]:
        fields = "id,source_id,source_url,canonical_url,source_title,source_published_at,fetched_at,clean_text,varoom_title,varoom_summary,varoom_body,category,topics,counties,towns,regulatory_status,affected_groups,key_facts,risk_level,confidence_score,source_tier,review_status,reviewed_by,published_at,image_url,content_hash,timeline_id,created_at,updated_at"
        rows = await self._request("GET", "news_items", params={
            "select": fields, "review_status": "eq.failed", "order": "updated_at.asc", "limit": str(limit),
        })
        return [self._item(row) for row in rows]

    async def source_health(self) -> list[dict[str, Any]]:
        rows = await self._request("GET", "news_sources", params={"select": "id,name,active,last_successful_fetch_at,last_failed_fetch_at", "order": "name.asc"})
        return rows

    async def archive_all_published(self) -> int:
        try:
            rows = await self._request("PATCH", "news_items", params={"review_status": "eq.published"},
                                       payload={"review_status": "archived"}, prefer="return=representation")
            return len(rows) if isinstance(rows, list) else 0
        except Exception:
            return 0


def build_repository(settings: Settings) -> MemoryNewsRepository | SupabaseNewsRepository:
    return SupabaseNewsRepository(settings) if settings.supabase_configured else MemoryNewsRepository()
