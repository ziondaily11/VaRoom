"""
Tests for POST /internal/reply/generate: the host-side reply writer that the
Express server calls for Away mode and @reply. It must require the shared
key, write no chat messages, and use only the history Express sends.
"""

import os
import sys
from pathlib import Path
from unittest.mock import AsyncMock, patch

import pytest

chatbot_dir = Path(__file__).resolve().parent
if str(chatbot_dir) not in sys.path:
    sys.path.insert(0, str(chatbot_dir))

os.environ.setdefault("GEMINI_API_KEY", "test-gemini-key-12345")
os.environ.setdefault("SUPABASE_URL", "https://mock-test.supabase.co")
os.environ.setdefault("SUPABASE_ANON_KEY", "mock-anon-key")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "mock-service-key")

import main  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

HOST = "11111111-1111-4111-8111-111111111111"
LISTING = "55555555-5555-4555-8555-555555555555"
KEY = "test-internal-key"

client = TestClient(main.app)


@pytest.fixture(autouse=True)
def internal_key(monkeypatch):
    monkeypatch.setattr(main, "CHATBOT_INTERNAL_API_KEY", KEY)


def payload(**overrides):
    body = {
        "conversation_id": "44444444-4444-4444-8444-444444444444",
        "host_id": HOST,
        "listing_id": LISTING,
        "trigger": "away",
        "guest_message": "Is it free this weekend?",
        "history": [
            {"speaker": "guest", "text": "Hi"},
            {"speaker": "host", "text": "Hello! How can I help?"},
            {"speaker": "guest", "text": "Is it free this weekend?"},
        ],
    }
    body.update(overrides)
    return body


def post(body, key=KEY):
    headers = {"X-Elie-Internal-Key": key} if key is not None else {}
    return client.post("/internal/reply/generate", json=body, headers=headers)


def test_requires_the_internal_key(monkeypatch):
    assert post(payload(), key=None).status_code == 401
    # Checked before the body, so the request format is not revealed.
    unauthorized = client.post("/internal/reply/generate", json={})
    assert unauthorized.status_code == 401
    assert "conversation_id" not in unauthorized.text
    assert post(payload(), key="wrong-key").status_code == 401
    monkeypatch.setattr(main, "CHATBOT_INTERNAL_API_KEY", "")
    assert post(payload()).status_code == 503


def test_public_reply_endpoint_is_gone():
    response = client.post("/reply", json={"conversation_id": "x", "message": "hi"}, headers={"Authorization": "Bearer t"})
    assert response.status_code in (404, 405)


def test_writes_the_reply_from_the_history_express_sends():
    listing = {"id": LISTING, "host_id": HOST, "title": "Garden flat", "price_amount": 4000}
    with patch("main.get_listing_context", new_callable=AsyncMock, return_value=listing), \
         patch("main.generate_ai_reply", new_callable=AsyncMock, return_value={"reply": "Yes, it's free."}) as generate, \
         patch("main.httpx.AsyncClient.post", new_callable=AsyncMock) as http_post, \
         patch("main.httpx.AsyncClient.patch", new_callable=AsyncMock) as http_patch:
        response = post(payload())

    assert response.status_code == 200
    assert response.json() == {"reply": "Yes, it's free.", "alternative_listing_ids": []}
    message, listing_ctx, history_block, is_command = generate.await_args.args[:4]
    assert message == "Is it free this weekend?"
    assert listing_ctx == listing
    assert is_command is False
    assert "Guest: Hi\nYou (the host): Hello! How can I help?\nGuest: Is it free this weekend?" in history_block
    http_post.assert_not_awaited()
    http_patch.assert_not_awaited()


def test_command_trigger_and_foreign_listing_is_ignored():
    foreign = {"id": LISTING, "host_id": "99999999-9999-4999-8999-999999999999", "title": "Someone else's"}
    with patch("main.get_listing_context", new_callable=AsyncMock, return_value=foreign), \
         patch("main.generate_ai_reply", new_callable=AsyncMock, return_value={"reply": "Sure."}) as generate:
        response = post(payload(trigger="command"))

    assert response.status_code == 200
    _, listing_ctx, _, is_command = generate.await_args.args[:4]
    assert listing_ctx is None
    assert is_command is True


def test_suggests_the_hosts_other_listings_when_asked():
    alternatives = [{"id": "66666666-6666-4666-8666-666666666666"}, {"id": "77777777-7777-4777-8777-777777777777"}]
    with patch("main.get_listing_context", new_callable=AsyncMock, return_value=None), \
         patch("main.generate_ai_reply", new_callable=AsyncMock, return_value={"reply": "Here are some."}) as generate, \
         patch("main.get_host_alternative_listings", new_callable=AsyncMock, return_value=alternatives) as lookup:
        response = post(payload(guest_message="Any cheaper options?", guest_enquiry="Hi\nAny cheaper options?"))

    assert response.status_code == 200
    assert response.json()["alternative_listing_ids"] == [row["id"] for row in alternatives]
    assert lookup.await_args.args[0] == HOST
    # The reply is written knowing which listings will be shared after it.
    assert generate.await_args.kwargs["shared_listings"] == alternatives


def test_the_prompt_names_the_listings_being_shared():
    shared = [{"id": "x", "title": "Cosy Studio", "listing_booking_details": [{"price_amount": 6000, "price_unit": "night"}]}]
    with patch("main.call_gemini", new_callable=AsyncMock, return_value='{"reply": "ok"}') as gemini:
        import asyncio
        result = asyncio.run(main.generate_ai_reply("Anything cheaper?", None, "", False, shared_listings=shared))

    assert result == {"reply": "ok"}
    prompt = gemini.await_args.args[0]
    assert "- Cosy Studio: KSh 6000 per night" in prompt
    assert gemini.await_args.kwargs["thinking_level"] == "low"


def test_gemini_failure_is_a_generic_503():
    with patch("main.get_listing_context", new_callable=AsyncMock, return_value=None), \
         patch("main.generate_ai_reply", new_callable=AsyncMock, return_value=None):
        response = post(payload())

    assert response.status_code == 503
    assert "Gemini" not in response.json()["detail"]


def test_rejects_an_empty_guest_message_and_unknown_trigger():
    assert post(payload(guest_message="   ")).status_code == 400
    assert post(payload(trigger="broadcast")).status_code == 422


def test_long_history_keeps_the_newest_turns():
    turns = [main.ReplyHistoryTurn(speaker="guest", text=f"message number {i} " + "x" * 200) for i in range(40)]
    block = main.format_reply_history(turns)
    assert len(block) <= main.REPLY_HISTORY_CHAR_BUDGET
    assert "message number 39" in block
    assert "message number 0 " not in block
