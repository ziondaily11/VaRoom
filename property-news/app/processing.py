from __future__ import annotations

import re
from datetime import datetime, timezone
from uuid import UUID

from .analysis import NewsAnalyzer
from .constants import ReviewStatus
from .models import NewsEvent, NewsItem
from .repository import MemoryNewsRepository, SupabaseNewsRepository
from .risk import allows_auto_publish

Repository = MemoryNewsRepository | SupabaseNewsRepository
_SENSITIVE_URL_PARAMETER = re.compile(r"(?i)([?&](?:api[_-]?key|key|token|access_token)=)[^&\s'\"]+")


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
            item.review_status = ReviewStatus.FAILED
            await self.repository.save_item(item)
            await self.repository.add_event(NewsEvent(news_id=item.id, source_id=item.source_id,
                event_type="item_processing_failed", payload={"error": _safe_error_message(error)}))
            raise
        await self.repository.save_analysis(item.id, analysis)
        item = item.model_copy(update={
            "varoom_title": analysis.varoom_title, "varoom_summary": analysis.varoom_summary,
            "varoom_body": analysis.varoom_body, "category": analysis.category, "topics": analysis.topics,
            "counties": analysis.counties, "towns": analysis.towns, "regulatory_status": analysis.regulatory_status,
            "affected_groups": analysis.affected_groups, "key_facts": analysis.key_facts,
            "risk_level": analysis.risk_level, "confidence_score": analysis.confidence_score,
            "source_tier": analysis.source_tier,
        })
        if not analysis.relevant:
            item.review_status = ReviewStatus.ARCHIVED
            event_type = "item_rejected_irrelevant"
        elif self._valid_for_auto_publish(item) and allows_auto_publish(item.risk_level, item.source_tier, item.confidence_score):
            item.review_status = ReviewStatus.PUBLISHED
            item.published_at = datetime.now(timezone.utc)
            event_type = "item_auto_published"
        else:
            item.review_status = ReviewStatus.PENDING_REVIEW
            event_type = "item_queued_for_review"
        saved = await self.repository.save_item(item)
        await self.repository.add_event(NewsEvent(news_id=saved.id, source_id=saved.source_id, event_type=event_type,
            payload={"risk_level": saved.risk_level, "confidence_score": saved.confidence_score,
                     "regulatory_status": saved.regulatory_status, "reasons": analysis.risk_reasons}))
        return saved

    @staticmethod
    def _valid_for_auto_publish(item: NewsItem) -> bool:
        return bool(item.varoom_title and item.varoom_summary and item.category and item.source_url and item.clean_text)
