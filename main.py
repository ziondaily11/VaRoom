"""Deployment entrypoint for the VaRoom chatbot service.

The maintained implementation lives in ``chatbot.main``. Keeping this
entrypoint as a thin import prevents Render and local development from
running different Elie pipelines.
"""

from chatbot.main import app

__all__ = ["app"]
