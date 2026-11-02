from __future__ import annotations

import logging
import re
from datetime import datetime, timedelta, timezone
from uuid import UUID

from .analysis import NewsAnalyzer
from .constants import ReviewStatus
from .models import NewsEvent, NewsItem, NewsUrl
from .repository import MemoryNewsRepository, SupabaseNewsRepository
from .risk import allows_auto_publish

Repository = MemoryNewsRepository | SupabaseNewsRepository
logger = logging.getLogger(__name__)
_SENSITIVE_URL_PARAMETER = re.compile(r"(?i)([?&](?:api[_-]?key|key|token|access_token)=)[^&\s'\"]+")
# An item is processed at most this many times; after that it is archived.
MAX_PROCESSING_ATTEMPTS = 3
# Retry delays after a failed attempt: 10 min, then 20 min.
PROCESSING_RETRY_BASE = timedelta(minutes=10)


def _safe_error_message(error: Exception) -> str:
    return _SENSITIVE_URL_PARAMETER.sub(r"\1[redacted]", str(error))[:1000]


class ProcessingService:
    def __init__(self, repository: Repository, analyzer: NewsAnalyzer) -> None:
        self.repository, self.analyzer = repository, analyzer

    async def process(self, item_id: UUID) -> NewsItem:
        item = await self.repository.get_item(item_id)
        if not item:
            raise LookupError("News item not found")
        source = await self.repository.get_source(item.source_id)
        if not source:
            raise LookupError("News source not found")
        item.review_status = ReviewStatus.PROCESSING
        await self.repository.save_item(item)
        try:
            analysis = await self.analyzer.analyse(item, source)
        except Exception as error:
            await self._record_failure(item, error)
            raise
        await self.repository.save_analysis(item.id, analysis)
        image_url = item.image_url or analysis.image_url
        item = item.model_copy(update={
            "next_attempt_at": None, "last_processing_error": None,
            "varoom_title": analysis.varoom_title, "varoom_summary": analysis.varoom_summary,
            "varoom_body": analysis.varoom_body, "category": analysis.category, "topics": analysis.topics,
            "counties": analysis.counties, "towns": analysis.towns, "regulatory_status": analysis.regulatory_status,
            "affected_groups": analysis.affected_groups, "key_facts": analysis.key_facts,
            "risk_level": analysis.risk_level, "confidence_score": analysis.confidence_score,
            "source_tier": analysis.source_tier, "image_url": image_url,
        })
        if not analysis.relevant:
            # STRICT PROPERTY SCOPE & STORAGE RULE:
            # Never retain non-property content in database. Purge immediately,
            # but remember the URL so it is never fetched and analysed again.
            await self._remember_rejected_url(item, "AI_NOT_RELEVANT")
            await self.repository.delete_item(item.id)
            item = item.model_copy(update={"review_status": ReviewStatus.ARCHIVED})
            await self.repository.add_event(NewsEvent(
                news_id=item.id, source_id=item.source_id, event_type="item_purged_irrelevant",
                payload={"reasons": analysis.risk_reasons, "source_title": item.source_title},
            ))
            return item
        elif allows_auto_publish(analysis.risk_level, analysis.source_tier, analysis.confidence_score) and self._valid_for_auto_publish(item):
            item = await self.repository.schedule_publication(item)
            event_type = "item_auto_published" if item.review_status is ReviewStatus.PUBLISHED else "item_queued_for_publication"
        else:
            item.review_status = ReviewStatus.PENDING_REVIEW
            event_type = "item_queued_for_review"
        saved = await self.repository.save_item(item)
        await self.repository.add_event(NewsEvent(news_id=saved.id, source_id=saved.source_id, event_type=event_type,
            payload={"risk_level": saved.risk_level, "confidence_score": saved.confidence_score,
                     "regulatory_status": saved.regulatory_status, "reasons": analysis.risk_reasons}))
        return saved

    async def _record_failure(self, item: NewsItem, error: Exception) -> None:
        message = _safe_error_message(error)
        item.last_processing_error = message
        if item.processing_attempts >= MAX_PROCESSING_ATTEMPTS:
            item.review_status = ReviewStatus.ARCHIVED
            item.next_attempt_at = None
            event_type = "item_processing_abandoned"
        else:
            item.review_status = ReviewStatus.FAILED
            item.next_attempt_at = datetime.now(timezone.utc) + PROCESSING_RETRY_BASE * (2 ** max(item.processing_attempts - 1, 0))
            event_type = "item_processing_failed"
        await self.repository.save_item(item)
        await self.repository.add_event(NewsEvent(news_id=item.id, source_id=item.source_id, event_type=event_type,
            payload={"error": message, "attempts": item.processing_attempts}))

    async def _remember_rejected_url(self, item: NewsItem, reason: str) -> None:
        try:
            await self.repository.save_url_records([NewsUrl(
                canonical_url=item.canonical_url, source_id=item.source_id, state="rejected", reason=reason,
                attempts=1, last_attempt_at=datetime.now(timezone.utc),
            )])
        except Exception as error:
            logger.error("Could not record rejected URL news_id=%s: %s", item.id, error)

    @staticmethod
    def _valid_for_auto_publish(item: NewsItem) -> bool:
        return bool(item.varoom_title and item.varoom_summary and item.category and item.source_url and item.clean_text)
