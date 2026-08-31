from __future__ import annotations

from .constants import RegulatoryStatus, RiskLevel


CRITICAL_TERMS = {"unverified", "rumour", "rumor", "fraud", "seized", "seizure", "title cancelled"}
HIGH_TERMS = {"land rate", "land rates", "tax", "taxation", "ownership", "title deed", "eviction", "mortgage", "lease", "compulsory acquisition"}
MEDIUM_TERMS = {"valuation", "planning", "zoning", "permit", "market", "housing", "development"}


def assess_risk(text: str, regulatory_status: RegulatoryStatus, source_tier: int) -> tuple[RiskLevel, list[str]]:
    haystack = text.lower()
    reasons: list[str] = []
    if any(term in haystack for term in CRITICAL_TERMS):
        reasons.append("Contains an unverified or ownership-sensitive claim.")
        return RiskLevel.CRITICAL, reasons
    if any(term in haystack for term in HIGH_TERMS):
        reasons.append("May affect property, financial, tax, ownership, or legal decisions.")
        return RiskLevel.HIGH, reasons
    if source_tier >= 4:
        reasons.append("Discovery-only source requires corroboration.")
        return RiskLevel.HIGH, reasons
    if any(term in haystack for term in MEDIUM_TERMS):
        reasons.append("Planning, market, or development information benefits from stronger validation.")
        return RiskLevel.MEDIUM, reasons
    if regulatory_status in {RegulatoryStatus.PROPOSED, RegulatoryStatus.UNDER_CONSIDERATION, RegulatoryStatus.PUBLIC_PARTICIPATION}:
        reasons.append("Policy status must be displayed precisely before publication.")
        return RiskLevel.MEDIUM, reasons
    return RiskLevel.LOW, ["No elevated financial, legal, ownership, or verification signal was detected."]


def allows_auto_publish(risk_level: RiskLevel, source_tier: int, confidence_score: float) -> bool:
    """Risk is impact, not truth. High-impact official and news stories may publish.

    Critical (rumour/fraud/seizure language) still needs review, including from
    tier-1 sources, because those claims can be ownership-sensitive even when the
    rest of the article is genuine.
    """
    if source_tier > 2 or confidence_score < 0.70:
        return False
    return risk_level in {RiskLevel.LOW, RiskLevel.MEDIUM, RiskLevel.HIGH}
