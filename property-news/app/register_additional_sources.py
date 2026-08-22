from __future__ import annotations

import argparse
import asyncio
import json
from pathlib import Path

from .config import settings
from .models import Source
from .repository import MemoryNewsRepository, SupabaseNewsRepository, build_repository

Repository = MemoryNewsRepository | SupabaseNewsRepository


async def register_sources_from_json(repository: Repository, json_path: str, activate: bool = False) -> list[Source]:
    """Register multiple sources from a JSON configuration file."""
    sources_file = Path(json_path)
    if not sources_file.exists():
        raise FileNotFoundError(f"Sources file not found: {json_path}")
    
    with open(sources_file) as f:
        sources_data = json.load(f)
    
    registered_sources = []
    for source_data in sources_data:
        existing = next(
            (source for source in await repository.list_sources()
             if source.base_url.rstrip("/") == source_data["base_url"].rstrip("/")),
            None
        )
        
        values = source_data | {"active": activate}
        if existing:
            values |= {"id": existing.id, "created_at": existing.created_at}
        
        source = Source(**values)
        registered = await repository.upsert_source(source)
        registered_sources.append(registered)
    
    return registered_sources


async def _run(json_path: str, activate: bool) -> None:
    repository = build_repository(settings)
    try:
        if not settings.supabase_configured:
            raise RuntimeError("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required to register production sources")
        
        sources = await register_sources_from_json(repository, json_path, activate)
        
        print(f"Successfully registered {len(sources)} sources:")
        for source in sources:
            status = "ACTIVE" if source.active else "INACTIVE"
            print(f"  [{status}] {source.name} ({source.source_type}, Tier {source.trust_tier})")
    finally:
        if isinstance(repository, SupabaseNewsRepository):
            await repository.close()


def main() -> None:
    parser = argparse.ArgumentParser(description="Register additional property news sources from JSON configuration")
    parser.add_argument("--json-path", default="sources/additional-sources.json", 
                       help="Path to JSON file containing source configurations")
    parser.add_argument("--activate", action="store_true", 
                       help="Activate sources after registration (use with caution)")
    args = parser.parse_args()
    asyncio.run(_run(args.json_path, args.activate))


if __name__ == "__main__":
    main()