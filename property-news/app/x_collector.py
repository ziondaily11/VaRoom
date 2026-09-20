from __future__ import annotations

import logging
from datetime import datetime, timezone

import httpx

from .collector import SourceCollector
from .models import CandidateArticle, NewsEvent, Source

logger = logging.getLogger(__name__)


class XCollector:
    """Official X API adapter. It never falls back to web scraping."""
    def __init__(self, repository, settings) -> None:
        self.repository, self.settings = repository, settings
        self._store = SourceCollector(repository, settings)

    async def close(self) -> None:
        await self._store.close()

    async def verify_source(self, source: Source) -> Source:
        if not self.settings.x_configured or not source.source_account:
            return source
        headers = {"Authorization": f"Bearer {self.settings.x_bearer_token}"}
        async with httpx.AsyncClient(timeout=self.settings.fetch_timeout_seconds, headers=headers) as client:
            response = await client.get(f"{self.settings.x_api_base_url}/users/by/username/{source.source_account}", params={"user.fields": "id,name,username"})
            if response.status_code == 404:
                return await self.repository.upsert_source(source.model_copy(update={"verified": False, "active": False}))
            response.raise_for_status()
            user = response.json()["data"]
        # The API's canonical username is required to match the curated handle.
        if str(user.get("username", "")).lower() != source.source_account.lower():
            return await self.repository.upsert_source(source.model_copy(update={"verified": False, "active": False}))
        config = {**source.parser_config, "x_user_id": str(user["id"]), "x_display_name": str(user.get("name") or source.source_account)}
        return await self.repository.upsert_source(source.model_copy(update={"name": str(user.get("name") or source.name), "verified": True, "parser_config": config}))

    async def collect_due_sources(self) -> dict:
        if not self.settings.x_configured:
            return {"status": "not_configured", "sources_checked": 0, "new_item_ids": [], "new_items": 0, "duplicates": 0, "rejected": 0}
        sources = [s for s in await self.repository.list_sources(active_only=True) if s.platform == "x" and s.verified]
        totals = {"status": "ok", "sources_checked": len(sources), "new_item_ids": [], "new_items": 0, "duplicates": 0, "rejected": 0, "sources_failed": 0}
        for source in sources:
            result = await self.collect_source(source)
            for key in ("new_items", "duplicates", "rejected", "sources_failed"):
                totals[key] += result.get(key, 0)
            totals["new_item_ids"].extend(result.get("new_item_ids", []))
        return totals

    async def collect_source(self, source: Source) -> dict:
        started = datetime.now(timezone.utc)
        run_id = await self.repository.start_fetch_run(source.id, started)
        result = {"new_item_ids": [], "new_items": 0, "duplicates": 0, "rejected": 0, "sources_failed": 0}
        try:
            verified = await self.verify_source(source)
            if not verified.verified or not verified.active:
                await self.repository.finish_fetch_run(run_id, result="partial", ended_at=datetime.now(timezone.utc), discovered_count=0, new_item_count=0, duplicate_count=0, error_message="X source is unverified or inactive")
                return result
            user_id = verified.parser_config.get("x_user_id")
            headers = {"Authorization": f"Bearer {self.settings.x_bearer_token}"}
            async with httpx.AsyncClient(timeout=self.settings.fetch_timeout_seconds, headers=headers) as client:
                response = await client.get(f"{self.settings.x_api_base_url}/users/{user_id}/tweets", params={"max_results": min(100, max(5, self.settings.x_fetch_max_results)), "tweet.fields": "created_at", "exclude": "retweets,replies"})
                response.raise_for_status()
                posts = response.json().get("data") or []
            for post in posts:
                post_id, text = str(post["id"]), str(post.get("text") or "").strip()
                if not text:
                    continue
                created_at = datetime.fromisoformat(str(post["created_at"]).replace("Z", "+00:00"))
                candidate = CandidateArticle(source_id=verified.id, source_url=f"https://x.com/{verified.source_account}/status/{post_id}", source_title=text[:1000], source_published_at=created_at, original_content=text, clean_text=text, external_post_id=post_id)
                saved, duplicate = await self._store._store_candidate(verified, candidate)
                if duplicate: result["duplicates"] += 1
                elif saved: result["new_items"] += 1; result["new_item_ids"].append(saved.id)
                else: result["rejected"] += 1
            verified.last_successful_fetch_at = datetime.now(timezone.utc)
            await self.repository.upsert_source(verified)
            await self.repository.finish_fetch_run(run_id, result="succeeded", ended_at=datetime.now(timezone.utc), discovered_count=len(posts), new_item_count=result["new_items"], duplicate_count=result["duplicates"])
        except Exception as error:
            source.last_failed_fetch_at = datetime.now(timezone.utc)
            await self.repository.upsert_source(source)
            await self.repository.finish_fetch_run(run_id, result="failed", ended_at=datetime.now(timezone.utc), discovered_count=0, new_item_count=0, duplicate_count=0, error_message=str(error)[:1000])
            result["sources_failed"] = 1
            logger.warning("X collection failed for @%s: %s", source.source_account, error)
        return result
