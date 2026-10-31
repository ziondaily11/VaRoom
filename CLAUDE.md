# CLAUDE.md — VaRoom Engineering & Performance Migration Constitution

## 1. What We Are Building

VaRoom is being migrated towards a modern, high-performance application architecture using **React, TypeScript and Next.js**.

This is not a simple HTML-to-React conversion project.

The objective is to eliminate the architectural limitations of the legacy application and make VaRoom fast, responsive, seamless and efficient.

**Performance is the primary reason for this migration.**

We are not adopting React and TypeScript simply because they are modern technologies. We are adopting them to achieve:

- Near-instant navigation between application pages.
- Persistent application shells and shared layouts.
- Intelligent data caching and reuse.
- Minimal unnecessary network requests.
- Reduced component and page remounting.
- Faster initial rendering and subsequent visits.
- Efficient state management.
- Predictable authentication and account management.
- Responsive layouts that adapt without unnecessarily rebuilding the page.
- A maintainable architecture that allows future features without compromising performance.

Every architectural decision must contribute to these objectives.

### The fundamental principle

**Do not simply reproduce the old application in React. Understand what it does, preserve everything it does, and implement it using a better architecture that makes it faster.**

---

## 2. Mandatory Engineering Rules

These rules apply to every file, component, route, service and migration stage.

### 2.1 React and TypeScript are the native implementation

- All migrated pages must use native React and TypeScript.
- Use `.tsx` for React components and pages.
- Use `.ts` for services, utilities, hooks, data models and other non-visual logic.
- Avoid introducing new standalone HTML pages.
- Avoid unnecessary static HTML and DOM manipulation.
- Prefer reusable React components over duplicated implementations.
- Prefer data-driven rendering over manually constructing markup.
- Use properly typed interfaces and types for application data, component props and API responses.
- Do not introduce `any` as a shortcut around proper typing.

The goal is to progressively eliminate dependence on the old browser scripts and legacy HTML architecture.

### 2.2 Never sacrifice functionality for a cleaner implementation

A migrated page must retain the functionality of the original page.

A shorter implementation is not necessarily a better implementation.

Do not remove features simply because they are difficult to reproduce in React.

Do not simplify complicated workflows without understanding why they exist.

Do not replace existing functionality with placeholders, mock data or incomplete implementations.

### 2.3 Preserve the existing UI

The migration is an architectural and performance improvement, not a visual redesign.

Unless explicitly instructed otherwise:

- Preserve existing layouts.
- Preserve spacing, dimensions and typography.
- Preserve colours, borders, backgrounds and shadows.
- Preserve icons and their meanings.
- Preserve hover, active, selected, disabled and loading states.
- Preserve desktop, laptop, tablet and mobile behaviour.
- Preserve existing interactions and navigation patterns.
- Preserve the relationship between page content and shared sidebars.

Do not introduce new UI elements, navigation items or visual changes simply because React offers a different implementation approach.

**The migrated page should look and behave like the original, while performing significantly better.**

---

## 3. Mandatory Investigation Before Every Migration

This is one of the most important requirements.

**No legacy page may be migrated before its existing implementation has been fully studied.**

A filename and its HTML contents are not sufficient to understand a page.

Before touching a page, conduct a complete investigation of the page and its dependencies.

### 3.1 Study the original page

Examine:

1. Its complete HTML structure.
2. All embedded JavaScript.
3. All embedded CSS.
4. External stylesheets.
5. External JavaScript dependencies.
6. All event listeners and event handlers.
7. All user interactions.
8. All API calls.
9. All Supabase queries and database operations.
10. Authentication and authorization requirements.
11. Loading, error, empty and success states.
12. Navigation destinations and route behaviour.
13. Responsive behaviour.
14. Modals, drawers, dropdowns and overlays.
15. Local storage, session storage and browser cache usage.
16. Any background processes, subscriptions or real-time listeners.

Do not assume that the page's main HTML file contains all its functionality.

Some functionality may be implemented in `public/js`, shared scripts, Express routes, backend services or other application files.

### 3.2 Trace every dependency

Identify:

- Which scripts the page loads.
- Which global browser objects it depends on.
- Which functions are shared with other pages.
- Which database tables it reads and writes.
- Which API endpoints it calls.
- Which authentication/session functions it uses.
- Which components or layouts it depends on.
- Whether another page depends on its scripts or functionality.

Pay particular attention to scripts used by multiple pages.

Do not replace or remove a shared script without understanding its other consumers.

### 3.3 Produce a feature inventory

Before implementation, produce a complete feature inventory.

For every feature, document:

| Area | What must be established |
|---|---|
| UI | Existing visual structure and components |
| Behaviour | Every interaction and expected result |
| Data | Database tables, queries and API dependencies |
| Authentication | Session and account requirements |
| Navigation | Routes, transitions and destinations |
| State | Existing state and persistence behaviour |
| Caching | Existing caching and opportunities for improvement |
| Responsive | Behaviour across screen sizes |
| Dependencies | Shared scripts, services and components |
| Risks | Potential regressions and migration concerns |

The investigation must also identify performance problems in the existing implementation.

### 3.4 Do not start implementation prematurely

The workflow is:

**Investigation → Findings → Migration plan → Approval → Implementation → Verification.**

The investigation must be sufficiently detailed to establish what the existing page does and how the React implementation will preserve it.

If a critical dependency or behaviour is not understood, investigate it before proceeding.

---

## 4. Application Shells and Persistent Navigation

One of the biggest performance improvements we want from React is eliminating unnecessary reconstruction of the application during navigation.

### 4.1 Persistent shells

VaRoom has shared application structures, particularly:

- Client application shell.
- Host application shell.
- Shared navigation.
- Sidebars.
- Main content area.
- Right-side information panels.

These structures should remain mounted when navigating between compatible pages.

Navigating from one page to another should not unnecessarily reconstruct the entire application.

The shared layout should persist while the relevant page content changes.

### 4.2 Navigation must not trigger unnecessary full-page reloads

Internal application navigation should use Next.js routing and appropriate client-side navigation mechanisms.

Avoid ordinary anchor navigation when it unnecessarily reloads the entire application.

However, preserve normal browser navigation behaviour where appropriate, including:

- Back and forward navigation.
- Direct URL access.
- Page refresh.
- Deep links.
- External links.
- Authentication redirects.

Do not implement a custom navigation system that conflicts with Next.js routing.

### 4.3 Avoid unnecessary remounting

Pay particular attention to:

- Layout components.
- Authentication providers.
- Account providers.
- Shared sidebars.
- Navigation components.
- Cached data providers.
- Persistent UI state.

Do not introduce changing React keys or routing structures that unnecessarily remount shared application components.

A route transition should update the required page content, not restart the application.

---

## 5. Data Caching and Intelligent Loading

Caching is a core part of VaRoom's performance strategy.

We want users to experience an application that remembers useful data and reuses it intelligently.

### 5.1 Use layered caching

Consider the appropriate combination of:

1. In-memory React/application caches.
2. Session storage.
3. Local storage where persistence is appropriate.
4. Next.js data caching where compatible with the data's security requirements.
5. Backend caching where it provides measurable benefits.

Choose the correct cache for each type of information.

Do not automatically cache everything.

### 5.2 Cache requirements

Every cache must have a clear strategy covering:

- Cache keys.
- User/account isolation.
- Data ownership.
- Expiration.
- Invalidation.
- Background refresh.
- Error handling.
- Memory management.
- Logout and account-switch behaviour.

User-specific data must never leak between accounts.

Never expose private user information through an improperly shared cache.

### 5.3 Reuse data when navigating back

If a user opens a page, navigates elsewhere and returns, the application should reuse valid cached information rather than automatically repeating every database query.

Where appropriate:

- Render cached content immediately.
- Refresh stale information in the background.
- Update only the affected components.
- Avoid replacing useful content with full-page loading screens.
- Avoid unnecessary skeleton flashes.

Use appropriate cache lifetimes for different data types.

For example, relatively stable page content may have a longer lifetime than notifications or rapidly changing booking information.

### 5.4 Prevent duplicate requests

Investigate and implement appropriate:

- Request deduplication.
- Shared in-flight promises.
- AbortController support.
- Request cancellation on unmount.
- Debouncing for search.
- Pagination and incremental loading.
- Selective data fetching.

Do not fetch the same information independently in multiple components when it can safely be shared.

### 5.5 Loading states

Loading states should improve perceived performance rather than make the application feel slower.

Prefer:

- Preserving previously rendered content.
- Local skeletons for components that genuinely need loading.
- Incremental rendering.
- Optimistic updates where safe.
- Background refreshes.
- Immediate feedback for user interactions.

Avoid unnecessary full-page loading indicators.

---

## 6. Authentication, Sessions and Account Switching

Authentication is a shared foundation, not something every individual page should independently initialize.

### Requirements

- Establish a properly typed Supabase client.
- Use shared authentication/session infrastructure.
- Avoid unnecessary session checks on every route transition.
- Avoid repeatedly fetching the same profile information.
- Reuse valid account and profile snapshots.
- Ensure account switching updates the appropriate application state.
- Ensure cached data is isolated by user and account.
- Handle session expiry and refresh correctly.
- Handle logout and account removal without leaving stale private data.
- Preserve Google and email authentication workflows.

Authentication must remain reliable while becoming more efficient.

Do not trade security for performance.

---

## 7. Responsive Behaviour and Layout Stability

VaRoom must behave consistently across different laptop and desktop screen sizes.

Do not assume that every laptop has the same usable viewport.

Some pages use a three-column layout with:

- Left navigation.
- Main content.
- Right information panel.

At narrower widths, the right information panel may need to become an overlay rather than remain in the right rail.

### Requirements

- Preserve existing responsive behaviour.
- Use CSS media queries for layout wherever possible.
- Use JavaScript resize observation only when application logic genuinely requires it.
- Avoid attaching multiple competing resize listeners.
- Clean up observers and listeners correctly.
- Avoid unnecessary component remounting when the viewport changes.
- Preserve scroll positions and interaction state where appropriate.

Responsive transitions must not cause the entire page to reload or unnecessarily reconstruct its components.

---

## 8. State Management and Component Architecture

Use React state and shared application state appropriately.

Avoid maintaining the same information in multiple unrelated places.

Establish clear ownership for:

- Authentication state.
- Account state.
- Profile state.
- Listing state.
- Booking state.
- Notification state.
- Chat state.
- Page-specific state.
- UI interaction state.

Prefer reusable hooks, typed services and focused components.

Do not create enormous components that reproduce the old HTML file in one React component.

Equally, do not split components into excessive abstractions that introduce unnecessary complexity.

The objective is a maintainable architecture with efficient rendering.

Use memoization, selectors and React rendering optimizations where profiling or component behaviour justifies them. Do not blindly apply `useMemo`, `useCallback` or `React.memo` everywhere.

---

## 9. Shared Browser Scripts Must Become Native Modules

The legacy `public/js` architecture must progressively disappear.

Scripts currently responsible for browser-wide objects and global functions should be examined and replaced with appropriately typed modules, services and React hooks.

Important shared areas include:

- Supabase client.
- Account authentication.
- Account switching.
- Listing feed caching.
- Account profile caching.
- Chat data and caching.
- Sidebar navigation.
- Mobile navigation.
- Video playback.

### Special requirements

**Supabase:** Establish one properly configured and typed client instead of duplicating credentials and initialization across multiple files.

**Chat:** Preserve independent chat architecture and ensure chat failures do not unnecessarily affect property news, Elie or the main application.

**Video:** Replace the shared legacy video-player implementation with a reusable native React `VideoPlayer` component.

**Caches:** Consolidate duplicate caching implementations rather than creating competing cache systems.

Do not remove a browser script simply because its original page has been migrated. First establish whether another page still depends on it.

---

## 10. Page Migration Strategy

Migration should happen in controlled stages.

Do not migrate every page simultaneously.

Each page must pass its own functional and performance verification before the next dependent stage proceeds.

### Stage A — Shared foundation

Establish the foundations that all pages will use:

- Typed Supabase client.
- Authentication and session infrastructure.
- Account switching.
- Shared client and host layouts.
- Shared sidebars.
- Cache infrastructure.
- Typed application services.
- Navigation and persistent-shell architecture.

Avoid creating multiple competing implementations of these foundations.

### Stage B — Smaller legacy pages

Migrate smaller pages first to establish and validate the migration pattern.

Examples:

- Transactions.
- Support.
- Map.
- Booking approved.
- Pricing.
- Authentication callback.
- Elie route redirect.

### Stage C — Medium and large pages

Progressively migrate:

- Marketplace.
- Chat settings.
- Settings.
- Profile.
- Bookings.
- Onboarding.

Preserve embedded experiences, particularly the chat-settings iframe integration, where required.

### Stage D — Extra-large pages

These require the most extensive investigation and careful implementation:

1. Booking.
2. Host home.
3. List / Properties.

Do not underestimate their complexity based on the number of lines.

Their existing business logic, integrations, workflows and dependencies must be fully understood.

### Stage E — Legacy retirement

Once all dependencies have been migrated and verified:

- Retire the catch-all legacy page machinery.
- Remove obsolete legacy lifecycle code.
- Remove the `_app.js` DOM patch when safe.
- Remove unused browser scripts.
- Remove obsolete HTML pages.
- Consolidate migrated React pages into the appropriate component/page architecture.
- Remove duplicate implementations.
- Update tests.

Never delete legacy infrastructure before proving that nothing still depends on it.

---

## 11. Mandatory Testing and Verification

A successful build is not proof of a successful migration.

Every migrated page must be tested against the original implementation.

### Functional verification

Check every feature identified during investigation.

Confirm:

- Buttons work.
- Forms work.
- Modals open and close.
- Dropdowns behave correctly.
- Data loads correctly.
- Database writes succeed.
- Navigation works.
- Authentication works.
- Account switching works.
- Permissions are respected.
- Error states work.
- Empty states work.
- Loading states work.
- Responsive behaviour is preserved.

### Performance verification

Check:

- Initial page loading.
- Navigation between internal routes.
- Navigation back to previously visited pages.
- Number of network requests.
- Duplicate requests.
- Unnecessary Supabase queries.
- Component remounting.
- Shell persistence.
- Cache effectiveness.
- Scroll restoration.
- Memory leaks.
- Unnecessary loading flashes.

Where possible, compare the migrated page against the original implementation using the same workflows and test conditions.

### Regression verification

Test other pages that share the migrated components or services.

A change to the account switcher, sidebar or Supabase client can affect many unrelated pages.

Do not declare a migration complete until its dependencies and affected routes have been tested.

---

## 12. Working Protocol for Claude Code

Work must be controlled, traceable and incremental.

### Before implementation

1. Confirm the active Git branch.
2. Examine the working tree.
3. Identify existing uncommitted changes.
4. Do not overwrite or discard unrelated work.
5. Study the target page and dependencies.
6. Produce the investigation report.
7. Identify the implementation stages and risks.

### During implementation

- Work only within the approved scope.
- Avoid unnecessary changes to unrelated pages.
- Preserve the existing UI.
- Use TypeScript properly.
- Prefer existing shared services where appropriate.
- Avoid duplicating existing functionality.
- Do not introduce unnecessary dependencies.
- Do not perform broad refactoring during a page migration without justification.
- Keep changes incremental and testable.

### After implementation

Provide a report containing:

1. Files created.
2. Files modified.
3. Features migrated.
4. Existing features preserved.
5. Performance improvements introduced.
6. Caching and navigation changes.
7. Dependencies replaced.
8. Tests performed.
9. Build and type-check results.
10. Remaining issues.
11. Risks and recommended next steps.

Never claim that something works without actually verifying it.

Do not commit, push or deploy unless explicitly instructed.

---

## 13. Performance Is a Continuous Requirement

Do not treat performance as a final optimization stage.

Every migration must consider performance from the beginning.

Before implementing something, ask:

- Does this cause an unnecessary network request?
- Does this remount a component that should persist?
- Can existing data be reused?
- Can the result be cached safely?
- Does this introduce unnecessary JavaScript execution?
- Is the application rendering more than necessary?
- Does navigation reconstruct the application?
- Can this operation happen in the background?
- Can the user interact with already available content?
- Does this introduce a new dependency that could have been avoided?

A visually correct page that takes several seconds to become usable is not a successful migration.

A page that works but reloads everything unnecessarily is not a successful migration.

A page that uses React but still relies heavily on legacy browser scripts is not a completed migration.

---

## 14. Definition of Done

A page is considered fully migrated only when all the following conditions are satisfied:

- [ ] Existing functionality has been fully investigated.
- [ ] All existing features have been accounted for.
- [ ] The page uses native React and TypeScript.
- [ ] Existing UI has been preserved.
- [ ] Legacy dependencies have been replaced or explicitly justified.
- [ ] Navigation uses the modern application routing architecture.
- [ ] Shared shells remain persistent where appropriate.
- [ ] Data caching and reuse have been considered and implemented where beneficial.
- [ ] Duplicate requests have been addressed.
- [ ] Authentication and account isolation work correctly.
- [ ] Responsive behaviour has been preserved.
- [ ] Loading and error states work.
- [ ] Original workflows have been tested.
- [ ] Related pages have been regression-tested.
- [ ] Build and TypeScript checks pass.
- [ ] No known critical regressions remain.

---

## 15. Final Architectural Direction

VaRoom should progressively become an application where:

- The application shell loads once and remains available.
- Internal navigation changes content without unnecessary full-page reloads.
- Previously fetched information is reused intelligently.
- Background refreshes keep information current.
- Shared components do not repeatedly initialize themselves.
- Authentication and account information are managed centrally.
- Individual components update without reconstructing entire pages.
- Legacy HTML and browser-global scripts are no longer necessary.
- The application remains responsive across screen sizes.
- New features can be added without returning to the old architecture.

### The principle to remember throughout this project

**We are not modernizing VaRoom to make its code look modern. We are modernizing its architecture to make the actual application faster.**

Every migration must preserve what VaRoom already does while improving how efficiently it does it.

When there is a choice between a quick rewrite and a properly investigated, performance-oriented migration, choose the latter.

When there is a choice between adding more code and eliminating unnecessary work, prefer eliminating unnecessary work.

When there is a choice between a full reload and an intelligent update of the affected content, prefer the intelligent update.

**Build VaRoom to feel seamless, not merely to compile successfully.**

---

## 16. Next.js Version Warning

`client/` runs Next.js 16, which has breaking changes relative to older versions. Read `client/AGENTS.md` and the relevant guide in `client/node_modules/next/dist/docs/` before writing Next.js code. Heed deprecation notices.

---

## Appendix — Migration Inventory (snapshot 2026-10-31)

**Progress is tracked only in `docs/migration/ROADMAP.md`**, which sets the order of work. This appendix is the size reference; its checkboxes are not maintained. Line counts are approximate (script / style lines in brackets).

Magnitude: **XS** rename + types · **S** < ~300 lines of logic · **M** ~300–900 · **L** ~900–1,500 with several dependencies · **XL** > 1,500 lines of logic and many dependencies.

Already native React + TypeScript: landing (`pages/index.tsx`), client home, chats, notifications, property news, analytics, terms, privacy.

### A1. Legacy HTML pages (served by `client/pages/[...slug].js` from `client/legacy-pages/`)

| Done | Mag. | File | Route | Lines | Legacy dependencies |
|---|---|---|---|---|---|
| [ ] | XL | `list.html` | `/list`, `/properties` | 5030 (3646 / 892) | listing-feed-cache, listing-draft-cache, listing-policy-preview, listing-policy-removal |
| [ ] | XL | `host-home.html` | `/host-home` | 3884 (2135 / 1422) | account-auth, account-switcher, host-listing-controls, varoom-video-player, property-news-api, skeleton-loader, listing-feed-cache; `lib/legacyPageLifecycle.js` |
| [ ] | XL | `booking.html` | `/booking` | 2588 (1746 / 728) | booking-policy, listing-feed-cache |
| [ ] | L | `bookings.html` | `/bookings` | 2323 (1331 / 704) | notifications-widget, skeleton-loader |
| [ ] | L | `profile.html` | `/profile` | 2094 (1065 / 673) | varoom-video-player, host-listing-controls, account-auth, account-switcher, listing-feed-cache, skeleton-loader |
| [ ] | L | `settings.html` | `/settings` | 2081 (907 / 511) | account-auth, account-switcher |
| [ ] | L | `onboarding.html` | `/onboarding` | 2138 (874 / 869) | auth-flow-utils |
| [ ] | M | `marketplace.html` | `/marketplace` | 1437 (747 / 465) | skeleton-loader |
| [ ] | M | `chat-settings.html` | `/chat-settings` | 747 (455 / 275) | Embedded in a same-origin iframe from chats |
| [ ] | M | `booking-approved.html` | `/booking-approved` | 733 (346 / 215) | listing-feed-cache |
| [ ] | S | `pricing.html` | `/pricing` | 553 (250 / 208) | listing-draft-cache; Paystack checkout |
| [ ] | S | `auth-callback.html` | `/auth-callback` | 306 (225 / 65) | account-auth, account-switcher; security-sensitive (`getSafeRedirect`) |
| [ ] | S | `support.html` | `/support` | 464 (184 / 175) | — |
| [ ] | S | `map.html` | `/map` | 238 (128 / 78) | varoom-maps.js |
| [ ] | S | `transactions.html` | `/transactions` | 233 (116 / 71) | — |
| [ ] | S | `varoomadmin.html` | Served by Express (`server/routes/adminRoutes.js:189`) | 291 | Overlaps `pages/admin.js`; references a missing `varoomadmin.js`. Decide canonical admin. |
| [ ] | XS | `chats.html` (as `/elie`) | `/elie` | 2273 | Redirect `/elie` to native chats instead of rewriting |

### A2. React files still in JS/JSX (convert to TypeScript)

| Done | Mag. | File | Lines |
|---|---|---|---|
| [ ] | M | `legacy-pages/varoom-admin-dashboard.jsx` | 1051 |
| [ ] | M | `components/SharedHostSidebar.jsx` | 911 |
| [ ] | M | `legacy-pages/public-profile.jsx` | 888 |
| [ ] | M | `components/SharedClientSidebar.jsx` | 832 |
| [ ] | M | `components/AddAccountModal.jsx` | 817 |
| [ ] | M | `legacy-pages/host-profile-view.jsx` | 770 |
| [ ] | M | `pages/_app.js` | 611 |
| [ ] | S | `components/ClientLayout.jsx`, `components/HostLayout.jsx` | 377, 347 |
| [ ] | S | `pages/404.js` | 184 |
| [ ] | S | `components/ChatComposerActions.jsx`, `components/ElieComposerBeam.jsx` | 225, 105 |
| [ ] | S | `legacy-pages/ProfileBanner.jsx`, `legacy-pages/ProfileCategoryNav.jsx` | 134, 121 |
| [ ] | XS | `components/VideoMedia.js`, `components/ElieIcon.js`, `components/resolveStoredPhotoUrl.js` | 90, 28, 42 |
| [ ] | XS | `pages/_document.js`, `pages/admin.js`, `pages/host/[hostId].js`, `pages/u/[username].js` | 64, 3, 18, 18 |
| [ ] | XS | `lib/*.js` (clientHomeVideoMetadataCache, clientHomeScroll, clientHomeWidgetCache, clientHomeProfileSnapshot, accountRoleLayout, clientHomeAccount, clientHomeSupabase) | ~465 total |

### A3. Browser-global scripts in `client/public/js` used by React pages

| Done | Mag. | File | Lines | Notes |
|---|---|---|---|---|
| [ ] | L | `chat-data.js`, `chat-cache.js` | 2362, 1098 | `chat-cache.js` duplicates `lib/chatCache.ts` |
| [ ] | M | `account-switcher.js`, `account-auth.js` | 921, 86 | |
| [ ] | M | `varoom-sidebar.js`, `varoom-mobile-nav.js` | 580, 199 | Possibly superseded by the shared sidebars |
| [ ] | S | `supabase-client.js` | 126 | Replace with one typed client; the URL and anon key are duplicated in ~8 files |
| [ ] | S | `google-sign-in.js` | 408 | |
| [ ] | S | `listing-feed-cache.js`, `varoom-data-cache.js`, `varoom-account-profile-cache.js` | 307, 89, 74 | |
| [ ] | M | `varoom-video-player.js` | 550 | Becomes a shared React `VideoPlayer` (host-home, profile) |

The other `public/js` scripts are used only by legacy pages and retire with them.

### A4. Retire once migration is complete (Stage E)

- `pages/[...slug].js`, `lib/legacyPageLifecycle.js`, the `Node.prototype` DOM patch in `pages/_app.js`.
- Unreachable legacy files: `index.html`, `login.html`, `signup-host.html`, `signup-client.html`, `elie.html`, `host-profile.jsx`, `public/js/varoom-video-uploader.*`, `public/js/property-news-bar.*`.
- Decide whether to convert or dev-gate `pages/onboarding-preview.js`.
- Rewrite the client tests that regex-match legacy source files.
