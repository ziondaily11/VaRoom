# VaRoom Chatbot Service

A standalone Python microservice, separate from the Node/Express backend
in `server/`. This is **not** merged into the main app — it runs on its
own, and the frontend/backend will call it over HTTP once it's wired up.

## What this is for (long-term)

VaRoom hosts will eventually be able to pay for an automated chatbot that
replies to client inquiries about their listings instead of the host
answering manually. This service is where that logic will live.

## What's actually built right now (scaffold only)

This is intentionally minimal — just the shape of the service, not the
real intelligence:

- `GET /health` — confirms the service is running
- `POST /reply` — accepts a client's message plus optional listing
  context, and returns a reply. **Right now this returns a canned,
  hardcoded response** — there's no real AI/LLM call, and no connection
  to Supabase or any database yet. This exists so the rest of the system
  (frontend, Node backend) has a stable request/response shape to build
  against before the real logic is filled in.

## Running it locally

```bash
cd chatbot
pip install -r requirements.txt
uvicorn main:app --reload
```

The service starts on `http://localhost:8000` by default.

Confirm it's working:

```bash
curl http://localhost:8000/health
# {"status":"ok"}
```

Try the placeholder reply endpoint:

```bash
curl -X POST http://localhost:8000/reply \
  -H "Content-Type: application/json" \
  -d '{"message": "Is this still available?", "listing_title": "Cozy 2-bedroom Airbnb"}'
```

FastAPI also gives you interactive API docs for free — once the server's
running, open `http://localhost:8000/docs` in a browser to see and test
both endpoints without curl.

## Request/response shape

`POST /reply` expects JSON like:

```json
{
  "message": "Is this still available?",
  "listing_id": "optional-uuid-if-known",
  "listing_title": "optional listing title, used to personalize the reply",
  "host_name": "optional, not currently used but reserved for later"
}
```

And returns:

```json
{
  "reply": "a plain string reply"
}
```

## What's deliberately NOT built yet

- No real AI/LLM call — `/reply` returns a canned response regardless of
  the actual message content.
- No Supabase or database connection of any kind.
- No authentication — anyone who can reach this service can call it.
- No deployment config — this only runs locally for now.

## Next steps (not part of this pass)

- Wire `/reply` to an actual LLM, using `message` + real listing details
  pulled from Supabase (not just what's passed in the request) to
  generate a grounded response instead of a canned one.
- Add a way to fetch real listing context by `listing_id` from Supabase
  rather than relying on the caller to pass `listing_title` directly.
- Decide on auth between this service and the Node backend (e.g. a
  shared secret header) before this is reachable from anywhere but
  localhost.
- Add deployment config once ready to run this somewhere other than a
  local machine.
