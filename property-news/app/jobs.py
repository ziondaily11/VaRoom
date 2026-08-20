from __future__ import annotations

import argparse
import asyncio
import logging

from .api import ServiceContainer
from .collector import SourceCollector
from .config import settings
from .repository import build_repository


async def run(collect_due: bool, health_check: bool) -> None:
    repository = build_repository(settings)
    try:
        if collect_due:
            result = await SourceCollector(repository, settings).collect_due_sources()
            print(result)
        if health_check:
            print(await repository.source_health())
    finally:
        if hasattr(repository, "close"):
            await repository.close()


def main() -> None:
    parser = argparse.ArgumentParser(description="Run isolated VaRoom property-news jobs.")
    parser.add_argument("--collect-due", action="store_true", help="Check sources that are due according to their database schedule.")
    parser.add_argument("--health-check", action="store_true", help="Print source-health data for a scheduler or monitor.")
    args = parser.parse_args()
    if not args.collect_due and not args.health_check:
        parser.error("Choose --collect-due and/or --health-check")
    logging.basicConfig(level=settings.log_level)
    asyncio.run(run(args.collect_due, args.health_check))


if __name__ == "__main__":
    main()
