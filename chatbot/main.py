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
import sys
import re
import json
import asyncio
import logging
import httpx
from pathlib import Path
from datetime import datetime, timezone, date, timedelta
from fastapi import FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, List
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger("varoom.elie")
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
GEMINI_MODEL = (os.getenv("GEMINI_MODEL") or "gemini-2.5-flash").strip()
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


class ElieGenerationError(RuntimeError):
    """Raised when Gemini cannot produce the response Elie needs."""


async def call_gemini(prompt: str, max_attempts: int = 3) -> Optional[str]:
    if not GEMINI_API_KEY:
        logger.error("Gemini request skipped: GEMINI_API_KEY is not configured")
        return None

    request_body = {"contents": [{"parts": [{"text": prompt}]}]}
    backoff_seconds = [0.5, 1.5]  # between attempts 1->2 and 2->3

    for attempt in range(max_attempts):
        try:
            async with httpx.AsyncClient(timeout=20.0) as client:
                response = await client.post(
                    GEMINI_URL,
                    params={"key": GEMINI_API_KEY},
                    json=request_body,
                )
                response.raise_for_status()
                data = response.json()
                candidates = data.get("candidates") or []
                if not candidates:
                    logger.error(
                        "Gemini returned no candidates (model=%s, prompt_feedback=%s)",
                        GEMINI_MODEL,
                        data.get("promptFeedback"),
                    )
                    return None

                candidate = candidates[0]
                parts = (candidate.get("content") or {}).get("parts") or []
                text = "".join(
                    part.get("text", "")
                    for part in parts
                    if isinstance(part, dict)
                ).strip()
                if not text:
                    logger.error(
                        "Gemini returned an empty candidate (model=%s, finish_reason=%s, safety_ratings=%s)",
                        GEMINI_MODEL,
                        candidate.get("finishReason"),
                        candidate.get("safetyRatings"),
                    )
                    return None
                return text

        except httpx.HTTPStatusError as e:
            status = e.response.status_code
            # 4xx (bad key, bad request, quota exhausted) won't fix itself
            # on retry — fail fast instead of wasting the user's wait time.
            if 400 <= status < 500:
                logger.error(
                    "Gemini request rejected (model=%s, status=%s, body=%s)",
                    GEMINI_MODEL,
                    status,
                    e.response.text[:500],
                )
                return None
            logger.warning(
                "Gemini server error (model=%s, status=%s, attempt=%s/%s)",
                GEMINI_MODEL,
                status,
                attempt + 1,
                max_attempts,
            )

        except (httpx.TimeoutException, httpx.TransportError) as e:
            logger.warning(
                "Gemini network/timeout (model=%s, attempt=%s/%s, error=%s)",
                GEMINI_MODEL,
                attempt + 1,
                max_attempts,
                type(e).__name__,
            )

        except Exception as e:
            logger.exception(
                "Unexpected Gemini response failure (model=%s, error=%s)",
                GEMINI_MODEL,
                type(e).__name__,
            )

        if attempt < max_attempts - 1:
            await asyncio.sleep(backoff_seconds[attempt])

    logger.error("Gemini request failed after %s attempts (model=%s)", max_attempts, GEMINI_MODEL)
    return None


# ============================================================
# /reply -- host-side assistant. It supports both Away mode and the host's
# explicit @reply command, grounded in verified conversation/listing data.
# Replies are posted as real messages marked is_auto_reply.
# ============================================================

class ReplyRequest(BaseModel):
    conversation_id: str
    listing_id: Optional[str] = None
    message: Optional[str] = None
    command: Optional[str] = None


class ReplyResponse(BaseModel):
    reply: str
    skipped: bool = False  # true when the host isn't away — nothing was posted
    message: Optional[dict] = None
    messages: Optional[List[dict]] = None


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
    amenities = ctx.get("amenities") or []
    if amenities:
        lines.append(f"Amenities: {', '.join(str(item) for item in amenities)}")

    return "\n".join(lines) if lines else "No verified listing details are available — do not state any specific price, size, or policy."


def normalize_amenities(value) -> list:
    if isinstance(value, list):
        return [str(item).strip() for item in value if str(item).strip()]
    if isinstance(value, str):
        try:
            parsed = json.loads(value)
        except json.JSONDecodeError:
            parsed = None
        if isinstance(parsed, list):
            return [str(item).strip() for item in parsed if str(item).strip()]
        return [item.strip() for item in value.split(",") if item.strip()]
    return []


def is_listing_alternative_request(message: str) -> bool:
    text = message.lower()
    return bool(re.search(
        r"\b(?:cheaper|affordable|lower[- ]priced|less expensive|"
        r"alternative|alternatives|other options|more options|another option|"
        r"different option|similar options|other airbnbs?|other listings?)\b|"
        r"\b(?:share|show|send).{0,40}\b(?:listings?|options?|airbnbs?)\b",
        text,
    ))


async def generate_ai_reply(
    message: str,
    listing_ctx: Optional[dict],
    history_block: str = "",
    elie_command: bool = False,
) -> Optional[dict]:
    """Returns {"reply": str, "booking_start_date": "YYYY-MM-DD" or None,
    "nights": int or None} — or None if Gemini is unreachable. Booking
    fields are only meaningful when the listing prices per night; other
    pricing types (hourly, lease) aren't handled by this yet."""
    facts = format_listing_facts(listing_ctx)
    today = datetime.now(timezone.utc).date().isoformat()
    prompt = (
        (
            "You are Elie, VaRoom's AI assistant, replying directly to the guest on "
            "the host's behalf. "
            if elie_command
            else "You are standing in for a VaRoom host who is currently away, replying to a "
            "prospective guest's message on their behalf. "
        )
        + f"Today's date is {today}.\n\n"
        "This is a text conversation, not a listing description — keep it SHORT. "
        "Match the guest's tone: a casual \"hi\" or \"let's book it\" gets a short, "
        "casual reply, not a recap of every fact. Only state the specific facts the "
        "guest is actually asking about right now — don't repeat information you "
        "(the host) already gave earlier in this conversation (see below) unless "
        "they're asking again. One or two sentences is usually enough; only go "
        "longer if the guest asked several distinct questions at once. Use ONLY "
        "the verified facts below — never invent a price, date, amenity, or policy "
        "that isn't listed. If asked something not covered, say the host will "
        "confirm that personally rather than guessing.\n\n"
        "If the guest clearly COMMITS to a specific check-in date and length of "
        "stay in nights (not just asking whether dates are free, but actually "
        "saying when they want to arrive and for how long), extract it so a real "
        "booking request can be created for the host to approve. Convert relative "
        "dates (\"25th of this month\", \"next Friday\", \"tomorrow\") into an "
        "absolute date using today's date above. Only do this when the listing "
        "prices per night (see facts). If you extract dates, phrase your reply as "
        "confirming you've sent the request to the host for approval — briefly, "
        "don't re-list every fact again. If the guest is only asking about "
        "availability/price with no firm commitment, leave the date fields null.\n\n"
        f"{history_block}"
        f"Verified listing facts:\n{facts}\n\n"
        f"Guest's latest message: {message}\n\n"
        "Respond with ONLY a JSON object, nothing else:\n"
        '{"reply": your short reply text as described above, '
        '"booking_start_date": "YYYY-MM-DD" or null, "nights": integer or null}'
    )
    raw = await call_gemini(prompt)
    if not raw:
        return None
    parsed = extract_first_json_object(raw)
    if not parsed or not parsed.get("reply"):
        return None
    return {
        "reply": parsed["reply"],
        "booking_start_date": parsed.get("booking_start_date"),
        "nights": parsed.get("nights"),
    }


async def insert_booking_request(
    listing_id: str, host_id: str, client_id: str,
    start_date: str, end_date: str, price_unit: str, total_price: float,
) -> Optional[dict]:
    if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
        return None
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.post(
                f"{SUPABASE_URL}/rest/v1/bookings",
                params={"select": "id"},
                json={
                    "listing_id": listing_id,
                    "host_id": host_id,
                    "client_id": client_id,
                    "status": "pending",
                    "start_date": start_date,
                    "end_date": end_date,
                    "price_unit": price_unit,
                    "total_price": total_price,
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

    is_elie_command = (payload.command or "").strip().lower() == "@reply"
    if is_elie_command and user["id"] != conversation.get("host_id"):
        raise HTTPException(status_code=403, detail="Only the host can use the @reply command.")
    if not is_elie_command and not (payload.message or "").strip():
        raise HTTPException(status_code=400, detail="A client message is required.")

    host_profile = await get_profile(conversation["host_id"])
    if not is_elie_command and (not host_profile or not host_profile.get("away_mode")):
        # Host isn't away — Elie has no business answering on their behalf.
        return ReplyResponse(reply="", skipped=True)

    listing_id = conversation.get("listing_id") or payload.listing_id
    listing_ctx = await get_listing_context(listing_id) if listing_id else None
    conversation_messages = await get_conversation_messages(payload.conversation_id)
    history_block = format_reply_history(conversation_messages, conversation["host_id"])
    message = payload.message or ""
    guest_enquiry_context = message
    if is_elie_command:
        guest_messages = [
            (row.get("body") or "").strip()
            for row in conversation_messages
            if row.get("sender_id") != conversation["host_id"] and (row.get("body") or "").strip()
        ]
        if not guest_messages:
            return ReplyResponse(
                reply="There is no guest enquiry to reply to yet.",
                skipped=True,
            )
        message = guest_messages[-1]
        guest_enquiry_context = "\n".join(guest_messages)

    ai_result = await generate_ai_reply(message, listing_ctx, history_block, is_elie_command)
    if not ai_result:
        raise HTTPException(
            status_code=503,
            detail="Elie is temporarily unavailable because Gemini did not return a response.",
        )
    reply_text = ai_result["reply"]
    alternative_listings = []
    if is_elie_command and is_listing_alternative_request(guest_enquiry_context):
        alternative_listings = await get_host_alternative_listings(
            conversation["host_id"],
            listing_id,
            listing_ctx,
            guest_enquiry_context,
        )
    # Only attempt a real booking when Gemini extracted a firm date + night
    # count, the listing prices per night, and the numbers are sane.
    if ai_result and listing_ctx and listing_ctx.get("price_unit") == "night" and listing_ctx.get("price_amount") is not None:
        start_str = ai_result.get("booking_start_date")
        nights = ai_result.get("nights")
        if start_str and isinstance(nights, int) and 0 < nights <= 365:
            try:
                start_date = date.fromisoformat(start_str)
                end_date = start_date + timedelta(days=nights)
                total_price = float(listing_ctx["price_amount"]) * nights
                await insert_booking_request(
                    listing_id=listing_id,
                    host_id=conversation["host_id"],
                    client_id=conversation["client_id"],
                    start_date=start_date.isoformat(),
                    end_date=end_date.isoformat(),
                    price_unit="night",
                    total_price=total_price,
                )
            except (ValueError, TypeError):
                pass  # unparseable date from Gemini — skip booking, keep the text reply

    inserted = await insert_auto_reply(payload.conversation_id, conversation["host_id"], reply_text)
    if not inserted and is_elie_command:
        raise HTTPException(status_code=503, detail="Elie generated a reply but it could not be added to the conversation.")
    if inserted:
        await touch_conversation(payload.conversation_id)

    inserted_messages = [inserted] if inserted else []
    for alternative in alternative_listings:
        listing_message = await insert_auto_reply(
            payload.conversation_id,
            conversation["host_id"],
            f"Shared listing: {alternative.get('title') or 'VaRoom listing'}",
            message_type="listing",
            listing_id=alternative["id"],
        )
        if listing_message:
            listing_message["listing"] = alternative
            inserted_messages.append(listing_message)

    return ReplyResponse(
        reply=reply_text,
        skipped=False,
        message=inserted,
        messages=inserted_messages,
    )


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


async def get_conversation_messages(conversation_id: str, limit: int = 100) -> list:
    if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
        return []
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(
                f"{SUPABASE_URL}/rest/v1/messages",
                params={
                    "conversation_id": f"eq.{conversation_id}",
                    "select": "sender_id,body,created_at",
                    "order": "created_at.desc",
                    "limit": str(limit),
                },
                headers={
                    "apikey": SUPABASE_SERVICE_ROLE_KEY,
                    "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
                },
            )
            response.raise_for_status()
            return list(reversed(response.json()))
    except Exception:
        return []


def format_reply_history(messages: list, host_id: str) -> str:
    if not messages:
        return ""
    lines = []
    for row in messages:
        speaker = "You (the host)" if row.get("sender_id") == host_id else "Guest"
        lines.append(f"{speaker}: {row.get('body', '')}")
    return "Full conversation so far:\n" + "\n".join(lines) + "\n\n"


def filter_alternative_listings(
    rows: list,
    host_id: str,
    current_price: Optional[float],
    current_unit: Optional[str],
    current_listing_id: Optional[str],
    wants_cheaper: bool,
) -> list:
    candidates = []
    for row in rows:
        if row.get("host_id") != host_id or row.get("id") == current_listing_id:
            continue
        booking = row.get("listing_booking_details") or {}
        if isinstance(booking, list):
            booking = booking[0] if booking else {}
        price = booking.get("price_amount")
        if price is None:
            continue
        if wants_cheaper and (
            current_price is None
            or current_unit != booking.get("price_unit")
            or float(price) >= float(current_price)
        ):
            continue
        row["listing_booking_details"] = [booking]
        candidates.append(row)

    candidates.sort(key=lambda row: float(row["listing_booking_details"][0]["price_amount"]))
    return candidates[:3]


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
                    "select": "title,description,location_text,category",
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
            details_response = await client.get(
                f"{SUPABASE_URL}/rest/v1/listing_booking_details",
                params={
                    "listing_id": f"eq.{listing_id}",
                    "select": "*",
                    "limit": "1",
                },
                headers={
                    "apikey": SUPABASE_SERVICE_ROLE_KEY,
                    "Authorization": f"******",
                },
            )
            details_response.raise_for_status()
            details_rows = details_response.json()
            booking = details_rows[0] if details_rows else {}
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
                "amenities": normalize_amenities(booking.get("amenities")),
            }
    except Exception as error:
        print(f"[Elie] listing context lookup failed: {error}")
        return None


async def insert_auto_reply(
    conversation_id: str,
    host_id: str,
    body: str,
    message_type: str = "text",
    listing_id: Optional[str] = None,
) -> Optional[dict]:
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
                params={"select": "id,conversation_id,sender_id,body,created_at,is_auto_reply,message_type,attachment_id,listing_id"},
                json={
                    "conversation_id": conversation_id,
                    "sender_id": host_id,
                    "body": body,
                    "is_auto_reply": True,
                    "message_type": message_type,
                    "listing_id": listing_id,
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


async def get_host_alternative_listings(
    host_id: str,
    current_listing_id: Optional[str],
    current_listing_ctx: Optional[dict],
    enquiry: str,
) -> list:
    """Find a small set of public, available alternatives owned by this host."""
    if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
        return []

    params = {
        "select": (
            "id,host_id,title,description,category,location_text,availability_status,"
            "listing_photos(storage_path),"
            "listing_booking_details!inner(price_amount,price_unit,size_or_type,max_guests,amenities)"
        ),
        "host_id": f"eq.{host_id}",
        "availability_status": "eq.available",
        "order": "created_at.desc",
        "limit": "20",
    }
    if current_listing_id:
        params["id"] = f"neq.{current_listing_id}"

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(
                f"{SUPABASE_URL}/rest/v1/listings",
                params=params,
                headers={
                    "apikey": SUPABASE_SERVICE_ROLE_KEY,
                    "Authorization": f"******",
                },
            )
            if response.is_error:
                # Older deployments may not have listing lifecycle controls yet.
                # Keep the host scope and enforce known availability states below.
                fallback_params = dict(params)
                fallback_params["select"] = fallback_params["select"].replace(
                    "availability_status,", ""
                ).replace(",amenities", "")
                fallback_params.pop("availability_status", None)
                response = await client.get(
                    f"{SUPABASE_URL}/rest/v1/listings",
                    params=fallback_params,
                    headers={
                        "apikey": SUPABASE_SERVICE_ROLE_KEY,
                        "Authorization": f"******",
                    },
                )
            response.raise_for_status()
            rows = response.json()
    except Exception as error:
        print(f"[Elie] host listing lookup failed: {error}")
        return []

    current_price = (
        current_listing_ctx.get("price_amount")
        if current_listing_ctx
        else None
    )
    current_unit = (
        current_listing_ctx.get("price_unit")
        if current_listing_ctx
        else None
    )
    wants_cheaper = bool(re.search(r"\b(?:cheaper|affordable|lower[- ]priced|less expensive)\b", enquiry.lower()))
    current_category = (current_listing_ctx or {}).get("category")
    category_matches = [
        row for row in rows
        if not current_category or not row.get("category")
        or str(row.get("category")).lower() == str(current_category).lower()
    ]
    if category_matches:
        rows = category_matches
    for row in rows:
        status = str(row.get("availability_status") or "available").lower()
        if status != "available":
            row["_unavailable"] = True
    rows = [row for row in rows if not row.get("_unavailable")]
    if not rows:
        return []

    await attach_video_media(rows)
    return filter_alternative_listings(
        rows,
        host_id,
        current_price,
        current_unit,
        current_listing_id,
        wants_cheaper,
    )


async def attach_video_media(listings: list) -> None:
    if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY or not listings:
        return
    listing_ids = [str(row["id"]) for row in listings if row.get("id")]
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(
                f"{SUPABASE_URL}/rest/v1/property_media",
                params={
                    "select": "id,property_id",
                    "property_id": "in.(" + ",".join(listing_ids) + ")",
                    "media_type": "eq.video",
                    "status": "eq.ready",
                    "visibility": "eq.public",
                    "deleted_at": "is.null",
                    "order": "sort_order.asc",
                },
                headers={
                    "apikey": SUPABASE_SERVICE_ROLE_KEY,
                    "Authorization": f"******",
                },
            )
            response.raise_for_status()
            media_by_listing = {}
            for media in response.json():
                media_by_listing.setdefault(media["property_id"], media["id"])
            for listing in listings:
                listing["video_media_id"] = media_by_listing.get(listing.get("id"))
    except Exception as error:
        print(f"[Elie] listing video lookup failed: {error}")


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


async def generate_no_results_reply(message: str, history: Optional[List[dict]] = None) -> Optional[str]:
    """A search came back empty. Instead of a fixed template, have Elie
    write a short, natural response that matches the guest's actual tone
    and language (including Swahili/Sheng) — an apologetic guest gets a
    gentler reply than a casual one, and the language always matches."""
    history_block = ""
    if history:
        lines = []
        for turn in history[-6:]:
            speaker = "Elie" if turn.get("role") == "elie" else "Guest"
            lines.append(f"{speaker}: {turn.get('text', '')}")
        history_block = "Recent conversation so far:\n" + "\n".join(lines) + "\n\n"

    prompt = (
        "You are Elie, VaRoom's search assistant based in Kenya. You just "
        "searched for the guest's request below and found NO matching "
        "listings. Write a short (1-2 sentence) reply acknowledging that — "
        "match the guest's tone and language exactly (including Swahili or "
        "Sheng if they used it), vary your phrasing, and never sound canned. "
        "Follow their lead; only mention another area, budget, category, or "
        "later check if it naturally fits what they said. Do not boss them "
        "around or give unsolicited instructions.\n\n"
        f"{history_block}"
        f"Guest's message: {message}\n\n"
        "Respond with ONLY the reply text, nothing else — no quotes, no JSON."
    )
    reply = await call_gemini(prompt)
    if not reply:
        raise ElieGenerationError("Gemini could not generate a no-results response.")
    return reply


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
    question — gets misread as a fresh, context-free message.
    """

    history_block = ""
    if history:
        lines = []
        for turn in history[-6:]:
            speaker = "Elie" if turn.get("role") == "elie" else "Guest"
            lines.append(f"{speaker}: {turn.get('text', '')}")
        history_block = "Recent conversation so far:\n" + "\n".join(lines) + "\n\n"

    prompt = (
        "You are Elie, a warm, emotionally intelligent conversational partner "
        "and search assistant on VaRoom, a hospitality "
        "marketplace (Airbnbs, hotels, event venues, offices, shops, and "
        "property listings) based in Kenya. Guests often mix Swahili or "
        "Sheng into English (\"niaje\", \"poa\", \"nataka nyumba Nairobi\", "
        "\"niko na budget ya 5k\") — treat that as completely normal, not a "
        "language error, and reply in whichever language(s) the guest used.\n\n"
        "Read the guest's emotional state, intent, and energy from their latest "
        "message and the recent conversation. Match their mood naturally: be "
        "gentle when they are upset, enthusiastic when they are excited, and "
        "brief when they are brief. Follow the guest's lead. Never lecture, "
        "pressure, command, or tell them what they should do; offer help only "
        "when it fits what they asked. Do not force a search into small talk, "
        "and do not steer the conversation toward VaRoom when the guest is "
        "simply being human.\n\n"
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
        '"guests": an integer number of guests/people if mentioned, or null, '
        '"intro": a short, warm sentence (under 15 words) telling the guest '
        'you searched and are showing results — vary the phrasing every '
        'time, write it like a real person not a template, and reply in '
        'the same language(s) the guest used}\n\n'
        "CARRYING OVER FILTERS ACROSS TURNS: if the recent conversation shows "
        "the guest already searching for something and their latest message "
        "only tweaks or corrects ONE part of it (a new area, a different "
        "budget, more guests), extract the FULL set of filters — keep "
        "whatever they didn't mention or change from the earlier search, and "
        "only override what they explicitly changed. Never drop the earlier "
        "filters just because the latest message alone doesn't repeat them. "
        "This applies across languages too — \"sio X\" / \"si X\" means "
        "\"not X\", so \"sio kilimani, tufanye westlands\" after a search for "
        "airbnbs in Kilimani under 5000 means: category=airbnb (carried "
        "over), location=Westlands (corrected), max_price=5000 (carried "
        "over, unchanged). Always extract the location precisely whenever a "
        "specific place name is mentioned, even briefly (\"in westlands\", "
        "\"near westlands\", \"westlands area\") — don't leave it null just "
        "because the message is short.\n\n"
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
            "intro": parsed.get("intro"),
        }

    raise ElieGenerationError("Gemini returned an invalid Elie response.")


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
    try:
        classification = await classify_message(payload.message, history_dicts)
    except ElieGenerationError as exc:
        raise HTTPException(
            status_code=503,
            detail="Elie is temporarily unavailable because Gemini did not return a response.",
        ) from exc

    if classification["intent"] == "chat":
        return ElieSearchResponse(reply=classification["chat_reply"], listings=None)

    category = classification.get("category")
    location = classification.get("location")
    max_price = classification.get("max_price")
    guests = classification.get("guests")

    raw_listings = await search_listings(category, location, payload.message, max_price, guests)

    filters = ElieFilters(category=category, location=location, max_price=max_price, guests=guests)

    if not raw_listings:
        try:
            no_results_reply = await generate_no_results_reply(payload.message, history_dicts)
        except ElieGenerationError as exc:
            raise HTTPException(
                status_code=503,
                detail="Elie is temporarily unavailable because Gemini did not return a response.",
            ) from exc
        return ElieSearchResponse(
            reply=no_results_reply,
            listings=None,
            filters=filters,
        )

    intro = classification.get("intro")
    if not intro:
        raise HTTPException(
            status_code=502,
            detail="Elie received an incomplete response from Gemini. Please try again.",
        )

    return ElieSearchResponse(
        reply=intro,
        listings=raw_listings,
        filters=filters,
    )


@app.get("/health")
def health_check():
    return {
        "status": "ok",
        "ai_configured": bool(GEMINI_API_KEY),
        "ai_model": GEMINI_MODEL,
        "supabase_configured": bool(SUPABASE_URL and SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY),
    }


# Render starts this chatbot entrypoint. Mount the isolated Property News
# service here as well, after the established chatbot routes.
_property_news_directory = Path(__file__).resolve().parent.parent / "property-news"
if _property_news_directory.is_dir():
    sys.path.insert(0, str(_property_news_directory))
    from app.api import create_app as create_property_news_app

    app.mount("/", create_property_news_app())
