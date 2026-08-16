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
premium status -- this is the first time this service talks to the
database.
"""

import os
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

app = FastAPI(
    title="VaRoom Chatbot Service",
    description="Standalone microservice for the host reply assistant and Elie, the client search assistant.",
    version="0.3.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ============================================================
# Shared: Gemini call
# ============================================================

async def call_gemini(prompt: str) -> Optional[str]:
    """Returns Gemini's raw text response, or None if the call fails."""
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
# /reply -- host-side assistant (unchanged from before)
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
    """Placeholder-turned-real host reply assistant. See module docstring."""
    ai_reply = await generate_ai_reply(payload)
    return ReplyResponse(reply=ai_reply or canned_reply(payload))


# ============================================================
# Elie -- client-side search assistant
# ============================================================

class ElieSearchRequest(BaseModel):
    message: str


class ElieSearchResponse(BaseModel):
    reply: str


async def verify_supabase_user(access_token: str) -> Optional[dict]:
    """
    Confirms the access token actually belongs to a real, currently
    logged-in Supabase user, and returns their user record (id, email)
    if so. Returns None if the token is missing, expired, or invalid.

    This is what stops someone from just claiming to be a premium user —
    they'd need a real, valid session token, which only comes from
    actually being logged in.
    """
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
    """Reads a profile row using the service-role key (bypasses RLS —
    this is a trusted backend call, not something exposed to the caller)."""
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


async def extract_search_intent(message: str) -> dict:
    """
    Uses Gemini to turn a natural-language request into structured
    search filters. Falls back to "no filters" (search everything) if
    the AI call fails or returns something we can't parse — Elie should
    degrade gracefully, not hard-fail, if Gemini has a bad moment.
    """
    prompt = (
        "Extract search filters from this message about finding a place "
        "on VaRoom, a hospitality marketplace. Respond with ONLY a JSON "
        "object, no other text, no markdown formatting, in exactly this "
        "shape:\n"
        '{"category": one of ["airbnb","hotel","venue","office","shop","property"] or null, '
        '"location": a city or area name as a string, or null}\n\n'
        f"Message: {message}"
    )

    raw = await call_gemini(prompt)
    if not raw:
        return {"category": None, "location": None}

    cleaned = raw.strip().strip("`")
    if cleaned.lower().startswith("json"):
        cleaned = cleaned[4:].strip()

    try:
        parsed = json.loads(cleaned)
        category = parsed.get("category")
        if category not in VALID_CATEGORIES:
            category = None
        return {"category": category, "location": parsed.get("location")}
    except Exception:
        return {"category": None, "location": None}


async def search_listings(category: Optional[str], location: Optional[str]) -> list:
    """Searches real listings in Supabase. Read-only, limited to 5 results."""
    if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
        return []

    params = {
        "select": "id,title,description,category,location_text,verified,host_id",
        "limit": "5",
    }
    if category:
        params["category"] = f"eq.{category}"
    if location:
        params["location_text"] = f"ilike.*{location}*"

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


def format_results_reply(listings: list, original_message: str) -> str:
    """
    Turns raw listing rows into a friendly reply. Deliberately does NOT
    mention price or availability as if they were checked — those fields
    don't exist in the database yet, so claiming to have checked them
    would be inventing information.
    """
    if not listings:
        return (
            "I couldn't find any listings matching that right now — "
            "try broadening your search, or check back soon as more spaces get listed."
        )

    lines = [f"Here's what I found for \"{original_message}\":\n"]
    for listing in listings:
        title = listing.get("title", "Untitled listing")
        location = listing.get("location_text", "location not specified")
        verified = listing.get("verified", False)
        badge = " (GPS-verified)" if verified else ""
        lines.append(f"• {title} — {location}{badge}")

    lines.append(
        "\nPrice and availability aren't tracked on VaRoom yet, so I can't "
        "confirm those — you'd need to message the host directly for that."
    )
    return "\n".join(lines)


@app.post("/elie/search", response_model=ElieSearchResponse)
async def elie_search(payload: ElieSearchRequest, authorization: Optional[str] = Header(None)):
    """
    Elie's search endpoint. Requires a real, valid Supabase session token
    in the Authorization header (Bearer <token>) — this identifies who's
    actually asking, so premium status can't be faked by just passing a
    user_id in the request body.
    """
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
    listings = await search_listings(intent.get("category"), intent.get("location"))
    return ElieSearchResponse(reply=format_results_reply(listings, payload.message))


# ============================================================
# Health check
# ============================================================

@app.get("/health")
def health_check():
    """Liveness check, plus a quick look at what's actually configured."""
    return {
        "status": "ok",
        "ai_configured": bool(GEMINI_API_KEY),
        "supabase_configured": bool(SUPABASE_URL and SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY),
    }
