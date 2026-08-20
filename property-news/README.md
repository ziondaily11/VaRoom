# VaRoom Property News

This is VaRoom's isolated Phase 1 property-news and intelligence subsystem. It is deliberately not mounted by the existing Express server and no existing VaRoom client, server, chatbot, database, or environment file is modified.

The service provides the complete back-office flow: source registry, collection, URL/content duplicate detection, structured analysis, deterministic risk controls, human review, controlled publishing, a public read API, and structured evidence retrieval for a future Elie integration.

## Run locally

```powershell
cd property-news
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
Copy-Item .env.example .env
uvicorn app.api:app --reload --port 8010
```

The in-memory store is used when Supabase credentials are absent, allowing development and tests without touching a database. Set `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` only in deployment to use the Supabase repository.

## Useful commands

```powershell
python -m unittest discover -s tests -v
python -m app.jobs --health-check
python -m app.jobs --collect-due
```

See `../docs/property-news/` for architecture, migration, operating, and future-integration documentation.
