"""
Comprehensive unit and integration test suite for Elie Gemini reliability,
error classification, retry/fallback mechanisms, schema validation,
database error isolation, correlation tracing, capacity configuration, and diagnostic probes.
"""

import sys
import os
import json
import logging
import asyncio
import pytest
from unittest.mock import patch, MagicMock, AsyncMock
import httpx
from pathlib import Path

# Add chatbot directory to sys.path
chatbot_dir = Path(__file__).resolve().parent
if str(chatbot_dir) not in sys.path:
    sys.path.insert(0, str(chatbot_dir))

# Set test environment variables before importing main
os.environ["GEMINI_API_KEY"] = "test-gemini-key-12345"
os.environ["GEMINI_MODEL"] = "gemini-3.8-flash"
os.environ["GEMINI_FALLBACK_MODEL"] = "gemini-3.6-flash"
os.environ["GEMINI_CAPACITY"] = "medium"
os.environ["SUPABASE_URL"] = "https://mock-test.supabase.co"
os.environ["SUPABASE_ANON_KEY"] = "mock-anon-key"
os.environ["SUPABASE_SERVICE_ROLE_KEY"] = "mock-service-key"

import main
from main import (
    call_gemini,
    classify_message,
    generate_no_results_reply,
    search_listings,
    get_or_create_correlation_id,
    normalize_category_filter,
    build_deterministic_no_results_reply,
    GeminiErrorCategory,
    ElieGenerationError,
    ListingDatabaseError,
    PRIMARY_GEMINI_MODEL,
    FALLBACK_GEMINI_MODEL,
    GEMINI_CAPACITY,
    app,
)


@pytest.fixture(autouse=True)
def reset_models():
    main.PRIMARY_GEMINI_MODEL = "gemini-3.8-flash"
    main.FALLBACK_GEMINI_MODEL = "gemini-3.6-flash"
    main.GEMINI_CAPACITY = "medium"
    main.GEMINI_API_KEY = "test-gemini-key-12345"


# ── 0. Model & Capacity Configuration Verification ────────────────────────

def test_models_and_capacity_configuration():
    assert main.PRIMARY_GEMINI_MODEL == "gemini-3.8-flash"
    assert main.FALLBACK_GEMINI_MODEL == "gemini-3.6-flash"
    assert main.PRIMARY_GEMINI_MODEL != main.FALLBACK_GEMINI_MODEL
    assert main.GEMINI_CAPACITY == "medium"


# ── 1. Primary Model Success & Payload Capacity ────────────────────────────

def test_call_gemini_primary_success():
    async def run():
        mock_response = httpx.Response(
            200,
            json={
                "candidates": [
                    {
                        "content": {"parts": [{"text": '{"intent": "chat", "chat_reply": "Hello there!"}'}]},
                        "finishReason": "STOP",
                    }
                ]
            },
            request=httpx.Request("POST", "https://mock.gemini/"),
        )

        with patch.object(httpx.AsyncClient, "post", new_callable=AsyncMock) as mock_post:
            mock_post.return_value = mock_response
            result = await call_gemini("Hello", request_id="TEST-001", stage="test")
            assert result == '{"intent": "chat", "chat_reply": "Hello there!"}'
            assert mock_post.call_count == 1
            call_url = str(mock_post.call_args[0][0])
            assert "gemini-3.8-flash" in call_url

            # Verify thinkingEffort / capacity is set to medium in generationConfig
            call_json = mock_post.call_args[1]["json"]
            assert "generationConfig" in call_json
            assert call_json["generationConfig"].get("thinkingConfig", {}).get("thinkingEffort") == "medium"

    asyncio.run(run())


# ── 2. Retry on Transient 503 ──────────────────────────────────────────────

def test_call_gemini_retry_503_to_success():
    async def run():
        resp_503 = httpx.Response(503, text="Service Unavailable", request=httpx.Request("POST", "https://mock/"))
        resp_200 = httpx.Response(
            200,
            json={
                "candidates": [
                    {"content": {"parts": [{"text": "Recovered reply"}]}, "finishReason": "STOP"}
                ]
            },
            request=httpx.Request("POST", "https://mock/"),
        )

        with patch.object(httpx.AsyncClient, "post", new_callable=AsyncMock) as mock_post:
            mock_post.side_effect = [resp_503, resp_200]
            result = await call_gemini("Test prompt", request_id="TEST-002", stage="test")
            assert result == "Recovered reply"
            assert mock_post.call_count == 2
            assert "gemini-3.8-flash" in str(mock_post.call_args_list[0][0][0])
            assert "gemini-3.8-flash" in str(mock_post.call_args_list[1][0][0])

    asyncio.run(run())


# ── 3. Fallback Model on Consecutive 503s with Medium Capacity ──────────────

def test_call_gemini_fallback_on_consecutive_503():
    async def run():
        resp_503 = httpx.Response(503, text="Service Unavailable", request=httpx.Request("POST", "https://mock/"))
        resp_fallback_200 = httpx.Response(
            200,
            json={
                "candidates": [
                    {"content": {"parts": [{"text": "Fallback model answer"}]}, "finishReason": "STOP"}
                ]
            },
            request=httpx.Request("POST", "https://mock/"),
        )

        with patch.object(httpx.AsyncClient, "post", new_callable=AsyncMock) as mock_post:
            mock_post.side_effect = [resp_503, resp_503, resp_fallback_200]
            result = await call_gemini("Test fallback", request_id="TEST-003", stage="test")
            assert result == "Fallback model answer"
            assert mock_post.call_count == 3
            # Attempts 1 & 2 use primary model (gemini-3.8-flash)
            assert "gemini-3.8-flash" in str(mock_post.call_args_list[0][0][0])
            assert "gemini-3.8-flash" in str(mock_post.call_args_list[1][0][0])
            # Attempt 3 reaches distinct fallback model (gemini-3.6-flash)
            assert "gemini-3.6-flash" in str(mock_post.call_args_list[2][0][0])

            # Confirm fallback attempt also used medium capacity
            fallback_call_json = mock_post.call_args_list[2][1]["json"]
            assert fallback_call_json["generationConfig"].get("thinkingConfig", {}).get("thinkingEffort") == "medium"

    asyncio.run(run())


# ── 4. Permanent Auth Errors (401, 403) Fail Fast ──────────────────────────

def test_call_gemini_permanent_401_no_retry():
    async def run():
        resp_401 = httpx.Response(401, text="API key invalid", request=httpx.Request("POST", "https://mock/"))

        with patch.object(httpx.AsyncClient, "post", new_callable=AsyncMock) as mock_post:
            mock_post.return_value = resp_401
            result = await call_gemini("Test 401", request_id="TEST-004", stage="test")
            assert result is None
            assert mock_post.call_count == 1

    asyncio.run(run())


def test_call_gemini_permanent_403_no_retry():
    async def run():
        resp_403 = httpx.Response(403, text="Forbidden", request=httpx.Request("POST", "https://mock/"))

        with patch.object(httpx.AsyncClient, "post", new_callable=AsyncMock) as mock_post:
            mock_post.return_value = resp_403
            result = await call_gemini("Test 403", request_id="TEST-005", stage="test")
            assert result is None
            assert mock_post.call_count == 1

    asyncio.run(run())


# ── 5. Model 404 Triggers Fallback Model ───────────────────────────────────

def test_call_gemini_404_model_triggers_fallback():
    async def run():
        resp_404 = httpx.Response(404, text="Model not found", request=httpx.Request("POST", "https://mock/"))
        resp_fallback_200 = httpx.Response(
            200,
            json={
                "candidates": [
                    {"content": {"parts": [{"text": "Fallback answer after 404"}]}, "finishReason": "STOP"}
                ]
            },
            request=httpx.Request("POST", "https://mock/"),
        )

        with patch.object(httpx.AsyncClient, "post", new_callable=AsyncMock) as mock_post:
            mock_post.side_effect = [resp_404, resp_fallback_200]
            result = await call_gemini("Test 404", request_id="TEST-006", stage="test")
            assert result == "Fallback answer after 404"
            assert mock_post.call_count == 2
            assert "gemini-3.8-flash" in str(mock_post.call_args_list[0][0][0])
            assert "gemini-3.6-flash" in str(mock_post.call_args_list[1][0][0])

    asyncio.run(run())


# ── 6. Safety Block Detection ───────────────────────────────────────────────

def test_call_gemini_safety_block_handled():
    async def run():
        resp_safety = httpx.Response(
            200,
            json={
                "candidates": [
                    {"finishReason": "SAFETY", "safetyRatings": [{"category": "HARM", "probability": "HIGH"}]}
                ]
            },
            request=httpx.Request("POST", "https://mock/"),
        )

        with patch.object(httpx.AsyncClient, "post", new_callable=AsyncMock) as mock_post:
            mock_post.return_value = resp_safety
            result = await call_gemini("Test safety", request_id="TEST-007", stage="test")
            assert result is None

    asyncio.run(run())


# ── 7. Timeout Handling & Budget ───────────────────────────────────────────

def test_call_gemini_timeout_triggers_fallback():
    async def run():
        timeout_exc = httpx.ReadTimeout("Timeout reading response", request=httpx.Request("POST", "https://mock/"))
        resp_fallback = httpx.Response(
            200,
            json={
                "candidates": [
                    {"content": {"parts": [{"text": "Response after timeout"}]}, "finishReason": "STOP"}
                ]
            },
            request=httpx.Request("POST", "https://mock/"),
        )

        with patch.object(httpx.AsyncClient, "post", new_callable=AsyncMock) as mock_post:
            mock_post.side_effect = [timeout_exc, timeout_exc, resp_fallback]
            result = await call_gemini("Test timeout", request_id="TEST-008", stage="test")
            assert result == "Response after timeout"
            assert mock_post.call_count == 3

    asyncio.run(run())


# ── 8. Classification Schema Validation ───────────────────────────────────

def test_classify_message_valid_search():
    async def run():
        gemini_json = json.dumps({
            "intent": "search",
            "category": "airbnb",
            "location": "Kilimani",
            "max_price": 4500,
            "guests": 2,
            "intro": "Found nice places in Kilimani:"
        })

        with patch("main.call_gemini", new_callable=AsyncMock) as mock_call:
            mock_call.return_value = gemini_json
            res = await classify_message("Find airbnbs in Kilimani under 4500 for 2 people", request_id="TEST-009")
            assert res["intent"] == "search"
            assert res["category"] == "airbnb"
            assert res["location"] == "Kilimani"
            assert res["max_price"] == 4500.0
            assert res["guests"] == 2
            assert res["intro"] == "Found nice places in Kilimani:"

    asyncio.run(run())


def test_classify_message_category_normalization():
    async def run():
        gemini_json = json.dumps({
            "intent": "search",
            "category": "venue",
            "location": "Nakuru",
            "max_price": "15k",
            "guests": "50",
        })

        with patch("main.call_gemini", new_callable=AsyncMock) as mock_call:
            mock_call.return_value = gemini_json
            res = await classify_message("Venues in Nakuru under 15k", request_id="TEST-010")
            assert res["intent"] == "search"
            assert res["category"] == "event venues"
            assert res["location"] == "Nakuru"
            assert res["max_price"] == 15000.0
            assert res["guests"] == 50
            assert "event venues" in res["intro"] or "Nakuru" in res["intro"]

    asyncio.run(run())


def test_classify_message_markdown_json():
    async def run():
        raw_markdown = "```json\n{\n  \"intent\": \"chat\",\n  \"chat_reply\": \"Mambo! I can help you find stays.\"\n}\n```"

        with patch("main.call_gemini", new_callable=AsyncMock) as mock_call:
            mock_call.return_value = raw_markdown
            res = await classify_message("Mambo", request_id="TEST-011")
            assert res["intent"] == "chat"
            assert res["chat_reply"] == "Mambo! I can help you find stays."

    asyncio.run(run())


def test_classify_message_plain_text_fallback():
    async def run():
        plain_text = "Niaje! Niko hapa kukusaidia kupata nyumba nzuri."

        with patch("main.call_gemini", new_callable=AsyncMock) as mock_call:
            mock_call.return_value = plain_text
            res = await classify_message("Niaje", request_id="TEST-012")
            assert res["intent"] == "chat"
            assert "Niaje!" in res["chat_reply"]

    asyncio.run(run())


# ── 9. Zero-Results Deterministic Fallback ──────────────────────────────────

def test_generate_no_results_reply_deterministic_fallback():
    async def run():
        with patch("main.call_gemini", new_callable=AsyncMock) as mock_call:
            mock_call.return_value = None  # Gemini failed
            reply = await generate_no_results_reply(
                message="Show villas in Diani under 2000",
                category="airbnb",
                location="Diani",
                max_price=2000,
                request_id="TEST-013",
            )
            assert isinstance(reply, str)
            assert len(reply) > 0
            assert "Diani" in reply or "airbnb" in reply or "2,000" in reply

    asyncio.run(run())


# ── 10. Listing Database Error Isolation ────────────────────────────────────

def test_search_listings_database_error_raises():
    async def run():
        with patch.object(httpx.AsyncClient, "get", new_callable=AsyncMock) as mock_get:
            mock_get.return_value = httpx.Response(
                500, text="Internal Server Error in Postgres", request=httpx.Request("GET", "https://mock/")
            )
            with pytest.raises(ListingDatabaseError) as exc_info:
                await search_listings("airbnb", "Nairobi", "airbnb Nairobi", request_id="TEST-014")
            assert exc_info.value.status_code == 503

    asyncio.run(run())


def test_search_listings_valid_empty_result():
    async def run():
        with patch.object(httpx.AsyncClient, "get", new_callable=AsyncMock) as mock_get:
            mock_get.return_value = httpx.Response(
                200, json=[], request=httpx.Request("GET", "https://mock/")
            )
            listings = await search_listings("airbnb", "Nairobi", "airbnb Nairobi", request_id="TEST-015")
            assert listings == []

    asyncio.run(run())


# ── 11. Correlation ID Header & Propagation ────────────────────────────────

def test_correlation_id_generation():
    cid = get_or_create_correlation_id(None, None)
    assert cid.startswith("ELIE-")
    assert len(cid) > 5

    custom = get_or_create_correlation_id(None, "CUSTOM-REQ-1234")
    assert custom == "CUSTOM-REQ-1234"


# ── 12. Health & Diagnostics Endpoints ─────────────────────────────────────

def test_health_check_lightweight():
    response = main.health_check()
    assert response["status"] == "ok"
    assert response["primary_model"] == "gemini-3.8-flash"
    assert response["fallback_model"] == "gemini-3.6-flash"
    assert response["capacity"] == "medium"
    assert response["ai_configured"] is True


def test_diagnostics_endpoint_ok():
    async def run():
        mock_request = MagicMock()
        mock_request.headers = {"x-correlation-id": "DIAG-123"}

        with patch("main.call_gemini", new_callable=AsyncMock) as mock_call:
            mock_call.return_value = "OK"
            res = await main.elie_diagnostics(mock_request, authorization=None)
            assert res["status"] == "ok"
            assert res["gemini_connectivity"] is True
            assert res["primary_model"] == "gemini-3.8-flash"
            assert res["fallback_model"] == "gemini-3.6-flash"
            assert res["capacity"] == "medium"
            assert res["request_id"] == "DIAG-123"

    asyncio.run(run())


# ── 13. Security: No Secrets in Logs ───────────────────────────────────────

def test_no_secrets_in_logs(caplog):
    async def run():
        caplog.set_level(logging.DEBUG, logger="varoom.elie")
        secret_key = "test-gemini-key-12345"

        resp_503 = httpx.Response(503, text="Service Unavailable", request=httpx.Request("POST", "https://mock/"))
        with patch.object(httpx.AsyncClient, "post", new_callable=AsyncMock) as mock_post:
            mock_post.return_value = resp_503
            await call_gemini("Test prompt", request_id="SEC-CHECK", stage="test")

        for record in caplog.records:
            assert secret_key not in record.message
            assert "key=" not in record.message.lower() or "key_configured=" in record.message.lower()

    asyncio.run(run())
