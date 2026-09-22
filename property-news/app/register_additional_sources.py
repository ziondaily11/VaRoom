from __future__ import annotations

import argparse
import asyncio
import json
from pathlib import Path

from .config import settings
from .models import Source
from .repository import MemoryNewsRepository, SupabaseNewsRepository, build_repository

Repository = MemoryNewsRepository | SupabaseNewsRepository


async def register_sources_from_json(repository: Repository, json_path: str, activate: bool = False,
                                     sync_active: bool = False,
                                     names: set[str] | None = None) -> list[Source]:
    """Register sources while preserving existing activation unless explicitly syncing it."""
    sources_file = Path(json_path)
    if not sources_file.exists():
        raise FileNotFoundError(f"Sources file not found: {json_path}")
    
    with open(sources_file) as f:
        sources_data = json.load(f)
    
    registered_sources = []
    for source_data in sources_data:
        if names and source_data["name"] not in names:
            continue
        existing = next(
            (source for source in await repository.list_sources()
             if source.base_url.rstrip("/") == source_data["base_url"].rstrip("/")),
            None
        )
        
        # A config refresh must not accidentally toggle every production source.
        # New sources default to inactive unless --activate is passed; existing
        # sources retain their current state unless --sync-active is deliberate.
        desired_active = bool(source_data.get("active", False))
        active = (desired_active if sync_active else (existing.active if existing else activate))
        values = source_data | {"active": active}
        if existing:
            values |= {"id": existing.id, "created_at": existing.created_at}
        
        source = Source(**values)
        registered = await repository.upsert_source(source)
        registered_sources.append(registered)
    
    return registered_sources


async def _run(json_path: str, activate: bool, sync_active: bool, names: set[str] | None) -> None:
    repository = build_repository(settings)
    try:
        if not settings.supabase_configured:
            raise RuntimeError("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required to register production sources")
        
        sources = await register_sources_from_json(repository, json_path, activate, sync_active, names)
        
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
    parser.add_argument("--sync-active", action="store_true",
                        help="Apply each selected source's active value from the JSON configuration")
    parser.add_argument("--name", action="append", dest="names",
                        help="Limit the operation to an exact source name; repeat for multiple sources")
    args = parser.parse_args()
    asyncio.run(_run(args.json_path, args.activate, args.sync_active, set(args.names or [])))


if __name__ == "__main__":
    main()
