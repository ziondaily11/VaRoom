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
from fastapi.responses import JSONResponse

from .analysis import build_analyzer
from .config import Settings, settings
from .constants import ReviewStatus
from .models import ReviewAction
from .processing import ProcessingService
from .repository import MemoryNewsRepository, PropertyNewsRepositoryUnavailable, SupabaseNewsRepository, build_repository
from .retrieval import NewsRetrievalService
from .review import ReviewService
from .jobs import run_collection_job
from .seed_sources import upsert_official_lands_source

Repository = MemoryNewsRepository | SupabaseNewsRepository


class ServiceContainer:
    def __init__(self, repository: Repository, config: Settings) -> None:
        self.repository = repository
        self.config = config
        self.analyzer = build_analyzer(config)
        self.processing = ProcessingService(repository, self.analyzer)
        self.review = ReviewService(repository)
        self.retrieval = NewsRetrievalService(repository)


def _public_item(item, source) -> dict[str, Any]:
    return {
        "id": str(item.id), "title": item.varoom_title or item.source_title, "summary": item.varoom_summary,
        "body": item.varoom_body, "category": item.category, "topics": item.topics, "counties": item.counties,
        "towns": item.towns, "regulatory_status": item.regulatory_status, "affected_groups": item.affected_groups,
        "risk_level": item.risk_level, "source": {"name": source.name if source else "Unknown source", "url": item.source_url,
                    "tier": item.source_tier, "published_at": item.source_published_at},
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
        yield
        if isinstance(store, SupabaseNewsRepository):
            await store.close()

    app = FastAPI(title="VaRoom Property News Service", version="0.1.0", lifespan=lifespan,
                  description="Isolated Phase 1 property-news service. It is not yet wired into the VaRoom application.")
    app.state.services = services

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
    async def latest_news(limit: int = Query(default=10, ge=1, le=50), service: ServiceContainer = Depends(container)):
        items = await service.repository.list_items(published_only=True)
        return [ _public_item(item, await service.repository.get_source(item.source_id)) for item in items[:limit] ]

    @app.get("/api/news/search")
    async def search_news(q: str = Query(min_length=2), category: str | None = None, county: str | None = None,
                          town: str | None = None, regulatory_status: str | None = None, date: int | None = Query(default=None, ge=1, le=3650),
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
    async def list_news(category: str | None = None, county: str | None = None, town: str | None = None,
                        regulatory_status: str | None = None, source: UUID | None = None, limit: int = Query(default=20, ge=1, le=50),
                        service: ServiceContainer = Depends(container)):
        items = await service.repository.list_items(published_only=True)
        def matches(item) -> bool:
            return ((not category or item.category == category.lower()) and
                    (not county or county.lower() in {value.lower() for value in item.counties}) and
                    (not town or town.lower() in {value.lower() for value in item.towns}) and
                    (not regulatory_status or item.regulatory_status.value == regulatory_status.lower()) and
                    (not source or item.source_id == source))
        return [_public_item(item, await service.repository.get_source(item.source_id)) for item in items if matches(item)][:limit]

    @app.get("/api/elie/news-search")
    async def elie_news_search(q: str = Query(min_length=2), county: str | None = None, regulatory_status: str | None = None,
                               date: int | None = Query(default=None, ge=1, le=3650), limit: int = Query(default=8, ge=1, le=20),
                               service: ServiceContainer = Depends(container)):
        """Structured source evidence only; a future Elie layer writes the user-facing response."""
        return (await service.retrieval.search(q, county=county, regulatory_status=regulatory_status, days=date, limit=limit)).model_dump(mode="json")

    @app.get("/api/admin/news/pending", dependencies=[Depends(require_admin)])
    async def pending_review(service: ServiceContainer = Depends(container)):
        items = await service.repository.list_pending_review()
        return [{"item": item.model_dump(mode="json"), "source": (await service.repository.get_source(item.source_id)).model_dump(mode="json") if await service.repository.get_source(item.source_id) else None}
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

    @app.post("/api/internal/jobs/collect", dependencies=[Depends(require_scheduler)])
    async def collect_due_news(service: ServiceContainer = Depends(container)):
        if not config.supabase_configured:
            raise HTTPException(status_code=503, detail="Collection requires the server-side Supabase configuration.")
        if collection_lock.locked():
            raise HTTPException(status_code=409, detail="A collection run is already in progress.")
        async with collection_lock:
            return await run_collection_job(service.repository, config, service.analyzer)

    @app.post("/api/internal/sources/seed-official-lands", dependencies=[Depends(require_scheduler)])
    async def seed_official_lands(service: ServiceContainer = Depends(container)):
        if not config.supabase_configured:
            raise HTTPException(status_code=503, detail="Source registration requires the server-side Supabase configuration.")
        source = await upsert_official_lands_source(service.repository, activate=True)
        return {"id": str(source.id), "name": source.name, "active": source.active}

    return app


app = create_app()
