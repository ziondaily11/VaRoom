from __future__ import annotations

import logging
import os
from collections.abc import Mapping
from dataclasses import dataclass
from pathlib import Path
from dotenv import load_dotenv


# Only this service's own .env. A bare load_dotenv() searches parent folders
# and would pick up the main VaRoom .env, including production credentials.
load_dotenv(Path(__file__).resolve().parents[1] / ".env")


def _int(name: str, default: int) -> int:
    try:
        return int(os.getenv(name, str(default)))
    except ValueError:
        return default


def _float(name: str, default: float) -> float:
    try:
        return float(os.getenv(name, str(default)))
    except ValueError:
        return default


def _first_set(*names: str) -> str | None:
    return next((value for name in names if (value := os.getenv(name))), None)


def configure_logging(level: str) -> None:
    """Send the service's own log records to stderr at `level`.

    Uvicorn configures only its own loggers. Without this, records from the
    collector and pipeline fall through to Python's last-resort handler, which
    drops everything below WARNING.
    """
    root = logging.getLogger()
    if not root.handlers:
        handler = logging.StreamHandler()
        handler.setFormatter(logging.Formatter("%(levelname)s %(name)s: %(message)s"))
        root.addHandler(handler)
    root.setLevel(level.upper())
    # HTTP client request logs repeat full URLs, which can carry API keys.
    for name in ("httpx", "httpcore"):
        logging.getLogger(name).setLevel(logging.WARNING)


def resolve_ai_provider(env: Mapping[str, str]) -> str:
    """An explicit provider wins; otherwise use Gemini when its key is present."""
    explicit = (env.get("NEWS_AI_PROVIDER") or "").strip()
    if explicit:
        return explicit
    return "gemini" if env.get("GEMINI_API_KEY") else "rules"


# gemini-2.5-flash is no longer available to new API keys (Google returns 404
# NOT_FOUND); Elie's chatbot made the same move.
DEFAULT_GEMINI_MODEL = "gemini-3.8-flash"
RETIRED_GEMINI_MODELS = {"gemini-1.5-flash", "gemini-2.5-flash"}


def resolve_ai_model(env: Mapping[str, str], provider: str) -> str | None:
    """An explicit model wins unless Google has retired it; Gemini gets a default."""
    configured = next((value.strip() for name in ("NEWS_AI_MODEL", "GEMINI_MODEL")
                       if (value := env.get(name)) and value.strip()), None)
    if configured and not (provider == "gemini" and configured in RETIRED_GEMINI_MODELS):
        return configured
    return DEFAULT_GEMINI_MODEL if provider == "gemini" else None


# Tried when the main model is overloaded or unavailable (Elie uses the same).
DEFAULT_GEMINI_FALLBACK_MODEL = "gemini-3.6-flash"


def resolve_ai_fallback_model(env: Mapping[str, str], provider: str, model: str | None) -> str | None:
    if provider != "gemini":
        return None
    configured = next((value.strip() for name in ("NEWS_AI_FALLBACK_MODEL", "GEMINI_FALLBACK_MODEL")
                       if (value := env.get(name)) and value.strip()), None)
    fallback = configured if configured and configured not in RETIRED_GEMINI_MODELS else DEFAULT_GEMINI_FALLBACK_MODEL
    return fallback if fallback != model else None


_default_ai_provider = resolve_ai_provider(os.environ)
_default_ai_model = resolve_ai_model(os.environ, _default_ai_provider.lower())
_default_ai_fallback_model = resolve_ai_fallback_model(os.environ, _default_ai_provider.lower(), _default_ai_model)


@dataclass(frozen=True)
class Settings:
    environment: str = os.getenv("NEWS_ENVIRONMENT", "development")
    log_level: str = os.getenv("NEWS_LOG_LEVEL", "INFO")
    supabase_url: str | None = os.getenv("SUPABASE_URL") or None
    supabase_service_role_key: str | None = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or None
    ai_provider: str = _default_ai_provider.lower()
    ai_api_key: str | None = _first_set("NEWS_AI_API_KEY", "GEMINI_API_KEY")
    ai_model: str | None = _default_ai_model
    ai_fallback_model: str | None = _default_ai_fallback_model
    ai_base_url: str | None = os.getenv("NEWS_AI_BASE_URL") or None
    fetch_timeout_seconds: int = _int("NEWS_FETCH_TIMEOUT_SECONDS", 20)
    fetch_max_bytes: int = _int("NEWS_FETCH_MAX_BYTES", 1_500_000)
    fetch_retry_attempts: int = _int("NEWS_FETCH_RETRY_ATTEMPTS", 3)
    fetch_user_agent: str = (
        _first_set("NEWS_FETCH_USER_AGENT")
        or "VaRoomNewsBot/1.1 (+https://varoom.co.ke)"
    )
    min_request_interval_seconds: float = _float("NEWS_MIN_REQUEST_INTERVAL_SECONDS", 1.0)
    public_rate_limit_per_minute: int = _int("NEWS_PUBLIC_RATE_LIMIT_PER_MINUTE", 60)
    admin_api_key: str | None = (os.getenv("NEWS_ADMIN_API_KEY") or "").strip() or None
    scheduler_secret: str | None = os.getenv("NEWS_SCHEDULER_SECRET") or None
    # GitHub Actions is the production collector. In-process collection is off
    # so a Render boot cannot collide with the scheduled workflow.
    enable_background_scheduler: bool = os.getenv("NEWS_ENABLE_BACKGROUND_SCHEDULER", "false").lower() in {"1", "true", "yes"}

    @property
    def supabase_configured(self) -> bool:
        return bool(self.supabase_url and self.supabase_service_role_key)

    @property
    def scheduler_configured(self) -> bool:
        return bool(self.scheduler_secret)

settings = Settings()
