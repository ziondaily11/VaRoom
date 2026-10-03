from __future__ import annotations

import argparse
import asyncio
import json
from pathlib import Path
from urllib.parse import urlparse

from .config import settings
from .collector import SOURCE_GROUP_COUNT, SourceCollector
from .models import Source
from .repository import MemoryNewsRepository, SupabaseNewsRepository, build_repository

Repository = MemoryNewsRepository | SupabaseNewsRepository


def canonical_domain(url: str) -> str:
    return (urlparse(url).hostname or "").lower().rstrip(".").removeprefix("www.")


def load_source_data(json_path: str) -> list[dict]:
    sources_file = Path(json_path)
    if not sources_file.exists():
        raise FileNotFoundError(f"Sources file not found: {json_path}")
    with sources_file.open(encoding="utf-8") as source_file:
        source_data = json.load(source_file)
    if not isinstance(source_data, list):
        raise ValueError(f"Sources file must contain a JSON array: {json_path}")
    return source_data


def deduplicate_sources(source_data: list[dict]) -> list[dict]:
    unique: dict[str, dict] = {}
    for row in source_data:
        if not isinstance(row, dict) or not isinstance(row.get("base_url"), str):
            raise ValueError("Every source registry entry must have a base_url")
        domain = canonical_domain(row["base_url"])
        if not domain:
            raise ValueError(f"Source URL has no hostname: {row['base_url']}")
        unique.setdefault(domain, row)
    return list(unique.values())


def source_has_verified_endpoint(source_data: dict) -> bool:
    parser_config = source_data.get("parser_config", {})
    parser_config = parser_config if isinstance(parser_config, dict) else {}
    verification = source_data.get("verification") or parser_config.get("verification") or {}
    if not isinstance(verification, dict):
        return False
    method = source_data.get("fetch_method")
    configured_urls = parser_config.get("urls", [])
    configured_endpoint = parser_config.get("discovery_url") or (
        configured_urls[0] if isinstance(configured_urls, list) and configured_urls else source_data.get("base_url")
    )
    return (
        verification.get("http_status") == 200
        and isinstance(verification.get("item_count"), int)
        and not isinstance(verification.get("item_count"), bool)
        and verification["item_count"] > 0
        and verification.get("method_used") == method
        and isinstance(configured_endpoint, str)
        and verification.get("url") == configured_endpoint
        and method in {"api", "wp_json", "rss", "atom", "sitemap", "html"}
    )


def registry_domains(sources_dir: Path, *, excluding: Path) -> set[str]:
    known: set[str] = set()
    excluded = excluding.resolve()
    for path in sources_dir.glob("*.json"):
        if path.resolve() == excluded:
            continue
        try:
            entries = load_source_data(str(path))
        except (json.JSONDecodeError, ValueError):
            continue
        for entry in entries:
            if isinstance(entry, dict) and isinstance(entry.get("base_url"), str):
                domain = canonical_domain(entry["base_url"])
                if domain:
                    known.add(domain)
    return known


async def audit_source_registry(repository: Repository, sources_dir: Path) -> dict:
    registry_active: dict[str, bool] = {}
    registry_verified: dict[str, bool] = {}
    registry_names: dict[str, str] = {}
    for path in sorted(sources_dir.glob("*.json")):
        for entry in load_source_data(str(path)):
            domain = canonical_domain(entry["base_url"])
            registry_active[domain] = registry_active.get(domain, False) or bool(entry.get("active", False))
            registry_verified[domain] = (
                registry_verified.get(domain, False) or source_has_verified_endpoint(entry)
            )
            registry_names.setdefault(domain, entry["name"])

    database_sources = await repository.list_sources()
    database_domains = {canonical_domain(source.base_url) for source in database_sources}
    active_sources = [source for source in database_sources if source.active]
    active_web_sources = [
        source for source in active_sources if source.platform == "web"
    ]
    active_web_by_group = {str(group): 0 for group in range(SOURCE_GROUP_COUNT)}
    due_web_by_group = {str(group): 0 for group in range(SOURCE_GROUP_COUNT)}
    production_inventory = []
    for source in database_sources:
        group = SourceCollector._source_group(source, SOURCE_GROUP_COUNT) if source.platform == "web" else None
        due = source.active and source.platform == "web" and SourceCollector._is_due(source)
        if source.active and group is not None:
            active_web_by_group[str(group)] += 1
        if due and group is not None:
            due_web_by_group[str(group)] += 1
        production_inventory.append({
            "name": source.name,
            "domain": canonical_domain(source.base_url),
            "active": source.active,
            "platform": source.platform,
            "fetch_method": source.fetch_method,
            "group": group,
            "due": due,
            "last_success_at": source.last_success_at or source.last_successful_fetch_at,
            "last_failed_fetch_at": source.last_failed_fetch_at,
            "failure_category": source.failure_category,
            "consecutive_failures": source.consecutive_failures,
        })
    return {
        "database_source_count": len(database_sources),
        "database_active_count": len(active_sources),
        "database_active_web_count": len(active_web_sources),
        "active_web_sources_by_group": active_web_by_group,
        "due_web_sources_by_group": due_web_by_group,
        "production_inventory": production_inventory,
        "registry_domain_count": len(registry_names),
        "registry_domains_not_registered": sorted(set(registry_names) - database_domains),
        "active_database_sources_not_in_registry": [
            {
                "source_id": str(source.id),
                "name": source.name,
                "domain": canonical_domain(source.base_url),
            }
            for source in active_sources
            if canonical_domain(source.base_url) not in registry_names
        ],
        "active_database_sources_without_verified_registry_endpoint": [
            {
                "source_id": str(source.id),
                "name": source.name,
                "domain": canonical_domain(source.base_url),
            }
            for source in active_sources
            if canonical_domain(source.base_url) in registry_names
            and not registry_verified.get(canonical_domain(source.base_url), False)
        ],
        "active_registry_sources_without_verified_endpoint": [
            {"name": registry_names[domain], "domain": domain}
            for domain, active in registry_active.items()
            if active and not registry_verified.get(domain, False)
        ],
    }


def make_upsert_sql(sources: list[dict]) -> str:
    def literal(value: str) -> str:
        return "'" + value.replace("'", "''") + "'"

    statements = [
        "-- Review before applying. This does not remove pre-existing duplicate source rows.",
        "-- Matches an existing row by canonical hostname (www/apex-insensitive).",
        "BEGIN;",
    ]
    for row in deduplicate_sources(sources):
        parser_config = json.dumps(row.get("parser_config", {}), ensure_ascii=False, separators=(",", ":"))
        active = "TRUE" if bool(row.get("active", False)) and source_has_verified_endpoint(row) else "FALSE"
        category = "NULL" if row.get("category") is None else literal(str(row["category"]))
        failure_category = "NULL" if row.get("failure_category") is None else literal(str(row["failure_category"]))
        last_error = "NULL" if row.get("last_error") is None else literal(str(row["last_error"]))
        last_success = "NULL" if row.get("last_success_at") is None else literal(str(row["last_success_at"])) + "::timestamptz"
        last_failure = (
            "NULL" if row.get("last_failed_fetch_at") is None
            else literal(str(row["last_failed_fetch_at"])) + "::timestamptz"
        )
        consecutive_failures = int(row.get("consecutive_failures", 0))
        host = canonical_domain(row["base_url"])
        statements.append(
            "DO $upsert$\n"
            "DECLARE matched_id uuid;\n"
            "BEGIN\n"
            "  SELECT id INTO matched_id FROM public.news_sources\n"
            "  WHERE lower(regexp_replace(rtrim(split_part(split_part(base_url, '://', 2), '/', 1), '.'), '^www\\.', '')) = "
            f"{literal(host)}\n"
            "  ORDER BY created_at, id LIMIT 1;\n"
            "  IF matched_id IS NULL THEN\n"
            "    INSERT INTO public.news_sources "
            "(name, base_url, source_type, trust_tier, fetch_method, schedule_minutes, active, parser_config, category, "
            "last_success_at, last_failed_fetch_at, last_error, failure_category, consecutive_failures)\n"
            f"    VALUES ({literal(row['name'])}, {literal(row['base_url'])}, {literal(row['source_type'])}, "
            f"{int(row['trust_tier'])}, {literal(row['fetch_method'])}, {int(row['schedule_minutes'])}, "
            f"{active}, {literal(parser_config)}::jsonb, {category}, {last_success}, {last_failure}, "
            f"{last_error}, {failure_category}, {consecutive_failures});\n"
            "  ELSE\n"
            "    UPDATE public.news_sources SET\n"
            f"      name = {literal(row['name'])}, base_url = {literal(row['base_url'])}, "
            f"      source_type = {literal(row['source_type'])}, trust_tier = {int(row['trust_tier'])}, "
            f"fetch_method = {literal(row['fetch_method'])}, schedule_minutes = {int(row['schedule_minutes'])}, "
            f"active = {active}, parser_config = {literal(parser_config)}::jsonb, "
            f"category = {category}, "
            f"failure_category = CASE WHEN {failure_category} IS NULL "
            f"THEN news_sources.failure_category ELSE {failure_category} END, "
            f"last_error = CASE WHEN {failure_category} IS NULL "
            f"THEN news_sources.last_error ELSE {last_error} END, "
            f"last_failed_fetch_at = CASE WHEN {failure_category} IS NULL "
            f"THEN news_sources.last_failed_fetch_at ELSE {last_failure} END, "
            f"consecutive_failures = CASE WHEN {failure_category} IS NULL "
            f"THEN news_sources.consecutive_failures "
            f"ELSE greatest(news_sources.consecutive_failures, {consecutive_failures}) END, "
            "updated_at = now()\n"
            "    WHERE id = matched_id;\n"
            "  END IF;\n"
            "END\n"
            "$upsert$;"
        )
    statements.append("COMMIT;")
    return "\n\n".join(statements) + "\n"


async def register_sources_from_json(repository: Repository, json_path: str, activate: bool = False,
                                     sync_active: bool = True,
                                     names: set[str] | None = None) -> list[Source]:
    """Upsert one source per canonical domain, syncing configured activation by default."""
    sources_data = deduplicate_sources(load_source_data(json_path))
    registered_sources: list[Source] = []
    existing_sources = await repository.list_sources()
    for source_data in sources_data:
        if names and source_data["name"] not in names:
            continue
        source_key = canonical_domain(source_data["base_url"])
        matches = [source for source in existing_sources if canonical_domain(source.base_url) == source_key]
        existing = min(matches, key=lambda item: (item.created_at, str(item.id))) if matches else None

        desired_active = bool(source_data.get("active", False))
        active = desired_active if sync_active else (existing.active if existing else activate)
        active = active and source_has_verified_endpoint(source_data)
        values = source_data | {"active": active}
        if existing:
            source_config = dict(source_data.get("parser_config", {}))
            registry_metadata = source_config.pop("registry_metadata", None)
            if source_data["fetch_method"] == "manual" and not source_config.get("urls"):
                values["fetch_method"] = existing.fetch_method
                values["schedule_minutes"] = existing.schedule_minutes
                values["parser_config"] = existing.parser_config
                if registry_metadata:
                    values["parser_config"] = existing.parser_config | {"registry_metadata": registry_metadata}
            values |= {"id": existing.id, "created_at": existing.created_at}
            values |= {
                "last_success_at": existing.last_success_at,
                "last_successful_fetch_at": existing.last_successful_fetch_at,
            }
            if source_data.get("failure_category"):
                values |= {
                    "last_failed_fetch_at": source_data.get("last_failed_fetch_at") or existing.last_failed_fetch_at,
                    "last_error": source_data.get("last_error") or existing.last_error,
                    "failure_category": source_data["failure_category"],
                    "consecutive_failures": max(
                        existing.consecutive_failures, int(source_data.get("consecutive_failures", 0)),
                    ),
                }
            else:
                values |= {
                    "last_failed_fetch_at": existing.last_failed_fetch_at,
                    "last_error": existing.last_error,
                    "failure_category": existing.failure_category,
                    "consecutive_failures": existing.consecutive_failures,
                }

        source = Source(**values)
        registered = await repository.upsert_source(source)
        registered_sources.append(registered)
        existing_sources = [registered if current.id == registered.id else current for current in existing_sources]
    return registered_sources


async def _run(json_path: str, activate: bool, sync_active: bool, names: set[str] | None,
               apply_changes: bool, sql_output: str, audit: bool) -> None:
    if audit:
        if not settings.supabase_configured:
            raise RuntimeError("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required for a production source audit")
        repository = build_repository(settings)
        try:
            result = await audit_source_registry(repository, Path(__file__).resolve().parents[1] / "sources")
            print(json.dumps(result, ensure_ascii=False, indent=2, default=str))
        finally:
            if isinstance(repository, SupabaseNewsRepository):
                await repository.close()
        return

    source_data = deduplicate_sources(load_source_data(json_path))
    source_file = Path(json_path).resolve()
    known_domains = registry_domains(source_file.parent, excluding=source_file)
    selected_sources = [
        source for source in source_data if not names or source["name"] in names
    ]
    for source in selected_sources:
        operation = "UPDATE" if canonical_domain(source["base_url"]) in known_domains else "INSERT"
        requested_active = bool(source.get("active", False)) if sync_active else bool(source.get("active", activate))
        active = requested_active and source_has_verified_endpoint(source)
        print(f"{operation} {canonical_domain(source['base_url'])} "
              f"[{'ACTIVE' if active else 'INACTIVE'}] {source['name']}")

    sql_path = Path(sql_output)
    if not sql_path.is_absolute():
        sql_path = Path(__file__).resolve().parents[1] / sql_path
    sql_path.parent.mkdir(parents=True, exist_ok=True)
    sql_path.write_text(make_upsert_sql(selected_sources), encoding="utf-8")
    print(f"SQL review file: {sql_path}")
    if not apply_changes:
        print(f"Dry run: {len(selected_sources)} unique-domain upserts planned; Supabase was not contacted.")
        return
    if not settings.supabase_configured:
        raise RuntimeError("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required to apply source registrations")

    repository = build_repository(settings)
    try:
        sources = await register_sources_from_json(repository, json_path, activate, sync_active, names)
        print(f"Successfully registered {len(sources)} sources:")
        for source in sources:
            status = "ACTIVE" if source.active else "INACTIVE"
            print(f"  [{status}] {source.name} ({source.source_type}, Tier {source.trust_tier})")
    finally:
        if isinstance(repository, SupabaseNewsRepository):
            await repository.close()


def main() -> None:
    parser = argparse.ArgumentParser(description="Register property news sources by canonical domain.")
    parser.add_argument("--json-path", default="sources/real-estate-source-pool.json",
                        help="Path to JSON file containing source configurations")
    parser.add_argument("--activate", action="store_true", help="Activate sources without configured active values")
    parser.add_argument("--preserve-active", action="store_true",
                        help="Keep existing activation for matched sources instead of syncing JSON active flags")
    parser.add_argument("--apply", action="store_true",
                        help="Write source records to Supabase (default is a local dry run)")
    parser.add_argument("--dry-run", action="store_true",
                        help="Print planned inserts/updates without contacting Supabase")
    parser.add_argument("--audit", action="store_true",
                        help="Read-only comparison of production sources with all local JSON registries")
    parser.add_argument("--sql-output", default="reports/real-estate-source-pool-upsert.sql",
                        help="Path for the review-only SQL upsert file")
    parser.add_argument("--name", action="append", dest="names",
                        help="Limit the operation to an exact source name; repeat for multiple names")
    args = parser.parse_args()
    if args.apply and (args.dry_run or args.audit):
        parser.error("--apply cannot be combined with --dry-run or --audit")
    asyncio.run(_run(
        args.json_path, args.activate, not args.preserve_active,
        set(args.names) if args.names else None, args.apply, args.sql_output, args.audit,
    ))


if __name__ == "__main__":
    main()
