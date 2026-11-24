"""Phase 3: one connection pool, one deadline per Elie question, remembered
sign-in checks, and the opening lookups run together."""

import asyncio
import base64
import json
import os
import sys
import time
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import httpx
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent))
os.environ.setdefault("GEMINI_API_KEY", "test-gemini-key-12345")
os.environ.setdefault("SUPABASE_URL", "https://mock-test.supabase.co")
os.environ.setdefault("SUPABASE_ANON_KEY", "mock-anon-key")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "mock-service-key")

import main  # noqa: E402


@pytest.fixture(autouse=True)
def clean_cache():
    main._token_cache.clear()
    yield
    main._token_cache.clear()


def token(exp_offset=3600, sub="u1"):
    payload = base64.urlsafe_b64encode(json.dumps({"sub": sub, "exp": int(time.time()) + exp_offset}).encode()).decode().rstrip("=")
    return f"header.{payload}.signature"


def test_outside_calls_share_one_pool_with_their_own_timeouts():
    async def run():
        with patch.object(httpx.AsyncClient, "get", new_callable=AsyncMock, return_value=httpx.Response(200, json=[])) as get:
            async with main.shared_http(timeout=8.0) as first:
                await first.get("https://a.test")
            async with main.shared_http(timeout=12.0) as second:
                await second.get("https://b.test", timeout=3.0)
            assert first._client is second._client, "one pool"
            assert [call.kwargs["timeout"] for call in get.await_args_list] == [8.0, 3.0]
        return first._client
    one, two = asyncio.run(run()), asyncio.run(run())
    assert one is not two, "a new event loop gets its own pool"


def test_model_calls_get_only_the_time_left_in_the_question():
    async def run(seconds_left):
        main._request_deadline.set(time.monotonic() + seconds_left)
        with patch("main.call_openrouter", new_callable=AsyncMock, return_value="ok") as provider, \
             patch.object(main, "LLM_PROVIDER", "openrouter"):
            try:
                await main.call_llm("hi", request_id="R", stage="test", total_time_budget=18.0, per_attempt_timeout=8.0)
            except main.ElieGenerationError as exc:
                return exc, provider
            return provider.await_args.kwargs, provider
    options, _ = asyncio.run(run(6.0))
    assert options["total_time_budget"] <= 5.5 and options["per_attempt_timeout"] <= 5.5
    error, provider = asyncio.run(run(1.0))
    assert error.category == main.LLMErrorCategory.TIMEOUT
    provider.assert_not_awaited()

    async def outside():
        with patch("main.call_openrouter", new_callable=AsyncMock, return_value="ok") as provider, \
             patch.object(main, "LLM_PROVIDER", "openrouter"):
            await main.call_llm("hi", total_time_budget=30.0)
            return provider.await_args.kwargs
    assert asyncio.run(outside())["total_time_budget"] == 30.0, "host replies keep their own budget"


def test_an_elie_question_runs_under_the_deadline_and_saving_does_not():
    seen = {}

    async def answer(payload, user, req_id):
        seen["deadline"] = main._request_deadline.get()
        return main.ElieSearchResponse(reply="hi")

    async def save(*args):
        seen["while_saving"] = main._request_deadline.get()
        return True

    request = MagicMock()
    request.headers = {}
    request.client.host = "127.0.0.1"
    with patch("main.verify_supabase_user", new_callable=AsyncMock, return_value={"id": "u-deadline"}), \
         patch("main.answer_elie", side_effect=answer), patch("main.save_elie_turns", side_effect=save):
        started = time.monotonic()
        result = asyncio.run(main.elie_search(main.ElieSearchRequest(message="hi", session_id="s"), request, MagicMock(headers={}), authorization="Bearer t"))
    assert result.saved is True
    assert 0 < seen["deadline"] - started <= main.ELIE_REQUEST_SECONDS + 1
    assert seen["while_saving"] is None


def test_sign_in_checks_are_remembered_for_a_minute_never_past_the_token_expiry():
    async def check(value):
        return await main.verify_supabase_user(value)
    with patch("main.fetch_supabase_user", new_callable=AsyncMock, return_value={"id": "u1"}) as fetch:
        fresh = token()
        assert asyncio.run(check(fresh)) == {"id": "u1"}
        assert asyncio.run(check(fresh)) == {"id": "u1"}
        assert fetch.await_count == 1, "the second check is remembered"
        assert fresh not in str(list(main._token_cache)), "kept by a hash, never the token"
        expired = token(exp_offset=-5)
        asyncio.run(check(expired))
        asyncio.run(check(expired))
        assert fetch.await_count == 3, "an expired token is checked every time"
    with patch("main.fetch_supabase_user", new_callable=AsyncMock, return_value=None) as fetch:
        asyncio.run(check(token(sub="bad")))
        asyncio.run(check(token(sub="bad")))
        assert fetch.await_count == 2, "a refused token is never remembered"
    with patch.object(main, "TOKEN_CACHE_MAX", 3), patch("main.fetch_supabase_user", new_callable=AsyncMock, return_value={"id": "u"}):
        for n in range(5):
            asyncio.run(check(token(sub=f"s{n}")))
    assert len(main._token_cache) == 3


def test_the_profile_wallet_and_shown_listings_load_together():
    started = []

    def slow(name, value):
        async def run(*args, **kwargs):
            started.append(name)
            await asyncio.sleep(0.05)
            return value
        return run

    payload = main.ElieSearchRequest(message="hi", listing_ids=["00000000-0000-4000-8000-000000000001"])
    llm = AsyncMock(return_value='{"intent": "chat", "chat_reply": "Hi!"}')
    with patch("main.get_profile", side_effect=slow("profile", {"role": "client"})), \
         patch("main.get_vcoin_wallet", side_effect=slow("wallet", main.ElieVcoins(balance=100))), \
         patch("main.fetch_shown_listings", side_effect=slow("shown", [])), \
         patch("main.call_llm", llm):
        began = time.monotonic()
        result = asyncio.run(main.answer_elie(payload, {"id": "u1"}, "R"))
        took = time.monotonic() - began
    assert sorted(started) == ["profile", "shown", "wallet"]
    assert took < 0.14, "one wait, not three"
    assert result.reply == "Hi!"


def test_a_missing_profile_or_wallet_still_fails_as_before():
    payload = main.ElieSearchRequest(message="hi")
    with patch("main.get_profile", new_callable=AsyncMock, return_value=None), \
         patch("main.get_vcoin_wallet", new_callable=AsyncMock, return_value=main.ElieVcoins(balance=100)):
        with pytest.raises(main.HTTPException) as missing:
            asyncio.run(main.answer_elie(payload, {"id": "u1"}, "R"))
    assert missing.value.status_code == 404
    with patch("main.get_profile", new_callable=AsyncMock, return_value={"role": "client"}), \
         patch("main.get_vcoin_wallet", new_callable=AsyncMock, side_effect=main.VcoinError("down")):
        with pytest.raises(main.HTTPException) as down:
            asyncio.run(main.answer_elie(payload, {"id": "u1"}, "R"))
    assert down.value.status_code == 503
