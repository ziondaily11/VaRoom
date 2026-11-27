# Elie — Operations

How to configure, deploy, switch off, trace and roll back Elie. This guide covers Elie search, the host's Elie tools (away answers, `@reply`, drafts, "Write with Elie") and V-Coins. The plan and history behind them are in [`PRODUCTION_READINESS_PLAN.md`](PRODUCTION_READINESS_PLAN.md).

Checked against the code on 2026-11-27.

---

## 1. The services

| Service | Code | What it does for Elie |
|---|---|---|
| **`elie1-0`** (Render, Python) | `chatbot/main.py` | Answers Elie search (`POST /elie/search`). Writes host replies and listing text when the main server asks (`/internal/*`). Calls the AI model. Also serves Property News (`property-news/`, mounted at `/`). Sleeps when idle on the free tier. |
| **Main server** (Render, Node) | `server/` | Owns every chat message: decrypts the history, asks `elie1-0` for a reply, then encrypts and saves it. Counts host Elie actions and sells V-Coins through Paystack. |
| **Client** (Next.js) | `client/` | The Elie thread in Chats, the V-Coin meter, the host's Elie buttons. Calls `elie1-0` directly for search, and the main server for everything else. |
| **Supabase** | `server/migrations/` | Search history (`elie_sessions`, `elie_messages`), V-Coins (`elie_ledger`), host actions (`elie_host_actions`), listings. |

```text
Browser ── POST /elie/search ──────────────────────► elie1-0 ──► AI model (OpenRouter or Gemini)
   │                                                    │
   └─ POST /api/chat/... ─► main server ─ /internal/* ──┘ (X-Elie-Internal-Key)
                               └─ encrypts and saves every message
```

## 2. Settings

Never put a key in git, in chat or in a screenshot. Keys live in the Render environment only.

### `elie1-0`

| Setting | Needed | Default | What it does |
|---|---|---|---|
| `LLM_PROVIDER` | No | `openrouter` when `OPENROUTER_API_KEY` is set, else `gemini` | Which provider writes Elie's answers. An unknown value falls back to `gemini`. |
| `OPENROUTER_API_KEY` | With OpenRouter | — | The OpenRouter key. |
| `OPENROUTER_MODEL` | No | `anthropic/claude-haiku-5.5` | First model tried. |
| `OPENROUTER_FALLBACK_MODEL` | No | `openai/gpt-5.6-luna` | Tried when the first fails. Pick one from another company, so a single outage doesn't take out both. |
| `OPENROUTER_REASONING` | No | unset (nothing sent) | Reasoning effort (`none`, `minimal`, `low`…) for models that think. Some models reject it. |
| `GEMINI_API_KEY` | With Gemini | — | The Gemini key. Property News also uses it unless `NEWS_AI_API_KEY` is set. |
| `GEMINI_MODEL` | No | `gemini-3.8-flash` | First Gemini model. |
| `GEMINI_FALLBACK_MODEL` | No | `gemini-3.6-flash` | Second Gemini model. If it equals the first, the other one is used. |
| `GEMINI_CAPACITY` | No | `medium` | Gemini thinking level. |
| `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | Yes | — | Sign-in checks, listings, history, V-Coins. |
| `CHATBOT_INTERNAL_API_KEY` | Yes | — | Shared secret for `/internal/*` and `/elie/diagnostics`. **Must match the main server's.** Unset means those endpoints answer 503. |
| `ENVIRONMENT` | In production | unset | `production` stops accepting the localhost origins. |
| `CORS_ORIGINS` | No | varoom.co.ke, www, `elie1-0`, `property-news-pnsj`, plus localhost unless production | Comma-separated list. Setting it **replaces** the default list, so include every VaRoom origin. |
| `PROPERTY_NEWS_API_URL` (or `NEWS_API_URL`) | For news answers | — | Where Elie looks up property news. |
| `NEWS_*` | For Property News | see `property-news/.env.example` | Property News settings, since it runs inside this service. |

Fixed in code (change them only with a deploy):

| Value | Setting |
|---|---|
| Time for one Elie question | 20 s (`ELIE_REQUEST_SECONDS`) |
| Questions a minute | 20 per account, 60 per address |
| Diagnostics calls | 6 a minute |
| Sign-in cache | 60 s, never past the token's own expiry, at most 1,000 entries |
| Guided search | counts up to 200 matches, asks above 8, at most 3 questions, shows 8 per page |

### Main server

| Setting | Needed | Default | What it does |
|---|---|---|---|
| `CHATBOT_API_URL` | No | `https://elie1-0.onrender.com` | Where the server calls Elie. No trailing slash. |
| `CHATBOT_INTERNAL_API_KEY` | Yes | — | Same value as on `elie1-0`. Without it every host Elie action fails at the `config` stage. |
| `ELIE_AUTO_REPLY_ENABLED` | No | `true` | `false` stops Elie's away answers at once (see §3). |
| `PAYSTACK_MODE`, `PAYSTACK_SECRET_KEY`, `PAYSTACK_WEBHOOK_SECRET` | Yes | — | V-Coin payments, shared with host plans. |
| `PUBLIC_BASE_URL`, `CLIENT_BASE_URL` | Yes | — | Where Paystack returns after a card payment (`/chats?c=elie&vcoins=return`). |

Fixed in code:

| Value | Setting |
|---|---|
| Host Elie actions | 300 a month, from the 1st, Nairobi time (`ELIE_HOST_ACTION_LIMIT`) |
| Away answers | per conversation: one at a time, 2 minutes apart (later messages wait and are answered together), at most 10 an hour |
| Time the server waits for Elie | away answers 90 s, `@reply` and drafts 60 s, "Write with Elie" 60 s. Each allows for a cold start. |

### Client

| Setting | Needed | Default | What it does |
|---|---|---|---|
| `NEXT_PUBLIC_ELIE_API_URL` | No | `https://elie1-0.onrender.com` | Where the browser sends Elie questions. **Baked in at build time:** changing it needs a client rebuild, and `elie1-0` must allow the new origin in `CORS_ORIGINS`. |

## 3. Switches

| To… | Do | Takes effect |
|---|---|---|
| Stop Elie's away answers | Main server: `ELIE_AUTO_REPLY_ENABLED=false` | On restart. Guests still get the host's own away message, and `@reply` and drafts still work. Set it back to `true` (or remove it) to resume. |
| Move from OpenRouter to Gemini | `elie1-0`: `LLM_PROVIDER=gemini`, with `GEMINI_API_KEY` set | On restart. No code change. |
| Change the model | `elie1-0`: `OPENROUTER_MODEL` / `OPENROUTER_FALLBACK_MODEL` (or the Gemini pair) | On restart. Check with `/health`, then `/elie/diagnostics`. |
| Point the client at another Elie | `NEXT_PUBLIC_ELIE_API_URL`, rebuild the client, and add the origin on the new service | On the client deploy. |

There is no switch that turns Elie search off by itself. To stop it, suspend `elie1-0` on Render. That also stops host Elie and Property News, and searches show "Elie is temporarily unavailable".

## 4. Deploy order

When a change touches several services, deploy in this order. Each step must be live before the next.

1. **Database.** Run any new migration in the Supabase SQL Editor (its check query first). Migrations are written to work with the code already running.
2. **`elie1-0`.** New fields and endpoints are added before anything calls them. An older page simply ignores fields it doesn't know.
3. **Main server.**
4. **Client.**

After each deploy:

- **`elie1-0`:** open `https://elie1-0.onrender.com/health`. Expect `status: ok`, the intended `provider` and `primary_model`, `ai_configured: true`, `supabase_configured: true` and `property_news_mounted: true`.
- **Model connection:** run `/elie/diagnostics` (see §5).
- **The whole path:** ask Elie one question from a test account, and check the V-Coin balance changes as expected.

`/health` never calls the model, so it is free to open at any time.

## 5. Checking the model connection

```bash
curl -s https://elie1-0.onrender.com/elie/diagnostics -H "X-Elie-Internal-Key: <CHATBOT_INTERNAL_API_KEY>"
```

Paste the key into your own terminal only. The call makes one small model call (6 a minute at most). Expect `"status": "ok"`, `"ai_connectivity": true` and a `latency_ms`. A `degraded` status comes with an `error` such as `Diagnostic probe failed: LLM_CREDITS (status=402)`. Look the code up in §6. Without the key, the answer is 401 and no model is called.

## 6. Tracing a problem

Every Elie request carries one ID, logged on each line as `request_id=…`. Its prefix tells you where it started:

| Prefix | Started by | Where to look |
|---|---|---|
| `CLIENT-…` | An Elie search from the browser | `elie1-0` logs |
| `ELIE-…` | A request that came without an ID (e.g. diagnostics) | `elie1-0` logs |
| `AR-…` | Away answers, `@reply`, drafts | Main server logs (`Elie auto-reply <event>: { correlationId: 'AR-…' }`), then `elie1-0` logs |
| `EW-…` | "Write with Elie" | `elie1-0` logs (the server's failure line doesn't print the ID, see §10) |

### A search failed

1. **Get the ID.**
   - In the browser's developer tools, open the Network tab and find the `search` request. The ID is its `X-Correlation-ID` request or response header.
   - Otherwise, ask the person for the time and search the `elie1-0` logs around it.
2. **Search the `elie1-0` logs for it.** The lines follow the request in order:
   - `stage=auth_check error=…`: the sign-in was missing or expired. The person should sign in again.
   - `stage=classification …`: understanding the question.
   - `provider=openrouter model=… result=success duration_ms=…`: a model answered, and how fast.
   - `result=all_attempts_failed category=…`: every model attempt failed. Look the category up below.
   - `stage=search_listings_failed category=DATABASE_ERROR`: the listing query failed. Check Supabase.
   - `stage=vcoin_charge error=…`: the answer was shown, but the charge failed. The person wasn't charged.
   - `stage=save_turns error=…`: the answer was shown, but not saved to history.
   - `decision=deadline_reached`: the 20 s were used up.
3. **The person saw "Elie is waking up…":** `elie1-0` was asleep. The page waited up to 60 s and asked once more. No log line is missing; the service was simply starting.

### What the error categories mean

| Category | Meaning | What to do |
|---|---|---|
| `LLM_CREDITS` (402) | The OpenRouter balance is used up | Top up OpenRouter credits, or switch to Gemini (§3) |
| `LLM_AUTH_ERROR` (401) | Wrong or missing key | Check the key on `elie1-0` |
| `LLM_MODEL_ERROR` (404) | The model name doesn't exist | Fix `OPENROUTER_MODEL` / `GEMINI_MODEL` |
| `LLM_RATE_LIMIT` (429), `LLM_PROVIDER_5XX`, `LLM_TIMEOUT`, `LLM_NETWORK_ERROR` | The provider is busy or down. These are retried, then the fallback model is tried | Usually passes. If it lasts, change the fallback model or provider |
| `LLM_SAFETY_BLOCK` | The model refused | Elie answers politely; nothing to do |
| `LLM_EMPTY_RESPONSE`, `LLM_INVALID_OUTPUT` | The model answered with nothing usable | Rare. If frequent, try another model |
| `LLM_CLIENT_ERROR` (400) | The request was rejected, for example because the model doesn't support `OPENROUTER_REASONING` | Unset `OPENROUTER_REASONING` or change the model |

People never see these codes or the provider's text, only "Elie is temporarily unavailable. Please try again shortly."

### An away answer didn't arrive

In the main server logs, search for `Elie auto-reply` around the guest's message:

- `away message sent`: the host's own away message was sent. It goes out even when Elie stays quiet.
- `generated` then `persisted`: Elie's answer was saved.
- `skipped … reason: …`: Elie stayed quiet on purpose:

  | Reason | Meaning |
  |---|---|
  | `elie disabled` | `ELIE_AUTO_REPLY_ENABLED=false` |
  | `plan without elie` | The host's plan doesn't include Elie |
  | `monthly elie limit reached` | The host used their 300 actions this month |
  | `hourly limit reached` | 10 Elie answers in this conversation in the last hour |
  | `already answered` | Every guest message is already answered |
  | `host not away`, `host suspended` | Away mode is off, or the host's account is suspended |
  | `no guest enquiry` | `@reply` or a draft with no guest message to answer |

- An answer within 2 minutes of the last one isn't skipped: it waits until the 2 minutes are up, then covers every message sent meanwhile.
- `failed … stage: …`: something broke.
  - `generate`: Elie didn't answer in time or returned an error. Take the `correlationId` to the `elie1-0` logs.
  - `persist`: saving the answer failed. Check Supabase and the encryption key.
  - `history`, `profile`, `cap`: a database read failed. Check Supabase.

When Elie fails, the action is given back, so the host isn't charged for it.

## 7. Database migrations

The owner runs each one in the Supabase SQL Editor, before the deploy that needs it. Each file starts with what it does and how to undo it.

| Order | File | Adds | Undo |
|---|---|---|---|
| 1 | `20260919_000015_chat_auto_reply.sql` | `messages.is_auto_reply` | `alter table public.messages drop column if exists is_auto_reply;` (only if auto-replies are retired) |
| 2 | `20261123_000079_elie_vcoins.sql` | `elie_ledger`, `elie_vcoin_wallet`, `elie_spend_vcoins`, `billing_payments.vcoins` | In the file. **It deletes every balance and purchase record, so never run it once coins have been sold.** |
| 3 | `20261124_000080_elie_message_results.sql` | `elie_messages.results` (listings and news kept with an answer) | `alter table public.elie_messages drop column if exists results;` |
| 4 | `20261125_000081_elie_host_actions.sql` | `elie_host_actions`, `elie_host_included`, `elie_use_host_action`, `elie_release_host_action`, `elie_host_usage`, `elie_host_month_start` | In the file, in order: restore `elie_vcoin_wallet` from 000079 first, then drop the functions and the table. |

`elie_sessions` and `elie_messages` predate these files. Account deletion clears them (`20260923_000025_permanent_account_deletion.sql`).

Read-only checks used during the plan are in [`ops/`](ops/).

## 8. Rolling back

| Service | How | Notes |
|---|---|---|
| `elie1-0` | Render → the service → Events → **Rollback** to the last good deploy | Safe at any time. The database keeps working with older code. |
| Main server | The same, on the server service | If only Elie's away answers misbehave, `ELIE_AUTO_REPLY_ENABLED=false` is faster. |
| Client | Redeploy the previous build | An older page keeps working against a newer `elie1-0`. |
| Database | Undo blocks in §7 | Last resort. Roll the code back first, and never undo 000079 after coins are sold. |

Roll back in the reverse of the deploy order: client, then main server, then `elie1-0`, then the database.

## 9. Costs and limits

| What | Amount |
|---|---|
| Welcome coins | 50, once per account |
| Packs | KSh 100 → 100 coins, 250 → 275, 500 → 600, 1,000 → 1,300. Coins never expire. |
| Search with results | 10 coins |
| News answer | 15 coins |
| Free | Chat, searches with no results, questions about listings already shown, guided-search questions, "Show more", errors |
| Plans that include Elie (Airbnb Business, Hotel Plus, Venue Premium, legacy Pro) | Search without coins, plus 300 host actions a month |
| Meter colour | Green 50+ (or a plan with Elie), yellow 20–49, red under 20 |

Model cost is bounded by the per-account limit (20 questions a minute), the 20 s deadline per question, the protected diagnostics, and the away-answer cooldown and cap. Watch the OpenRouter balance: when it runs out, every answer fails with `LLM_CREDITS` until it is topped up or the provider is switched.

## 10. Known gaps

- People see no reference number when Elie fails. The ID is only in the browser's developer tools and the logs, so a complaint is traced by time.
- `elie1-0` logs a line per model call, not one summary line per question with the account. Finding one person's question means searching by time.
- "Write with Elie" logs its failures on the main server without the `EW-…` ID.
- The away-answer cooldown is kept in the memory of one main server instance. With several instances, the database check still prevents most duplicates.
- The production Claude key (a direct `anthropic` provider beside OpenRouter and Gemini) is not built yet. Until it is, Claude models run through OpenRouter.
