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
import random
import httpx
from datetime import datetime, timezone
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

FAREWELL_WORDS = {
    "bye", "goodbye", "good bye", "see you", "see ya", "later",
    "cya", "farewell", "night", "good night",
}

# Varied first-contact replies so Elie doesn't sound like a canned bot
# repeating itself every time. Picked at random on greetings.
GREETING_REPLIES = [
    "Hey! I'm Elie — tell me what kind of space you're after and I'll dig through VaRoom for you.",
    "Hi there! Looking for a place to stay, host an event, or set up shop? Just describe it and I'll get searching.",
    "Hey, good to see you. Give me a location or vibe you're after — \"Airbnbs in Nairobi\", \"venues in Nakuru\" — and I'll take it from there.",
    "Hello! I'm Elie, your VaRoom search buddy. What are you hunting for today?",
    "Hey! No need to scroll and filter — just tell me what you need and where, and I'll bring back real listings.",
    "Hi! Ready when you are — describe the space you want and I'll go find it.",
]

FAREWELL_REPLIES = [
    "Bye for now — come find me whenever you're ready to search again.",
    "Take care! I'll be here when you need to find another space.",
    "See you around — good luck with the search!",
    "Later! Ping me anytime you want to look for something new.",
    "Bye! Hope you find exactly what you're looking for.",
]

# Follow-up nudges shown after a successful search, so results don't just
# end abruptly — varied on purpose.
SEARCH_FOLLOWUPS = [
    "Want me to narrow this down by price or number of guests?",
    "If none of these quite fit, tell me what to change and I'll try again.",
    "Say the word if you want me to check a different area too.",
    "I can filter further — just tell me what's off about these.",
    "Let me know if you'd like something bigger, cheaper, or closer to town.",
]

# Used only when Gemini is unreachable AND the message doesn't look like
# a search — a generic but still varied conversational reply so Elie
# never resorts to "couldn't find any listings" for plain chit-chat.
CHAT_FALLBACK_REPLIES = [
    "I'm here — tell me what kind of space you're looking for and I'll go find it.",
    "Happy to help! Describe the place you need (like \"Airbnbs in Nairobi\") and I'll search.",
    "I'm Elie, your VaRoom search assistant — give me a location or type of space and I'll get started.",
]

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
# /reply -- host-side assistant. Steps in only when the host has
# switched "Away mode" on, grounded in the listing's real price/size/
# guest data so it doesn't invent numbers, and posts the reply as a
# real message (marked is_auto_reply) so it's honest about what it is.
# ============================================================

class ReplyRequest(BaseModel):
    conversation_id: str
    listing_id: str
    message: str


class ReplyResponse(BaseModel):
    reply: str
    skipped: bool = False  # true when the host isn't away — nothing was posted


def format_listing_facts(ctx: Optional[dict]) -> str:
    if not ctx:
        return "No verified listing details are available — do not state any specific price, size, or policy."

    lines = []
    if ctx.get("title"):
        lines.append(f"Listing: {ctx['title']}")
    if ctx.get("location_text"):
        lines.append(f"Location: {ctx['location_text']}")
    if ctx.get("size_or_type"):
        lines.append(f"Size/type: {ctx['size_or_type']}")
    if ctx.get("max_guests"):
        lines.append(f"Max guests: {ctx['max_guests']}")
    if ctx.get("price_amount") is not None:
        unit = ctx.get("price_unit") or "night"
        lines.append(f"Price: KSh {ctx['price_amount']} per {unit}")
    if ctx.get("cleaning_fee"):
        lines.append(f"Cleaning fee: KSh {ctx['cleaning_fee']}")
    if ctx.get("min_stay_nights"):
        lines.append(f"Minimum stay: {ctx['min_stay_nights']} night(s)")
    if ctx.get("checkin_time"):
        lines.append(f"Check-in: {ctx['checkin_time']}")
    if ctx.get("checkout_time"):
        lines.append(f"Check-out: {ctx['checkout_time']}")
    if ctx.get("cancellation_policy"):
        lines.append(f"Cancellation policy: {ctx['cancellation_policy']}")
    if ctx.get("description"):
        lines.append(f"Description: {ctx['description']}")

    return "\n".join(lines) if lines else "No verified listing details are available — do not state any specific price, size, or policy."


def canned_reply(ctx: Optional[dict]) -> str:
    title = ctx.get("title") if ctx else None
    if title:
        return (
            f"Thanks for your interest in {title}! The host is away right now but will "
            "get back to you personally as soon as they're able to."
        )
    return "Thanks for reaching out! The host is away right now but will get back to you personally as soon as they're able to."


async def generate_ai_reply(message: str, listing_ctx: Optional[dict]) -> Optional[str]:
    facts = format_listing_facts(listing_ctx)
    prompt = (
        "You are standing in for a VaRoom host who is currently away, replying to a "
        "prospective guest's message on their behalf. Write a short, warm, human reply "
        "(2-4 sentences), as if you were the host texting back. Use ONLY the verified "
        "facts below — never invent a price, date, amenity, or policy that isn't listed. "
        "If the guest asks about something not covered by these facts, say the host will "
        "confirm that personally rather than guessing.\n\n"
        f"Verified listing facts:\n{facts}\n\n"
        f"Guest's message: {message}"
    )
    return await call_gemini(prompt)


@app.post("/reply", response_model=ReplyResponse)
async def reply(payload: ReplyRequest, authorization: Optional[str] = Header(None)):
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid Authorization header.")

    token = authorization.split(" ", 1)[1]
    user = await verify_supabase_user(token)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid or expired session — please log in again.")

    conversation = await get_conversation(payload.conversation_id)
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found.")

    if user["id"] not in (conversation.get("host_id"), conversation.get("client_id")):
        raise HTTPException(status_code=403, detail="You're not a participant in this conversation.")

    host_profile = await get_profile(conversation["host_id"])
    if not host_profile or not host_profile.get("away_mode"):
        # Host isn't away — Elie has no business answering on their behalf.
        return ReplyResponse(reply="", skipped=True)

    listing_ctx = await get_listing_context(payload.listing_id)
    ai_reply = await generate_ai_reply(payload.message, listing_ctx)
    reply_text = ai_reply or canned_reply(listing_ctx)

    inserted = await insert_auto_reply(payload.conversation_id, conversation["host_id"], reply_text)
    if inserted:
        await touch_conversation(payload.conversation_id)

    return ReplyResponse(reply=reply_text, skipped=False)


# ============================================================
# Elie -- client-side search assistant
# ============================================================

class ElieHistoryTurn(BaseModel):
    role: str  # "user" or "elie"
    text: str


class ElieSearchRequest(BaseModel):
    message: str
    history: Optional[List[ElieHistoryTurn]] = None


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
    suggestion: Optional[str] = None


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
    headers = {
        "apikey": SUPABASE_SERVICE_ROLE_KEY,
        "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
    }
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(
                f"{SUPABASE_URL}/rest/v1/profiles",
                params={"id": f"eq.{user_id}", "select": "role,elie_premium,city,full_name,away_mode"},
                headers=headers,
            )
            response.raise_for_status()
            rows = response.json()
            return rows[0] if rows else None
    except Exception:
        pass

    # away_mode may not exist on profiles yet (pending Supabase migration) —
    # retry without it so search/profile lookups can never be broken by that.
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(
                f"{SUPABASE_URL}/rest/v1/profiles",
                params={"id": f"eq.{user_id}", "select": "role,elie_premium,city,full_name"},
                headers=headers,
            )
            response.raise_for_status()
            rows = response.json()
            if not rows:
                return None
            row = rows[0]
            row["away_mode"] = False
            return row
    except Exception:
        return None


async def get_conversation(conversation_id: str) -> Optional[dict]:
    if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
        return None
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(
                f"{SUPABASE_URL}/rest/v1/conversations",
                params={"id": f"eq.{conversation_id}", "select": "id,host_id,client_id,listing_id"},
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


async def get_listing_context(listing_id: str) -> Optional[dict]:
    """Pulls real, verified facts about a listing (price, size, guest
    capacity, policies) so the host auto-reply can answer accurately
    instead of guessing — mirrors the grounding used for Elie's search."""
    if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
        return None
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(
                f"{SUPABASE_URL}/rest/v1/listings",
                params={
                    "id": f"eq.{listing_id}",
                    "select": (
                        "title,description,location_text,category,"
                        "booking_details:listing_booking_details(price_amount,price_unit,"
                        "size_or_type,max_guests,cleaning_fee,min_stay_nights,"
                        "checkin_time,checkout_time,cancellation_policy)"
                    ),
                },
                headers={
                    "apikey": SUPABASE_SERVICE_ROLE_KEY,
                    "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
                },
            )
            response.raise_for_status()
            rows = response.json()
            if not rows:
                return None
            row = rows[0]
            booking = row.get("booking_details")
            if isinstance(booking, list):
                booking = booking[0] if booking else {}
            booking = booking or {}
            return {
                "title": row.get("title"),
                "description": row.get("description"),
                "location_text": row.get("location_text"),
                "category": row.get("category"),
                "price_amount": booking.get("price_amount"),
                "price_unit": booking.get("price_unit"),
                "size_or_type": booking.get("size_or_type"),
                "max_guests": booking.get("max_guests"),
                "cleaning_fee": booking.get("cleaning_fee"),
                "min_stay_nights": booking.get("min_stay_nights"),
                "checkin_time": booking.get("checkin_time"),
                "checkout_time": booking.get("checkout_time"),
                "cancellation_policy": booking.get("cancellation_policy"),
            }
    except Exception:
        return None


async def insert_auto_reply(conversation_id: str, host_id: str, body: str) -> Optional[dict]:
    """Inserts the AI-generated reply directly as a real message row, sent
    via the service role key (bypassing RLS) so it can be attributed to
    the host even though the host isn't the one calling this endpoint.
    Marked is_auto_reply=true so the frontend can label it honestly."""
    if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
        return None
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.post(
                f"{SUPABASE_URL}/rest/v1/messages",
                params={"select": "id,conversation_id,sender_id,body,created_at"},
                json={
                    "conversation_id": conversation_id,
                    "sender_id": host_id,
                    "body": body,
                    "is_auto_reply": True,
                },
                headers={
                    "apikey": SUPABASE_SERVICE_ROLE_KEY,
                    "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
                    "Content-Type": "application/json",
                    "Prefer": "return=representation",
                },
            )
            response.raise_for_status()
            rows = response.json()
            return rows[0] if rows else None
    except Exception:
        return None


async def touch_conversation(conversation_id: str) -> None:
    if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
        return
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            await client.patch(
                f"{SUPABASE_URL}/rest/v1/conversations",
                params={"id": f"eq.{conversation_id}"},
                json={"last_message_at": datetime.now(timezone.utc).isoformat()},
                headers={
                    "apikey": SUPABASE_SERVICE_ROLE_KEY,
                    "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
                    "Content-Type": "application/json",
                },
            )
    except Exception:
        pass


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


def is_probably_farewell(message: str) -> bool:
    """Same idea as is_probably_greeting, but for sign-offs — checked
    first so 'good bye elie' etc. gets a farewell reply, not a generic
    greeting reply."""
    cleaned = message.strip().lower().strip("!.? ")
    return any(word in cleaned for word in FAREWELL_WORDS)


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


async def classify_message(message: str, history: Optional[List[dict]] = None) -> dict:
    """
    Single Gemini call that both classifies the message AND extracts
    search filters when relevant — keeps this to one AI call instead of
    two. Returns:
      {"intent": "chat", "chat_reply": "..."}                    or
      {"intent": "search", "category": ..., "location": ...,
       "max_price": ..., "guests": ...}

    `history` is a short list of recent {"role": "user"|"elie", "text": ...}
    turns. It matters a lot: without it, a reply like "yeah" or "am good
    thanks" — which only makes sense as a response to Elie's own last
    question — gets misread as a fresh, context-free message. The cheap
    greeting/farewell fast paths below are skipped once there's real
    history, since "short message" stops being a reliable greeting signal
    mid-conversation.
    """
    has_history = bool(history)

    if not has_history and is_probably_farewell(message):
        return {"intent": "chat", "chat_reply": random.choice(FAREWELL_REPLIES)}

    if not has_history and is_probably_greeting(message):
        return {"intent": "chat", "chat_reply": random.choice(GREETING_REPLIES)}

    history_block = ""
    if has_history:
        lines = []
        for turn in history[-6:]:
            speaker = "Elie" if turn.get("role") == "elie" else "Guest"
            lines.append(f"{speaker}: {turn.get('text', '')}")
        history_block = "Recent conversation so far:\n" + "\n".join(lines) + "\n\n"

    prompt = (
        "You are Elie, a friendly search assistant on VaRoom, a hospitality "
        "marketplace (Airbnbs, hotels, event venues, offices, shops, and "
        "property listings).\n\n"
        f"{history_block}"
        "Decide whether the guest's LATEST message is (a) general "
        "conversation — a greeting, thanks, goodbye, a short reply/"
        "acknowledgment to what Elie just said (like \"yeah\", \"sure\", "
        "\"no thanks\", \"am good\"), a question about what you can do, "
        "small talk (\"how are you\", \"are you a real person\"), or "
        "literally anything that isn't a description of a place to search "
        "for — or (b) an actual request to search for a place (new "
        "criteria, a location, a category, a budget, etc). When in doubt, "
        "prefer (a): it's much better to chat naturally than to force an "
        "unrelated message into a doomed search. If the recent conversation "
        "shows Elie just asked a question and the guest's latest message "
        "is a short reply to it rather than a new place description, treat "
        "it as general conversation and respond naturally in context — "
        "don't force it into a search.\n\n"
        "Respond with ONLY a JSON object, nothing else, in exactly one of "
        "these two shapes:\n"
        'If general conversation: {"intent": "chat", "chat_reply": a short, '
        'warm reply (1-3 sentences), as Elie — write like a real person '
        'texting, casual and varied, never stiff or repetitive, no corporate '
        'phrasing, and stay coherent with what was just said}\n'
        'If a search request: {"intent": "search", "category": one of '
        '["airbnb","hotel","venue","office","shop","property"] or null, '
        '"location": the single city or area name only, or null, '
        '"max_price": a number in Kenyan Shillings if the person gave a '
        'budget or price ceiling (convert "2k" to 2000), or null, '
        '"guests": an integer number of guests/people if mentioned, or null}\n\n'
        f"Guest's latest message: {message}"
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

    # Gemini failed or returned something unparseable. Don't blindly treat
    # this as a search — that's exactly what used to turn ordinary
    # chit-chat into a "couldn't find any listings" response. Only fall
    # back to search when there's an actual signal to search on.
    if has_history and is_probably_greeting(message):
        return {"intent": "chat", "chat_reply": "Sounds good! Let me know if you want to search for something else."}

    lower = message.lower()
    category = next((v for k, v in CATEGORY_KEYWORDS.items() if k in lower), None)
    words = message.split()
    location = None
    for i, word in enumerate(words):
        cleaned_word = word.strip(".,!?")
        if i > 0 and cleaned_word[:1].isupper() and cleaned_word.lower() not in CATEGORY_KEYWORDS:
            location = cleaned_word
            break
    max_price = extract_price(message)
    guests = extract_guests(message)

    has_search_signal = bool(category or location or max_price or guests)
    if not has_search_signal:
        return {"intent": "chat", "chat_reply": random.choice(CHAT_FALLBACK_REPLIES)}

    return {
        "intent": "search",
        "category": category,
        "location": location,
        "max_price": max_price,
        "guests": guests,
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

    history_dicts = [{"role": t.role, "text": t.text} for t in payload.history] if payload.history else None
    classification = await classify_message(payload.message, history_dicts)

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

    return ElieSearchResponse(
        reply=intro,
        listings=raw_listings,
        filters=filters,
        suggestion=random.choice(SEARCH_FOLLOWUPS),
    )


@app.get("/health")
def health_check():
    return {
        "status": "ok",
        "ai_configured": bool(GEMINI_API_KEY),
        "supabase_configured": bool(SUPABASE_URL and SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY),
    }
