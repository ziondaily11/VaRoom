"""
VaRoom Chatbot Service.

Standalone microservice, separate from the Node/Express backend in
server/. Hosts two related but independent features:

- POST /reply       - host-side assistant, auto-replies to a client
                       inquiry using whatever listing context is passed
                       in. Does NOT touch Supabase or check premium
                       status yet (see README for why).
- POST /elie/search  - "Elie", the client-side search assistant. Takes a
                       natural-language request, searches real listings
                       in Supabase, and returns matches. Gated to clients
                       with profiles.elie_premium = true.

Both use Google's Gemini API (free tier). Elie additionally needs real
(read-only, service-role) Supabase access to search listings and check
premium status.
"""

import os
import re
import json
import httpx
from fastapi import FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional
from dotenv import load_dotenv

load_dotenv()

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
GEMINI_MODEL = "gemini-2.5-flash"
GEMINI_URL = (
    f"https://generativelanguage.googleapis.com/v1beta/models/"
    f"{GEMINI_MODEL}:generateContent"
)

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_ANON_KEY = os.getenv("SUPABASE_ANON_KEY")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

VALID_CATEGORIES = {"airbnb", "hotel", "venue", "office", "shop", "property"}

CATEGORY_KEYWORDS = {
    "airbnb": "airbnb",
    "airbnbs": "airbnb",
    "hotel": "hotel",
    "hotels": "hotel",
    "venue": "venue",
    "venues": "venue",
    "event": "venue",
    "wedding": "venue",
    "office": "office",
    "offices": "office",
    "shop": "shop",
    "shops": "shop",
    "property": "property",
    "land": "property",
    "house": "property",
}

app = FastAPI(
    title="VaRoom Chatbot Service",
    description="Standalone microservice for the host reply assistant and Elie, the client search assistant.",
    version="0.3.2",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


async def call_gemini(prompt: str) -> Optional[str]:
    if not GEMINI_API_KEY:
        return None

    request_body = {"contents": [{"parts": [{"text": prompt}]}]}

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.post(
                GEMINI_URL,
                params={"key": GEMINI_API_KEY},
                json=request_body,
            )
            response.raise_for_status()
            data = response.json()
            return data["candidates"][0]["content"]["parts"][0]["text"].strip()
    except Exception:
        return None


class ReplyRequest(BaseModel):
    message: str
    listing_id: Optional[str] = None
    listing_title: Optional[str] = None
    host_name: Optional[str] = None


class ReplyResponse(BaseModel):
    reply: str


def canned_reply(payload: ReplyRequest) -> str:
    if payload.listing_title:
        return (
            f"Thanks for your interest in {payload.listing_title}! "
            "This is a placeholder auto-reply from VaRoom's chatbot service — "
            "real AI-generated responses are coming soon."
        )
    return (
        "Thanks for reaching out! This is a placeholder auto-reply from "
        "VaRoom's chatbot service — real AI-generated responses are coming soon."
    )


async def generate_ai_reply(payload: ReplyRequest) -> Optional[str]:
    context_lines = []
    if payload.listing_title:
        context_lines.append(f"Listing title: {payload.listing_title}")
    if payload.host_name:
        context_lines.append(f"Host name: {payload.host_name}")
    context_block = "\n".join(context_lines) if context_lines else "No listing context provided."

    prompt = (
        "You are a helpful assistant replying on behalf of a host on VaRoom, "
        "a hospitality marketplace (Airbnbs, hotels, event venues, offices, "
        "shops, and property listings). A prospective client sent this message "
        "about a listing. Write a short, friendly, helpful reply (2-4 sentences) "
        "as if you were the host. Do not invent specific facts (like exact price "
        "or availability dates) that weren't given to you — if you don't know "
        "something, say the host will confirm shortly.\n\n"
        f"{context_block}\n\n"
        f"Client's message: {payload.message}"
    )
    return await call_gemini(prompt)


@app.post("/reply", response_model=ReplyResponse)
async def reply(payload: ReplyRequest):
    ai_reply = await generate_ai_reply(payload)
    return ReplyResponse(reply=ai_reply or canned_reply(payload))


class ElieSearchRequest(BaseModel):
    message: str


class ElieSearchResponse(BaseModel):
    reply: str


async def verify_supabase_user(access_token: str) -> Optional[dict]:
    if not SUPABASE_URL or not SUPABASE_ANON_KEY:
        return None

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(
                f"{SUPABASE_URL}/auth/v1/user",
                headers={
                    "apikey": SUPABASE_ANON_KEY,
                    "Authorization": f"Bearer {access_token}",
                },
            )
            if response.status_code != 200:
                return None
            return response.json()
    except Exception:
        return None


async def get_profile(user_id: str) -> Optional[dict]:
    if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
        return None

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(
                f"{SUPABASE_URL}/rest/v1/profiles",
                params={
                    "id": f"eq.{user_id}",
                    "select": "role,elie_premium,city,full_name",
                },
                headers={
                    "apikey": SUPABASE_SERVICE_ROLE_KEY,
                    "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
                },
            )
            response.raise_for_status()
            rows = response.json()
            return rows[0] if rows else None
    except Exception:
        return None


def extract_first_json_object(text: str) -> Optional[dict]:
    """Pulls the first {...} JSON object out of Gemini's response, no
    matter what text (markdown fences, a preamble sentence) surrounds it."""
    match = re.search(r"\{.*\}", text, re.DOTALL)
    if not match:
        return None
    try:
        return json.loads(match.group(0))
    except Exception:
        return None


def keyword_fallback_intent(message: str) -> dict:
    """Used only if Gemini's call fails entirely or returns nothing
    parseable — a simple keyword match instead of no filtering at all."""
    lower = message.lower()
    category = None
    for keyword, value in CATEGORY_KEYWORDS.items():
        if keyword in lower:
            category = value
            break

    words = message.split()
    location = None
    for i, word in enumerate(words):
        cleaned_word = word.strip(".,!?")
        if i > 0 and cleaned_word[:1].isupper() and cleaned_word.lower() not in CATEGORY_KEYWORDS:
            location = cleaned_word
            break

    return {"category": category, "location": location}


async def extract_search_intent(message: str) -> dict:
    prompt = (
        "Extract search filters from this message about finding a place "
        "on VaRoom, a hospitality marketplace. Respond with ONLY a JSON "
        "object and nothing else — no explanation, no markdown formatting, "
        "no preamble — in exactly this shape:\n"
        '{"category": one of ["airbnb","hotel","venue","office","shop","property"] or null, '
        '"location": the single city or area name only (e.g. "Nairobi", not '
        '"Nairobi, Kenya" or a full address), as a string, or null}\n\n'
        f"Message: {message}"
    )

    raw = await call_gemini(prompt)
    parsed = extract_first_json_object(raw) if raw else None

    if parsed is not None:
        category = parsed.get("category")
        if category not in VALID_CATEGORIES:
            category = None
        return {"category": category, "location": parsed.get("location")}

    return keyword_fallback_intent(message)


def build_word_or_filter(text: str, field: str) -> Optional[str]:
    """
    Builds a PostgREST OR filter matching ANY significant word in `text`
    against `field`. Word-based rather than a single exact-substring match:
    a location like "Nairobi, Kenya" extracted by Gemini should still
    correctly match a listing stored as "Kilimani, Nairobi", since they
    share the word "Nairobi". A single strict substring match would miss
    that entirely and under-return valid results.
    """
    words = [w.strip(",.") for w in text.split() if len(w.strip(",.")) > 2]
    if not words:
        return None
    conditions = ",".join(f"{field}.ilike.*{w}*" for w in words)
    return f"({conditions})"


async def search_listings(category: Optional[str], location: Optional[str], raw_message: str) -> list:
    """
    Searches real listings in Supabase, read-only, limited to 5 results,
    GPS-verified listings surfaced first. category (when present) is a
    strict, exact match. location (when present) uses word-based OR
    matching, not a single exact-substring match, so slightly different
    phrasing doesn't cause valid matches to be missed. If NEITHER category
    nor location could be determined at all, falls back to a broad keyword
    search using the raw message instead of an unfiltered "return
    everything" query.
    """
    if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
        return []

    params = {
        "select": "id,title,description,category,location_text,verified,host_id",
        "order": "verified.desc",
        "limit": "5",
    }

    if category:
        params["category"] = f"eq.{category}"

    if location:
        location_filter = build_word_or_filter(location, "location_text")
        if location_filter:
            params["or"] = location_filter

    if not category and not location:
        significant_words = [w.strip(".,!?") for w in raw_message.split() if len(w.strip(".,!?")) > 3]
        if not significant_words:
            return []
        conditions = ",".join(
            f"title.ilike.*{w}*,description.ilike.*{w}*,location_text.ilike.*{w}*"
            for w in significant_words[:3]
        )
        params["or"] = f"({conditions})"

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(
                f"{SUPABASE_URL}/rest/v1/listings",
                params=params,
                headers={
                    "apikey": SUPABASE_SERVICE_ROLE_KEY,
                    "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
                },
            )
            response.raise_for_status()
            return response.json()
    except Exception:
        return []


def format_results_reply(listings: list, original_message: str, category: Optional[str], location: Optional[str]) -> str:
    if not listings:
        return (
            "I couldn't find any listings matching that right now — "
            "try broadening your search, or check back soon as more spaces get listed."
        )

    lines = [f"Here's what I found for \"{original_message}\":\n"]
    for listing in listings:
        title = listing.get("title", "Untitled listing")
        loc = listing.get("location_text", "location not specified")
        verified = listing.get("verified", False)
        badge = " (GPS-verified)" if verified else ""
        lines.append(f"• {title} — {loc}{badge}")

    if not category and not location:
        lines.append(
            "\n(I couldn't pin down an exact category or location from your message, "
            "so these are broader matches — try being more specific, e.g. "
            "\"Airbnbs in Nairobi\", for tighter results.)"
        )

    lines.append(
        "\nPrice and availability aren't tracked on VaRoom yet, so I can't "
        "confirm those — you'd need to message the host directly for that."
    )
    return "\n".join(lines)


@app.post("/elie/search", response_model=ElieSearchResponse)
async def elie_search(payload: ElieSearchRequest, authorization: Optional[str] = Header(None)):
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid Authorization header.")

    token = authorization.split(" ", 1)[1]
    user = await verify_supabase_user(token)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid or expired session — please log in again.")

    profile = await get_profile(user["id"])
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found for this account.")

    if profile.get("role") != "client":
        return ElieSearchResponse(reply="Elie is available on client accounts only.")

    if not profile.get("elie_premium"):
        return ElieSearchResponse(
            reply="Elie is a premium feature — upgrade your VaRoom account to search with Elie."
        )

    intent = await extract_search_intent(payload.message)
    category = intent.get("category")
    location = intent.get("location")

    listings = await search_listings(category, location, payload.message)
    return ElieSearchResponse(reply=format_results_reply(listings, payload.message, category, location))


@app.get("/health")
def health_check():
    return {
        "status": "ok",
        "ai_configured": bool(GEMINI_API_KEY),
        "supabase_configured": bool(SUPABASE_URL and SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY),
    }
