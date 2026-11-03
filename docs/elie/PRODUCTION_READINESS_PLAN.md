# Elie and Auto-Reply — Production Readiness Plan

**Status:** Approved 2026-11-03 (D1–D4 as recommended) · Phase 0 done · Phase 1 implemented on `elie-phase1-auto-reply` (not committed; tests pass, not yet deployed)

This plan makes the two chatbot features production ready:

- **Elie search** (`POST /elie/search` in `chatbot/main.py`): the client-side assistant in Chats that searches listings and property news.
- **Auto-reply** (`POST /reply` in `chatbot/main.py`, triggered from `server/routes/chatRoutes.js`): replies to a guest on the host's behalf when the host is in Away mode, or when the host types `@reply`.

Each phase is approved, built, verified and reported on its own, following `CLAUDE.md` §3 and §12. One branch per phase, cut from `main`.

---

## 1. Production targets

| Target | Goal | Measured by |
|---|---|---|
| Auto-reply works | An away-mode or `@reply` reply is saved, encrypted, and appears in the guest's open chat without a refresh | Manual scenarios (§7) and Express logs |
| Sending never breaks | A guest's message is always accepted when it was saved, even if Elie, Gemini or a follow-up lookup fails | Express tests |
| Elie answers in time | Server always answers before the client's 25 s timeout. Target p95 under 10 s for a warm service | Correlation-ID logs (`duration_ms`) |
| No false errors | Searches with a budget or guest count return listings or an honest "no results" reply, never "temporarily unavailable" | Python tests and manual scenarios |
| No leaks | Users never see provider error text; only participants can trigger a reply; diagnostics are not public | Tests and a manual check |
| Isolation | A Property News fault cannot stop Elie or auto-reply from starting, and an Elie fault cannot stop chat | Startup test |

## 2. Evidence: how the system behaves today

Found by reading the code on 2026-11-03. The first row also explains why nothing in production shows an auto-reply.

| # | Severity | Finding | Evidence |
|---|---|---|---|
| F1 | Critical | Auto-reply cannot read the conversation. `@reply` always answers "There is no guest enquiry to reply to yet"; Away mode replies without context | `get_conversation_messages` selects `messages.body` (`chatbot/main.py:888`), which `server/migrations/20260924_000026_chat_message_encryption.sql` dropped. The error is swallowed and `[]` returned |
| F2 | Critical | Auto-reply cannot save its reply. No away-mode reply or "Shared listing" message is ever posted | `insert_auto_reply` writes `body` (`chatbot/main.py:1019`). The Python service has no encryption key, so it cannot write `ciphertext/iv/key_version` either |
| F3 | High | Logs claim success that did not happen | `requestChatbotReply` logs "Elie response persisted" unconditionally (`server/routes/chatRoutes.js:63-72`) |
| F4 | High | `GEMINI_MODEL` is ignored; primary is always `gemini-3.7-flash` while the warning says 3.8 | `chatbot/main.py:60`. Tests hide it by overwriting the variable (`chatbot/test_elie_reliability.py:52`) |
| F5 | High | Searches with a budget or guest count probably fail with "Listing search is temporarily unavailable" | The embed is aliased `booking_details:listing_booking_details!inner(...)` but the filters use `listing_booking_details.price_amount` / `.max_guests` (`chatbot/main.py:1590-1592`). PostgREST expects the alias |
| F6 | High | Server can run longer than the client waits; the abandoned request keeps spending Gemini calls | Client aborts at 25 s (`client/lib/chat/elie.ts:7`). Server: classification budget 18 s, news lookup 12 s, news summary 18 s, plus auth/profile lookups of up to 8 s each, plus Render cold start |
| F7 | High | Provider error text is shown to users | `detail=f"Invalid request to Elie AI service: {exc}"` includes up to 1,000 chars of the Gemini error body (`chatbot/main.py:1763`); the client displays `detail` |
| F8 | Medium | Any participant can call the public `/reply` directly with any text, including text never sent in the chat | `/reply` trusts `payload.message` and accepts the client's token (`chatbot/main.py:623-688`) |
| F9 | Medium | No cooldown: each guest message in a burst gets its own AI reply, even if the host just replied | `chatRoutes.js:621-633` triggers on every client text message |
| F10 | Medium | A saved message can be reported as failed, so a retry posts it twice | After the insert, the away-mode, attachment and listing lookups can throw and return 502 (`chatRoutes.js:612, 642, 652`) |
| F11 | Medium | Express `@reply` has no suspended-account check, no host-only check and no timeout | `chatRoutes.js:444-465`, `requestChatbotReply` uses `fetch` with no signal |
| F12 | Medium | `/elie/diagnostics` is public and unthrottled; anyone can trigger paid Gemini calls | `chatbot/main.py:1869` |
| F13 | Medium | A Property News import error stops Elie and auto-reply from starting | Unguarded `app.mount("/", create_property_news_app())` (`chatbot/main.py:1917-1923`) |
| F14 | Medium | Malformed JSON from the news service becomes an unhandled 500 | Only `httpx.HTTPError` and `RuntimeError` are caught (`chatbot/main.py:1786`) |
| F15 | Low | Rate limiter keys on the client-supplied first `X-Forwarded-For` entry and never frees old keys | `chatbot/main.py:98-116` |
| F16 | Low | Every Supabase and Gemini call opens a new HTTP client; every Elie request re-verifies the token and reads the profile twice when the first select fails | `chatbot/main.py` throughout; `get_profile` fallback |
| F17 | Low | Client history is pasted into the prompt unwrapped, so a client can forge "Elie:" turns | `classify_message` history block (`chatbot/main.py:1308-1318`) |
| F18 | Low | Elie URL is hardcoded; in-flight requests are not aborted on reset, session load or unmount | `client/lib/chat/elie.ts:6`, `client/components/chat/useElie.ts` |
| F19 | Low | Auto-replies create no notification for the guest, unlike a normal host message | `insert_auto_reply` writes directly; `createNotification` only runs in the Express send route |
| F20 | High | Elie never finds event venues. Searches for venues filter on `event venues`, but listings store `venue` | Phase 0 query 5: categories are `airbnb`, `property`, `office`, `hotel`, `venue`. `server/routes/listingRoutes.js:13` uses `venue`; `normalize_category_filter` maps "venue" to `event venues` (`chatbot/main.py:139-148`) |

Production confirms F1/F2: `messages.body` no longer exists and **no auto-reply has ever been saved** (0 rows with `is_auto_reply`). 3 hosts currently have Away mode on.

Existing tests (22 in `chatbot/test_elie_reliability.py`) pass but never exercise `/reply`, message reads/writes, or filtered searches.

## 3. Current architecture and its failure points

```text
Guest sends text ─► Express POST /messages ─► encrypt + insert ─► 201
                         └─ host away? ─► fetch Python /reply (guest's token, no timeout)
                                             ├─ read messages.body  ✗ column dropped → []
                                             ├─ Gemini
                                             └─ insert messages.body ✗ fails, logged only
Host types @reply ─► Express POST /reply ─► Python /reply ─► same ✗ path

Client Elie ─► Python /elie/search (Render free, may be asleep)
                 ├─ Supabase auth + profile (new client each call)
                 ├─ Gemini classification (up to 18 s)
                 └─ listings (✗ aliased filter) │ property news (12 s) + Gemini summary (18 s)
```

The core design flaw: the Python service writes chat messages directly, but only Express can encrypt them.

## 4. Target architecture

```text
Guest sends text ─► Express ─► encrypt + insert ─► 201 (never fails after insert)
                      └─ autoReply.trigger(conversation) [single-flight per conversation, cooldown]
                            ├─ Express reads + decrypts recent messages
                            ├─ POST Python /internal/reply/generate (shared secret, 20 s timeout)
                            │     └─ listing facts + Gemini → { reply, alternative_listing_ids }   (no DB writes)
                            └─ Express encrypts + inserts reply (is_auto_reply = true)
                                 + listing messages + guest notification
                                 → realtime INSERT reaches the open chat
```

- **Express owns every chat message write.** One place encrypts, one place notifies. Python becomes a pure "generate text" service for auto-reply.
- **Python `/reply` is removed from the public surface.** The new endpoint requires `X-Elie-Internal-Key` (`CHATBOT_INTERNAL_API_KEY`, set on both services), so browsers cannot call it.
- **Elie search keeps its current shape** (browser → Python), with fixed filters, a single request deadline, and generic error messages.
- No database migration is needed: `messages.is_auto_reply`, `message_type = 'listing'` and `notifications` already exist.

## 5. Phases

### Phase 0 — Verify assumptions (read-only, no code)

1. The owner runs the read-only queries in [`docs/elie/ops/2026-11-03-phase0-checks.sql`](ops/2026-11-03-phase0-checks.sql) in the Supabase SQL Editor (each numbered query on its own) and shares the results. They confirm the dropped `body` column, that no auto-reply has been saved since encryption, the stored category and availability values, the columns Elie reads, the notification idempotency index and the Elie history tables.
2. ~~Confirm which Render services run `main:app` and which one is kept warm.~~ Answered by the owner 2026-11-03: `elie1-0` is the chatbot service, `property-news-pnsj` is the news service, and the keep-alive pings the main Express server. **`elie1-0` is not kept warm**, so it sleeps when idle (see D1).
3. Read the last week of `elie1-0` Render logs for `Elie response persistence failed` and `stage=listing_search status=400` to confirm F2 and F5 in production.

F5 needs no database check: the aliased filter (`booking_details.price_amount`) is the documented PostgREST form, so Phase 2 switches to it either way and a test pins it.

**Done when:** each item has a recorded answer in this file's status line or §2.

**Results (2026-11-03, run read-only through the Supabase Management API):**

| Query | Result |
|---|---|
| 1 `messages` columns | `body` absent; `ciphertext`, `iv`, `key_version`, `is_auto_reply` (default false), `message_type`, `listing_id` present |
| 2 Auto-replies | 0 ever, 0 since encryption |
| 3 Undecryptable live messages | 0 |
| 4 Hosts away | 3 |
| 5 Categories | airbnb 15, property 12, office 4, hotel 4, venue 1 (no `shop` yet) → F20 |
| 6 Availability | available 32, draft 2, paused 1, unavailable 1 |
| 7 Columns | all present, including `listings.verified` and `conversations.last_message_at` |
| 8 Notifications | unique index `notifications_event_key_idx` on `event_key` |
| 9 Elie history | `elie_sessions`, `elie_messages` exist with RLS on |
| Extra: triggers | only `varoom_reject_suspended_activity` (BEFORE INSERT) on `messages` and `conversations`; nothing maintains `last_message_at`, and 17 of 29 conversations already have a stale value |

### Phase 1 — Auto-reply works (F1, F2, F3, F8, F9, F10, F11, F19)

Branch `elie-phase1-auto-reply`.

Python (`chatbot/main.py`):
- New `POST /internal/reply/generate`, guarded by `X-Elie-Internal-Key` (constant-time compare; 503 if the key is unset). Body: `conversation_id`, `host_id`, `listing_id`, `trigger` (`away` | `command`), `guest_message`, `guest_enquiry` (all guest turns for `@reply`), `history` (list of `{speaker: host|guest, text}`, last 30, decrypted by Express). Returns `{ reply, alternative_listing_ids }`. No message reads or writes.
- Reuse `generate_ai_reply`, `get_listing_context` (including the host-ownership check) and `get_host_alternative_listings`.
- Remove `/reply`, `get_conversation_messages`, `insert_auto_reply`, `touch_conversation`. `conversations.last_message_at` exists, but no code reads it and normal messages do not update it (Express sorts conversations by their latest message), so auto-replies follow the same rule.
- A suspended host's auto-reply is rejected by the existing `varoom_reject_suspended_activity` insert trigger; Express logs it as `skipped (host suspended)`.

Express:
- New `server/lib/autoReply.js`:
  - `generate()` calls Python with the internal key and a timeout that allows for a cold start of `elie1-0` plus the reply's own 30 s Gemini budget: 90 s for away mode (runs in the background, nobody waits) and 60 s for `@reply` (the host's composer waits).
  - `persist()` encrypts and inserts the reply as the host with `is_auto_reply: true`, then any listing messages (`message_type: 'listing'`), then a `new_message` notification for the guest (same shape as the send route).
  - Away-mode trigger is **single-flight per conversation** (in-memory map) and **coalesces bursts**: when a reply finishes and newer guest messages arrived meanwhile, it generates once more, at most one follow-up.
  - **Cooldown** (D2): skip if an auto-reply was posted in this conversation within the cooldown window and no new guest message followed it; hard cap of auto-replies per conversation per hour.
  - Kill switch: `ELIE_AUTO_REPLY_ENABLED=false` disables away-mode replies without a deploy.
- Send route (`POST /chat/conversations/:id/messages`):
  - Fetch the full attachment and listing rows during validation (before the insert), so nothing after the insert can fail the request.
  - Away-mode lookup and trigger run after the response and only log on error.
- `@reply` route: add `rejectSuspendedActivity`, host-only check, and return `{ reply, message, messages }` decrypted, with `listing` joined, matching what `client/pages/chats.tsx:767` already appends.
- Replace the three unconditional "persisted" logs with real outcomes: `generated`, `persisted`, `skipped (reason)`, `failed (stage)`, all carrying the correlation ID, which is passed to Python as `X-Correlation-ID`.

Tests:
- `server/test/autoReply.test.js` (node:test, Supabase and fetch stubbed): away mode inserts an encrypted reply with `is_auto_reply`; the reply decrypts in the messages list; Python failure or timeout still returns 201 for the guest's message; post-insert lookup failure still returns 201; a burst of 3 messages yields at most 2 replies; cooldown and cap; non-host `@reply` → 403; suspended host → 403; kill switch.
- Python: internal key required (401 without, 503 when unset); generate performs no Supabase writes; history comes from the payload; alternative listing IDs belong to the host.

Added during implementation (found by running the endpoint locally against real Gemini and a real listing):
- **F4 moved into Phase 1.** `GEMINI_MODEL` is now honoured (default `gemini-3.8-flash`). The hardcoded `gemini-3.7-flash` timed out or returned 503 on every attempt, so the 18 s budget ran out before the fallback and the reply failed.
- The reply step gets its own Gemini budget (30 s, 12 s per attempt) and thinking level `low`; `call_gemini` takes an optional `thinking_level`.
- Suggested listings are found **before** the reply is written and named in the prompt. Before, the reply said "we don't have cheaper options" while three cheaper listings were shared under it.
- The key check is a FastAPI dependency, so a caller without the key gets 401 before the body is validated (no description of the request format).
- `generate_ai_reply` kept the oldest 2,000 characters of a long conversation; it now keeps the newest 3,000.
- Away-mode follow-ups remember which guest messages a reply covered: messages sent while a reply is being written are saved before it, and would otherwise be treated as answered.

**Local measurements (2026-11-03, real Gemini, read-only listing data):** away reply 9 s and 20 s, `@reply` with cheaper options 25 s. In all three, `gemini-3.8-flash` returned 503 or timed out and `gemini-3.6-flash` answered in 2–4 s. Recommendation: set `GEMINI_MODEL=gemini-3.6-flash` on `elie1-0` until 3.8 is stable.

**Done when:** tests pass and the §7 auto-reply scenarios pass on the deployed services.

### Phase 2 — Elie search correctness (F4, F5, F7, F14, F17, F20)

Branch `elie-phase2-search`.

- Models: the configuration itself was fixed in Phase 1. Remaining: fix the test fixture that overwrites `PRIMARY_GEMINI_MODEL` so the test checks the real configuration; give classification its own thinking level.
- Filters: use `booking_details.price_amount` / `booking_details.max_guests`. Add `created_at.desc` as a secondary order so results are stable.
- Categories (F20): canonical values become `airbnb, hotel, venue, office, shop, property`, matching `server/routes/listingRoutes.js:13`; "event venue(s)" and similar map to `venue`. Test with every stored value.
- Errors: safety blocks get a polite 200 reply ("I can't help with that one…"); all other errors return a generic message plus the correlation ID. Provider text is logged only.
- News: catch malformed JSON and non-dict payloads as "temporarily unavailable".
- Wrap client-supplied history in `<conversation_history>` tags with the same "untrusted" directive used for the guest message.
- Tests: filter params for budget and guests; category normalisation from real values; safety block → 200; Gemini 400 → no provider text in `detail`; malformed news payload → 503 with a generic message.

### Phase 3 — Latency and cold starts (F6, F16, F18)

Branch `elie-phase3-latency`.

- One request deadline of 20 s for `/elie/search`, shared by every stage (classification ≤ 10 s, listing search ≤ 5 s, news lookup ≤ 6 s, summaries get what remains; no-results falls back to the deterministic reply when time is short).
- Per-stage thinking level: `low` for classification and replies (configurable), instead of `medium` everywhere.
- One shared `httpx.AsyncClient` created in the FastAPI lifespan, so connections are reused.
- Cache verified tokens for 60 s, keyed by a SHA-256 of the token (never the token itself), max 1,000 entries. Single profile select (drop the fallback query now that `away_mode` exists).
- Cold start (D1, `elie1-0` sleeps when idle):
  - **Warm-up ping:** when Chats loads, `useElie` sends one `GET /health` to the Elie service (no auth, no Gemini call, ignored if it fails), so the service is waking while the user reads or types.
  - **Waking-up retry:** if a question times out or gets a 502/503 from Render's proxy, the thread shows "Elie is waking up…" and retries once automatically with a 60 s timeout before showing the error.
- Client: `NEXT_PUBLIC_ELIE_API_URL` with the current URL as default; abort the in-flight request on reset, session load and unmount.

### Phase 4 — Hardening and isolation (F12, F13, F15)

Branch `elie-phase4-hardening`.

- `/elie/diagnostics` requires `X-Elie-Internal-Key` and is rate limited.
- Rate limiter: per-user limit is primary; the IP key uses the right-most `X-Forwarded-For` entry (added by Render), and empty buckets are pruned.
- CORS: `allow_headers` limited to `Authorization`, `Content-Type`, `X-Correlation-ID`; localhost origins only when `ENVIRONMENT != production`.
- Guard the Property News mount: on import failure log an error and keep serving Elie and auto-reply. Add a startup test that simulates the failure.

### Phase 5 — Operations

Branch `elie-phase5-ops` (docs only).

- `docs/elie/OPERATIONS.md`: environment variables per service (`CHATBOT_INTERNAL_API_KEY`, `GEMINI_MODEL`, `GEMINI_FALLBACK_MODEL`, `ELIE_AUTO_REPLY_ENABLED`, `CHATBOT_API_URL`, `NEXT_PUBLIC_ELIE_API_URL`), deploy order, the kill switch, how to trace a request by correlation ID, and rollback.

## 6. Files and SQL by phase

**Database:** no migrations in any phase. The only SQL is the read-only Phase 0 file. If Phase 0 shows a schema or data gap, the fix is written as a separate SQL file and shared for the owner to run before the phase that needs it.

| Phase | Added | Edited |
|---|---|---|
| 0 | `docs/elie/ops/2026-11-03-phase0-checks.sql` (read-only) | `docs/elie/PRODUCTION_READINESS_PLAN.md` (results) |
| 1 | `server/lib/autoReply.js`, `server/test/autoReply.test.js`, `chatbot/test_internal_reply.py` | `chatbot/main.py` (internal generate endpoint; remove `/reply`, `get_conversation`, `get_conversation_messages`, `insert_auto_reply`, `touch_conversation`, `attach_video_media`; model config; reply budget; listings in the prompt), `server/routes/chatRoutes.js` (send route, `@reply` route, logs), `server/.env.example` (`CHATBOT_INTERNAL_API_KEY`, `ELIE_AUTO_REPLY_ENABLED`), `chatbot/.env.example` (`CHATBOT_INTERNAL_API_KEY`; the repo has no root `.env.example`) |
| 2 | — | `chatbot/main.py` (models, filters, categories, errors, news parsing, history tags), `chatbot/test_elie_reliability.py` (real model test, new search and error tests) |
| 3 | — | `chatbot/main.py` (deadline, thinking level, shared HTTP client, token cache, single profile read), `chatbot/test_elie_reliability.py`, `client/lib/chat/elie.ts` (env URL, abort signal, warm-up ping, waking-up retry), `client/components/chat/useElie.ts` (warm-up on load; abort on reset/load/unmount), `client/components/chat/ElieThread.tsx` ("Elie is waking up…" text in the existing thinking row), `client/test/chat-elie.test.js`, `client/.env.example` (`NEXT_PUBLIC_ELIE_API_URL`) |
| 4 | — | `chatbot/main.py` (diagnostics key, rate limiter, CORS, guarded mount), `chatbot/test_elie_reliability.py` |
| 5 | `docs/elie/OPERATIONS.md` | `docs/elie/PRODUCTION_READINESS_PLAN.md` (final status) |

Not touched: `client/pages/chats.tsx` (it already appends `message`/`messages` from `@reply` and receives new rows through realtime), the message encryption service, Property News code, and every other page.

## 7. Verification (production sign-off)

Automated, every phase: `pytest chatbot`, `npm test` in `server`, client tests, `tsc`, `next build`.

Manual, on the deployed services with the test accounts (no account-group actions):

| Scenario | Expected |
|---|---|
| Host away; guest sends "Hi, is it available this weekend?" | One reply from the host's side appears in the guest's open chat without a refresh; guest gets a notification; conversation preview shows the reply text |
| Guest sends 3 messages in 5 s | At most 2 replies |
| Guest asks "any cheaper options?" | Reply plus up to 3 listing cards from the same host |
| Host not away | No reply |
| Host types `@reply` | Reply appears at once in the host's chat and in the guest's |
| Guest calls the chatbot `/reply` or the internal endpoint directly | 404 / 401 |
| `ELIE_AUTO_REPLY_ENABLED=false` | Messages send; no replies |
| Gemini key temporarily invalid | Guest's message still sends; Express logs `failed (generate)`; Elie search shows a generic message |
| Elie: "Airbnb in Kilimani under 5k for 2" | Listings or an honest no-results reply, never "temporarily unavailable" |
| Elie: "what changed with land rates in Nairobi?" | Answer with citations, under 20 s |
| Elie after the service has slept (~15 min idle) | "Elie is waking up…", then the answer, with no error shown |
| Away-mode guest message while `elie1-0` is asleep | Reply still arrives (within about a minute) |
| `/elie/diagnostics` without the key | 401 |

Then watch Render and Express logs for 48 hours: no `failed (persist)`, no listing-search 400s, p95 under the target.

## 8. Decisions needed from the owner

| # | Decision | Recommendation |
|---|---|---|
| D1 | Cold starts on the free Render tier | **Settled 2026-11-03:** `elie1-0` is not kept warm (the keep-alive is for the main server, and the free 750 hours cover one always-on service). Warm-up ping when Chats loads, "Elie is waking up…" with one automatic retry, and auto-reply timeouts long enough for a cold start (Phases 1 and 3) |
| D2 | Away-mode limits | Cooldown 2 minutes per conversation, cap 10 auto-replies per conversation per hour |
| D3 | Should the guest be notified of an auto-reply like any host message? | Yes |
| D4 | Phase order | 1 → 2 → 3 → 4 → 5. Phase 1 alone restores the broken feature |

## 9. Risks and rollback

- **Deploy order (Phase 1):** deploy Python first (adds the internal endpoint), then Express. Auto-reply is already broken, so the gap costs nothing. Set `CHATBOT_INTERNAL_API_KEY` on both before deploying.
- **Single Express instance assumed** for the in-memory single-flight lock. With several instances the cooldown check in the database still prevents most duplicates. Record this if Express is scaled.
- **Reply loops:** only guest (`client_id`) text messages trigger a reply; replies are sent as the host and can never trigger another.
- **Cost:** the cap (D2), the shared deadline and the protected diagnostics bound Gemini spend.
- **Rollback:** `ELIE_AUTO_REPLY_ENABLED=false` for auto-reply; redeploy the previous commit for Elie search. No migrations to reverse.

## 10. Out of scope

- A visible "sent by Elie" label on auto-replies (a UI change; propose separately).
- Moving Elie search behind Express or rewriting it in Node.
- Splitting Property News into its own deployment (Phase 4 only guards the mount).
