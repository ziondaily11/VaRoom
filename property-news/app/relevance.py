from __future__ import annotations

import re
from urllib.parse import urlparse

# Strict exclusion patterns for topics that NEVER qualify for Property News on their own
EXCLUSION_PATTERNS: tuple[tuple[str, str], ...] = (
    ("IMMIGRATION", r"\b(passports?|visas?|work\s+permits?|deport(?:ed|ation|ing)?|citizenship|foreign\s+nationals?|alien\s+cards?|immigration\s+department)\b"),
    ("GENERAL_POLITICS", r"\b(election|elections|by-election|campaign(?:ing|s)?|political\s+rally|political\s+rallies|rallies|mps?\b|senators?\b|governorship|cabinet\s+secretary|impeachment|political\s+part(?:y|ies)|coalition|uda\b|odm\b|azimio|kenya\s+kwanza|parliamentary\s+vetting)\b"),
    ("GENERAL_CRIME", r"\b(murders?|assassinated|killings?|shot\s+dead|shootout|bandits?|banditry|robber(?:y|ies)|armed\s+robbers?|al-shabaab|terror(?:ism|ist)?|drug\s+trafficking|illicit\s+brew|contraband|smuggling)\b"),
    ("DIPLOMACY", r"\b(embass(?:y|ies)|ambassadors?|consulates?|diplomats?|diplomacy|bilateral\s+talks|un\s+summit|au\s+summit|foreign\s+envoy)\b"),
    ("SPORTS_ENTERTAINMENT", r"\b(football|soccer|premier\s+league|fkf\b|gor\s+mahia|afc\s+leopards|athletics|marathon|olympics?|celebrities|celebrity|musicians?|actors?|actresses?|concerts?|albums?|pageants?|miss\s+kenya)\b"),
    ("GENERAL_ECONOMY", r"\b(fuel\s+prices?|petrol|diesel|epra\s+fuel|shilling\s+falls?|shilling\s+drops?|teachers?\s+strike|doctors?\s+strike|nurses?\s+strike|civil\s+servants?\s+strike|inflation\s+rate\s+rises?)\b"),
)

# Explicit exemptions where crime or politics involves central property events
CRIME_PROPERTY_EXEMPTIONS = re.compile(
    r"\b(land\s+grab(?:bing|s)?|title\s+deed\s+forger(?:y|ies)|land\s+fraud|demolition\s+of\s+(?:illegal\s+)?(?:houses|buildings|structures|homes)|illegal\s+construction|title\s+deed\s+scam)\b",
    re.IGNORECASE,
)

POLITICS_PROPERTY_EXEMPTIONS = re.compile(
    r"\b(housing\s+levy|affordable\s+housing\s+(?:act|bill|programme|fund)|ministry\s+of\s+lands|ardhisasa|land\s+rates\s+(?:bill|act|policy)|national\s+land\s+commission|sectional\s+properties\s+act)\b",
    re.IGNORECASE,
)

# Concrete real-estate/property subject markers (unambiguous property domains)
STRONG_PROPERTY_PATTERNS = re.compile(
    r"\b("
    # Land & Titles
    r"title\s+deeds?|land\s+titles?|titles?\s+cancell(?:ed|ation)|land\s+regist(?:ry|ries|ration)|"
    r"ardhisasa|land\s+rates?|national\s+land\s+commission|\bnlc\b|valuation\s+rolls?|"
    r"parcels?\s+of\s+land|acres?\s+of\s+land|land\s+ownership|land\s+tenure|land\s+conveyanc(?:e|ing)|"
    r"conveyancing|cadastral|sectional\s+propert(?:y|ies)|change\s+of\s+user|"
    r"physical\s+planning|zoning\s+regulations?|zoning\s+polic(?:y|ies)|zoning\s+plans?|"
    r"land\s+demarcation|land\s+adjudication|freehold\s+titles?|freehold|leasehold|"
    r"communal\s+land|ancestral\s+land|land\s+disputes?|land\s+allocations?|land\s+laws?|"
    r"land\s+reforms?|public\s+land|private\s+land|"
    # Housing & Real Estate
    r"real\s+estate|affordable\s+housing|housing\s+polic(?:y|ies)|housing\s+levy|"
    r"housing\s+projects?|housing\s+deficits?|housing\s+units?|housing\s+supply|"
    r"housing\s+developments?|housing\s+schemes?|housing\s+construction|"
    r"gated\s+communit(?:y|ies)|apartments?|condominiums?|residential\s+developments?|"
    r"residential\s+units?|residential\s+homes?|commercial\s+propert(?:y|ies)|commercial\s+real\s+estate|"
    r"office\s+spaces?|industrial\s+parks?|warehousing\s+spaces?|real\s+estate\s+developers?|"
    r"hass\s+propert(?:y|ies)|buyrentkenya|realtors?|estate\s+agents?|"
    # Property General with Property Context
    r"propert(?:y|ies)\s+(?:market|markets|prices?|tax(?:es)?|rates?|update|updates|news|sector|"
    r"developments?|developers?|investment|investments|transfer|transfers|sales?|buyers?|owners?|"
    r"ownership|valuations?|valuers?|regist(?:ry|ries|ration)|management|laws?|regulations?|"
    r"disputes?|rights|transactions?|financing|portfolios?)|"
    r"(?:residential|commercial|industrial|prime|rental)\s+propert(?:y|ies)|"
    # Tenancy & Rentals
    r"landlords?|tenants?|rent\s+restriction\s+tribunal|business\s+premises\s+rent\s+tribunal|"
    r"rent\s+increas(?:e|es|ing)|rental\s+yields?|rental\s+markets?|rental\s+propert(?:y|ies)|"
    r"tenancy\s+agreements?|eviction\s+of\s+tenants?|rent\s+disputes?|"
    # Finance & Taxation
    r"mortgages?|housing\s+finance|kenya\s+mortgage\s+refinance|\bkmrc\b|"
    r"stamp\s+dut(?:y|ies)|capital\s+gains\s+tax\s+on\s+propert(?:y|ies)|"
    r"real\s+estate\s+investment\s+trusts?|\breits?\b|"
    # Construction & Built Environment
    r"construction\s+sectors?|construction\s+industr(?:y|ies)|building\s+codes?|"
    r"building\s+collapse|demolition\s+of\s+(?:houses|buildings|structures|homes)|"
    r"national\s+construction\s+authority|\bnca\s+registration\b|"
    r"building\s+permits?|construction\s+permits?|architectural\s+association\s+of\s+kenya|\bboraqs\b|"
    r"structural\s+safety\s+of\s+buildings?"
    r")\b",
    re.IGNORECASE,
)

# Negative ambiguous word contexts (incidental mentions)
INCIDENTAL_PATTERNS = re.compile(
    r"\b("
    r"plane\s+lands?|landed\s+at\s+airport|lands\s+deal|lands\s+in\s+court|"
    r"lands\s+appointment|lands\s+job|building\s+bridges|building\s+consensus|"
    r"building\s+a\s+team|capacity\s+building|developing\s+story|state\s+house|"
    r"house\s+of\s+parliament|in-house|fourth\s+estate|estate\s+of\s+the\s+late|"
    r"dry\s+land|promised\s+land|never-never\s+land"
    r")\b",
    re.IGNORECASE,
)


def classify_property_relevance(
    title: str,
    url: str = "",
    text: str = "",
    *,
    is_pre_fetch: bool = False,
) -> tuple[bool, str]:
    """Classify whether an article is directly and materially related to property/real estate.

    Enforces the HARD editorial boundary:
    Returns (True, "QUALIFIED_PROPERTY_NEWS") only when property/real estate is the
    central subject of the news story.
    If there is ANY reasonable doubt, returns (False, reason).
    """
    clean_title = " ".join((title or "").split()).strip()
    clean_url = (url or "").strip()
    clean_text = (text or "").strip()

    # Pre-fetch candidate inspection targets title and URL path
    parsed_path = urlparse(clean_url).path if clean_url else ""
    url_slug = re.sub(r"[-_/]+", " ", parsed_path)
    header_content = f"{clean_title} {url_slug}".lower()

    # 1. Check for immediate explicit exclusions on header
    for category, pattern in EXCLUSION_PATTERNS:
        if re.search(pattern, header_content, re.IGNORECASE):
            # Check for property exemptions (e.g. land fraud crime, housing levy politics)
            if category == "GENERAL_CRIME" and CRIME_PROPERTY_EXEMPTIONS.search(header_content):
                continue
            if category == "GENERAL_POLITICS" and POLITICS_PROPERTY_EXEMPTIONS.search(header_content):
                continue
            return False, f"EXCLUDED_{category}"

    # 2. Check for strong property match in title or URL
    has_strong_header_match = bool(STRONG_PROPERTY_PATTERNS.search(header_content))

    if is_pre_fetch:
        # If pre-fetch and snippet available (e.g. from RSS/Atom summary), check snippet too
        if clean_text:
            snippet_lower = clean_text[:1200].lower()
            for category, pattern in EXCLUSION_PATTERNS:
                if re.search(pattern, snippet_lower, re.IGNORECASE):
                    if category == "GENERAL_CRIME" and CRIME_PROPERTY_EXEMPTIONS.search(snippet_lower):
                        continue
                    if category == "GENERAL_POLITICS" and POLITICS_PROPERTY_EXEMPTIONS.search(snippet_lower):
                        continue
                    return False, f"EXCLUDED_{category}_IN_SNIPPET"
            if not has_strong_header_match:
                has_strong_header_match = bool(STRONG_PROPERTY_PATTERNS.search(snippet_lower))

        if not has_strong_header_match:
            # Check if ambiguous words like 'land' or 'building' triggered accidentally
            return False, "NO_CONCRETE_PROPERTY_SUBJECT"

        # Check for obvious incidental expressions in title
        if INCIDENTAL_PATTERNS.search(clean_title):
            return False, "INCIDENTAL_EXPRESSION_IN_TITLE"

        return True, "QUALIFIED_PROPERTY_CANDIDATE"

    # 3. Post-fetch Full-Text Verification
    full_content = f"{clean_title}\n{clean_text}".lower()

    # Check exclusions against full article content if not heavily property-focused
    for category, pattern in EXCLUSION_PATTERNS:
        matches = re.findall(pattern, full_content, re.IGNORECASE)
        if len(matches) >= 3:
            # Overwhelmingly non-property category
            if category == "GENERAL_CRIME" and not CRIME_PROPERTY_EXEMPTIONS.search(full_content):
                return False, f"EXCLUDED_{category}_FULL_TEXT"
            if category == "GENERAL_POLITICS" and not POLITICS_PROPERTY_EXEMPTIONS.search(full_content):
                return False, f"EXCLUDED_{category}_FULL_TEXT"

    # Property markers in full text
    property_matches = STRONG_PROPERTY_PATTERNS.findall(full_content)
    if not property_matches:
        return False, "NO_PROPERTY_SUBJECT_IN_BODY"

    # Check property centrality:
    # Must appear in the first 400 words or have multiple occurrences indicating central topic
    first_400_words = " ".join(full_content.split()[:400])
    has_early_property_presence = bool(STRONG_PROPERTY_PATTERNS.search(first_400_words))

    if not has_early_property_presence and len(property_matches) < 3:
        return False, "PROPERTY_ONLY_INCIDENTAL_IN_BODY"

    # Reject if incidental phrases dominate
    if INCIDENTAL_PATTERNS.search(clean_title) and len(property_matches) < 2:
        return False, "INCIDENTAL_METAPHOR"

    return True, "QUALIFIED_PROPERTY_NEWS"
