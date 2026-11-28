# Phone menu plan: a hamburger on every page, no bottom nav

Status: **approved 2026-11-28 with the recommendations D1–D3**

## Goal

On phones (860px wide or less), remove the bottom navigation bar from every page. Each page gets a
hamburger button that opens the account's sidebar as a drawer. Laptops and desktops do not change.

## What exists today

- **Bottom nav.** One component, `components/shell/MobileNav.tsx`, rendered once from `pages/_app.tsx:457`.
  Its rules (items, hidden routes, scroll-hide) are in `lib/navigation/mobileNav.ts`, its styles are
  `MOBILE_NAV_STYLES` in `components/shell/shellStyles.ts`, and it shows only for signed-in, onboarded accounts.
- **The drawer already exists.** On phones the shell sidebar is an off-screen drawer
  (`shellStyles.ts:231` host, `:590` client). Four things open it:
  - Clicks on `#topbar-avatar-btn` / `#menu-toggle` / `.menu-toggle`, caught by a document-wide click listener in
    `components/shell/useShellChrome.ts`.
  - The `open-host-sidebar`, `open-client-sidebar`, `varoom-toggle-sidebar` and similar window events.
- **Pages that already have a menu button:** Client Home, Host Home, Bookings (`#topbar-avatar-btn`),
  Notifications and Settings (window events).
- **Pages with no sidebar mounted**, so nothing can be opened yet: Chats, Help & Support, Pricing,
  Property News, Booking approved, Map, Chat Settings.

## The design

### 1. One drawer control

A small `SidebarDrawerProvider` in `_app` holds the drawer's open or closed state. It is typed and has one owner.

- The host and client sidebars read it.
- A new shared `MenuButton` component calls `open()`.

This replaces the document-wide click listener, the id/class selectors and the six window events. They go away
everywhere (lethal fix), and the five existing buttons switch to `MenuButton`.

The drawer still closes on link tap, backdrop tap and Escape, and after navigation, as it does now.

### 2. One hamburger look

`MenuButton` uses the look Home and Bookings already have: a round button with three lines and a 16px icon,
using the page's ink colour.

- It shows on phones only (CSS media query; Chats uses its own 760px breakpoint).
- It shows only for a signed-in, onboarded account, the same rule the bottom nav uses today.
- Signed-out visitors (Marketplace, Support, Map, Property News) see no hamburger.

### 3. A drawer on pages outside the shell

For the seven pages without a shell, `_app` mounts a `PhoneDrawer`. It holds the account's sidebar in drawer form
only. Pages opt in with a typed `phoneMenu` flag, which replaces today's `appNavigation` flag.

- It is never rendered on laptops or desktops, so those pages look exactly as they do now.
- It is code-split and mounted when the browser is idle. The first paint pays nothing, and the first tap opens
  at once.
- It adds no network requests: the counts and profile it shows come from stores that are already loaded.

### 4. Where the hamburger goes on each page

The hamburger always sits at the far left of the page's existing header. No new bars are added.

| Page | Role | Placement |
|---|---|---|
| Client Home, Host Home, Bookings | both | existing button, switched to `MenuButton` |
| Notifications, Settings | both | existing button, switched to `MenuButton` |
| Marketplace | both | left of the "Marketplace" title in the sticky header |
| Profile | both | the empty left spot of the profile topbar |
| Public host profile | both | top-left over the banner (owner banner buttons stay top-right) |
| Chats (inbox) | both | left of "Messages" (phones ≤760px; 761–860px keeps the Chats icon rail) |
| Help & Support | both | left of the VaRoom logo |
| Calendar | host | left of the date tile |
| Analytics | host | left of the niche chip |
| Create listing (`/list`) | host | left end of the "Step N of 6" row |
| Pricing | host | left of the VaRoom logo |
| Property News | host | left of the VaRoom brand in the masthead |
| Detail screens (see D1) | both | open conversation, Chat Settings, listing page, Booking details, Map |

### 5. Remove the bottom nav

The bottom nav and everything tied to it are removed (lethal fix, nothing left behind):

- **The nav itself:** `MobileNav.tsx`, `lib/navigation/mobileNav.ts`, `MOBILE_NAV_STYLES`, and the render in `_app`.
- **The spacing kept for it:**
  - the body bottom padding;
  - `has-varoom-mobile-nav` rules in `bookingsStyles.ts:728-730`, `mapStyles.ts:21` and `marketplaceStyles.ts:144-145`;
  - the 5.5rem bottom padding on the Bookings and Client Home feeds;
  - the 5.1rem padding on the Chats contact list;
  - the raised start-page toast (`shellStyles.ts:735`).
- **Chats:**
  - the `.varoom-mobile-nav` hiding rules in `chats.css:574-580`;
  - the `chat-page-context` body class (`lib/chat/thread.ts:158`, `pages/chats.tsx:747`), if nothing else uses it.
- **Dead rules:** `.bottom-bar` / `.mobile-bottom-nav` hiding rules (no page renders them anymore), plus stale
  comments in `booking-approved.tsx`, `chat-settings.tsx` and `RAIL_STYLES`.
- **Tests that assert the bottom nav:** `persistent-host-sidebar`, `chats-migration`, `client-home-upgrade`,
  `notifications-migration` and `settings-page`. These are rewritten to test the drawer instead.

## Decisions for you

| # | Question | Recommendation |
|---|---|---|
| D1 | Detail screens (open conversation, Chat Settings, the listing page, Booking details, Map) already have a back arrow or close (X) top-left. Should they also get a hamburger? | **No: keep only the back arrow.** The page they go back to has the hamburger, and detail screens stay uncluttered (the open conversation keeps its full screen for messages). If you want a hamburger on every screen, it goes right after the back arrow. |
| D2 | Should the hamburger show a dot for unread notifications or chats? Without the bottom nav, they are one tap deeper. | **Yes:** a small red dot on the hamburger when anything is unread. It uses the counts store already loaded, so there are no extra requests. |
| D3 | Should the phone breakpoint stay as it is? | **Yes:** 860px for the app, 760px inside Chats, as today. |

## Parts (one PR each)

1. **Drawer control and hamburgers.** Adds `SidebarDrawerProvider`, `MenuButton` and `PhoneDrawer`, puts the
   hamburger on every page in the table, and removes the old selectors and events. The bottom nav still shows,
   so nothing is lost if this part ships alone.
2. **Remove the bottom nav.** Everything in section 5, plus doc updates (`docs/migration/ROADMAP.md`).

No database changes and no SQL migration.

## Testing

- Unit tests for the drawer provider, the `phoneMenu` pages and the show rule (signed out, not onboarded, host, client).
- `tsc`, the full test suite and `next build`.
- At 390px and 768px wide, for both roles, on every page in the table:
  - the hamburger is visible and opens and closes the drawer (link, backdrop, Escape);
  - the drawer closes on navigation;
  - no gap or white strip is left where the bottom nav was;
  - no page content is hidden behind anything at the bottom.
- At 1280px: no hamburger and no drawer on any page; the layout is unchanged.
- Dark mode on Chats, Property News and Marketplace, which colour their own headers.

## Risks

- **Sidebar CSS outside the shell.** The sidebar styles assume a `.host-app-layout` / `.client-app-layout` parent.
  `PhoneDrawer` keeps that parent with `display: contents`, so it adds no layout. Global rules in
  `chats.css` that touch `.sidebar` must be checked.
- **Stacking.** The drawer (z-index 200) must sit over sticky headers (Marketplace 20, Booking details 5,
  Chat Settings 10) and the Chats fixed app shell. It must stay under the checkout window (9000).
- **Crowded headers.** Calendar and Analytics have full headers on phones, so the hamburger must not push their
  controls onto a second line. If it does, they wrap as they already do today.
- **Support opens in a new tab.** The drawer there navigates that tab, which is expected.
- **Out of scope (noticed while investigating):** the Chats inbox on phones shows two settings gears.
