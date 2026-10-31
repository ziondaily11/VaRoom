# Stage A — Shared Foundation: Investigation, Findings and Migration Plan

Status: **approved 2026-10-31 — A1 done (commit `d05458e`, branch `agents/stage-a-foundation`); A2 awaiting the go-ahead** · Investigated 2026-10-31 on `main` @ `4dfff59` · Paths relative to `client/` unless noted.

## Decisions and progress

- **Decisions (2026-10-31):**
  - Implement one increment at a time and report after each.
  - Single logout destination: `/?auth=login`.
  - Hand-write the core domain types rather than generating them.
- **A1 done.**
  - Created:
    - `lib/supabase/{config,client,r2PhotoStorage}.ts`
    - `lib/api.ts`
    - `lib/safeRedirect.ts`
    - `types/global.d.ts`
    - `test/helpers/loadTs.js`
    - `test/supabase-foundation.test.js`
  - Removed `lib/clientHomeSupabase.js`.
  - Deviations from the plan:
    - The domain types (`lib/types/`) move to A2, where they first get used.
    - No `@/*` alias: the tests load TS through relative imports.
    - `window.VaRoomApi` is not exposed yet, because no legacy consumer exists.
- **Fixed alongside A1 (approved):** the theme boot scripts never ran (since `edf5915`, 2026-10-29).
  - `_document.js` and `_app.js` wrote `/\/$/` inside template literals, so the browser received `//$/` and every page threw a `SyntaxError`.
  - Fixed by escaping it as `/\\/$/`.
  - Test: `test/inline-boot-scripts.test.js`.
- **`/list` outage** (since `b1fa8b2`): split out as hotfix **H1** in `ROADMAP.md`, and not part of this branch.
- **A1 verification (2026-10-31):**
  - **Automated:**
    - 294/294 tests pass.
    - `tsc --noEmit` is clean.
    - `next build` succeeds.
  - **Signed-in headless Chrome against the production build**, with `/api` proxied to Render; logged in as the test client and the test host through the AuthPanel. The client account ran on 8 routes and the host account on 10. On every route:
    - one auth storage key
    - the session persists
    - the R2 patch is installed
    - 0 "Multiple GoTrueClient" warnings
    - 0 CDN SDK downloads
    - no uncaught exceptions
  - **Compared with production (`main`):**
    - Production downloads the CDN SDK 1–2 times per page.
    - Production throws the theme `SyntaxError`s on every page.
    - Production lacks the R2 patch on `/notifications`.
    - Production has the `/list` outage.
  - **Not exercised**, because they write production data: adding, switching and removing linked accounts; photo upload; creating notifications; Google sign-in.
- **Known pre-existing issue, not fixed:** `/profile` makes a `bookings` query that returns 400 for the client account, in production too.
- **Baseline for A2/A5 — `profiles` REST reads per hard page load, signed in:**

  | Page | Client account | Host account |
  |---|---|---|
  | login | 11–14 | — |
  | client-home | 4 | — |
  | host-home | — | 6 |
  | notifications | 13 | 17 |
  | bookings | 11 | 11 |
  | settings | 12 | 12 |
  | profile | 13 | 13 |
  | chats | 2 | 2 |

  Target after A2: 1 per user per TTL.

Stage A covers the foundations every page uses: the Supabase client, auth/session, account switching, cache infrastructure, typed services, layouts/sidebars and the persistent shell. No page is migrated in this stage. Each later page migration builds on what this stage delivers.

---

## 1. Findings

### 1.1 Supabase client

- **Five or more clients are created independently**, with the URL and anon key hard-coded in each place:
  - `public/js/supabase-client.js:2-3`
  - `lib/clientHomeSupabase.js` (used by `client-home.tsx:67-76`)
  - `chats.tsx:27-46`
  - `notifications.tsx:19-36`
  - `index.tsx:87-90, 700-704`
  - Legacy fallbacks in `account-switcher.js:577`, `auth-callback.html:92-96`, `index.html`, `login.html` and `signup-*.html`. Some of these use broken placeholder keys.
- **Whichever creator runs first wins `window.supabaseClient`.**
  - When a React page creates the client first, `supabase-client.js` skips its setup.
  - The page then loses the **R2 `storage.from` patch** (photo URLs and uploads through `/api/photos`) and the **data-cache invalidation hook**.
- **Up to three GoTrueClient instances can share one storage key at once** (`sb-deaphymimdaygeavhyek-auth-token`):
  - the `window.supabaseClient` singleton
  - the non-global fallback in `index.tsx`
  - the second client in `auth-callback.html`

  Each one runs its own refresh timer, so they race to rotate the same refresh token.
- **The SDK ships twice:**
  - an unpinned CDN copy, `@supabase/supabase-js@2`, with no SRI, loaded on 6 React pages and 16 legacy pages
  - the npm copy, pinned at `^2.117.2`
- **Exception that must be kept:** on the add-account callback (`?add_account_callback=1` / `addAccount=true`), `window.supabaseClient` is deliberately an *isolated temporary* client (`supabase-client.js:9-17`).

### 1.2 Auth and session

- **Session checks are scattered and heavily repeated.**
  - There are 63 `getSession` call sites and 7 `onAuthStateChange` subscriptions. `chat-data.js` and `account-switcher.js` never unsubscribe theirs, so they pile up as legacy scripts re-run on each visit.
  - Typical cost of one page visit:

    | Page | `getSession` calls | `profiles` reads |
    |---|---|---|
    | `/client-home`, full load | ~5 | ~4 |
    | `/notifications` | 8–10 | 5–7 |
    | A legacy page | 4–8 | 3–5 |

  - The host sidebar repeats its profile and count fetch **every 30 s**. `varoom-sidebar.js initCounts` polls every 60 s.
- **There is no shared authenticated fetch helper.** "`getSession` + manual `Authorization: Bearer`" is copy-pasted in about 80 places.
- **Login redirects are inconsistent:**
  - `/?auth=login&redirect=`
  - `/login?next=` — `next` is ignored
  - `/login?redirect=`
  - bare `/login`
- **Security:**
  - **Open redirect / `javascript:` URL in `AuthPanel.tsx:36-39,166`.** `?redirect=` goes unvalidated into `location.assign`. A safe implementation already exists: `getSafeRedirect` in `auth-callback.html:108-117`.
  - **`_app.js:556-557` trusts the role carried in `varoom_role_change` event payloads.** The comment directly above says not to.
  - **`auth-callback.html:283-285` upserts `profiles.role` from the client.** Whether this is safe depends on RLS, and that has not been verified.

### 1.3 Account switching and profile caches

- **What must be preserved in `public/js/account-switcher.js`:**
  - **Linked accounts:** up to 3, stored in `localStorage.varoom_linked_accounts`, with the server as the authority via `/api/account-groups/*`.
  - **Switching:**
    - checks the target's identity before switching
    - restores the previous session on failure and never deletes the saved account
    - a monotonic `expires_at` guard so two tabs rotating tokens don't overwrite each other
  - **Removal:** optimistic, with rollback on error.
  - **Adding an account:** through isolated temporary clients (`account-auth.js`), with Google popup, `postMessage` and redirect fallbacks.
- **Every account switch does a full `location.reload()`.** Logout destinations differ: the host sidebar sends you to `/login`, the client sidebar to `/`.
- **Cached private data can leak between accounts (verified).**
  - Logout clears none of these:
    - `varoom_cached_profile`
    - `varoom_active_account_id`
    - sessionStorage caches
    - the notifications cache
    - the chat IndexedDB (inbox, messages, media)
  - `notifications.tsx:303-336` takes a user id from `varoom_cached_profile` / `varoom_active_account_id` and **renders that user's cached notifications before checking the session**.
  - `_app.js:527-531`, `chats.tsx` and `property-news.tsx` also read the unscoped cached role.
- **`AddAccountModal.jsx` duplicates the vanilla modal's UI**, but it delegates the actual linking to the switcher.
  - A race: the popup-closed poller can report "cancelled" while the link is still in flight.
  - Its `message` listener stays active even when the modal is closed.
- `host-home.html:3622` deletes a saved account when a switch fails, contradicting the switcher's contract.
- `varoom_active_account_changed` is listened for in `chats.tsx` and `notifications.tsx`, but nothing ever dispatches it.

### 1.4 Layouts, sidebars and the shell

- **The shell is rebuilt on every hard load (verified).**
  - `role` starts as `null`, so `getAccountLayout` returns `'none'`. Once the role resolves, `_app.js:599-607` wraps the same page in `<HostLayout>`/`<ClientLayout>`.
  - The element type at that slot changes, so React unmounts the page and mounts it again.
  - Legacy pages therefore run **all their scripts twice**.
- **The shell also remounts when:**
  - navigating through any route that has no layout (chats, marketplace, property-news, analytics, …)
  - switching between host and client
  - the URL changes in any way on a legacy page, because `[...slug].js:422` keys `<main>` on `asPath`, so even a query-only change re-runs every legacy script
- **Two near-duplicate sidebars**, `SharedHostSidebar.jsx` (911 lines) and `SharedClientSidebar.jsx` (832 lines):
  - Each fetches `getSession`, profile, upsert and unread count on every mount, after polling up to 3 s for `window.supabaseClient`.
  - Navigation uses `<a>` + `router.push`. There is no `next/link`, so no prefetch, and cmd/ctrl-click is broken.
  - Each layout installs its own document click interceptor. It ignores modifier keys and `defaultPrevented`.
  - The host sidebar server-renders a hard-coded "Amazing Stays 🌴" identity that flashes before the real one loads.
  - Host "Premium" pushes `/pricing.html`, which is not a valid route.
- **Legacy shell leftovers:**
  - `varoom-sidebar.js mount()` is never called, but its `initCounts` is live: 4 queries, a realtime channel, a 60 s interval and a body-wide MutationObserver.
  - `varoom-mobile-nav.js` appends a `<nav>` to `<body>` without de-duping. Its active item goes stale after client-side navigation, and it persists onto native pages.
  - Legacy templates carry their own sidebars, hidden by layout CSS, and their IDs collide with the React sidebar's (`more-menu`, `sidebar-backdrop`, `notif-nav-badge`).
  - Legacy `:root` variables (`--paper`, `--ink`) re-skin the React sidebar on each page.
- **Other shell problems:**
  - **Theme is written in 6+ places.** The `_app` theme effect runs on `routeChangeComplete`, which is after paint, so there is a light↔dark flash between forced-light routes. The forced-light list is hard-coded 3 times.
  - **The `Node.prototype.removeChild/insertBefore` patch** (`_app.js:386-408`) swallows the DOM-ownership conflicts caused by legacy scripts mutating React-owned nodes.
  - **Next 16 change:** Next no longer overrides `scroll-behavior` during navigation. `_app.js:82` sets `html{scroll-behavior:smooth}`, so client-side route changes now smooth-scroll unless `<html data-scroll-behavior="smooth">` is added.

### 1.5 Caches and data services

- **About 12 independent caches**, each with its own key scheme, TTL and invalidation (full table in the investigation notes).
- **Only the legacy sidebar's logout clears any of them.**
- **Two copies of the chat cache share one IndexedDB database** (`varoom_chat_cache` v2):
  - `public/js/chat-cache.js` (legacy)
  - `lib/chatCache.ts` (a port)

  They overwrite the same global and keep separate in-flight maps.
- **News cache collision (verified):** `client-home.tsx:1647` writes its 5-item preview to the same key that `property-news.tsx:307` uses for the full list. Property News can then show only 5 items, treated as fresh.
- **The unread notification count is fetched 3–5 times per navigation**, and profile/role up to 4 times.
- **Unbounded in-memory caches:** `chats.tsx authedImageCache` and the news article details map.
- **`index.tsx` refetches on mount the same 12 listings it already got from ISR.**
- **Domain types are scattered and duplicated:**
  - `Listing` is defined 4 different ways.
  - There is no shared `Profile` or `Booking` type.
  - No generated Supabase `Database` types exist.

### 1.6 Tooling and tests

- **`tsconfig.json`:** `strict:false`, `allowJs:true`, no `paths` alias, `target es5`. `next build` fails on TS errors.
- **No ESLint.**
- **Tests:** `node --test test/*.test.js`.
  - Several tests run `public/js` scripts in a `vm` sandbox: `account-switching-auth`, `account-groups`, `listing-feed-cache` and `account-profile-cache`. Converting those scripts to ESM/TS breaks those tests, not just renaming them.
  - Many tests regex-match source: `_app.js`, the layouts, the sidebars, `home-state-restoration` and `client-home-cache-first`.
  - `notifications-migration` and `property-news-migration` evaluate their cache `.ts` files without `require`. Adding any import to those modules breaks the tests.
- **No local `/api` proxy.** `/api/*` rewrites exist only in `vercel.json`, so `/api` calls probably fail under `next dev` (not yet tested).

---

## 2. Design principles for Stage A

1. **Coexistence first.** Legacy pages keep working unchanged during Stages A–D. The new TypeScript modules become the *owners* of each foundation, and the legacy globals become thin adapters over them, with the same names, events, storage keys and formats:
   - globals: `window.supabaseClient`, `VaRoomAccountSwitcher`, `VaRoomDataCache`, `VaRoomChatCache`, `VaRoomAccountProfileCache`
   - events: `varoom_supabase_ready`, `varoom_role_change`, `varoom_linked_accounts_changed`
2. **One owner per concern.** One Supabase client, one auth subscription, one profile fetch per user, one cache layer, one counts store, one shell.
3. **The session is the only source of identity.** Every private cache read is keyed by the verified `session.user.id`. Nothing private renders before the session resolves.
4. **Providers never remount.** Auth, account, cache and counts providers sit above the routing slot in `_app`. The shell is a single stable element whose presence is decided by the **route**, which is known during SSR, not by the async role.
5. **No visual changes.** Sidebar markup and CSS are ported as-is.

## 3. Migration plan — five increments

Each increment is independently shippable, with tests updated, `tsc --noEmit`, `next build` and the regression checks in §4.

### A1 — Typed Supabase client, API helper and safe redirects (S–M)

Create:
- **`lib/supabase/client.ts`:** one browser singleton.
  - Same default storage key, so existing sessions survive.
  - Reuses `window.supabaseClient` if it already exists.
  - Applies the R2 `storage.from` patch and `VaRoomNotificationAPI`, idempotently, flagged on the instance.
  - Sets the legacy globals and dispatches `varoom_supabase_ready`.
  - Respects the add-account callback exception.
  - Config comes from `NEXT_PUBLIC_SUPABASE_*`, with a single fallback constant.
- **`lib/api.ts`:** `apiFetch()` attaches the Bearer token, supports `AbortSignal`, and returns a typed JSON result. Exposed as `window.VaRoomApi` for legacy scripts.
- **`lib/safeRedirect.ts`:** a port of `getSafeRedirect`. Fixes the AuthPanel open redirect and standardises login redirects on `/?auth=login&redirect=`.
- **`types/global.d.ts`:** `Window` declarations for every legacy global.
- **`lib/types/`:** `Profile`, `Listing`, `Booking`, `Notification`; the chat types are re-exported from `chatCache.ts`. Generated `Database` types if possible (see decision 3).

Change:
- Replace the creators in `client-home.tsx`, `chats.tsx`, `notifications.tsx` and `index.tsx` with the singleton.
- Import the singleton from `_app`, so it exists before any page renders.
- `supabase-client.js` becomes an adapter: if a client exists, it only ensures the patch is applied.
- Pin the CDN version to match npm.
- Add a `@/*` path alias.

### A2 — AuthProvider, profile store and logout cleanup (M)

Create:
- **`lib/auth/AuthProvider.tsx`:**
  - The single `onAuthStateChange` subscription.
  - `useSession()` and `useProfile()`.
  - One deduplicated `profiles` fetch per user, with a TTL.
  - First paint from the session-bound cached profile only.
  - Mirrors the result to `varoom_cached_profile` (in the `VaRoomAccountProfileCache` format, including `homeState`), `varoom_active_account_id` and `varoom_last_role`.
  - Emits the legacy events, including the missing `varoom_active_account_changed`.
- **`lib/auth/clearUserData.ts`:** called on `SIGNED_OUT`, on user-id change and before an account switch. It clears:
  - the profile slot and active id
  - the `varoom:data-cache:v1:` and `varoom:client-home:*` prefixes
  - the notifications and news caches
  - the chat IndexedDB (inbox, messages **and media**)

  Linked-account tokens are kept only for accounts that are still members.

Change:
- `_app` takes the role from the provider. Remove the event-payload trust and the storage/mutation re-query loops.
- Fix `notifications.tsx` so it doesn't render before the session is verified.
- Fix the unscoped role reads in `chats.tsx` and `property-news.tsx`.

### A3 — Shared cache layer (M)

Create **`lib/cache/`**, a namespaced store:
- keys: `v1:{namespace}:{userId|public}:{resource}:{params}`
- returns `{data, isFresh}` (stale-while-revalidate), with in-flight dedupe and `AbortSignal` support
- memory, sessionStorage and localStorage adapters, with per-namespace size/LRU caps and quota handling
- `clearUser()` wired to A2

Adapters:
- Keep `VaRoomDataCache` and `VaRoomListingFeedCache` as adapters with the same keys and formats.
- Make `lib/chatCache.ts` the single owner of the chat DB, and load it globally from the bundle so legacy pages stop loading `public/js/chat-cache.js`.

Fixes:
- Give the client-home news preview its own key.
- Bound `authedImageCache` and the news details map.

### A4 — Account switching (M)

Create:
- **`lib/account/`:** a typed `useLinkedAccounts()` and `switchAccount()` / `logout()` / `removeAccount()` over the existing switcher. The switcher stays JS for now, because legacy pages execute it and tests run it in a `vm`.
- **`logout()`:** one function used everywhere. It runs `clearUserData`, then sends the user to a single destination (see decision 2).
- **Cross-tab:** a `BroadcastChannel` notice on switch and logout, so other tabs reload instead of silently changing user.

Change:
- Account switch **keeps `location.reload()`** for now, because legacy pages can't re-key. Switching without a reload is revisited after Stage D.
- Convert `AddAccountModal` to TSX. Fix the popup race and the always-on listener. Unmounting must not delete the switcher's method.

### A5 — Persistent shell and sidebars (L)

Create:
- **`components/shell/AppShell.tsx`:** rendered at one fixed position in `_app`.
  - The route table decides whether the shell is shown. This is SSR-safe, so a hard load no longer remounts.
  - Host and client are a `variant` prop of one component, not different element types.
  - Routes that have no sidebar today stay without one (UI preserved). Only the shell subtree toggles; the providers persist.
- **`HostSidebar.tsx` / `ClientSidebar.tsx`:**
  - Markup and CSS ported 1:1, with namespaced tokens so legacy `:root` variables stop re-skinning them.
  - Identity, linked accounts and counts come from the providers. Removes all per-mount fetches, the 3 s polling and the 30 s interval.
  - Navigation uses `next/link` with prefetch.
  - One shared delegated interceptor for legacy markup, which respects modifier keys and `defaultPrevented`.
- **`lib/counts/`:** one store for notification, chat and booking unread counts, with a single realtime channel. The legacy `initCounts` and `varoom_notification_count` read from or feed this store.

Theme:
- One `lib/theme.ts` resolver, used by `_document` and `_app`.
- Applied before paint on route change.
- One forced-light list.
- Add `data-scroll-behavior="smooth"`.

Keep the legacy contract:
- `#host-page-content` / `#client-main-content`
- `.host-layout-active` / `.client-layout-active`
- `open-*-sidebar` / `varoom-toggle-sidebar` events
- `window.showSavedView`, `?view=` deep links
- the duplicate-sidebar suppression CSS

`[...slug].js`:
- Key `<main>` on pathname, not `asPath`, but only after checking that the query-dependent legacy pages re-read the query on their own.
- Extend `legacyPageLifecycle` to all templates. The `removeChild` patch stays until Stage E.

Mobile bottom nav:
- Moves into React inside the shell.
- `varoom-mobile-nav.js` is guarded against double mounting and skipped when the shell owns it.

**Out of scope for Stage A** (recorded for later stages):
- converting legacy page internals
- removing `[...slug].js`
- the `host-home.html` delete-on-failed-switch bug (fixed with host-home in Stage D)
- server-side issues (notification spoofing, `trust proxy`)

## 4. Verification per increment

- **Automated:** `node --test test/*.test.js`, with affected tests updated *in the same change* to assert the new behaviour rather than deleted. Also `npx tsc --noEmit` and `next build`.
- **Functional — run in the browser:**
  - email login, Google login and logout
  - add, switch and remove linked accounts (requires linked test accounts)
  - every sidebar link and badge
  - mobile drawer and bottom nav
  - dark/light theme on forced-light routes
  - each legacy page loads and works: host-home, bookings, profile, settings, marketplace, list, booking
- **Performance, using DevTools network and React Profiler, before vs after:**
  - `getSession` and `profiles` request counts per navigation
  - the shell is not remounted on hard load or on navigation between shell routes
  - legacy scripts execute once per visit
  - no duplicate GoTrueClient warning
- **Isolation:** log in as A → visit notifications and chats → log out → log in as B in the same tab. Nothing of A's appears.

## 5. Risks

| Risk | Mitigation |
|---|---|
| Changing the client singleton logs users out | Keep the default storage key; reuse the existing `window.supabaseClient`; test on a real session before merging |
| Legacy pages depend on load-order quirks (`varoom_supabase_ready`, `.host-layout-active` checked at script time) | Keep the events and classes; the singleton exists before page render, so the order only gets more deterministic; regression-check every legacy page |
| Removing the remount changes when legacy scripts see the layout class | Shell presence is route-decided, so the class is present on first render, which is what the scripts expect |
| Cache clearing is too aggressive (drafts, theme) | `clearUserData` targets user-private namespaces only; listing drafts are host-keyed and kept unless the host logs out — to confirm |
| Tests that regex-match source block refactors | Update them alongside each change to assert behaviour where feasible |
| Local verification hits the production Supabase project | Use dedicated test accounts; no destructive data operations |
