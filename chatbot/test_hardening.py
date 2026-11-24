"""Phase 4: protected diagnostics, rate limiter, CORS, and a guarded Property News mount."""

import logging
import os
import subprocess
import sys
import types
from pathlib import Path
from unittest.mock import AsyncMock, patch

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

chatbot_dir = Path(__file__).resolve().parent
sys.path.insert(0, str(chatbot_dir))
os.environ.setdefault("GEMINI_API_KEY", "test-gemini-key-12345")
os.environ.setdefault("SUPABASE_URL", "https://mock-test.supabase.co")
os.environ.setdefault("SUPABASE_ANON_KEY", "mock-anon-key")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "mock-service-key")

import main

KEY = "internal-test-key"


@pytest.fixture(autouse=True)
def fresh_limits():
    main._rate_limit_records.clear()
    main.CHATBOT_INTERNAL_API_KEY = KEY
    yield
    main._rate_limit_records.clear()


def test_diagnostics_need_the_internal_key_and_are_limited():
    client = TestClient(main.app)
    with patch("main.call_llm", new_callable=AsyncMock, return_value="OK") as call:
        assert client.get("/elie/diagnostics").status_code == 401
        assert client.get("/elie/diagnostics", headers={"X-Elie-Internal-Key": "wrong"}).status_code == 401
        call.assert_not_awaited()
        codes = [client.get("/elie/diagnostics", headers={"X-Elie-Internal-Key": KEY}).status_code for _ in range(7)]
    assert codes == [200] * 6 + [429]
    assert call.await_count == 6
    main.CHATBOT_INTERNAL_API_KEY = ""
    assert client.get("/elie/diagnostics", headers={"X-Elie-Internal-Key": ""}).status_code == 503


def test_old_rate_limit_buckets_are_forgotten():
    main._rate_limit_pruned_at = 0.0
    with patch("main.time.monotonic", return_value=1000.0):
        main.check_rate_limit("elie:user:old")
    with patch("main.time.monotonic", return_value=1000.0 + main.RATE_LIMIT_PRUNE_SECONDS + 1):
        main.check_rate_limit("elie:user:new")
    assert list(main._rate_limit_records) == ["elie:user:new"]


def test_the_address_limit_is_a_generous_ceiling_behind_the_account_limit():
    source = (chatbot_dir / "main.py").read_text(encoding="utf-8")
    assert 'check_rate_limit(f"elie:ip:{client_ip}", max_requests=60, window_seconds=60)' in source
    assert 'check_rate_limit(f"elie:user:{user[\'id\']}", max_requests=20, window_seconds=60)' in source


def test_cors_allows_only_the_page_headers_and_drops_localhost_in_production():
    client = TestClient(main.app)
    preflight = lambda origin, headers: client.options("/elie/search", headers={
        "Origin": origin, "Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": headers,
    })
    assert preflight("https://varoom.co.ke", "authorization,content-type,x-correlation-id").status_code == 200
    assert preflight("https://varoom.co.ke", "x-elie-internal-key").status_code == 400
    assert preflight("https://evil.example", "content-type").status_code == 400

    def origins(environment):
        env = {k: v for k, v in os.environ.items() if k not in ("ENVIRONMENT", "CORS_ORIGINS")}
        out = subprocess.run([sys.executable, "-c", "import main; print(main.allowed_origins)"], cwd=chatbot_dir,
                             env={**env, "ENVIRONMENT": environment}, capture_output=True, text=True, check=True)
        return out.stdout.strip().splitlines()[-1]
    assert "localhost" in origins("")
    production = origins("production")
    assert "localhost" not in production and "https://varoom.co.ke" in production


def test_a_property_news_failure_leaves_elie_running(tmp_path, caplog):
    broken = types.ModuleType("app.api")
    broken.create_app = lambda: (_ for _ in ()).throw(RuntimeError("bad config"))
    target = FastAPI()
    with patch.dict(sys.modules, {"app.api": broken}), caplog.at_level(logging.ERROR, logger="varoom.elie"):
        assert main.mount_property_news(target, tmp_path) is False
    assert "Property News failed to load" in caplog.text
    assert main.mount_property_news(target, tmp_path / "missing") is False
    assert main.health_check()["property_news_mounted"] is main.PROPERTY_NEWS_MOUNTED
