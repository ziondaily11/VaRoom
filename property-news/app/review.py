from __future__ import annotations

from datetime import datetime, timezone
from uuid import UUID

from .constants import ReviewStatus, RiskLevel
from .models import NewsEvent, ReviewAction
from .repository import MemoryNewsRepository, SupabaseNewsRepository

Repository = MemoryNewsRepository | SupabaseNewsRepository


class ReviewService:
    def __init__(self, repository: Repository) -> None:
        self.repository = repository

    async def act(self, news_id: UUID, reviewer_id: UUID | None, action: ReviewAction):
        item = await self.repository.get_item(news_id)
        if not item:
            raise LookupError("News item not found")
        if action.action not in {"approve", "reject", "edit", "request_more_evidence"}:
            raise ValueError("Unsupported review action")
        if action.action == "approve":
            if item.risk_level is RiskLevel.CRITICAL:
                raise ValueError("Critical-risk items cannot be approved without lowering risk with documented evidence.")
            item = await self.repository.schedule_publication(item)
        elif action.action == "reject":
            item.review_status = ReviewStatus.REJECTED
        elif action.action == "request_more_evidence":
            item.review_status = ReviewStatus.PENDING_REVIEW
        elif action.action == "edit":
            allowed = {"varoom_title", "varoom_summary", "varoom_body", "category", "topics", "counties", "towns", "regulatory_status", "affected_groups", "key_facts", "risk_level"}
            unsafe = set(action.edits) - allowed
            if unsafe:
                raise ValueError(f"Unsupported editorial fields: {', '.join(sorted(unsafe))}")
            if "risk_level" in action.edits and item.risk_level is RiskLevel.CRITICAL and not action.reason:
                raise ValueError("Lowering a critical risk level requires a documented reason and supporting evidence.")
            item = item.__class__.model_validate(item.model_dump() | action.edits)
            item.review_status = ReviewStatus.PENDING_REVIEW
        item.reviewed_by = reviewer_id
        saved = await self.repository.save_item(item)
        review = {"news_id": str(news_id), "reviewer_id": str(reviewer_id) if reviewer_id else None,
                  "decision": action.action, "reason": action.reason, "edits": action.edits,
                  "reviewed_at": datetime.now(timezone.utc).isoformat()}
        await self.repository.add_review(review)
        await self.repository.add_event(NewsEvent(news_id=saved.id, source_id=saved.source_id, event_type=f"review_{action.action}", payload=review))
        return saved
