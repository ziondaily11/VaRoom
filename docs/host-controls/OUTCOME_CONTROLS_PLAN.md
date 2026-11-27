# Host listing controls by niche: plan

Status: **approved 2026-11-27. Part 1 (controls) built on `claude/host-outcome-controls`; part 2 (analytics) not started.**

## Goal

Every niche gets controls that match what actually happens to its listings. A property is rented or sold, an office is leased, and a shop is rented. When that happens, the host marks it, the listing leaves Discover and the marketplace, and analytics counts it. Duplicate status controls are removed.

## Decisions (agreed)

| # | Decision |
|---|---|
| D1 | The agreed price when marking sold / rented / leased is **optional**. |
| D2 | Approving a rental or lease request **prompts** "Mark as rented?" (a prompt, never automatic). |
| D3 | Sale properties get an **Under offer** badge: still visible, still contactable. |
| D4 | Block dates, separate hotel room/table pausing and the instant-book switch are **out of scope**. They belong to a separately planned calendar for Airbnb, hotel and venue. |

## What exists today (investigation)

- **Same menu for all niches** (`lib/listings/hostListingActions.ts:12-18`, `components/listings/HostListingMenu.tsx`): Edit · Make available · Mark booked · Mark unavailable · Pause · Save as draft · Share · Copy link · View bookings · View analytics · Duplicate · Delete.
- **Booked, unavailable and paused do the same thing.** The status route writes only `availability_status` for them (`server/routes/listingRoutes.js:545-597`). Every public reader filters `availability_status = 'available'`: client home `:974`, host home `hostHome.ts:74`, marketplace `:213`, landing `featuredSpaces.ts:197`, public profile `hostProfile.ts:150`, and Elie. The bookings insert trigger refuses any listing that isn't available (`20260903_000004:14-36`).
- **Nothing records why a listing went offline**, so analytics can't count sold or rented places.
- **Nothing in the database changes the status automatically.** Plan expiry and renewal only move `live_until` (`server/lib/listingLive.js:44-50`). A `sold` status would therefore never be put back to `available` by the system.
- **Admin moderation also uses `unavailable`** (`adminRoutes.js:472`), so that value must stay valid in the database.
- **Units:** `listing_booking_details.units_available` exists for property (and hotel rooms) only. Offices and shops have no unit count: their `office_shop_details` holds rooms and desks, which are not lettable units.
- **Analytics** is the Supabase RPC `host_analytics_overview`. The latest version is in `20261113_000068:42-281`; it calls `host_analytics_period` (`20261104_000057:133-287`). The client is `lib/analytics/analyticsApi.ts`, which **throws on a missing field** (`count()`, `:41-47`), and `lib/analytics/niche.ts` (the KPI catalogue and per-niche tiles).
- **Approving a request** is a direct client update (`lib/bookings/hostBookings.ts:45-61`) from `HostBookingsView.tsx:409-435`. Its select doesn't load the listing's category, purpose or units. `ConfirmSheet` (`components/bookings/ConfirmSheet.tsx`) can host the prompt.
- **Gaps a new status would hit:**
  - `profilePage.ts:76` would label `sold` as "Available".
  - `attention.ts:40-48` would still warn that a sold listing's term is ending.
  - The list wizard's edit path (`publish.ts:262-267`) would re-activate a sold listing and spend a credit.
  - Saved listings (`bookmarks.ts`) would show a sold house with no sign that it's gone.
- **Share vs Copy link (correction):** `navigator.share` exists in desktop Chrome and Edge on Windows. So on a computer, "Share" opens the Windows share panel and does not copy the link. The two buttons are not duplicates today, so merging them needs the rule below.

## The new controls

### Menu per niche

| Listing | While live | After the outcome |
|---|---|---|
| Property, rent | **Mark as rented…** | **Relist…** |
| Property, sale | **Mark as sold…**, **Mark under offer** / **Remove under offer** | **Relist…** |
| Property, both | **Mark as rented…**, **Mark as sold…**, under offer | **Relist…** |
| Office | **Mark as leased…** | **Relist…** |
| Shop | **Mark as rented…** | **Relist…** |
| Airbnb, hotel, venue | (no outcome controls; the calendar plan covers them) | n/a |

Every niche keeps: Edit · **Pause listing** / **Make available** · Share listing · View requests · View analytics · Duplicate · Delete.

**Removed from the menu:**
- **Mark booked**, **Mark unavailable** and **Save as draft** (on live listings). The values stay valid in the database, for existing listings and for admin removal. A listing currently in one of those states shows **Make available**.
- **Copy listing link** merges into **Share listing**: the share sheet on phones and tablets (coarse pointer), copy-to-clipboard on computers.

**View bookings** takes the niche's word:
- "View rental requests" for a property for rent and for shops
- "View lease requests" for offices
- "View bookings" for Airbnbs, hotels and venues
- Hidden for a sale-only property, where buyers come through chat

### Mark as sold / rented / leased…

A small dialog (the existing `.vr-listing-confirm` style):
- "Mark *Palm View* as rented?"
- **How many units** (shown only when the property has more than one unit; 1 to units left; default 1)
- **Agreed price, optional** (KES, monthly for rent and lease, total for sale)
- Buttons: **Mark as rented** / **Cancel**

The result:
- **A single unit, or the last unit:** the status becomes `rented` / `sold` / `leased`. The listing leaves Discover, the marketplace, the public profile and Elie. It frees its plan slot and its video place, the same as pausing does today. New booking requests are refused by the existing trigger.
- **Some units of several:** `units_available` goes down (5 → 4). The listing stays live and the booking card shows "4 units available".
- **Always:** one permanent record in `listing_outcomes` (see the migration below). Marking sold also clears Under offer.
- A toast confirms, with **Undo** (on screen for 8 seconds; the server accepts it for 10 minutes, and only for the listing's latest record). Undo voids the record and restores the status and units. It doesn't delete anything, so the history stays honest.

### Relist…

Asks how many units are available again (for a property), then uses the existing **Make available** path: plan checks, Silver/Gold term and media. Relisting adds a new time-on-market period and never deletes an outcome record, so the counts never go backwards. **Note:** if the listing's paid term has ended, relisting needs a new term or plan place, exactly as Make available does today.

### Under offer (sale and both)

- `listings.under_offer` is a flag, not a status. The listing stays `available`, visible and contactable, and the rent side of a "both" property can still be requested.
- An **Under offer** badge appears on the client home card, host home card, marketplace card, saved card, profile listing card and booking page. The booking page's sale note reads "This home is under offer. You can still contact the host."
- It clears automatically when the listing is marked sold.

### "Mark as rented?" after approving a request

- In `HostBookingsView`, after a rental or lease request on a property, office or shop is approved (`lease_months` is set) and the listing is still live, a `ConfirmSheet` asks: "Mark *Palm View* as rented? It leaves the marketplace and counts as rented in your analytics."
- For a multi-unit property: "Mark one unit rented? 3 left after this."
- **Not now** just closes the sheet; nothing else changes.
- The record links to the booking (`booking_id`), so the same booking can't be counted twice.
- This needs `category`, `listing_purpose`, `availability_status` and `listing_booking_details(units_available)` added to `HOST_BOOKINGS_SELECT` (extra columns, same request).

### Analytics

New period metrics, computed in SQL from `listing_outcomes` (voided records excluded):
- **Places rented / sold / leased**: the sum of units recorded in the period
- **Time on market**: median days from going live (`live_since`) to the outcome
- **Agreed value**: the sum of the prices hosts entered, labelled "from prices you entered"

Where they show (`niche.ts`):
- **Sale mode:** the hero becomes **Places sold**, followed by Time on market and Agreed sale value. Views, enquiries and contacts move into the tiles.
- **Leases mode** (property rent): a **Places rented** tile and a Time on market tile.
- **Commercial mode:** **Places leased** for offices, **Places rented** for shops.
- **Listings table:** a **Rented / sold** column. The CSV export picks it up automatically.

Marking an outcome clears that account's analytics cache (`invalidateAnalytics`, which exists but nothing calls it yet), so the numbers update straight away.

## Other places to fix

| Where | Change |
|---|---|
| `lib/profile/profilePage.ts:67-77` | Labels for Sold, Rented, Leased and Under offer |
| `lib/booking/bookingListing.ts:247-268` | "This property has been sold." / "This space has been rented / leased." instead of "currently sold" |
| `client-home.tsx:607`, `FeedCard.tsx:234,280` | Status banner uses the same labels (it's only seen in the host's own feed) |
| `lib/hostHome/attention.ts:40-48` | No "term ending" warning for sold, rented or leased listings |
| `lib/team/team.ts:42`, `TeamSection.tsx:51` | Status suffix for the new values |
| `lib/listWizard/publish.ts:262-267`, `startup.ts:144-150` | Editing a sold, rented or leased listing never re-activates it or spends a credit; only Relist does |
| Saved listings (`MarketplaceCard` / `SavedListings`) | Sold / Rented / Leased / Under offer badge for the guest who saved it |
| `chatbot/main.py` | No change: it already shows only available listings |

## Database migrations (the owner runs them)

**`20261127_000085_listing_outcomes.sql`**
- CHECK constraint: add `'sold', 'rented', 'leased'`.
- `listings.under_offer boolean not null default false`.
- Table `listing_outcomes`:
  - `id`
  - `listing_id`: on delete set null, so counts survive a deleted listing
  - `host_id`, `category`
  - `outcome`: sold / rented / leased
  - `units`: ≥ 1
  - `agreed_amount`: null when not entered
  - `amount_unit`: month / total
  - `listed_since`, `recorded_at`
  - `booking_id`: unique when set
  - `voided_at`
- RLS: the host reads their own rows; no client writes.
- One `security definer` function each for record, void and set-under-offer. Each checks ownership and that the outcome fits the category and purpose, then updates units, status and the record in one transaction. The server calls them with the service role.

**`20261127_000086_analytics_outcomes.sql`**
- Redefines `host_analytics_period` and `host_analytics_overview` from their latest versions, adding the outcome fields and the per-listing column.

Run order: 000085 before the first PR deploys, 000086 before the second. As a safety net, the client also treats missing analytics fields as 0, so a deploy that lands first can't break the page.

## Delivery

Two PRs on one branch line:

1. **Controls:** migration 000085, server routes (`POST /api/listings/:id/outcomes`, `POST /api/listings/:id/outcomes/:outcomeId/void`, `POST /api/listings/:id/relist`, `PATCH /api/listings/:id/under-offer`), menu per niche, dialogs, badges, the approve prompt, and the fixes in "Other places to fix".
2. **Analytics:** migration 000086, `analyticsApi.ts`, `types.ts`, `niche.ts`, the listings table and tests.

## Tests

- **Server:** each outcome per category and purpose; refusing a wrong outcome (e.g. "sold" on an office); unit countdown to zero; void within and after 10 minutes; one outcome per booking; ownership; team members acting for a company.
- **Client:**
  - The menu items for each niche and status.
  - The removed items are gone.
  - Share copies the link on a computer.
  - The badges and labels show up.
  - The approve prompt appears only for rentals and leases on a live listing.
  - Analytics mode tiles and the parser tolerating missing fields.
- **Also:** `tsc` and the build; signed-in browser checks on host home, profile, marketplace, the booking page, bookings and analytics, with the test accounts' own listings only.

## Deploy order (part 1)

The feeds, marketplace, Saved, profile cards and booking page read `listings.under_offer`. **Run migration 000085 before this code deploys**, or those reads fail ("column listings.under_offer does not exist", checked against production on 2026-11-27). The home feed cache moves to version 4, so cards cached without the new fields are fetched again.

## Risks

- **Relisting a listing whose paid term has ended** needs a new term or plan place, as Make available does today. The Relist dialog says so before it tries.
- **The two analytics functions are long**, and redefining them copies their latest bodies. The existing `host-analytics.test.js` plus a before/after comparison of the overview on the test accounts guard against regressions.
- **Existing listings marked `booked` or `unavailable`** stay as they are and show **Make available**. No data is changed.
