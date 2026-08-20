# Deployment

1. Create a separate development deployment for the `property-news/` service; do not add it to the current Express deployment yet.
2. Apply the additive migration to a confirmed development Supabase project.
3. Store `SUPABASE_SERVICE_ROLE_KEY`, AI credentials, and a long random `NEWS_ADMIN_API_KEY` in platform secret storage only. Never use them in browser code.
4. Run the service with an ASGI server, for example `uvicorn app.api:app --host 0.0.0.0 --port 8010`.
5. Schedule `python -m app.jobs --collect-due` and a daily `--health-check` job in the deployment platform.
6. Verify a controlled source, a low-risk item, a high-risk review item, public reads, and unauthorised admin denial before enabling more sources.

The service must be reachable only through TLS and an API gateway/reverse proxy with production rate limits, request logging, and restricted administrative access. Activate candidate sources one by one after source-specific technical and copyright review.
