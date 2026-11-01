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

**H1, A1–A4 and H2 are merged to `main` (PR #501–#507). H3 is committed (`5ecdced`) and included in `agents/stage-a-foundation`. Current task: A5 (approved). A5a (counts store) is done and verified, awaiting commit instructions; A5b–A5d follow.**

---

## Hotfixes (production bugs, shipped independently from `main`)

| ID | Task | Mag. | Status |
|---|---|---|---|
| H1 | `/list` (listing wizard) is broken in production since 2026-10-23 (`b1fa8b2`). `parseTemplate` in `pages/[...slug].js` cuts the body at the first `</body>`, which sits inside a `srcdoc` string in `list.html`. That splits a `<script>`, and the page's JS never loads. Fix: match up to the last `</body>`, plus a regression test. Branch `fix/list-template-parsing` (worktree `../VaRoom-H1`). Verified: 284/284 tests pass and the build succeeds; signed-in host check on `/list` and `/properties` passes, plus 10 other legacy pages; parsing output is byte-identical for every template except `list.html`. Commit `30501df`, PR https://github.com/ziondaily11/VaRoom/pull/501. | XS | Done — merged (PR #501, `d0f8d42`) |

| H2 | Linked-account removal must be permanent (X/Y/Z → Y/Z → Y/Z/K). The server model was already correct: removal deletes only the `account_group_members` row and frees the slot, every link is an explicit sign-in, and stale browser data is filtered against server membership. The gap was in `public/js/account-switcher.js`: `switchAccount` trusted the group list loaded when the page opened, so a page opened before a removal (on any device) could switch back into the removed relationship using stored credentials. Fix: re-confirm membership with the server before every switch, and block the switch if the lookup fails. Branch `fix/linked-account-removal` (from `agents/stage-a-foundation`). Verified: 340/340 client tests, including `test/linked-account-removal.test.js`, which runs the full scenario across browsers and fresh logins against a backend model of the SQL rules and fails without the fix; server account-group tests 8/8; read-only Settings check. | XS | Done — awaiting production test |

| H3 | Switching between linked accounts asked for a new sign-in. Cause: refresh tokens rotate on every refresh (`enable_refresh_token_rotation`; the old token is rejected after 10 s), but the stored copy used for switching was only re-saved when a sidebar mounted or a few legacy pages ran, so background refreshes left it stale ("Invalid Refresh Token: Already Used"). Fix in `account-switcher.js`: `watchSessionTokens` saves every refreshed or new session (installed from `_app`); `switchAccount` saves the outgoing account first, uses the freshest stored pair, retries once if another tab just rotated it, and maps a genuinely revoked token to "sign in again". No new tokens are minted and no API or database change. Verified: 346/346 tests, including `seamless-account-switching.test.js` (both directions across three accounts, expiry, browser restart, cross-tab rotation; 4 of 5 fail without the fix); real-browser check that the stored token follows each rotation on native and legacy pages. | S | Done — awaiting commit |
## Stage A — Shared foundation (branch `agents/stage-a-foundation`)

The detailed plan and findings are in `docs/migration/stage-a-foundation.md`.

| ID | Task | Scope | Mag. | Status |
|---|---|---|---|---|
| A1 | Typed Supabase client, API helper, safe redirects | One browser client (`lib/supabase/*`); `apiFetch`; `getSafeRedirect`/`loginUrl` (fixes the AuthPanel open redirect); `Window` typings; remove 5 duplicate creators and CDN SDK loads. The approved theme boot-script fix is a separate commit, `3426034`. Commit `d05458e`; merged to `main` via PR #502. | S–M | Done — merged |
| A2 | Auth and profile foundation | `AuthProvider` (one auth subscription, one deduplicated profile fetch per user, session-bound first paint); `clearUserData` on sign-out and user change; shared domain types (`lib/types`); `_app` takes its role from the provider; fix the cross-account render on notifications and the unscoped role reads in chats and property-news. Target: 1 `profiles` read per user per TTL (now 11–17 per page). Detailed plan and results in `stage-a-foundation.md` § A2. Result: 0 `profiles` reads on native pages; legacy pages keep only their own query (host notifications went from 17 to 0). Commit `c278d1b`, PR #503. | M | Done — merged |
| A3 | Shared cache layer | `lib/cache` (namespaced user-scoped keys, SWR, dedupe, abort, size caps); `VaRoomDataCache`/`VaRoomListingFeedCache` become adapters over it; `lib/chatCache.ts` becomes the single owner of the chat DB, so legacy pages stop loading `public/js/chat-cache.js`; fix the news cache key collision; bound unbounded caches; convert the `lib/clientHome*.js` caches to TS. Detailed plan in `stage-a-foundation.md` § A3, split into A3a (core module and lib caches) and A3b (one owner for each legacy-global cache, including the chat prefetch cooldown). A3a merged (PR #504); A3b merged (PR #505). | M+M | Done — merged |
| A4 | Account switching | Typed `lib/account` over the switcher; one `logout()` to `/?auth=login` with cache cleanup; cross-tab notice; `AddAccountModal` to TSX (fix the popup race and the always-on listener). The switch keeps its page reload for now. Detailed plan and results in `stage-a-foundation.md` § A4. Commit `c7b588e`. | M | Done — committed (not merged) |
| A5 | Persistent shell | `AppShell` decided by route (no remount on load); `HostSidebar`/`ClientSidebar`/layouts to TSX, fed by providers (no per-mount fetches or polling); counts store with one realtime channel; `next/link`; one link interceptor; theme resolver; mobile nav in React; `_app`/`_document` to TS; legacy DOM contract preserved. Detailed plan in `stage-a-foundation.md` § A5, split into A5a–A5d. A5a done; A5b–A5d not started. | L | A5a done — awaiting commit |

**Stage A exit:** every Stage A task is Done, with signed-in regression on both test accounts across all routes, and before/after request counts recorded.

## Stage B — Small legacy pages (one branch each)

| ID | Page / item | Mag. | Notes | Status |
|---|---|---|---|---|
| B1 | `/elie` → native Chats | XS | Redirect instead of rewriting; retire `chats.html`/`elie.html` from routing | Not started |
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
- Legacy pages re-run `account-switcher.js`, so `window.VaRoomAccountSwitcher` becomes a fresh instance without the group loaded and without the React add-account modal; those pages show the switcher's vanilla modal. A4 makes switching tolerate this. A single instance belongs with A5 or the page migrations.
- End-to-end switching cannot be tested with the current test accounts: both are in full 3/3 groups with real accounts. Dedicated unlinked test accounts are needed.
- `host-home.html` binds every `.nav-item[data-nav]` in the document, including the React sidebar's: Marketplace hard-reloads, and Notifications throws `viewHandlers[...] is not a function` (seen 2026-11-02). Fix with D2.
- `host-home.html` sets `listings-glance-grid` attributes after an async load without a null check; navigating away mid-load throws `Cannot read properties of null (reading 'setAttribute')` (intermittent). Fix with D2.
- Production first load sometimes takes longer than 6 s to hydrate (seen 2026-11-01 in headless runs). Measure in A5.
- `server/test/photoUrlRouting.test.js`: 5 tests fail because their vm sandbox lacks `CustomEvent`/`dispatchEvent`, which `supabase-client.js` has always called (fails on `4dfff59`, before Stage A as well).
- Cached credentials of other group members stay in a browser's localStorage until that browser next loads the group, which prunes them. The app can no longer use them after a removal (H2), but they remain valid tokens until then. Full revocation needs the affected account to sign out of all devices.
- `/api/*` has no proxy under local `next dev` (only `vercel.json` rewrites).

## Log

- 2026-10-31: Inventory and Stage A investigation done; plan approved. A1 implemented and verified signed in on both test accounts. `/list` outage found and split out as H1.
- 2026-10-31: Roadmap created. The H1 fix was removed from the Stage A branch and implemented and verified on its own branch.
- 2026-10-31: H1 committed and PR #501 opened. Theme fix (`3426034`) and A1 (`d05458e`) committed on `agents/stage-a-foundation` and the branch pushed. A2 is on hold until the go-ahead.
- 2026-11-02: A5 plan approved. A5a implemented: 354/354 tests pass, `tsc` is clean, the build succeeds; 0 count requests over 70 s idle (previously 30 s and 60 s polling) and 0 on bookings and host-home navigations.
- 2026-11-02: H2 committed (`75ff10f`). H3 found that stored sign-ins went stale on background token rotation; fixed and verified.
- 2026-11-01: A4 committed (`c7b588e`). H2 started on `fix/linked-account-removal`: stale-page switching into a removed relationship found and fixed.
- 2026-11-01: A4 implemented: 337/337 tests pass, `tsc` is clean, the build succeeds; logout, cross-tab and modal end-to-end checks pass. A test-script near miss (an attempted unlink of a real linked account, refused by the switcher; no change made) found a legacy-page switching regression, now fixed.
- 2026-11-01: A3a merged (PR #504). A3b implemented: 329/329 tests pass, `tsc` is clean, the build succeeds; signed-in runs on both accounts show 0 cache-script downloads (production downloads 2–3 per legacy page) and no 429s.
- 2026-11-01: A3 plan approved. A3a implemented: 312/312 tests pass, `tsc` is clean, the build succeeds; signed-in runs and the isolation check pass. Found and fixed a core bug where `clear()` missed loads still in flight.
- 2026-11-01: A2 merged (PR #503). A3 investigated: found a gap in A2's sign-out clean-up (URL-encoded data-cache keys) and that legacy pages re-run the chat prefetch on every hard load.
- 2026-11-01: A2 plan approved and implemented. 301/301 tests pass, `tsc` is clean, the build succeeds; signed-in runs on both accounts and the cross-account isolation check pass.
- 2026-10-31: PR #501 merged into `main` (`d0f8d42`); `/list` fix shipped. Hotfix worktree and local branch removed.
