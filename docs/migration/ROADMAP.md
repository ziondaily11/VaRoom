# VaRoom React + TypeScript Migration — Roadmap and Tracker

This is the **single progress tracker** for the migration defined in `CLAUDE.md`. Line counts and magnitudes come from the inventory appendix in `CLAUDE.md`.

## How we work

- **One task at a time, in the order below.** A task starts only when the previous one is **Done** or explicitly parked.
- **Each task follows the same steps:** Investigation → Plan → Approval → Implementation → Verification → Report. It meets the Definition of Done in `CLAUDE.md` §14.
- **Each task gets its own branch.** Stage A increments share `agents/stage-a-foundation`. Pages get `agents/<stage><n>-<page>`, and hotfixes get `fix/<name>` from `main`.
- **Nothing is committed, pushed or deployed without explicit instruction.**
- **Problems found along the way go into the Backlog**, not into the current task. The exception is a production-breaking bug: that becomes a Hotfix task, which waits its turn like any other.

Statuses: `Not started` · `Investigating` · `Awaiting approval` · `In progress` · `Verifying` · `Done — awaiting commit` · `Done`

## Current position

**Stage A is complete and merged (PR #511–#513). Current work, before Stage B: the Chats track below. H4 (Chats send and XSS hotfix) is committed and pushed on `fix/chats-send-and-xss` (`09e4339`). CH1 (message controls) is done and verified on `feat/chats-message-controls` (stacked on H4), awaiting commit instructions.**

---

## Hotfixes (production bugs, shipped independently from `main`)

| ID | Task | Mag. | Status |
|---|---|---|---|
| H1 | `/list` (listing wizard) is broken in production since 2026-10-23 (`b1fa8b2`). `parseTemplate` in `pages/[...slug].js` cuts the body at the first `</body>`, which sits inside a `srcdoc` string in `list.html`. That splits a `<script>`, and the page's JS never loads. Fix: match up to the last `</body>`, plus a regression test. Branch `fix/list-template-parsing` (worktree `../VaRoom-H1`). Verified: 284/284 tests pass and the build succeeds; signed-in host check on `/list` and `/properties` passes, plus 10 other legacy pages; parsing output is byte-identical for every template except `list.html`. Commit `30501df`, PR https://github.com/ziondaily11/VaRoom/pull/501. | XS | Done — merged (PR #501, `d0f8d42`) |

| H2 | Linked-account removal must be permanent (X/Y/Z → Y/Z → Y/Z/K). The server model was already correct: removal deletes only the `account_group_members` row and frees the slot, every link is an explicit sign-in, and stale browser data is filtered against server membership. The gap was in `public/js/account-switcher.js`: `switchAccount` trusted the group list loaded when the page opened, so a page opened before a removal (on any device) could switch back into the removed relationship using stored credentials. Fix: re-confirm membership with the server before every switch, and block the switch if the lookup fails. Branch `fix/linked-account-removal` (from `agents/stage-a-foundation`). Verified: 340/340 client tests, including `test/linked-account-removal.test.js`, which runs the full scenario across browsers and fresh logins against a backend model of the SQL rules and fails without the fix; server account-group tests 8/8; read-only Settings check. | XS | Done — awaiting production test |

| H3 | Switching between linked accounts asked for a new sign-in. Cause: refresh tokens rotate on every refresh (`enable_refresh_token_rotation`; the old token is rejected after 10 s), but the stored copy used for switching was only re-saved when a sidebar mounted or a few legacy pages ran, so background refreshes left it stale ("Invalid Refresh Token: Already Used"). Fix in `account-switcher.js`: `watchSessionTokens` saves every refreshed or new session (installed from `_app`); `switchAccount` saves the outgoing account first, uses the freshest stored pair, retries once if another tab just rotated it, and maps a genuinely revoked token to "sign in again". No new tokens are minted and no API or database change. Verified: 346/346 tests, including `seamless-account-switching.test.js` (both directions across three accounts, expiry, browser restart, cross-tab rotation; 4 of 5 fail without the fix); real-browser check that the stored token follows each rotation on native and legacy pages. | S | Done — merged |
| H4 | Native Chats (`/chats`): the send button throws (the click event is passed as the message text), mobile users cannot send text (Enter only sent above 760 px, the reverse of legacy), message formatting is rendered with `dangerouslySetInnerHTML` after a regex filter that lets unquoted event handlers through (XSS), file downloads link to a JSON route that needs the session token, and the tab title shows "Â·". Fix: `lib/chat/messageBody.ts` rebuilds allowlisted elements with no attributes (as legacy did) and React renders them as elements and text; send and Enter fixed; downloads open the signed URL. Branch `fix/chats-send-and-xss`. Verified: 374/374 tests (new `chat-message-body.test.js` with XSS payloads), `tsc`, build; send button (desktop) and Enter (390 px) send in the Elie conversation on both accounts; title correct; no uncaught errors. The download fix is not browser-verified: no file messages in the test accounts' recent conversations. | S | Done — pushed (`09e4339`) |

## Chats track — finish the native page, then retire `chats.html`

Found 2026-11-02 by comparing `chats.html` + `public/js/chat-data.js` with `pages/chats.tsx`. `/elie` is the only route still rendering `chats.html`. `chats.css` already holds the legacy styles. Decisions: H4 first; the message menu opens by right-click, 500 ms long-press **and** the native "⋯" button, styled as the legacy `.chat-message-menu`; Copy shows a brief "Copied" note; the non-working stubs ("Mark as read", conversation "Delete", unread badges) are removed and moved to the backlog.

| ID | Scope | Mag. | Status |
|---|---|---|---|
| CH1 | Message controls: Reply, Copy (plain text, line breaks kept), Pin/Unpin, Delete for me (any message), Delete for everyone (own, with confirm); text messages only, never Elie; errors shown; after an action the thread and cache are refetched in full (the cache's `since` sync misses pins and deletions, a bug legacy had too). Clickable reply references with scroll + highlight and "This message is unavailable"; legacy composer reply preview inside the composer (click scrolls, Escape or ✕ cancels); pinned banner as plain text; deleted rendering for every message type. Stubs removed. New: `components/chat/MessageActionMenu.tsx`, `lib/chat/messageActions.ts`, `messagePlainText`. Verified: 382/382 tests, `tsc`, build; both accounts in a browser with actions intercepted (no real conversation changed) | S–M | Done — awaiting commit |
| CH2 | Thread and composer parity: listing cards (with video), voice playback, read receipts, encryption notice, skeletons, load-error and role-specific empty states, inbox re-sort and preview update, keep text on a failed send and guard double sends, role gating for attachments, share-listing sheet, `@reply`, mobile pending file, photo-preview Escape and object-URL leak, realtime double fetch, stale online dot, mobile keyboard handling | L | In progress: CH2a and CH2b done; CH2c (inbox and live updates) follows |
| CH3 | Elie parity: suggestion chips, last 6 turns of history, 25 s timeout, result cards (listings, news, suggestion), saved sessions (`elie_sessions`/`elie_messages`) and history panel, avatar, "About Elie" info panel | M | Not started |
| CH4 | Info panel, mobile and chat settings: phone / member since / local time, files list, fixed report reasons, desktop auto-expand, chat-settings `postMessage` close, `returnTo` keeps the conversation, rail unread badges, mobile view details | M | Not started |
| CH5 | Retire: redirect `/elie` → `/chats?c=elie` and `/chat` → `/chats` (Next and Express); delete `chats.html`, `elie.html`, `public/js/chat-data.js`, `public/js/chat-cache.js` (and its server test), the chat code paths in `[...slug].js` and the Express chat routes; replaces B1 | S | Not started |

## Stage A — Shared foundation (branch `agents/stage-a-foundation`)

The detailed plan and findings are in `docs/migration/stage-a-foundation.md`.

| ID | Task | Scope | Mag. | Status |
|---|---|---|---|---|
| A1 | Typed Supabase client, API helper, safe redirects | One browser client (`lib/supabase/*`); `apiFetch`; `getSafeRedirect`/`loginUrl` (fixes the AuthPanel open redirect); `Window` typings; remove 5 duplicate creators and CDN SDK loads. The approved theme boot-script fix is a separate commit, `3426034`. Commit `d05458e`; merged to `main` via PR #502. | S–M | Done — merged |
| A2 | Auth and profile foundation | `AuthProvider` (one auth subscription, one deduplicated profile fetch per user, session-bound first paint); `clearUserData` on sign-out and user change; shared domain types (`lib/types`); `_app` takes its role from the provider; fix the cross-account render on notifications and the unscoped role reads in chats and property-news. Target: 1 `profiles` read per user per TTL (now 11–17 per page). Detailed plan and results in `stage-a-foundation.md` § A2. Result: 0 `profiles` reads on native pages; legacy pages keep only their own query (host notifications went from 17 to 0). Commit `c278d1b`, PR #503. | M | Done — merged |
| A3 | Shared cache layer | `lib/cache` (namespaced user-scoped keys, SWR, dedupe, abort, size caps); `VaRoomDataCache`/`VaRoomListingFeedCache` become adapters over it; `lib/chatCache.ts` becomes the single owner of the chat DB, so legacy pages stop loading `public/js/chat-cache.js`; fix the news cache key collision; bound unbounded caches; convert the `lib/clientHome*.js` caches to TS. Detailed plan in `stage-a-foundation.md` § A3, split into A3a (core module and lib caches) and A3b (one owner for each legacy-global cache, including the chat prefetch cooldown). A3a merged (PR #504); A3b merged (PR #505). | M+M | Done — merged |
| A4 | Account switching | Typed `lib/account` over the switcher; one `logout()` to `/?auth=login` with cache cleanup; cross-tab notice; `AddAccountModal` to TSX (fix the popup race and the always-on listener). The switch keeps its page reload for now. Detailed plan and results in `stage-a-foundation.md` § A4. Commit `c7b588e`. | M | Done — merged |
| A5 | Persistent shell | `AppShell` decided by route (no remount on load); `HostSidebar`/`ClientSidebar`/layouts to TSX, fed by providers (no per-mount fetches or polling); counts store with one realtime channel; `next/link`; one link interceptor; theme resolver; mobile nav in React; `_app`/`_document` to TS; legacy DOM contract preserved. Detailed plan and results in `stage-a-foundation.md` § A5, split into A5a–A5d. A5a merged (PR #511); A5b merged (PR #512); A5c–A5d done in one commit: one `AppShell` whose structure does not change when the role resolves, sidebars and `_app`/`_document` in TSX, the mobile nav in React (the legacy script is retired), and Client Home's own bar without Create. | L | Done — awaiting merge |

**Stage A exit:** every Stage A task is Done, with signed-in regression on both test accounts across all routes, and before/after request counts recorded.

## Stage B — Small legacy pages (one branch each)

| ID | Page / item | Mag. | Notes | Status |
|---|---|---|---|---|
| B1 | `/elie` → native Chats | XS | Moved to the Chats track (CH5) | Moved |
| B2 | `transactions.html` | S | | Not started |
| B3 | `support.html` | S | | Not started |
| B4 | `map.html` | S | Replaces `varoom-maps.js` | Not started |
| B5 | `booking-approved.html` | M | `listing-feed-cache` | Not started |
| B6 | `pricing.html` | S | Paystack checkout, `listing-draft-cache` | Not started |
| B7 | `auth-callback.html` | S | Security-sensitive: OAuth, popup and add-account callbacks | Not started |
| B8 | Admin | M | Decide whether `/admin` (React) or Express `varoomadmin.html` is canonical; migrate or retire the other; `varoom-admin-dashboard.jsx` to TSX | Not started |
| B9 | `404.js` | XS | To TSX | Not started |

## Stage C — Medium and large pages (one branch each)

| ID | Page / item | Mag. | Notes | Status |
|---|---|---|---|---|
| C1 | `marketplace.html` | M | | Not started |
| C2 | `chat-settings.html` | M | Keep the same-origin iframe embedding from Chats | Not started |
| C3 | `settings.html` | L | Account management, theme setting | Not started |
| C4 | `profile.html` and public profile pages | L | Shared React `VideoPlayer` (replaces `varoom-video-player.js`); `host-listing-controls`; `public-profile.jsx`, `host-profile-view.jsx`, `ProfileBanner`, `ProfileCategoryNav` to TSX | Not started |
| C5 | `bookings.html` | L | `notifications-widget` | Not started |
| C6 | `onboarding.html` | L | Keep `?redirect=`; decide on `onboarding-preview` | Not started |
| C7 | Shared chat/media components to TSX | S | `ChatComposerActions`, `ElieComposerBeam`, `ElieIcon`, `VideoMedia`, `resolveStoredPhotoUrl` | Not started |

## Stage D — Extra-large pages (one branch each)

| ID | Page | Mag. | Notes | Status |
|---|---|---|---|---|
| D1 | `booking.html` | XL | `booking-policy` | Not started |
| D2 | `host-home.html` | XL | Fix the delete-saved-account-on-failed-switch bug here | Not started |
| D3 | `list.html` (`/list`, `/properties`) | XL | Listing wizard; drafts, policies | Not started |

## Stage E — Legacy retirement

| ID | Task | Status |
|---|---|---|
| E1 | Remove `pages/[...slug].js`, `lib/legacyPageLifecycle.js` and the `_app` DOM patch | Not started |
| E2 | Delete unused `public/js` scripts and legacy HTML, including the unreachable `index.html`, `login.html`, `signup-*.html`, `elie.html`, `host-profile.jsx`, the video uploader and `property-news-bar` | Not started |
| E3 | Move React pages out of `legacy-pages/`; remove duplicate implementations | Not started |
| E4 | Replace source-regex tests with behaviour tests; enable TypeScript `strict` | Not started |
| E5 | Final performance audit against the Stage A baseline | Not started |

## Backlog (outside the migration; each needs its own decision)

- `/profile` makes a `bookings` query that returns 400 for client accounts, in production too.
- `/chat-settings` queries `profiles.away_message`, which returns 400; the column is likely missing.
- `/bookings`: `notifications-widget.js` throws "Identifier 'NOTIF_MOBILE_BREAKPOINT' has already been declared" because the script is loaded twice.
- The production API rate limit (120 requests/min per IP) is easy to hit: browsing 2–3 legacy pages quickly triggers 429s on chat and media endpoints.
- Server: `POST /api/notifications` lets any user notify anyone with arbitrary text.
- Server: `trust proxy` is unset, so the rate limit is shared across users behind the proxy.
- Linked accounts' refresh tokens are stored in plaintext `localStorage`.
- `auth-callback.html` upserts `profiles.role` from the client. Verify RLS.
- The CSP allows `'unsafe-inline'` scripts.
- A stray nested `client/.git` repository.
- Landing page ISR: `getStaticProps` resolves old-format listing photo keys with an unpatched client, so the pre-rendered HTML contains dead Supabase public URLs (blocked by ORB). The browser re-fetch corrects them. Fix: apply the R2 photo rule in `getStaticProps`.
- Legacy pages load `account-auth.js`, `account-switcher.js` and `supabase-client.js` again through their own script tags (seen on host-home, settings and profile).
- Legacy pages re-run `account-switcher.js`, so `window.VaRoomAccountSwitcher` becomes a fresh instance without the group loaded and without the React add-account modal; those pages show the switcher's vanilla modal. A4 makes switching tolerate this. A single instance belongs with A5 or the page migrations.
- End-to-end switching cannot be tested with the current test accounts: both are in full 3/3 groups with real accounts. Dedicated unlinked test accounts are needed.
- `host-home.html` binds every `.nav-item[data-nav]` in the document, including the React sidebar's: Marketplace hard-reloads, and Notifications throws `viewHandlers[...] is not a function` (seen 2026-11-02). Fix with D2.
- `host-home.html` sets `listings-glance-grid` attributes after an async load without a null check; navigating away mid-load throws `Cannot read properties of null (reading 'setAttribute')` (intermittent). Fix with D2.
- Production first load sometimes takes longer than 6 s to hydrate (seen 2026-11-01 in headless runs). Not reproduced on the local production build in A5; measure again in production.
- `server/test/photoUrlRouting.test.js`: 5 tests fail because their vm sandbox lacks `CustomEvent`/`dispatchEvent`, which `supabase-client.js` has always called (fails on `4dfff59`, before Stage A as well).
- Cached credentials of other group members stay in a browser's localStorage until that browser next loads the group, which prunes them. The app can no longer use them after a removal (H2), but they remain valid tokens until then. Full revocation needs the affected account to sign out of all devices.
- `/api/*` has no proxy under local `next dev` (only `vercel.json` rewrites).
- Chat attachment storage (R2) sends no CORS headers for signed download URLs, so the browser cannot cache attachments as blobs (IndexedDB). Allowing GET from the app's origins in the bucket's CORS policy would enable it; the page works without it.
- Chats features removed as non-working stubs in CH1, to build properly if wanted: mark a conversation as read from the inbox, delete or archive a conversation, unread counts per conversation (the server sends none).

## Log

- 2026-11-02: CH2b done: sends are guarded and the text is kept until the server accepts it; `@reply`; sent replies show their quote; formatting resets; clients share photos only, hosts files and listings; the share-listing sheet works on desktop and phone (it was a "coming soon" alert); a file picked on a phone waits and goes with the text; photo-preview Escape, autofocus and object-URL leak fixed; phone keyboard handling; failed file uploads now show "Failed". Verified on both accounts with every send answered by the test (nothing reached real conversations).
- 2026-11-02: CH2 approved as CH2a (thread display), CH2b (composer and sending) and CH2c (inbox and live updates), committed separately; the Elie inbox row stays visible to hosts. CH2a done: listing cards, voice notes, read receipts, encryption notice, legacy photo sizing and viewer, skeletons, load-error and empty states. Chat storage refuses cross-origin reads, so attachments cannot be cached as blobs (legacy failed the same way, silently); signed URLs are kept in memory until shortly before expiry instead, and reopening a thread makes no download calls.
- 2026-11-02: H4 committed and pushed (`09e4339`). CH1 implemented and verified: right-click, ⋯ and 500 ms long-press open the legacy menu; Copy puts plain text on the clipboard with a "Copied" note; Reply previews and Escape cancels; pin and both deletes send the right requests (intercepted); the confirm prompt guards delete for everyone; Elie messages get no menu.
- 2026-11-02: Chats parity audit (legacy `chats.html` + `chat-data.js` vs `chats.tsx`): the native page is missing much of the legacy behaviour and has live bugs. Chats track (H4, CH1–CH5) added. H4 implemented and verified.
- 2026-11-02: A5c and A5d implemented in one commit, completing Stage A: 369/369 tests pass, `tsc` is clean, the build succeeds. On both accounts, every hard load of a shell route mounts the page once (the shell changes from pending to host/client in place) and legacy scripts run once, after the shell is ready. The mobile nav is one React component with a live active item; Client Home shows only its own bar, without Create.
- 2026-10-31: Inventory and Stage A investigation done; plan approved. A1 implemented and verified signed in on both test accounts. `/list` outage found and split out as H1.
- 2026-10-31: Roadmap created. The H1 fix was removed from the Stage A branch and implemented and verified on its own branch.
- 2026-10-31: H1 committed and PR #501 opened. Theme fix (`3426034`) and A1 (`d05458e`) committed on `agents/stage-a-foundation` and the branch pushed. A2 is on hold until the go-ahead.
- 2026-11-02: `main` moved (property-news cleanup, PR #509/#510); merged into `agents/stage-a-foundation` without conflicts (`5f9a00c`), and PR #511 is mergeable again. A5b implemented: 367/367 tests pass; one `pushState` per sidebar click (the layouts' document handlers no longer double-push); theme writes down from about 2 to about 0.6 per navigation (the rest come from legacy pages' own inline scripts); Ctrl-click keeps the tab; hover prefetch confirmed.
- 2026-11-02: A5 plan approved. A5a implemented: 354/354 tests pass, `tsc` is clean, the build succeeds; 0 count requests over 70 s idle (previously 30 s and 60 s polling) and 0 on bookings and host-home navigations.
- 2026-11-02: H2 committed (`75ff10f`). H3 found that stored sign-ins went stale on background token rotation; fixed and verified.
- 2026-11-01: A4 committed (`c7b588e`). H2 started on `fix/linked-account-removal`: stale-page switching into a removed relationship found and fixed.
- 2026-11-01: A4 implemented: 337/337 tests pass, `tsc` is clean, the build succeeds; logout, cross-tab and modal end-to-end checks pass. A test-script near miss (an attempted unlink of a real linked account, refused by the switcher; no change made) found a legacy-page switching regression, now fixed.
- 2026-11-01: A3a merged (PR #504). A3b implemented: 329/329 tests pass, `tsc` is clean, the build succeeds; signed-in runs on both accounts show 0 cache-script downloads (production downloads 2–3 per legacy page) and no 429s.
- 2026-11-01: A3 plan approved. A3a implemented: 312/312 tests pass, `tsc` is clean, the build succeeds; signed-in runs and the isolation check pass. Found and fixed a core bug where `clear()` missed loads still in flight.
- 2026-11-01: A2 merged (PR #503). A3 investigated: found a gap in A2's sign-out clean-up (URL-encoded data-cache keys) and that legacy pages re-run the chat prefetch on every hard load.
- 2026-11-01: A2 plan approved and implemented. 301/301 tests pass, `tsc` is clean, the build succeeds; signed-in runs on both accounts and the cross-account isolation check pass.
- 2026-10-31: PR #501 merged into `main` (`d0f8d42`); `/list` fix shipped. Hotfix worktree and local branch removed.
