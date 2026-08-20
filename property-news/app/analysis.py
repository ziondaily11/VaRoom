from __future__ import annotations

import json
import re
from typing import Protocol

import httpx

from .constants import PROPERTY_CATEGORIES, RegulatoryStatus
from .models import NewsAnalysis, NewsItem, Source
from .risk import assess_risk


KEYWORDS: dict[str, tuple[str, ...]] = {
    "land": ("land", "title deed", "valuation roll", "lease", "parcel"),
    "property": ("property", "real estate", "estate", "rental", "landlord"),
    "housing": ("housing", "affordable housing", "tenant", "residential"),
    "construction": ("construction", "building", "permit", "building code"),
    "development": ("development", "development plan", "infrastructure"),
    "finance": ("mortgage", "property finance", "interest rate", "lending"),
    "taxation": ("land rate", "land rates", "property tax", "ratepayer", "taxation"),
    "law": ("bill", "act", "regulation", "court", "legal notice"),
    "zoning": ("zoning", "zone", "change of user"),
    "planning": ("planning", "public participation", "physical plan"),
    "administration": ("land registry", "land registration", "ministry of lands"),
    "market": ("market report", "house prices", "property prices", "supply", "demand"),
}

KENYAN_COUNTIES = {
    "Nairobi", "Kiambu", "Mombasa", "Nakuru", "Kisumu", "Machakos", "Kajiado", "Uasin Gishu",
    "Nyeri", "Murang'a", "Meru", "Kilifi", "Kakamega", "Kisii", "Kericho", "Laikipia", "Narok",
    "Nyandarua", "Embu", "Bungoma", "Trans Nzoia", "Kwale", "Taita Taveta", "Garissa", "Isiolo",
}
KENYAN_TOWNS = {"Nairobi", "Mombasa", "Nakuru", "Kisumu", "Thika", "Ruiru", "Kiambu", "Eldoret", "Naivasha", "Malindi"}


def _status_from_text(text: str) -> RegulatoryStatus:
    lowered = text.lower()
    rules = (
        (RegulatoryStatus.SUSPENDED, ("suspended", "suspension", "halted")),
        (RegulatoryStatus.REJECTED, ("rejected", "withdrawn", "defeated")),
        # A proposal may mention a prospective effective date. Proposal language
        # takes precedence so VaRoom cannot present it as a current rule.
        (RegulatoryStatus.PROPOSED, ("proposed", "proposes", "proposing", "proposal", "draft bill", "intends to")),
        (RegulatoryStatus.PUBLIC_PARTICIPATION, ("public participation", "public comment", "public hearing")),
        (RegulatoryStatus.UNDER_CONSIDERATION, ("under consideration", "being considered", "committee consideration")),
        (RegulatoryStatus.EFFECTIVE, ("now in effect", "effective from", "comes into force", "commenced")),
        (RegulatoryStatus.ENACTED, ("enacted", "assented", "gazetted as an act")),
        (RegulatoryStatus.AMENDED, ("amended", "amendment")),
        (RegulatoryStatus.APPROVED, ("approved", "adopted", "passed")),
        (RegulatoryStatus.REPORTED, ("reported", "announced", "said")),
    )
    for status, phrases in rules:
        if any(phrase in lowered for phrase in phrases):
            return status
    return RegulatoryStatus.UNKNOWN


def _sentences(text: str) -> list[str]:
    return [sentence.strip() for sentence in re.split(r"(?<=[.!?])\s+", text) if sentence.strip()]


class NewsAnalyzer(Protocol):
    async def analyse(self, item: NewsItem, source: Source) -> NewsAnalysis: ...


class RulesBasedNewsAnalyzer:
    """Conservative fallback used when an approved AI provider is not configured."""

    async def analyse(self, item: NewsItem, source: Source) -> NewsAnalysis:
        text = f"{item.source_title}\n{item.clean_text}"
        lowered = text.lower()
        matches = [category for category, terms in KEYWORDS.items() if any(term in lowered for term in terms)]
        category = matches[0] if matches else None
        relevant = bool(matches)
        counties = [county for county in KENYAN_COUNTIES if county.lower() in lowered]
        towns = [town for town in KENYAN_TOWNS if town.lower() in lowered]
        status = _status_from_text(text)
        facts = [{"statement": sentence} for sentence in _sentences(item.clean_text)
                 if re.search(r"\d|proposed|approved|effective|gazette|rate|tax", sentence, flags=re.I)][:6]
        summary_sentences = _sentences(item.clean_text)[:2]
        summary = " ".join(summary_sentences)[:700] if summary_sentences else None
        risk, reasons = assess_risk(text, status, source.trust_tier)
        confidence = 0.82 if relevant and source.trust_tier <= 2 else (0.62 if relevant else 0.95)
        return NewsAnalysis(
            relevant=relevant, category=category, topics=matches, counties=counties, towns=towns,
            regulatory_status=status, affected_groups=_affected_groups(lowered), key_facts=facts,
            varoom_title=item.source_title if relevant else None, varoom_summary=summary if relevant else None,
            varoom_body=summary if relevant else None, confidence_score=confidence, source_tier=source.trust_tier,
            risk_level=risk, risk_reasons=reasons, model_provider="rules", model_version="rules-v1",
        )


def _affected_groups(text: str) -> list[str]:
    candidates = {
        "property owners": ("owner", "ratepayer"), "landlords": ("landlord",), "tenants": ("tenant",),
        "developers": ("developer",), "home buyers": ("buyer", "purchaser"),
    }
    return [label for label, keywords in candidates.items() if any(keyword in text for keyword in keywords)]


class OpenAICompatibleNewsAnalyzer:
    """Optional strict-schema adapter for an approved OpenAI-compatible endpoint."""

    def __init__(self, base_url: str, api_key: str, model: str) -> None:
        self.base_url, self.api_key, self.model = base_url.rstrip("/"), api_key, model

    async def analyse(self, item: NewsItem, source: Source) -> NewsAnalysis:
        schema = NewsAnalysis.model_json_schema()
        prompt = (
            "You are VaRoom's property-news editor. Return only JSON matching the supplied schema. "
            "Use only source-supported facts. Never state a proposal as approved, enacted, or effective. "
            "Do not give legal or financial advice.\n\n"
            f"Source tier: {source.trust_tier}; source: {source.name}\nTitle: {item.source_title}\n"
            f"Text: {item.clean_text[:12000]}\n\nSchema: {json.dumps(schema)}"
        )
        payload = {"model": self.model, "messages": [{"role": "user", "content": prompt}], "response_format": {"type": "json_object"}}
        headers = {"Authorization": f"Bearer {self.api_key}"}
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(f"{self.base_url}/chat/completions", json=payload, headers=headers)
            response.raise_for_status()
        content = response.json()["choices"][0]["message"]["content"]
        analysis = NewsAnalysis.model_validate_json(content)
        # Deterministic policy is authoritative over model self-assessment.
        risk, reasons = assess_risk(f"{item.source_title}\n{item.clean_text}", analysis.regulatory_status, source.trust_tier)
        return analysis.model_copy(update={"source_tier": source.trust_tier, "risk_level": risk, "risk_reasons": reasons,
                                           "model_provider": "openai-compatible", "model_version": self.model})
