from __future__ import annotations

import argparse
import asyncio

from .config import settings
from .models import Source
from .repository import MemoryNewsRepository, SupabaseNewsRepository, build_repository

Repository = MemoryNewsRepository | SupabaseNewsRepository


OFFICIAL_LANDS_SOURCE = {
    "name": "State Department for Lands and Physical Planning",
    "base_url": "https://www.lands.go.ke",
    "source_type": "government",
    "trust_tier": 1,
    "fetch_method": "html",
    "schedule_minutes": 60,
    "parser_config": {
        "discovery_url": "https://www.lands.go.ke/allnews",
        "url_regex": r"^/[a-z0-9]+(?:-[a-z0-9]+){2,}/?$",
        "exclude_url_contains": ["/allnews", "/land-registries", "/news-update"],
        "max_articles": 25,
        "verification": {
            "authority": "Official Government of Kenya State Department for Lands and Physical Planning website.",
            "robots_checked_at": "2026-08-21",
            "technical_check": "HTTPS GET to /robots.txt, /allnews, and discovered article URLs succeeded during the production readiness audit.",
            "content_policy": "Store source evidence privately; publish only VaRoom summaries with a source link.",
        },
    },
}


async def upsert_official_lands_source(repository: Repository, *, activate: bool) -> Source:
    existing = next((source for source in await repository.list_sources()
                     if source.base_url.rstrip("/") == OFFICIAL_LANDS_SOURCE["base_url"].rstrip("/")), None)
    values = OFFICIAL_LANDS_SOURCE | {"active": activate}
    if existing:
        values |= {"id": existing.id, "created_at": existing.created_at}
    return await repository.upsert_source(Source(**values))


async def _run(activate: bool) -> None:
    repository = build_repository(settings)
    try:
        if not settings.supabase_configured:
            raise RuntimeError("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required to seed a production source")
        source = await upsert_official_lands_source(repository, activate=activate)
        print(f"Source {'activated' if source.active else 'registered'}: {source.name}")
    finally:
        if isinstance(repository, SupabaseNewsRepository):
            await repository.close()


def main() -> None:
    parser = argparse.ArgumentParser(description="Register the verified official Lands source.")
    parser.add_argument("--activate", action="store_true", help="Enable collection after the migration and service secret are live.")
    args = parser.parse_args()
    asyncio.run(_run(args.activate))


if __name__ == "__main__":
    main()
