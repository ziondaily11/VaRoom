"""Daily health check for Property News (plan Phase 6).

Run once a day by .github/workflows/property-news-daily-check.yml. A failed
run makes GitHub email the repository owner, so this check fails only for
problems that need action, and at most once a day.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any

from .collector import QUARANTINE_AFTER_FAILURES

WINDOW = timedelta(hours=24)
# The collector is started every 30 minutes (48 runs a day); fewer than this
# means the scheduler, its token or GitHub Actions has a problem.
MIN_COLLECTION_RUNS_PER_DAY = 12
PENDING_REVIEW_WARNING_AGE = timedelta(hours=48)


async def daily_health_report(store, ai_provider: str, now: datetime | None = None) -> dict[str, Any]:
    now = now or datetime.now(timezone.utc)
    since = now - WINDOW
    issues: list[str] = []
    notes: list[str] = []

    new_items = await store.count_items_created_since(since)
    if new_items == 0:
        issues.append("No new stories were collected in the last 24 hours.")

    providers = await store.analysis_providers_since(since)
    if ai_provider != "rules" and providers and all(provider == "rules" for provider in providers):
        issues.append(
            f"All {len(providers)} stories analysed in the last 24 hours used the rules fallback, "
            f"not {ai_provider}. Check the AI provider error in the collector logs (\"AI analysis failed\")."
        )

    runs = await store.count_collection_runs_since(since)
    if runs < MIN_COLLECTION_RUNS_PER_DAY:
        issues.append(f"Only {runs} collection runs in the last 24 hours (about 48 expected). "
                      "Check the cron-job.org job and its GitHub token.")

    pending = await store.list_pending_review()
    if pending:
        oldest = min(item.created_at for item in pending)
        age_hours = int((now - oldest).total_seconds() // 3600)
        note = f"{len(pending)} stories are waiting for review; the oldest is {age_hours} hours old."
        if now - oldest > PENDING_REVIEW_WARNING_AGE:
            note += " Tier 3 sources never auto-publish, so these wait for a reviewer."
        notes.append(note)

    quarantined = [source.name for source in await store.list_sources(active_only=True)
                   if source.platform == "web" and source.consecutive_failures >= QUARANTINE_AFTER_FAILURES]
    if quarantined:
        notes.append(f"Quarantined sources (re-checked weekly): {', '.join(sorted(quarantined))}.")

    return {
        "checked_at": now.isoformat(), "healthy": not issues, "issues": issues, "notes": notes,
        "new_items_24h": new_items, "analyses_24h": len(providers),
        "ai_analyses_24h": sum(1 for provider in providers if provider != "rules"),
        "collection_runs_24h": runs, "pending_review": len(pending),
    }


def format_report(report: dict[str, Any]) -> str:
    lines = ["## Property News daily check", "",
             f"- Status: {'healthy' if report['healthy'] else 'needs attention'}",
             f"- New stories (24 h): {report['new_items_24h']}",
             f"- Analyses (24 h): {report['analyses_24h']}, of which by the AI provider: {report['ai_analyses_24h']}",
             f"- Collection runs (24 h): {report['collection_runs_24h']}",
             f"- Waiting for review: {report['pending_review']}"]
    if report["issues"]:
        lines += ["", "### Needs attention", ""] + [f"- {issue}" for issue in report["issues"]]
    if report["notes"]:
        lines += ["", "### Notes", ""] + [f"- {note}" for note in report["notes"]]
    return "\n".join(lines) + "\n"
