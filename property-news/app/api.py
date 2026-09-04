from __future__ import annotations

import asyncio
import hmac
import time
from collections import defaultdict, deque
from contextlib import asynccontextmanager
from datetime import datetime
from typing import Any
from uuid import UUID

from fastapi import Depends, FastAPI, Header, HTTPException, Query, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

import logging
from .analysis import build_analyzer, format_location_display
from .config import Settings, settings
from .constants import ReviewStatus
from .models import ReviewAction
from .processing import ProcessingService
from .repository import MemoryNewsRepository, PropertyNewsRepositoryUnavailable, SupabaseNewsRepository, build_repository
from .retrieval import NewsRetrievalService
from .review import ReviewService
from .jobs import run_collection_job, run_reprocess_job
from .media import extract_article_image_url
from .seed_sources import seed_verified_sources, upsert_official_lands_source

Repository = MemoryNewsRepository | SupabaseNewsRepository
logger = logging.getLogger("property_news.api")


class ServiceContainer:
    def __init__(self, repository: Repository, config: Settings) -> None:
        self.repository = repository
        self.config = config
        self.analyzer = build_analyzer(config)
        self.processing = ProcessingService(repository, self.analyzer)
        self.review = ReviewService(repository)
        self.retrieval = NewsRetrievalService(repository)


def _public_item(item, source) -> dict[str, Any]:
    source_payload = None
    if source:
        source_payload = {
            "name": source.name,
            "url": item.source_url,
            "tier": item.source_tier,
            "published_at": item.source_published_at,
        }
    image_url = item.image_url
    if not image_url and source and getattr(item, "original_content", None):
        image_url = extract_article_image_url(item.original_content, item.source_url, source.base_url)
    return {
        "id": str(item.id), "title": item.varoom_title or item.source_title, "summary": item.varoom_summary,
        "body": item.varoom_body, "category": item.category, "topics": item.topics, "counties": item.counties,
        "towns": item.towns, "location_summary": format_location_display(item.counties, item.towns),
        "regulatory_status": item.regulatory_status, "affected_groups": item.affected_groups,
        "risk_level": item.risk_level, "source": source_payload, "image_url": image_url,
        "published_at": item.published_at,
    }


def create_app(config: Settings = settings, repository: Repository | None = None) -> FastAPI:
    store = repository or build_repository(config)
    services = ServiceContainer(store, config)
    request_log: dict[str, deque[float]] = defaultdict(deque)
    collection_lock = asyncio.Lock()

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        app.state.services = services
        scheduler_task = None

        async def _seed_verified_sources():
            await asyncio.sleep(4)
            try:
                await seed_verified_sources(store, activate=True)
            except Exception as err:
                logger.warning("Automated source seed notice: %s", err)

        if config.supabase_configured and config.environment not in {"test", "testing"}:
            scheduler_task = asyncio.create_task(_seed_verified_sources())

        yield
        if scheduler_task:
            scheduler_task.cancel()
            try:
                await scheduler_task
            except asyncio.CancelledError:
                pass
        if isinstance(store, SupabaseNewsRepository):
            await store.close()

    app = FastAPI(title="VaRoom Property News Service", version="0.1.0", lifespan=lifespan,
                  description="Isolated Phase 1 property-news service. It is not yet wired into the VaRoom application.")
    app.state.services = services

    @app.exception_handler(RequestValidationError)
    async def invalid_request(_request: Request, _error: RequestValidationError):
        return JSONResponse({"error": "Invalid input"}, status_code=422)

    @app.middleware("http")
    async def enforce_request_size(request: Request, call_next):
        content_length = request.headers.get("content-length")
        if content_length and (not content_length.isdigit() or int(content_length) > 1024 * 1024):
            return JSONResponse({"error": "Request body too large"}, status_code=413)
        return await call_next(request)

    @app.exception_handler(PropertyNewsRepositoryUnavailable)
    async def property_news_repository_unavailable(_request: Request, error: PropertyNewsRepositoryUnavailable):
        return JSONResponse({"detail": str(error)}, status_code=503, headers={"Cache-Control": "no-store"})

    @app.middleware("http")
    async def rate_limit_public_requests(request: Request, call_next):
        if request.url.path.startswith("/api/news") or request.url.path.startswith("/api/elie/news-search"):
            identifier = request.client.host if request.client else "unknown"
            now = time.monotonic()
            window = request_log[identifier]
            while window and now - window[0] > 60:
                window.popleft()
            if len(window) >= config.public_rate_limit_per_minute:
                return JSONResponse({"detail": "Rate limit exceeded"}, status_code=429)
            window.append(now)
        return await call_next(request)

    def container(request: Request) -> ServiceContainer:
        return request.app.state.services

    async def require_admin(authorization: str | None = Header(default=None)) -> None:
        if not config.admin_api_key:
            raise HTTPException(status_code=503, detail="Admin endpoints are disabled until NEWS_ADMIN_API_KEY is configured.")
        token = authorization.removeprefix("Bearer ") if authorization else ""
        if not hmac.compare_digest(token, config.admin_api_key):
            raise HTTPException(status_code=401, detail="Admin authentication failed.")

    async def require_scheduler(authorization: str | None = Header(default=None)) -> None:
        if not config.scheduler_secret:
            raise HTTPException(status_code=503, detail="Collection endpoint is disabled until NEWS_SCHEDULER_SECRET is configured.")
        token = authorization.removeprefix("Bearer ") if authorization else ""
        if not hmac.compare_digest(token, config.scheduler_secret):
            raise HTTPException(status_code=401, detail="Collection authentication failed.")

    @app.get("/health")
    async def health(service: ServiceContainer = Depends(container)):
        return {"status": "ok", "isolated": True, "supabase_configured": service.config.supabase_configured,
                "ai_provider": service.analyzer.__class__.__name__}

    @app.get("/api/news/latest")
    async def latest_news(limit: int = Query(default=2, ge=1, le=50), service: ServiceContainer = Depends(container)):
        items = await service.repository.list_items(published_only=True, limit=limit)
        sources_map = await service.repository.get_sources_map([item.source_id for item in items])
        return [ _public_item(item, sources_map.get(item.source_id)) for item in items ]

    @app.get("/api/news/search")
    async def search_news(q: str = Query(min_length=2, max_length=300), category: str | None = Query(default=None, max_length=50),
                          county: str | None = Query(default=None, max_length=100),
                          town: str | None = Query(default=None, max_length=100), regulatory_status: str | None = Query(default=None, max_length=50), date: int | None = Query(default=None, ge=1, le=3650),
                          limit: int = Query(default=20, ge=1, le=50), service: ServiceContainer = Depends(container)):
        return (await service.retrieval.search(q, category=category, county=county, town=town,
                                               regulatory_status=regulatory_status, days=date, limit=limit)).model_dump(mode="json")

    @app.get("/api/news/related/{news_id}")
    async def related_news(news_id: UUID, limit: int = Query(default=5, ge=1, le=20), service: ServiceContainer = Depends(container)):
        item = await service.repository.get_item(news_id)
        if not item or item.review_status is not ReviewStatus.PUBLISHED:
            raise HTTPException(status_code=404, detail="Published news item not found.")
        query = " ".join(filter(None, [item.category, *item.topics, *item.counties]))
        result = await service.retrieval.search(query or item.source_title, limit=limit + 1)
        return [e for e in result.evidence if e.id != item.id][:limit]

    @app.get("/api/news/{news_id}")
    async def get_news_item(news_id: UUID, service: ServiceContainer = Depends(container)):
        item = await service.repository.get_item(news_id)
        if not item or item.review_status is not ReviewStatus.PUBLISHED:
            raise HTTPException(status_code=404, detail="Published news item not found.")
        return _public_item(item, await service.repository.get_source(item.source_id))

    @app.get("/api/news")
    async def list_news(category: str | None = Query(default=None, max_length=50), county: str | None = Query(default=None, max_length=100), town: str | None = Query(default=None, max_length=100),
                        regulatory_status: str | None = Query(default=None, max_length=50), source: UUID | None = None, limit: int = Query(default=20, ge=1, le=50),
                        service: ServiceContainer = Depends(container)):
        items = await service.repository.list_items(published_only=True)
        def matches(item) -> bool:
            return ((not category or item.category == category.lower()) and
                    (not county or county.lower() in {value.lower() for value in item.counties}) and
                    (not town or town.lower() in {value.lower() for value in item.towns}) and
                    (not regulatory_status or item.regulatory_status.value == regulatory_status.lower()) and
                    (not source or item.source_id == source))
        filtered = [item for item in items if matches(item)][:limit]
        sources_map = await service.repository.get_sources_map([item.source_id for item in filtered])
        return [_public_item(item, sources_map.get(item.source_id)) for item in filtered]

    @app.get("/api/elie/news-search")
    async def elie_news_search(q: str = Query(min_length=2, max_length=300), county: str | None = Query(default=None, max_length=100), regulatory_status: str | None = Query(default=None, max_length=50),
                               date: int | None = Query(default=None, ge=1, le=3650), limit: int = Query(default=8, ge=1, le=20),
                               service: ServiceContainer = Depends(container)):
        """Structured source evidence only; a future Elie layer writes the user-facing response."""
        return (await service.retrieval.search(q, county=county, regulatory_status=regulatory_status, days=date, limit=limit)).model_dump(mode="json")

    @app.get("/api/admin/news/pending", dependencies=[Depends(require_admin)])
    async def pending_review(service: ServiceContainer = Depends(container)):
        items = await service.repository.list_pending_review()
        sources_map = await service.repository.get_sources_map([item.source_id for item in items])
        return [{"item": item.model_dump(mode="json"), "source": sources_map.get(item.source_id).model_dump(mode="json") if sources_map.get(item.source_id) else None}
                for item in items]

    async def review_action(news_id: UUID, action: ReviewAction, reviewer: str | None, service: ServiceContainer):
        try:
            reviewer_id = UUID(reviewer) if reviewer else None
            return (await service.review.act(news_id, reviewer_id, action)).model_dump(mode="json")
        except LookupError as error:
            raise HTTPException(status_code=404, detail=str(error)) from error
        except (ValueError, TypeError) as error:
            raise HTTPException(status_code=422, detail=str(error)) from error

    @app.post("/api/admin/news/{news_id}/approve", dependencies=[Depends(require_admin)])
    async def approve_news(news_id: UUID, payload: ReviewAction, x_news_reviewer_id: str | None = Header(default=None), service: ServiceContainer = Depends(container)):
        return await review_action(news_id, payload.model_copy(update={"action": "approve"}), x_news_reviewer_id, service)

    @app.post("/api/admin/news/{news_id}/reject", dependencies=[Depends(require_admin)])
    async def reject_news(news_id: UUID, payload: ReviewAction, x_news_reviewer_id: str | None = Header(default=None), service: ServiceContainer = Depends(container)):
        return await review_action(news_id, payload.model_copy(update={"action": "reject"}), x_news_reviewer_id, service)

    @app.post("/api/admin/news/{news_id}/edit", dependencies=[Depends(require_admin)])
    async def edit_news(news_id: UUID, payload: ReviewAction, x_news_reviewer_id: str | None = Header(default=None), service: ServiceContainer = Depends(container)):
        return await review_action(news_id, payload.model_copy(update={"action": "edit"}), x_news_reviewer_id, service)

    @app.post("/api/admin/news/{news_id}/request-more-evidence", dependencies=[Depends(require_admin)])
    async def request_more_evidence(news_id: UUID, payload: ReviewAction, x_news_reviewer_id: str | None = Header(default=None), service: ServiceContainer = Depends(container)):
        return await review_action(news_id, payload.model_copy(update={"action": "request_more_evidence"}), x_news_reviewer_id, service)

    @app.get("/api/admin/sources/health", dependencies=[Depends(require_admin)])
    async def sources_health(service: ServiceContainer = Depends(container)):
        return await service.repository.source_health()

    async def _run_locked_job(job):
        try:
            await asyncio.wait_for(collection_lock.acquire(), timeout=120)
        except TimeoutError:
            return {
                "status": "already_running",
                "sources_checked": 0, "candidates": 0, "new_items": 0, "duplicates": 0, "failures": 0,
                "processed": 0, "published": 0, "pending_review": 0, "archived": 0,
                "processing_failures": 0, "retried": 0,
            }
        try:
            return await job()
        finally:
            collection_lock.release()

    @app.post("/api/internal/jobs/collect", dependencies=[Depends(require_scheduler)])
    async def collect_due_news(service: ServiceContainer = Depends(container)):
        if not config.supabase_configured:
            raise HTTPException(status_code=503, detail="Collection requires the server-side Supabase configuration.")
        return await _run_locked_job(lambda: run_collection_job(service.repository, config, service.analyzer))

    @app.post("/api/admin/jobs/reprocess-existing", dependencies=[Depends(require_admin)])
    async def reprocess_existing_news(limit: int = Query(default=20, ge=1, le=100), service: ServiceContainer = Depends(container)):
        """One-off maintenance: re-fetch/re-clean existing items with the current
        extraction logic. Call repeatedly with a modest limit to work through a
        backlog in batches rather than one long-running request."""
        if not config.supabase_configured:
            raise HTTPException(status_code=503, detail="Reprocessing requires the server-side Supabase configuration.")
        return await _run_locked_job(lambda: run_reprocess_job(service.repository, config, service.analyzer, limit=limit))

    @app.post("/api/admin/news/archive-all-published", dependencies=[Depends(require_admin)])
    async def archive_all_published_news(service: ServiceContainer = Depends(container)):
        count = await service.repository.archive_all_published()
        return {"archived_count": count}

    @app.post("/api/internal/sources/seed-verified", dependencies=[Depends(require_scheduler)])
    async def seed_sources(service: ServiceContainer = Depends(container)):
        if not config.supabase_configured:
            raise HTTPException(status_code=503, detail="Source registration requires the server-side Supabase configuration.")
        sources = await seed_verified_sources(service.repository, activate=True)
        return [{"id": str(s.id), "name": s.name, "active": s.active} for s in sources]

    @app.post("/api/internal/sources/seed-official-lands", dependencies=[Depends(require_scheduler)])
    async def seed_official_lands(service: ServiceContainer = Depends(container)):
        if not config.supabase_configured:
            raise HTTPException(status_code=503, detail="Source registration requires the server-side Supabase configuration.")
        source = await upsert_official_lands_source(service.repository, activate=True)
        return {"id": str(source.id), "name": source.name, "active": source.active}

    return app


app = create_app()
