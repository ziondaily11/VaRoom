from __future__ import annotations

import asyncio
import json
import logging
import re
from typing import Protocol

import httpx

from .config import Settings
from .constants import MAX_PROCESSING_ATTEMPTS, PROPERTY_CATEGORIES, RegulatoryStatus
from .models import NewsAnalysis, NewsItem, Source
from .relevance import classify_property_relevance
from .risk import assess_risk
from .quality import EVENT_TERMS

logger = logging.getLogger(__name__)

KEYWORDS: dict[str, tuple[str, ...]] = {
    "land": ("title deed", "valuation roll", "leasehold", "freehold", "parcel of land", "land rates", "land registry", "land dispute", "ardhisasa"),
    "property": ("real estate", "property market", "property price", "property valuation", "rental property", "landlord"),
    "housing": ("affordable housing", "housing levy", "housing project", "housing policy", "residential development", "apartments", "tenant"),
    "construction": ("construction sector", "building code", "building permit", "construction permit", "building collapse", "national construction authority"),
    "development": ("real estate development", "property development", "housing development"),
    "finance": ("mortgage", "housing finance", "kmrc", "property finance", "reit"),
    "taxation": ("land rate", "land rates", "property tax", "stamp duty", "ratepayer"),
    "law": ("sectional properties act", "land act", "physical planning act", "rent restriction tribunal"),
    "zoning": ("zoning", "change of user", "physical planning"),
    "planning": ("physical planning", "urban planning", "zoning regulations"),
    "administration": ("land registry", "land registration", "ministry of lands", "national land commission"),
    "market": ("hass property index", "house prices", "property prices", "rental yields", "property market"),
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


SUMMARY_MAX_LENGTH = 280
# How much of the source article the analyser reads and may republish.
SOURCE_TEXT_LIMIT = 12000
# A model body shorter than this share of the source has dropped part of the story.
MIN_BODY_SHARE = 0.4


def _excerpt(text: str, max_length: int = SUMMARY_MAX_LENGTH) -> str:
    """Shorten text without breaking a word: last whole sentence, else last word + ellipsis."""
    clean = " ".join(text.split())
    if len(clean) <= max_length:
        return clean
    sentence_end = max((match.end() for match in re.finditer(r"[.!?](?=\s|$)", clean[:max_length + 1])), default=0)
    if sentence_end >= max_length * 0.4:
        return clean[:sentence_end]
    cut = clean[:max_length - 1]
    if clean[max_length - 1] != " " and " " in cut:
        cut = cut[:cut.rindex(" ")]
    return cut.rstrip(" ,;:—–-") + "…"


class NewsAnalyzer(Protocol):
    async def analyse(self, item: NewsItem, source: Source) -> NewsAnalysis: ...


def format_location_display(counties: list[str] | None, towns: list[str] | None, max_count: int = 5) -> str:
    """Format location string. If more than max_count locations, summarize to a general term."""
    raw = [value.strip() for value in (counties or []) + (towns or []) if value and value.strip()]
    unique_locations: list[str] = []
    seen = set()
    for loc in raw:
        low = loc.lower()
        if low not in seen:
            seen.add(low)
            unique_locations.append(loc)
    if len(unique_locations) > max_count:
        return "National · Kenya"
    return " · ".join(unique_locations) if unique_locations else "Kenya"


def _editor_prompt(item: NewsItem, source: Source) -> str:
    schema = NewsAnalysis.model_json_schema()
    return (
        "You are VaRoom's property-news editor specializing exclusively in Kenyan real estate, housing, land, and construction.\n"
        "STRICT EDITORIAL BOUNDARY — ZERO SCOPE CREEP:\n"
        "VaRoom's Property News section contains ONLY news directly and materially related to real estate, property, housing, land, construction, development, rentals, mortgages, property finance, property regulation, planning, zoning, valuations, property taxation, or infrastructure directly affecting property development/value in Kenya.\n\n"
        "CRITICAL FILTER (relevant = true OR false):\n"
        "- Set relevant=true ONLY if property/real estate is the CENTRAL subject of the story.\n"
        "- Set relevant=false if property is only mentioned incidentally, secondary, or as a metaphor.\n"
        "- STRICTLY EXCLUDE (set relevant=false):\n"
        "  * General Kenyan politics, elections, politicians, parliamentary debates, party coalitions (unless specifically about land/housing acts or ministry policy).\n"
        "  * General crime, murders, shootings, banditry, terrorism (unless specifically title deed forgery, land grabbing, or building collapse).\n"
        "  * Immigration, visas, passports, foreign nationals.\n"
        "  * Diplomatic disputes, embassies, international relations.\n"
        "  * Sports, entertainment, celebrities, lifestyle.\n"
        "  * General macroeconomic news (fuel prices, inflation, currency, generic strikes).\n"
        "  * General court cases or general business news.\n"
        "- RULE OF REASONABLE DOUBT: If there is ANY reasonable doubt whether a property professional, landlord, developer, or buyer would consider this directly relevant, set relevant=false. Never include borderline articles.\n\n"
        "Editorial Rules when relevant=true:\n"
        "- varoom_summary: a crisp, objective, 1-2 sentence summary (under 280 characters) for the news card, explaining the direct impact on Kenyan property owners, buyers, tenants, or developers.\n"
        "- varoom_body: the COMPLETE story for the article page. It is NOT a summary and must not be shortened. "
        "Retell the whole article in clear, neutral newspaper prose, following the source's order, and keep every fact: "
        "names and roles, figures, amounts, dates, places, background, reactions and next steps. Keep quotations word for word with their speaker. "
        "Leave out only advertising, subscription or paywall prompts, navigation text and links to other stories. "
        "Its length should be close to the article's own length. Separate paragraphs with a blank line; 2-4 sentences each. "
        "Do not open with the summary. No headings, markdown or bullet lists.\n"
        "- Use only source-supported facts. Never invent dates, locations, or regulations.\n"
        "- Accurately detect regulatory status (e.g. proposed, public_participation, approved, enacted, effective). Never state a proposal or draft bill as approved, enacted, or in effect.\n"
        "- Extract specific Kenyan counties and towns mentioned. If the update applies nationally across all of Kenya or has more than 5 locations, identify it as national.\n"
        f"- category must be exactly one of: {', '.join(sorted(PROPERTY_CATEGORIES))}.\n\n"
        f"Source Tier: {source.trust_tier} | Source Name: {source.name}\n"
        f"Source Title: {item.source_title}\n"
        f"Article Content:\n{item.clean_text[:SOURCE_TEXT_LIMIT]}\n\n"
        f"JSON Schema:\n{json.dumps(schema)}"
    )


class RulesBasedNewsAnalyzer:
    """Conservative fallback used when an approved AI provider is not configured."""

    async def analyse(self, item: NewsItem, source: Source) -> NewsAnalysis:
        text = f"{item.source_title}\n{item.clean_text}"
        lowered = text.lower()
        is_relevant, _ = classify_property_relevance(
            item.source_title, item.source_url, item.clean_text, is_pre_fetch=False
        )
        matches = [category for category, terms in KEYWORDS.items() if any(term in lowered for term in terms)]
        relevant = is_relevant
        category = matches[0] if matches else ("property" if is_relevant else None)
        if not relevant:
            matches = []
            category = None
        counties = [county for county in KENYAN_COUNTIES if county.lower() in lowered]
        towns = [town for town in KENYAN_TOWNS if town.lower() in lowered]
        status = _status_from_text(text)
        facts = [{"statement": sentence} for sentence in _sentences(item.clean_text)
                 if re.search(r"\d|proposed|approved|effective|gazette|rate|tax", sentence, flags=re.I)][:6]
        summary_sentences = [
            sentence for sentence in _sentences(item.clean_text)
            if any(term in sentence.lower() for term in EVENT_TERMS)
        ][:2]
        summary = _excerpt(" ".join(summary_sentences)) if summary_sentences else None
        body = item.clean_text[:SOURCE_TEXT_LIMIT].strip() if item.clean_text else None
        risk, reasons = assess_risk(text, status, source.trust_tier)
        confidence = 0.82 if relevant and source.trust_tier <= 2 else (0.62 if relevant else 0.95)
        return NewsAnalysis(
            relevant=relevant, category=category, topics=matches, counties=counties, towns=towns,
            regulatory_status=status, affected_groups=_affected_groups(lowered), key_facts=facts,
            varoom_title=item.source_title if relevant else None, varoom_summary=summary if relevant else None,
            varoom_body=body if relevant else None, confidence_score=confidence, source_tier=source.trust_tier,
            risk_level=risk, risk_reasons=reasons, image_url=item.image_url,
            model_provider="rules", model_version="rules-v1",
        )


def _affected_groups(text: str) -> list[str]:
    candidates = {
        "property owners": ("owner", "ratepayer"), "landlords": ("landlord",), "tenants": ("tenant",),
        "developers": ("developer",), "home buyers": ("buyer", "purchaser"),
    }
    return [label for label, keywords in candidates.items() if any(keyword in text for keyword in keywords)]


def _complete_body(analysis: NewsAnalysis, item: NewsItem) -> str | None:
    """The model's body, unless it has cut the story down: then the source text,
    so the article page never shows a shortened version of the news."""
    source = (item.clean_text or "")[:SOURCE_TEXT_LIMIT].strip()
    body = (analysis.varoom_body or "").strip()
    if not analysis.relevant or len(body) >= MIN_BODY_SHARE * len(source):
        return body or None
    logger.warning("AI body kept %d of %d source characters item_id=%s; using source text", len(body), len(source), item.id)
    return source


class OpenAICompatibleNewsAnalyzer:
    """Optional strict-schema adapter for an approved OpenAI-compatible endpoint."""

    def __init__(self, base_url: str, api_key: str, model: str) -> None:
        self.base_url, self.api_key, self.model = base_url.rstrip("/"), api_key, model
        self._client = httpx.AsyncClient(timeout=90.0, limits=httpx.Limits(max_keepalive_connections=10, max_connections=20))

    async def close(self) -> None:
        await self._client.aclose()

    async def analyse(self, item: NewsItem, source: Source) -> NewsAnalysis:
        prompt = _editor_prompt(item, source)
        payload = {"model": self.model, "messages": [{"role": "user", "content": prompt}], "response_format": {"type": "json_object"}}
        headers = {"Authorization": f"Bearer {self.api_key}"}
        response = await self._client.post(f"{self.base_url}/chat/completions", json=payload, headers=headers)
        response.raise_for_status()
        content = response.json()["choices"][0]["message"]["content"]
        analysis = NewsAnalysis.model_validate_json(content)
        # Deterministic policy is authoritative over model self-assessment.
        risk, reasons = assess_risk(f"{item.source_title}\n{item.clean_text}", analysis.regulatory_status, source.trust_tier)
        return analysis.model_copy(update={"source_tier": source.trust_tier, "risk_level": risk, "risk_reasons": reasons,
                                           "image_url": item.image_url or analysis.image_url,
                                           "varoom_body": _complete_body(analysis, item),
                                           "model_provider": "openai-compatible", "model_version": self.model})


class GeminiNewsAnalyzer:
    """Gemini JSON-mode adapter using VaRoom's existing server-side Gemini credential.

    Tries the configured model, then each fallback model when one is
    overloaded, rate-limited or unavailable (as Elie's chatbot does).
    """

    def __init__(self, api_key: str, model: str, fallback_models: tuple[str, ...] = ()) -> None:
        self.api_key, self.model = api_key, model
        self.models = tuple(dict.fromkeys((model, *fallback_models)))
        self._client = httpx.AsyncClient(timeout=90.0, limits=httpx.Limits(max_keepalive_connections=10, max_connections=20))

    async def close(self) -> None:
        await self._client.aclose()

    async def analyse(self, item: NewsItem, source: Source) -> NewsAnalysis:
        payload = {
            "contents": [{"role": "user", "parts": [{"text": _editor_prompt(item, source)}]}],
            "generationConfig": {"temperature": 0.1, "responseMimeType": "application/json"},
        }
        for index, model in enumerate(self.models):
            url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
            # Header rather than ?key= so the credential never appears in a URL.
            response = await self._client.post(url, headers={"x-goog-api-key": self.api_key}, json=payload)
            if response.status_code in MODEL_FALLBACK_STATUS and index + 1 < len(self.models):
                logger.warning("Gemini model %s returned %d; trying %s", model, response.status_code, self.models[index + 1])
                continue
            response.raise_for_status()
            return self._parse(item, source, response, model)
        raise RuntimeError("No Gemini model configured")

    @staticmethod
    def _parse(item: NewsItem, source: Source, response: httpx.Response, model: str) -> NewsAnalysis:
        candidates = response.json().get("candidates") or []
        parts = candidates[0].get("content", {}).get("parts", []) if candidates else []
        content = "".join(str(part.get("text", "")) for part in parts)
        if not content:
            raise ValueError("Gemini returned no JSON analysis")
        analysis = NewsAnalysis.model_validate_json(content)
        risk, reasons = assess_risk(f"{item.source_title}\n{item.clean_text}", analysis.regulatory_status, source.trust_tier)
        return analysis.model_copy(update={"source_tier": source.trust_tier, "risk_level": risk, "risk_reasons": reasons,
                                           "category": _allowed_category(analysis),
                                           "varoom_body": _complete_body(analysis, item),
                                           "image_url": item.image_url or analysis.image_url,
                                           "model_provider": "gemini", "model_version": model})


def _allowed_category(analysis: NewsAnalysis) -> str | None:
    """news_items only accepts PROPERTY_CATEGORIES; a model's own label
    (e.g. "real estate") would make saving the story fail."""
    if analysis.category in PROPERTY_CATEGORIES:
        return analysis.category
    if analysis.category:
        logger.warning("Gemini returned unsupported category %r; using 'property'", analysis.category)
    return "property" if analysis.relevant else None


RETRYABLE_PROVIDER_STATUS = {429, 500, 502, 503, 504}
# Statuses for which another Gemini model is tried (404: model retired).
MODEL_FALLBACK_STATUS = RETRYABLE_PROVIDER_STATUS | {404}


class ProviderTemporarilyUnavailable(RuntimeError):
    """The AI provider is overloaded or unreachable; retry the item later."""


_GOOGLE_API_KEY_PATTERN = re.compile(r"AIza[0-9A-Za-z_\-]{20,}")


def _provider_error_reason(response: httpx.Response) -> str:
    """The provider's own explanation (e.g. Gemini's error.status and message),
    so a 403 says whether the API is disabled, the key restricted or revoked."""
    try:
        error = response.json().get("error") or {}
        reason = f"{error.get('status', '')}: {error.get('message', '')}".strip(": ")
    except (ValueError, AttributeError):
        reason = response.text
    return _GOOGLE_API_KEY_PATTERN.sub("[redacted]", " ".join(str(reason).split()))[:300] or "unknown"


PROVIDER_RETRY_DELAY_SECONDS = 2.0
PROVIDER_MAX_RETRY_DELAY_SECONDS = 10.0


class FallbackNewsAnalyzer:
    """Uses the AI provider, retrying once on rate limits or server errors.

    A temporary failure (overload, rate limit, network) is handed back to the
    processing queue while the item has attempts left, so it is retried with
    the AI provider later instead of keeping a rules analysis for good. Only
    the last attempt, or a failure that will not go away (bad key, invalid
    JSON), falls back to the rules analyser.
    """

    def __init__(self, primary: NewsAnalyzer, fallback: NewsAnalyzer | None = None,
                 retry_delay_seconds: float = PROVIDER_RETRY_DELAY_SECONDS,
                 max_attempts: int = MAX_PROCESSING_ATTEMPTS) -> None:
        self.primary = primary
        self.fallback = fallback or RulesBasedNewsAnalyzer()
        self.retry_delay_seconds = retry_delay_seconds
        self.max_attempts = max_attempts

    async def close(self) -> None:
        close = getattr(self.primary, "close", None)
        if close:
            await close()

    async def analyse(self, item: NewsItem, source: Source) -> NewsAnalysis:
        temporary = False
        for attempt in range(2):
            try:
                return await self.primary.analyse(item, source)
            except httpx.HTTPStatusError as error:
                status = error.response.status_code
                temporary = status in RETRYABLE_PROVIDER_STATUS
                if attempt == 0 and temporary:
                    await asyncio.sleep(self._retry_delay(error.response))
                    continue
                reason = f"status={status} reason={_provider_error_reason(error.response)}"
                break
            except (httpx.TransportError, ValueError, KeyError, IndexError, TypeError) as error:
                # ValueError covers invalid JSON and schema validation errors.
                temporary = isinstance(error, httpx.TransportError)
                if attempt == 0 and temporary:
                    await asyncio.sleep(self.retry_delay_seconds)
                    continue
                reason = f"error_type={type(error).__name__}"
                break
        if temporary and item.processing_attempts < self.max_attempts:
            logger.warning("AI analysis temporarily unavailable item_id=%s %s; retrying later", item.id, reason)
            raise ProviderTemporarilyUnavailable(reason)
        logger.warning("AI analysis failed item_id=%s %s; using rules fallback", item.id, reason)
        return await self.fallback.analyse(item, source)

    def _retry_delay(self, response: httpx.Response) -> float:
        try:
            delay = float(response.headers.get("retry-after", self.retry_delay_seconds))
        except ValueError:
            delay = self.retry_delay_seconds
        return max(0.0, min(delay, PROVIDER_MAX_RETRY_DELAY_SECONDS))


def build_analyzer(config: Settings) -> NewsAnalyzer:
    if config.ai_provider == "gemini" and config.ai_api_key and config.ai_model:
        fallback_models = (config.ai_fallback_model,) if config.ai_fallback_model else ()
        return FallbackNewsAnalyzer(GeminiNewsAnalyzer(config.ai_api_key, config.ai_model, fallback_models))
    if config.ai_provider == "openai-compatible" and config.ai_base_url and config.ai_api_key and config.ai_model:
        return FallbackNewsAnalyzer(OpenAICompatibleNewsAnalyzer(config.ai_base_url, config.ai_api_key, config.ai_model))
    return RulesBasedNewsAnalyzer()
