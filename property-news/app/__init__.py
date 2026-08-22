"""Isolated VaRoom property-news subsystem. No existing VaRoom module imports this package in Phase 1."""

from .register_additional_sources import register_sources_from_json

__all__ = ["register_sources_from_json"]
