from __future__ import annotations

import os
from dataclasses import dataclass
from dotenv import load_dotenv


load_dotenv()


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


_default_ai_provider = os.getenv("NEWS_AI_PROVIDER") or "rules"
_default_ai_model = _first_set("NEWS_AI_MODEL", "GEMINI_MODEL") or (
    "gemini-2.5-flash" if _default_ai_provider.lower() == "gemini" else None
)


@dataclass(frozen=True)
class Settings:
    environment: str = os.getenv("NEWS_ENVIRONMENT", "development")
    log_level: str = os.getenv("NEWS_LOG_LEVEL", "INFO")
    supabase_url: str | None = os.getenv("SUPABASE_URL") or None
    supabase_service_role_key: str | None = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or None
    ai_provider: str = _default_ai_provider.lower()
    ai_api_key: str | None = _first_set("NEWS_AI_API_KEY", "GEMINI_API_KEY")
    ai_model: str | None = _default_ai_model
    ai_base_url: str | None = os.getenv("NEWS_AI_BASE_URL") or None
    fetch_timeout_seconds: int = _int("NEWS_FETCH_TIMEOUT_SECONDS", 20)
    fetch_max_bytes: int = _int("NEWS_FETCH_MAX_BYTES", 1_500_000)
    fetch_retry_attempts: int = _int("NEWS_FETCH_RETRY_ATTEMPTS", 3)
    fetch_user_agent: str = os.getenv("NEWS_FETCH_USER_AGENT", "VaRoomPropertyNews/0.1")
    min_request_interval_seconds: float = _float("NEWS_MIN_REQUEST_INTERVAL_SECONDS", 1.0)
    public_rate_limit_per_minute: int = _int("NEWS_PUBLIC_RATE_LIMIT_PER_MINUTE", 60)
    admin_api_key: str | None = os.getenv("NEWS_ADMIN_API_KEY") or None
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
