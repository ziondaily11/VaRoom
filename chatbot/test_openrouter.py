"""OpenRouter as Elie's model provider: request shape, fallback order, errors."""

import asyncio
import logging
import os
import subprocess
import sys
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import httpx
import pytest

chatbot_dir = Path(__file__).resolve().parent
sys.path.insert(0, str(chatbot_dir))
os.environ.setdefault("GEMINI_API_KEY", "test-gemini-key-12345")
os.environ.setdefault("SUPABASE_URL", "https://mock-test.supabase.co")
os.environ.setdefault("SUPABASE_ANON_KEY", "mock-anon-key")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "mock-service-key")

import main
from main import ElieGenerationError, LLMErrorCategory

KEY = "sk-or-v1-test-secret"
REQUEST = httpx.Request("POST", main.OPENROUTER_URL)


@pytest.fixture(autouse=True)
def openrouter():
    main.LLM_PROVIDER = "openrouter"
    main.OPENROUTER_API_KEY = KEY
    main.OPENROUTER_MODEL = "anthropic/claude-haiku-5.5"
    main.OPENROUTER_FALLBACK_MODEL = "openai/gpt-5.6-luna"
    main.OPENROUTER_REASONING = ""
    yield
    main.LLM_PROVIDER = "gemini"


def reply(status=200, **body):
    return httpx.Response(status, json=body, request=REQUEST)


def answer(text, model="anthropic/claude-haiku-5.5", finish_reason="stop", **message):
    return reply(model=model, choices=[{"finish_reason": finish_reason, "message": {"role": "assistant", "content": text, **message}}])


def run(responses, **options):
    with patch.object(httpx.AsyncClient, "post", new_callable=AsyncMock, side_effect=responses) as post, \
         patch("main.asyncio.sleep", new_callable=AsyncMock):
        try:
            result = asyncio.run(main.call_llm("Find me a loft", request_id="OR-1", stage="test", **options))
        except ElieGenerationError as exc:
            result = exc
    return result, [call.kwargs for call in post.call_args_list]


def test_provider_follows_the_key_unless_gemini_is_chosen():
    def provider(**env):
        clean = {k: v for k, v in os.environ.items() if k not in ("OPENROUTER_API_KEY", "LLM_PROVIDER")}
        out = subprocess.run(
            [sys.executable, "-c", "import main; print(main.LLM_PROVIDER)"],
            cwd=chatbot_dir, env={**clean, "OPENROUTER_API_KEY": "", **env}, capture_output=True, text=True, check=True,
        )
        return out.stdout.strip().splitlines()[-1]

    assert provider() == "gemini"
    assert provider(OPENROUTER_API_KEY="sk-or-x") == "openrouter"
    assert provider(OPENROUTER_API_KEY="sk-or-x", LLM_PROVIDER="gemini") == "gemini"


def test_request_sends_both_models_json_mode_and_the_key_as_a_bearer_token():
    result, calls = run([answer('{"intent": "chat"}')], response_json=True, max_output_tokens=50)
    assert result == '{"intent": "chat"}'
    sent = calls[0]
    assert sent["headers"]["Authorization"] == f"Bearer {KEY}"
    assert sent["json"]["models"] == ["anthropic/claude-haiku-5.5", "openai/gpt-5.6-luna"]
    assert sent["json"]["messages"] == [{"role": "user", "content": "Find me a loft"}]
    assert sent["json"]["response_format"] == {"type": "json_object"}
    assert sent["json"]["max_tokens"] == 50
    assert "reasoning" not in sent["json"], "off unless OPENROUTER_REASONING is set"

    main.OPENROUTER_REASONING = "low"
    main.OPENROUTER_FALLBACK_MODEL = main.OPENROUTER_MODEL
    _, calls = run([answer("ok")])
    assert calls[0]["json"]["reasoning"] == {"effort": "low", "exclude": True}
    assert calls[0]["json"]["models"] == ["anthropic/claude-haiku-5.5"], "one model listed once"
    assert "response_format" not in calls[0]["json"]


@pytest.mark.parametrize("failure", [
    reply(503, error={"code": 503, "message": "overloaded"}),
    reply(429, error={"code": 429, "message": "rate limited"}),
    reply(200, error={"code": 502, "message": "upstream error"}),
    reply(200, choices=[{"finish_reason": "error", "error": {"code": 502, "message": "mid-stream"}, "message": {"content": ""}}]),
    answer(""),
    httpx.ReadTimeout("slow", request=REQUEST),
])
def test_a_failed_attempt_is_sent_again_with_the_other_model_first(failure):
    result, calls = run([failure, answer("Two lofts.", model="openai/gpt-5.6-luna")])
    assert result == "Two lofts."
    assert [call["json"]["models"][0] for call in calls] == ["anthropic/claude-haiku-5.5", "openai/gpt-5.6-luna"]


@pytest.mark.parametrize("failure, category", [
    (reply(402, error={"code": 402, "message": "Insufficient credits"}), LLMErrorCategory.CREDITS),
    (reply(403, error={"code": 403, "message": "Input was flagged"}), LLMErrorCategory.SAFETY_BLOCK),
    (reply(401, error={"code": 401, "message": "No auth"}), LLMErrorCategory.AUTH_ERROR),
    (reply(400, error={"code": 400, "message": "bad request"}), LLMErrorCategory.CLIENT_ERROR),
    (reply(404, error={"code": 404, "message": "No endpoints found"}), LLMErrorCategory.MODEL_ERROR),
    (answer("", finish_reason="content_filter"), LLMErrorCategory.SAFETY_BLOCK),
    (answer(None, refusal="I can't help with that."), LLMErrorCategory.SAFETY_BLOCK),
])
def test_final_errors_stop_at_once_with_their_category(failure, category):
    result, calls = run([failure, answer("never")])
    assert isinstance(result, ElieGenerationError)
    assert result.category == category
    assert len(calls) == 1


def test_both_attempts_failing_reports_the_last_failure():
    result, calls = run([httpx.ReadTimeout("slow", request=REQUEST)] * 2)
    assert result.category == LLMErrorCategory.TIMEOUT and result.status_code == 504
    assert len(calls) == 2


def test_no_key_fails_without_a_request():
    main.OPENROUTER_API_KEY = ""
    result, calls = run([answer("never")])
    assert result.category == LLMErrorCategory.AUTH_ERROR and calls == []


def test_a_question_openrouter_flags_gets_the_polite_reply_free():
    request = MagicMock()
    request.headers = {}
    request.client.host = "127.0.0.1"
    with patch.object(httpx.AsyncClient, "post", new_callable=AsyncMock, return_value=reply(403, error={"code": 403, "message": "flagged"})),          patch("main.verify_supabase_user", new_callable=AsyncMock, return_value={"id": "user-or"}),          patch("main.get_profile", new_callable=AsyncMock, return_value={"role": "client"}),          patch("main.get_vcoin_wallet", new_callable=AsyncMock, return_value=main.ElieVcoins(balance=100)),          patch("main.spend_vcoins", new_callable=AsyncMock) as spend:
        result = asyncio.run(main.elie_search(main.ElieSearchRequest(message="something bad"), request, MagicMock(headers={}), authorization="Bearer t"))
    assert result.reply.startswith("I can't help with that one")
    spend.assert_not_called()


def test_health_names_the_provider_and_models_never_the_key():
    health = main.health_check()
    assert health["provider"] == "openrouter"
    assert (health["primary_model"], health["fallback_model"]) == ("anthropic/claude-haiku-5.5", "openai/gpt-5.6-luna")
    assert health["ai_configured"] is True
    assert KEY not in str(health)


def test_the_key_never_reaches_the_logs(caplog):
    caplog.set_level(logging.DEBUG, logger="varoom.elie")
    run([reply(401, error={"code": 401, "message": f"bad key {KEY}"})])
    assert caplog.records and all(KEY not in record.getMessage() for record in caplog.records)
