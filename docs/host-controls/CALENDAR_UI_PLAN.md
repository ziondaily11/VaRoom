# Host calendar: UI redesign plan

Status: **approved 2026-11-28 (recommendations accepted: default view by niche, stats in the right column, details in the right column). PR 1 (shell and month view, 000096) merged (#765). PR 2 (Week and Day views) on `claude/calendar-week-day`.** The calendar's logic is complete (`CALENDAR_PLAN.md`, parts 1–7). This plan changes how it looks and is used, not what it does. Every feature stays.

References: Prodless (week grid, date tile, details panel), Chronicle (filters with colours, Day/Week/Month, all-day row, popover), the "Today's schedule" app (day timeline, pinned cards, widgets).

## Problems in today's page

1. Broken controls in the side panel: "Get a new link…" and "Add link" wrap into tiny pills, and "Copy" overflows the panel.
2. The side panel mixes the day with a listing's settings (sync, prices, weekly closed days, hire hours) in one long scroll.
3. The month grid is big empty boxes. A stay shows as a chip on each day, not one bar from check-in to check-out.
4. Month view only: no time grid for hourly venues, viewings and timed events.
5. Four large stat tiles, mostly zero, and the month list far below the fold.
6. No filters (places by colour, kinds of entries, other sites).

## The new layout (desktop, 1280px and wider)

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│ [NOV|28] Saturday, 28 November 2026        (search) ‹ Today ›  Day Week Month Timeline  [Select days] [+ Add] │
├───────────────┬──────────────────────────────────────────────┬───────────────────┤
│ mini month    │                                              │ Details           │
│ (dots = busy) │   the chosen view                            │ (selected entry)  │
│               │   Month · Week · Day · Timeline              │  or               │
│ My places     │                                              │ Today / This month│
│ ■ Palm View ✓ │                                              │ widgets           │
│ ■ Garden    ✓ │                                              │                   │
│ Show          │                                              │                   │
│ ✓ Bookings …  │                                              │                   │
│ Coming up     │                                              │                   │
│ (next 5 cards)│                                              │                   │
└───────────────┴──────────────────────────────────────────────┴───────────────────┘
```

### Header
- A **date tile**: red top with the month, day number below (Prodless). Then the full date.
- Search across the loaded months (guest names, event titles, places).
- ‹ **Today** ›, and the view switch: **Day · Week · Month · Timeline**. Timeline is shown only when there are 2+ places.
- **Select days** and **+ Add** (VaRoom red).
- The four big stat tiles leave the header. Their numbers move to the right column's widgets.

### Left column (about 280px)
- **Mini month calendar.** Days with entries get a dot; closed days are muted. A tap jumps the main view to that day.
- **My places:** each listing with its own colour swatch and a checkbox, plus a ⚙ that opens **Place settings** (below). Colours come from a fixed palette in listing order, so they never change between visits.
- **Show:** checkboxes for Bookings, Requests, Booked offline, Other sites, Viewings, Notes, Closed and cleaning days.
- **Coming up:** the next 5 check-ins, move-ins, viewings and events as small cards (the "Weekly pinned" pattern).

### Main views
- **Month:** compact cells.
  - A stay is **one bar** from check-in to check-out. It starts halfway into the check-in day and ends halfway into the check-out day, so changeover days read at a glance.
  - Bars stack in lanes; "+N more" opens the day.
  - Closed days are hatched and cleaning days lightly hatched; a double booking gets a red outline.
  - A special price shows small in the corner; a hotel shows "3 left".
- **Week:**
  - an **all-day row** on top for stays and day hires (bars across days);
  - an **hour grid** below for hourly bookings, viewings, timed events and table reservations;
  - today's column tinted, with a black **current-time pill** on the line (Prodless and Chronicle).
- **Day:**
  - the **schedule timeline** from the third reference: rich cards with an icon, title, time and a tag (Booked, Request, Viewing, Note, Other site);
  - for planner hosts (property, office, shop): move-ins, lease ends and viewings.
- **Timeline:** one row per place across the month (today's view), restyled with the same colours.

### Entry styles (all views)
- **The place's colour** is the main colour. The **kind** of entry is its style:
  - VaRoom booking: solid tint and a coloured edge;
  - request: dashed edge and a "Request" tag;
  - booked offline: tint and an "Offline" tag;
  - other site: tint and the site's name ("Airbnb.com");
  - viewing: an eye icon;
  - note: neutral grey;
  - closed: hatched;
  - cleaning: light hatch.
- Each entry shows the guest's photo, or their initials when there's none.

### Right column (about 340px)
- **Nothing selected:** widgets (the third reference):
  - **Today:** check-ins, check-outs, viewings;
  - **This month:** occupancy bar, nights or days booked, earned, with "entered by you" money shown separately;
  - **Requests waiting:** a list with Approve and Decline.
  - Planner hosts get: viewings this week, move-ins, leases ending, requests waiting.
- **An entry selected:** its **details card** (Prodless). Title, place, dates and time, length, guests, price, status, guest photo and name, then the actions:
  - Approve and Decline;
  - Chat and Call;
  - Edit and Delete for the host's own entries.
- **A day selected (no entry):** that day's places with Open / Closed / rooms left, Close day / Reopen, Close rooms…, the day's price, and "+ Add to this day".

### Place settings (a drawer, opened from ⚙ or a place's row)
Everything that is a listing's setting moves out of the day panel, in tabs: **Prices** (normal, weekend, special dates) · **Availability** (closed every week, cleaning days, hire hours) · **Sync** (VaRoom's link, other sites' links). The broken controls are rebuilt here.

## Smaller screens

| Width | Layout |
|---|---|
| 1024–1279 | The left column becomes a drawer (a "Filters" button). The right column becomes a panel that slides over. |
| 861–1023 | The same, with Week showing 5 days and scrolling sideways. |
| 860 and below (phones) | The header becomes a compact date and a week strip. **Day** is the default view; Month shows dots, not bars. Details and settings open as bottom sheets; the existing + button adds. |

Layout changes use CSS media queries only, with no resize listeners (CLAUDE.md §7).

## Default view
A host's last view is remembered on their device. The first time:
- **Month** for Airbnbs and hotels;
- **Week** for venues;
- **Day** for property, office and shop.

## Data
- One small database change: `host_calendar` adds the guest's photo (`avatar_url`) to bookings and leases. Everything else is already loaded.
- Week and day views can cross into the next month; the two months load from the existing cache.

## Light and dark
Both, using the page's existing tokens. The screenshots are dark; the references are light.

## Delivery (one PR each)
1. **Shell and month view:**
   - header, left column (mini calendar, places, filters, coming up), right column (widgets, details card, day);
   - Place settings drawer (fixes the broken controls);
   - the month view with stay bars;
   - the `avatar_url` addition.
2. **Week and day views:** all-day row, hour grid, current-time line, schedule cards.
3. **Timeline, search and phone layout:** timeline restyle, search, the phone layout and bottom sheets. Then a signed-in check of every view in light and dark.

## Tests
- Pure helpers stay tested as now: stay-bar layout (lanes, half-day ends), filters, colours, week ranges.
- `tsc`, build, and the existing 1033 client tests updated where markup changes.
- A signed-in browser check with a test host, in both themes and at 1440, 1280, 1024 and 390 px wide.
