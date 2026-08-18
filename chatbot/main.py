"""
VaRoom Chatbot Service.

Standalone microservice, separate from the Node/Express backend in
server/. Hosts two related but independent features:

- POST /reply       - host-side assistant, auto-replies to a client
                       inquiry using whatever listing context is passed
                       in.
- POST /elie/search  - "Elie", the client-side search assistant. Handles
                       both ordinary conversation (greetings, "what can
                       you do") and real listing searches. Search results
                       come back as structured data (not a flat string),
                       so the frontend can render them as real cards,
                       grouped by host, with actual booking links, real
                       prices, sizes, guest capacity, and a photo.

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
from typing import Optional, List
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

# Public bucket - storage_path values from listing_photos can be turned
# straight into public URLs, no signed URLs needed.
LISTING_PHOTOS_BUCKET = "listing-photos"

VALID_CATEGORIES = {"airbnb", "hotel", "venue", "office", "shop", "property"}

CATEGORY_KEYWORDS = {
    "airbnb": "airbnb", "airbnbs": "airbnb",
    "hotel": "hotel", "hotels": "hotel",
    "venue": "venue", "venues": "venue", "event": "venue", "wedding": "venue",
    "office": "office", "offices": "office",
    "shop": "shop", "shops": "shop",
    "property": "property", "land": "property", "house": "property",
}

GREETING_WORDS = {
    "hi", "hey", "hello", "hiya", "yo", "sup", "howdy",
    "hey elie", "hi elie", "hello elie", "morning", "good morning",
    "good afternoon", "good evening", "thanks", "thank you", "ok", "okay",
}

app = FastAPI(
    title="VaRoom Chatbot Service",
    description="Standalone microservice for the host reply assistant and Elie, the client search assistant.",
    version="0.5.0",
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


# ============================================================
# /reply -- host-side assistant (unchanged)
# ============================================================

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
        "a hospitality marketplace. A prospective client sent this message "
        "about a listing. Write a short, friendly reply (2-4 sentences) as "
        "if you were the host. Do not invent specific facts you weren't "
        "given.\n\n"
        f"{context_block}\n\n"
        f"Client's message: {payload.message}"
    )
    return await call_gemini(prompt)


@app.post("/reply", response_model=ReplyResponse)
async def reply(payload: ReplyRequest):
    ai_reply = await generate_ai_reply(payload)
    return ReplyResponse(reply=ai_reply or canned_reply(payload))


# ============================================================
# Elie -- client-side search assistant
# ============================================================

class ElieSearchRequest(BaseModel):
    message: str


class ElieHost(BaseModel):
    id: Optional[str] = None
    full_name: Optional[str] = None
    username: Optional[str] = None
    verified: Optional[bool] = False


class ElieListing(BaseModel):
    id: str
    title: str
    location_text: Optional[str] = None
    category: Optional[str] = None
    verified: Optional[bool] = False
    host: Optional[ElieHost] = None
    # From listing_booking_details - only fields that actually exist on
    # the table. No bedrooms/bathrooms - that column doesn't exist yet,
    # size_or_type (e.g. "Studio", "2BR") is what hosts actually fill in.
    price_amount: Optional[float] = None
    price_unit: Optional[str] = None
    size_or_type: Optional[str] = None
    max_guests: Optional[int] = None
    # From listing_photos - first photo only, turned into a public URL.
    photo_url: Optional[str] = None


class ElieFilters(BaseModel):
    category: Optional[str] = None
    location: Optional[str] = None
    max_price: Optional[float] = None
    guests: Optional[int] = None


class ElieSearchResponse(BaseModel):
    reply: str
    listings: Optional[List[ElieListing]] = None
    filters: Optional[ElieFilters] = None


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
                params={"id": f"eq.{user_id}", "select": "role,elie_premium,city,full_name"},
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
    match = re.search(r"\{.*\}", text, re.DOTALL)
    if not match:
        return None
    try:
        return json.loads(match.group(0))
    except Exception:
        return None


def is_probably_greeting(message: str) -> bool:
    """Cheap, reliable check used as a first pass before ever calling
    Gemini — catches the most common case (a plain greeting) instantly
    and for free, and acts as a safety net if the AI classification call
    below fails entirely."""
    cleaned = message.strip().lower().strip("!.? ")
    if cleaned in GREETING_WORDS:
        return True
    # Very short messages with no digits and none of the category words
    # are almost never real search requests.
    if len(cleaned) <= 20 and not any(k in cleaned for k in CATEGORY_KEYWORDS):
        words = cleaned.split()
        if len(words) <= 3:
            return True
    return False


def extract_price(text: str) -> Optional[float]:
    """Best-effort price extraction for the non-Gemini fallback path.
    Handles '2k', 'ksh 6000', 'under 6,000', plain 4-7 digit numbers."""
    lower = text.lower()

    m = re.search(r'(\d+(?:\.\d+)?)\s*k\b', lower)
    if m:
        return float(m.group(1)) * 1000

    m = re.search(r'(?:ksh?\.?|kes)\s?([\d,]{3,7})', lower)
    if m:
        return float(m.group(1).replace(',', ''))

    m = re.search(r'\b(\d{1,3}(?:,\d{3})+|\d{4,7})\b', lower)
    if m:
        return float(m.group(1).replace(',', ''))

    return None


def extract_guests(text: str) -> Optional[int]:
    """Best-effort guest-count extraction for the non-Gemini fallback path."""
    lower = text.lower()
    m = re.search(r'(\d+)\s*(?:guests?|people|pax|persons?)', lower)
    if m:
        return int(m.group(1))
    return None


async def classify_message(message: str) -> dict:
    """
    Single Gemini call that both classifies the message AND extracts
    search filters when relevant — keeps this to one AI call instead of
    two. Returns:
      {"intent": "chat", "chat_reply": "..."}                    or
      {"intent": "search", "category": ..., "location": ...,
       "max_price": ..., "guests": ...}
    """
    if is_probably_greeting(message):
        return {
            "intent": "chat",
            "chat_reply": (
                "Hey! I'm Elie — I can help you find a place on VaRoom. "
                "Try something like \"Airbnbs in Nairobi\" or \"event venues in Nakuru\"."
            ),
        }

    prompt = (
        "You are Elie, a friendly search assistant on VaRoom, a hospitality "
        "marketplace (Airbnbs, hotels, event venues, offices, shops, and "
        "property listings). Decide whether this message is (a) general "
        "conversation — a greeting, thanks, goodbye, or a question about "
        "what you can do — or (b) an actual request to search for a place.\n\n"
        "Respond with ONLY a JSON object, nothing else, in exactly one of "
        "these two shapes:\n"
        'If general conversation: {"intent": "chat", "chat_reply": a short, '
        'warm, helpful reply (1-3 sentences), as Elie}\n'
        'If a search request: {"intent": "search", "category": one of '
        '["airbnb","hotel","venue","office","shop","property"] or null, '
        '"location": the single city or area name only, or null, '
        '"max_price": a number in Kenyan Shillings if the person gave a '
        'budget or price ceiling (convert "2k" to 2000), or null, '
        '"guests": an integer number of guests/people if mentioned, or null}\n\n'
        f"Message: {message}"
    )

    raw = await call_gemini(prompt)
    parsed = extract_first_json_object(raw) if raw else None

    if parsed and parsed.get("intent") == "chat" and parsed.get("chat_reply"):
        return {"intent": "chat", "chat_reply": parsed["chat_reply"]}

    if parsed and parsed.get("intent") == "search":
        category = parsed.get("category")
        if category not in VALID_CATEGORIES:
            category = None
        return {
            "intent": "search",
            "category": category,
            "location": parsed.get("location"),
            "max_price": parsed.get("max_price"),
            "guests": parsed.get("guests"),
        }

    # Gemini failed or returned something unparseable — fall back to the
    # simple keyword/regex search we had before, treating it as a search intent.
    lower = message.lower()
    category = next((v for k, v in CATEGORY_KEYWORDS.items() if k in lower), None)
    words = message.split()
    location = None
    for i, word in enumerate(words):
        cleaned_word = word.strip(".,!?")
        if i > 0 and cleaned_word[:1].isupper() and cleaned_word.lower() not in CATEGORY_KEYWORDS:
            location = cleaned_word
            break
    return {
        "intent": "search",
        "category": category,
        "location": location,
        "max_price": extract_price(message),
        "guests": extract_guests(message),
    }


def build_word_or_filter(text: str, field: str) -> Optional[str]:
    words = [w.strip(",.") for w in text.split() if len(w.strip(",.")) > 2]
    if not words:
        return None
    conditions = ",".join(f"{field}.ilike.*{w}*" for w in words)
    return f"({conditions})"


def photo_url_from_path(storage_path: Optional[str]) -> Optional[str]:
    if not storage_path or not SUPABASE_URL:
        return None
    return f"{SUPABASE_URL}/storage/v1/object/public/{LISTING_PHOTOS_BUCKET}/{storage_path}"


def reshape_listing(raw: dict) -> dict:
    """Flattens the nested Supabase embed (host / booking_details / photos)
    into the flat shape ElieListing expects."""
    host = raw.get("host") or {}

    booking = raw.get("booking_details")
    if isinstance(booking, list):
        booking = booking[0] if booking else {}
    booking = booking or {}

    photos = raw.get("photos") or []
    first_photo = photos[0] if photos else {}

    return {
        "id": raw.get("id"),
        "title": raw.get("title"),
        "location_text": raw.get("location_text"),
        "category": raw.get("category"),
        "verified": raw.get("verified", False),
        "host": host,
        "price_amount": booking.get("price_amount"),
        "price_unit": booking.get("price_unit"),
        "size_or_type": booking.get("size_or_type"),
        "max_guests": booking.get("max_guests"),
        "photo_url": photo_url_from_path(first_photo.get("storage_path")),
    }


async def search_listings(
    category: Optional[str],
    location: Optional[str],
    raw_message: str,
    max_price: Optional[float] = None,
    guests: Optional[int] = None,
) -> list:
    """
    Searches real listings, GPS-verified first, joined with booking
    details (price, size, guest capacity) and the first listing photo,
    plus host info (name, username, verified) so results can be grouped,
    priced, and linked properly on the frontend.

    booking_details is an !inner join deliberately: a listing with no
    booking details filled in has no price to show, which breaks the
    card design, so it's excluded rather than shown with blank price.
    """
    if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
        return []

    params = {
        "select": (
            "id,title,description,category,location_text,verified,host_id,"
            "host:profiles(full_name,username,verified),"
            "booking_details:listing_booking_details!inner(price_amount,price_unit,size_or_type,max_guests),"
            "photos:listing_photos(storage_path)"
        ),
        "order": "verified.desc",
        "limit": "8",
    }

    if category:
        params["category"] = f"eq.{category}"
    if location:
        location_filter = build_word_or_filter(location, "location_text")
        if location_filter:
            params["or"] = location_filter
    if max_price:
        params["listing_booking_details.price_amount"] = f"lte.{max_price}"
    if guests:
        params["listing_booking_details.max_guests"] = f"gte.{guests}"

    if not category and not location:
        significant_words = [w.strip(".,!?") for w in raw_message.split() if len(w.strip(".,!?")) > 3]
        if significant_words:
            conditions = ",".join(
                f"title.ilike.*{w}*,description.ilike.*{w}*,location_text.ilike.*{w}*"
                for w in significant_words[:3]
            )
            params["or"] = f"({conditions})"
        elif not max_price and not guests:
            return []

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
            return [reshape_listing(row) for row in response.json()]
    except Exception:
        return []


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

    classification = await classify_message(payload.message)

    if classification["intent"] == "chat":
        return ElieSearchResponse(reply=classification["chat_reply"], listings=None)

    category = classification.get("category")
    location = classification.get("location")
    max_price = classification.get("max_price")
    guests = classification.get("guests")

    raw_listings = await search_listings(category, location, payload.message, max_price, guests)

    filters = ElieFilters(category=category, location=location, max_price=max_price, guests=guests)

    if not raw_listings:
        return ElieSearchResponse(
            reply=(
                "I couldn't find any listings matching that right now — "
                "try broadening your search, or check back soon as more spaces get listed."
            ),
            listings=None,
            filters=filters,
        )

    intro = f"Here's what I found for \"{payload.message}\":"
    if not category and not location and not max_price and not guests:
        intro += " (I couldn't pin down exact filters, so these are broader matches.)"

    return ElieSearchResponse(reply=intro, listings=raw_listings, filters=filters)


@app.get("/health")
def health_check():
    return {
        "status": "ok",
        "ai_configured": bool(GEMINI_API_KEY),
        "supabase_configured": bool(SUPABASE_URL and SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY),
    }
