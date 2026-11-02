from __future__ import annotations

import re

from .constants import RegulatoryStatus, RiskLevel


CRITICAL_TERMS = {"unverified", "rumour", "rumor", "fraud", "seized", "seizure", "title cancelled"}
HIGH_TERMS = {"land rate", "land rates", "tax", "taxation", "ownership", "title deed", "eviction", "mortgage", "lease", "compulsory acquisition"}
MEDIUM_TERMS = {"valuation", "planning", "zoning", "permit", "market", "housing", "development"}


def _term_pattern(terms: set[str]) -> re.Pattern[str]:
    # Whole words, plurals included: "lease" matches "leases" but not
    # "release", and "tax" matches "taxes" but not "taxi".
    alternatives = "|".join(re.escape(term) for term in sorted(terms, key=len, reverse=True))
    return re.compile(rf"\b(?:{alternatives})(?:e?s)?\b", re.IGNORECASE)


CRITICAL_PATTERN = _term_pattern(CRITICAL_TERMS)
HIGH_PATTERN = _term_pattern(HIGH_TERMS)
MEDIUM_PATTERN = _term_pattern(MEDIUM_TERMS)


def assess_risk(text: str, regulatory_status: RegulatoryStatus, source_tier: int) -> tuple[RiskLevel, list[str]]:
    reasons: list[str] = []
    if CRITICAL_PATTERN.search(text):
        reasons.append("Contains an unverified or ownership-sensitive claim.")
        return RiskLevel.CRITICAL, reasons
    if HIGH_PATTERN.search(text):
        reasons.append("May affect property, financial, tax, ownership, or legal decisions.")
        return RiskLevel.HIGH, reasons
    if source_tier >= 4:
        reasons.append("Discovery-only source requires corroboration.")
        return RiskLevel.HIGH, reasons
    if MEDIUM_PATTERN.search(text):
        reasons.append("Planning, market, or development information benefits from stronger validation.")
        return RiskLevel.MEDIUM, reasons
    if regulatory_status in {RegulatoryStatus.PROPOSED, RegulatoryStatus.UNDER_CONSIDERATION, RegulatoryStatus.PUBLIC_PARTICIPATION}:
        reasons.append("Policy status must be displayed precisely before publication.")
        return RiskLevel.MEDIUM, reasons
    return RiskLevel.LOW, ["No elevated financial, legal, ownership, or verification signal was detected."]


def allows_auto_publish(risk_level: RiskLevel, source_tier: int, confidence_score: float) -> bool:
    """Only low- and medium-impact stories may bypass editorial review."""
    if source_tier > 2 or confidence_score < 0.70:
        return False
    return risk_level in {RiskLevel.LOW, RiskLevel.MEDIUM}
