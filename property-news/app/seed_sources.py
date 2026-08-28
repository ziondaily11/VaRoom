from __future__ import annotations

import argparse
import asyncio

from .config import settings
from .models import Source
from .repository import MemoryNewsRepository, SupabaseNewsRepository, build_repository

Repository = MemoryNewsRepository | SupabaseNewsRepository


VERIFIED_SOURCES = [
    {
        "name": "State Department for Lands and Physical Planning",
        "base_url": "https://www.lands.go.ke",
        "source_type": "government",
        "trust_tier": 1,
        "fetch_method": "html",
        "schedule_minutes": 60,
        "parser_config": {
            "discovery_url": "https://www.lands.go.ke/allnews",
            "url_regex": r"^/[a-z0-9]+(?:-[a-z0-9]+){2,}/?$",
            "exclude_url_contains": ["/allnews", "/land-registries", "/news-update", "/about"],
            "max_articles": 25,
            "verification": {
                "authority": "Official Government of Kenya State Department for Lands and Physical Planning website.",
                "content_policy": "Store source evidence privately; publish only VaRoom summaries with a source link.",
            },
        },
    },
    {
        "name": "Business Daily Africa Real Estate",
        "base_url": "https://www.businessdailyafrica.com",
        "source_type": "news",
        "trust_tier": 2,
        "fetch_method": "html",
        "schedule_minutes": 60,
        "parser_config": {
            "discovery_url": "https://www.businessdailyafrica.com/bd/markets/real-estate",
            "url_regex": r"^/bd/markets/real-estate/[a-z0-9-]+/?$",
            "exclude_url_contains": ["/bd/markets/real-estate$", "/author"],
            "allowed_hosts": ["businessdailyafrica.com", "www.businessdailyafrica.com"],
            "max_articles": 20,
        },
    },
    {
        "name": "National Land Commission",
        "base_url": "https://landcommission.go.ke",
        "source_type": "government",
        "trust_tier": 1,
        "fetch_method": "html",
        "schedule_minutes": 120,
        "parser_config": {
            "discovery_url": "https://landcommission.go.ke",
            "url_regex": r"^/[a-z-]+/?$",
            "exclude_url_contains": ["/about", "/contact", "/downloads"],
            "max_articles": 15,
        },
    }
]

OFFICIAL_LANDS_SOURCE = VERIFIED_SOURCES[0]


async def upsert_official_lands_source(repository: Repository, *, activate: bool) -> Source:
    existing = next((source for source in await repository.list_sources()
                     if source.base_url.rstrip("/") == OFFICIAL_LANDS_SOURCE["base_url"].rstrip("/")), None)
    values = OFFICIAL_LANDS_SOURCE | {"active": activate}
    if existing:
        values |= {"id": existing.id, "created_at": existing.created_at}
    return await repository.upsert_source(Source(**values))


async def seed_verified_sources(repository: Repository, *, activate: bool = True) -> list[Source]:
    seeded = []
    existing_sources = await repository.list_sources()
    for source_data in VERIFIED_SOURCES:
        existing = next((s for s in existing_sources if s.base_url.rstrip("/") == source_data["base_url"].rstrip("/")), None)
        values = source_data | {"active": activate}
        if existing:
            values |= {"id": existing.id, "created_at": existing.created_at}
        source = await repository.upsert_source(Source(**values))
        seeded.append(source)
    return seeded


async def _run(activate: bool) -> None:
    repository = build_repository(settings)
    try:
        if not settings.supabase_configured:
            raise RuntimeError("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required to seed a production source")
        sources = await seed_verified_sources(repository, activate=activate)
        for source in sources:
            print(f"Source {'activated' if source.active else 'registered'}: {source.name}")
    finally:
        if isinstance(repository, SupabaseNewsRepository):
            await repository.close()


def main() -> None:
    parser = argparse.ArgumentParser(description="Register verified official and industry property news sources.")
    parser.add_argument("--activate", action="store_true", help="Enable collection after registration.")
    args = parser.parse_args()
    asyncio.run(_run(args.activate))


if __name__ == "__main__":
    main()
