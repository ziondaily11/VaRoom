# Property News Production Completion Report

**Date:** 21 August 2026
**Scope:** Property News only. `client/client-home.html` was not changed or staged.

## Delivery result

The production code path is complete and ready to release. It mounts the isolated service on the existing Render FastAPI application, routes VaRoom’s public news reads through Vercel, uses the server-side Gemini credential when available, and runs a protected twice-hourly collection workflow independent of a laptop.

The connected live Supabase project and public Property News API are now live. The remaining production check is scheduled ingestion: the latest GitHub Actions collector runs received Render `502` responses after the platform request timeout, so the Render job path must be verified after the workflow routing fix is deployed.

## Implemented

- Root Render integration in `main.py`, preserving the established chatbot routes.
- Public Vercel rewrites for `/api/news` to the Render origin.
- Gemini JSON analysis with deterministic relevance, risk, and review safeguards.
- End-to-end collection processing: discovery, deduplication, per-source fetch runs, analysis, automatic low-risk publication, and pending review for consequential material.
- Secret-protected source activation and collection endpoints, with an in-process concurrency guard.
- GitHub Actions scheduler every 30 minutes.
- Verified initial source configuration for the [State Department for Lands and Physical Planning](https://www.lands.go.ke/): its `robots.txt`, `/allnews`, and a discovered article endpoint were reachable; the collector remains TLS-strict and host-restricted.
- Production deployment, source registry, and rollback documentation.

## Verification evidence

- `python -m unittest discover -s tests -q`: **15 tests passed**.
- `python -m compileall -q app`: passed.
- `client/vercel.json`: valid JSON.
- In-process request through the existing root application: `GET /api/news/latest?limit=1` returned **200** with the mounted service.
- Current production checks: `https://varoom.co.ke/api/news/latest?limit=1` and `https://varoom-1.onrender.com/api/news/latest?limit=1` return published data; scheduled collection remains the outstanding verification.
- Local live-source rehearsal was intentionally not allowed to disable certificate validation: this Windows network presents an injected TLS certificate that Python does not trust, while OS-level HTTPS checks to the official site succeeded. The collector’s secure verification remains enabled.

## Required final release actions

Follow [`DEPLOYMENT.md`](DEPLOYMENT.md) in order: apply the additive migration, configure `NEWS_SCHEDULER_SECRET` in Render and matching GitHub Actions secrets, allow the linked deployments to finish, call the protected official-source activation endpoint, and run the workflow once. Only then can the final live host-dashboard test and first published story be recorded.
