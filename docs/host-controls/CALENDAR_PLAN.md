# Host calendar: plan

Status: **approved 2026-11-27 with every recommendation (C1–C6 below). Part 1 (booking rules, 000089) and Part 2 (Calendar page, open by default, 000090) merged and applied. Part 3 (planner, 000091) on `claude/calendar-planner`; 000091 applied 2026-11-28.**

## Goal

One calendar that does two jobs for every host:

1. **It controls what guests can book.** What the calendar says is exactly what the booking page offers and what the database accepts. A host never has to keep two things in sync.
2. **It is the host's own planner.** A host can mark dates and write what is happening ("Kamau wedding, Garden lawn, 300 guests"), record bookings that came by phone, WhatsApp or another site, and keep private notes. The calendar highlights those days.

It matters most for **Airbnbs, hotels and venues** (the subscription niches), because they sell time. It is included in **every plan**: it is not a paid extra.

## What exists today (investigation)

### How dates work now

- **Hosts "open" dates one by one.** The listing wizard's Step 4 calendar (`components/listWizard/AvailabilityCalendar.tsx`) writes one row per open day to the `availability` table (`pages/list.tsx:755-763`). It has "Open next 30 days" and "Clear all". Guests can only request days that are open (`lib/booking/bookingListing.ts:376`).
- **The booking page** reads open days and pending/approved bookings for the listing (`fetchCalendar`, `bookingListing.ts:339-346`) and greys out booked days (`components/booking/BookingCalendar.tsx`).
- **The database** checks every new booking (`varoom_apply_booking_rules`, latest in `20261127_000085_venue_day_pricing.sql`): past dates, minimum notice, how far ahead, min/max nights, venue day hire, and no overlap with a pending or approved booking. Instant book approves nightly stays automatically. Guest count is checked against the listing's maximum (`000077`).
- **Listing-wide status** (`availability_status`: available / paused / booked / unavailable, plus sold / rented / leased from 000087) switches the whole listing off. A trigger refuses any booking on a listing that isn't available (`000004`).
- **Hotel dining** has its own `table_reservations` (date, time, tables, guests) with statuses requested / contacted / closed (`000030`).
- **Hosts see bookings only as a list** (`/bookings`, `HostBookingsView.tsx`), with a month filter. There is no calendar for hosts anywhere.

### Problems found

These are real gaps in the current code. The calendar plan fixes all of them.

| # | Problem | Where | Effect |
|---|---|---|---|
| P1 | **Guests can't see other guests' bookings.** The only read policy on `bookings` lets a user see bookings where they are the client or the host (`000065:136-138`). The booking page's "booked" days therefore only ever contain the guest's own bookings. | `bookingListing.ts:342` | A guest picks dates that are already taken, fills everything in, and only then gets "Those dates were just booked". (To confirm on production with a read-only `pg_policies` check: the base schema predates the migrations.) |
| P2 | **The open-dates model fails silently.** If a host never opens dates, or the 30 days they opened run out, the listing shows "available" everywhere but nobody can book it. | wizard Step 4 | Hosts lose bookings without knowing why. Opening dates is buried in the listing editor. |
| P3 | **No changeover day.** The overlap check counts both ends: `start_date <= new.end_date and end_date >= new.start_date`. A guest checking out on the 5th blocks a new guest checking in on the 5th. The booking page marks the check-out day as booked too. | `000085` trigger, `bookedDays()` | Every Airbnb and hotel loses a night between stays. |
| P4 | **A hotel listing with 20 rooms can take only one booking per night.** A hotel listing is a room type with `units_available` rooms ("20 rooms of this type", `bookingListing.ts:501`), but the overlap check is per listing. | `000085` trigger | Hotels can't actually be booked as hotels. |
| P5 | **Hourly venue bookings have no time and no overlap check.** They store a date and a number of hours only (`bookingPayload`, `:560-562`). The overlap check needs an end date, so it skips them, and `bookedDays()` skips them too. | trigger, booking page | Two parties can book the same hall at the same time, and the host can't tell when either starts. |
| P6 | **Unanswered requests hold dates until the hourly sweep runs.** The server expires requests older than 48 hours once an hour (`server/lib/bookingExpiry.js`, `server.js:874-882`), and only while the server is awake. Until then the database still treats them as holding the dates, and the host can still approve them. | trigger, host bookings | Dates stay blocked by requests nobody answered, and a host can approve a request the guest was told had expired. |
| P7 | **Opening dates is not in the database rules.** The trigger never checks `availability`, so a request on a closed day from an old or altered page is accepted. | trigger | The host's closed days aren't guaranteed. |
| P8 | **The guest's browser sends the price** (`total_price` in `bookingPayload`), and nothing on the server recomputes it. | `bookingListing.ts:546-552` | Fine for one flat price; it must change before per-date prices exist (Part 4). |

## What the calendar shows

### The host's Calendar page (`/calendar`)

A new **Calendar** item in the host sidebar, under Bookings. It opens inside the persistent host shell (no reload), and is also reachable from each listing's menu ("Open calendar", pre-filtered to that listing) and from host home.

**Views**

| View | Who it's for | What it shows |
|---|---|---|
| **Month** (default) | Everyone | A month grid. Each day shows its state colour and up to three chips (booking guest name, event title, note), then "+2 more". |
| **Listings timeline** | Hosts with several listings (Airbnb with 6 units, venue with 5 spaces, hotel with room types) | One row per listing, days across. Bookings and events are bars that span their days, so a host sees the whole business at once. Same idea as a hotel front-desk board. |
| **Day** (and week) | Venues hired by the hour, hotel dining | Hours down the side, from the venue's hire hours. Hourly bookings, events and table reservations sit at their times, with setup/cleanup buffers shaded. |
| **Agenda** (phones) | Everyone on a phone | A scrolling list: Today, Tomorrow, This week… Each entry shows time, listing, who and status. The month grid shrinks to a small date strip above it. |

**Filters:** listing (one, several or all) · show/hide requests, bookings, my events, notes, closed days · team members see the same calendar their role allows.

**Day states and colours** (one legend, the same on the host calendar and, simplified, on the booking page):

| State | Meaning | Guests can book? |
|---|---|---|
| Open | Bookable | Yes |
| Booked | An approved VaRoom booking | No |
| Requested | A pending request, held for 48 hours | No (held) |
| Booked offline | The host's own booking (phone, walk-in, another site) | No |
| Closed | The host closed it (maintenance, personal use, holiday) | No |
| Partly booked | Hotel: some rooms left ("3 of 20 left"). Venue by the hour: some hours taken | Yes, what's left |
| Outside window | Before the minimum notice or past "book up to N days ahead" | No |
| Listing off | The whole listing is paused, sold, expired, etc. A banner explains it and links to the fix | No |

Changeover days show half and half (one stay ending, one starting), as hosts know from other platforms.

**Clicking a day** opens a side panel (an overlay on narrow screens, matching the right-panel rules in CLAUDE.md §7):
- Everything on that day: bookings (guest, guests count, nights, price, status, link to the booking and the chat), requests (with **Approve** and **Decline** right there), events and notes.
- For hotels: rooms booked, closed and left, per room type.
- Actions: **Close** / **Reopen**, **Add event**, **Add note**, and for hotels **Close rooms…**.

**Top of the page**, small and useful, not a dashboard:
- This month: nights or days booked, occupancy %, money from approved bookings (and from offline bookings, shown separately because the host typed it).
- Waiting for you: N requests to answer (expiring soonest first).
- Today / tomorrow: check-ins, check-outs, events.

### The host's own events (the planner)

The user's example: a venue host marks a Saturday and writes "Wanjiku & Otieno wedding, Garden lawn, 250 guests"; that day lights up with the event's colour.

**Add event** form:
- Title (required), listing (one, several, or "not tied to a listing")
- Date or date range; all day, or start and end time
- Colour (6 to choose from)
- **Blocks bookings** on/off. On (default for an event on a listing) = an offline booking: guests can't book that time. Off = a note or reminder only.
- Optional: client name and phone, number of guests, amount agreed (KES), notes
- Optional repeat: weekly or monthly, until a date (e.g. "Church service every Sunday 8-12")

Three quick types set sensible defaults: **Booked offline** (blocks, has client and amount), **Closed** (blocks, a reason), **Note** (doesn't block).

Events are **private**. Guests never see a title, a name or a note: only that the time is unavailable. Team members with the manager role see and edit them, like bookings.

### Bulk actions

Drag across days (or tap first and last day on a phone) to select a range, then: Close · Reopen · Add event · Close rooms (hotel). Weekly closed days are a listing setting ("Closed every Monday"), not hundreds of rows.

## How the calendar controls availability

### Rule 1: open by default, the host closes what isn't available

**Recommended (decision C1).** Instead of opening each day, a listing is bookable on every day inside its booking window (minimum notice to "book up to N days ahead", default 365), except days that are booked, held, closed, or outside the listing's weekly closed days. This removes P2. The listing wizard's Step 4 calendar becomes "Close dates you're not available" with the same look.

Existing listings keep exactly what they offer today. A one-time conversion turns each listing's open dates into the same thing expressed as closures: the gaps between open days become closed ranges, and the day after the last open date onward becomes one "closed from" range. Listings with no open dates at all today are not bookable now; they get a closure from today, and the host sees "Your calendar is closed. Open it?" on the Calendar page and on host home. No listing becomes bookable on a day it isn't today, until its host acts.

### Rule 2: the database is the only judge

Every rule the calendar shows is enforced by the booking trigger, so a stale or altered page can't get round it (P7):
- Not on a closed day, an offline booking, or outside the weekly closed days.
- **Nightly stays:** a night is taken when a stay covers it. A stay from the 1st to the 5th takes the nights of the 1st to the 4th, so the 5th is free for check-in (P3). Overlap test: `existing.start < new.end and existing.end > new.start`.
- **Venues by the day:** first and last day both included (as today).
- **Venues by the hour:** bookings store a start and end time. Overlap is checked by time, plus the venue's setup/cleanup buffer (P5). Hourly bookings must fall inside the venue's hire hours.
- **Hotels:** a night is full when overlapping bookings + offline bookings + closed rooms reach `units_available`. Until then it stays bookable with "N rooms left" (P4).
- **Requests hold dates for 48 hours only.** The overlap check ignores pending requests older than 48 hours, so they release on time even if nobody sweeps them (P6). A scheduled sweep marks them expired for the lists.

### Rule 3: guests see availability, never other guests

The booking page reads one database function, `listing_calendar(listing, from, to)`, that returns only day (or hour) states: open, unavailable, rooms left. No names, no booking ids, no event titles. It works for signed-out visitors too. This fixes P1 without opening the bookings table.

### Rule 4: listing-wide switches stay as they are

Pause, sold / rented / leased, plan expiry and admin removal still switch the whole listing off. The calendar shows them as a banner over the listing's days, with the action that fixes it (Make available, Relist, Renew). The calendar never changes `availability_status` by itself.

### Instant book

The switch moves to the calendar's listing settings (next to minimum notice, booking window, min/max stay, check-in/out times, buffers, weekly closed days). These rules already exist in `listing_booking_details` and Settings → Bookings defaults; the calendar is simply where hosts find them.

## Niche by niche

| Niche | Unit of time | Calendar specifics |
|---|---|---|
| **Airbnb** | Night | Changeover days, min/max stay, check-in/out times, cleaning buffer days (optional, e.g. 1 day between stays). Timeline view for hosts with several units. |
| **Hotel (rooms)** | Night, per room type | Rooms left per night, close N rooms, room-type rows in the timeline. Occupancy per room type. |
| **Hotel (dining)** | Time slot | Table reservations appear in day view with guests and tables; their status (requested / contacted / closed) is changed from the panel. Tables already reserved per slot shown ("6 of 12 tables"). Capacity enforcement for tables is a later step, not part of this plan. |
| **Venue** | Day or hour | Hire hours, setup/cleanup buffer, day view, events with titles and guest numbers. A day hire blocks the whole day; hourly bookings make a day "partly booked". |
| **Property, office, shop** | Months / viewings | No booking control (leases and sales aren't date-booked). They get the planner only: viewings, move-in dates from approved rental requests, lease renewals and notes. Low priority; offered because the calendar is in every plan. |

## Syncing with other sites (Part 5)

Many Kenyan Airbnb hosts also list on Airbnb.com and Booking.com. Without sync they will be double-booked, and the VaRoom calendar can't be trusted.
- **Export:** each listing gets a private iCal link (`.ics`) of its unavailable days, which the host pastes into Airbnb.com / Booking.com / Google Calendar.
- **Import:** the host pastes those sites' iCal links; VaRoom reads them every 30-60 minutes and shows their bookings as "Booked on Airbnb.com" (blocks). Runs on the existing free scheduler setup (GitHub Actions started by cron-job.org, as Property News does).

## Data (migrations the owner runs)

Planned tables and changes, to be written per part:

- **`calendar_entries`**: `id`, `host_id`, `listing_id` (null = not tied to a listing), `kind` (offline_booking / closed / note), `title`, `notes`, `color`, `start_date`, `end_date`, `start_time`, `end_time` (null = all day), `units` (hotel rooms, default all), `blocks_bookings`, `client_name`, `client_phone`, `guest_count`, `amount`, `repeat_rule`, `repeat_until`, `source` (host / ical), `created_by`, timestamps. RLS: the host and team managers only; guests never read it.
- **`listing_booking_details`** gains `closed_weekdays`, `hire_start`, `hire_end`, `buffer_minutes`, `turnover_days`.
- **`bookings`** gains `start_time`, `end_time` for hourly bookings (hours stays, derived).
- **`varoom_apply_booking_rules`** redefined from its latest body (000085): closed days and entries, changeover, hotel room counts, hourly overlap with buffers, 48-hour hold.
- **`listing_calendar(listing, from, to)`**: public, returns day states only.
- **`host_calendar(from, to, listings)`**: the host's view in one call: bookings, requests, entries, table reservations, listing rules and status for the range.
- **Conversion** of today's `availability` rows to closures (Rule 1), then the `availability` table is retired once nothing reads it.

Every migration starts with a check query, is safe to re-run, and has an undo section, as before.

## Speed and caching

Per CLAUDE.md §5:
- One request per visible range (`host_calendar`), never one per listing or per day. The next and previous month are fetched in the background.
- Cached per account and month in memory and sessionStorage (key `calendar:{accountId}:{yyyy-mm}`), shown instantly on return, refreshed in the background. Cleared on logout and account switch.
- Closing a day or adding an event updates the grid at once (optimistic), and rolls back with a message if the server refuses.
- Approving or declining a request on `/bookings` or in the calendar clears that month's cache in both places.
- The booking page caches `listing_calendar` per listing for a minute, and always re-checks on submit (the database decides anyway).
- The page is a native React route in the host shell; the sidebar never remounts.

## Plans

Included in **every** Airbnb, hotel and venue plan, and for property / office / shop hosts (planner only). Nothing about the calendar is gated by plan, including iCal sync. (Decision C2.)

## Decisions for the owner

| # | Question | Recommendation |
|---|---|---|
| C1 | Open by default (host closes days) instead of opening each day? | **Yes**, with the conversion that keeps every listing exactly as bookable as today. |
| C2 | Calendar and sync free on every plan? | **Yes**, as you asked. |
| C3 | Do pending requests hold dates? | **Yes, for 48 hours**, shown as "Requested". |
| C4 | Default buffer between stays / venue events? | **None** by default; hosts set it (Airbnb: days; venue: minutes). |
| C5 | Do offline bookings count in analytics (occupancy, earnings)? | **Occupancy yes; earnings shown separately** as "entered by you". |
| C6 | Should the planner come to property, office and shop hosts now or later? | **Later** (Part 6). The booking niches first. |

## Delivery

One branch and PR per part, each tested and shipped before the next:

1. **Fix the booking rules** (P1, P3, P4, P6, P7): `listing_calendar`, changeover, hotel room counts, 48-hour hold, closed days in the trigger, the booking page reading `listing_calendar`. Guests benefit first, even before the host page exists.
2. **Host Calendar page**: month and agenda views, day panel with approve/decline, close/reopen, the open-by-default conversion, sidebar item, listing menu link. The listing wizard's date step became a note linking to Calendar, so dates have one editor (two would overwrite each other).
3. **Events and planner**: events in `calendar_entries` (booked offline, which takes its days and hotel rooms like a booking; notes, which never do), colours, times, client details, amount, weekly or monthly repeat; timeline view; weekly closed days. Bulk select shipped in part 2. A closed day's reason is written as a note, so closed ranges keep merging cleanly.
4. **Venues by the hour and hotels**: start/end times, hire hours, buffers, day view, close rooms, table reservations in day view. Then server-side price calculation (P8), so per-date prices (weekend and season prices) can follow safely.
5. **iCal export and import.**
6. **Planner for property, office and shop** (viewings, move-ins, renewals) and occupancy in analytics.

## Tests

- **Database (PGlite in the scratchpad, as for 000087/000088):** changeover accepted; overlap refused; hotel fills at exactly `units_available`; closed days and offline bookings refuse bookings; hourly overlap with buffer; a 49-hour-old pending request no longer holds; `listing_calendar` returns no names or ids; RLS hides `calendar_entries` from guests and from other hosts; team managers can read and edit.
- **Client:** each view per niche; day panel actions; optimistic close with rollback; cache keys by account; agenda on phone widths; the booking page legend and partly-booked states.
- **Also:** `tsc` and the build; signed-in browser checks with the test accounts' own listings only (never account-group writes, per the test-accounts rule).

## Risks

- **The booking trigger is the heart of every booking.** Redefining it can break booking for everyone. Part 1 is small on purpose, and each rule has its own test before the trigger changes.
- **The conversion** must not make any listing bookable on a day it isn't today. It runs in a migration the owner checks first with a count query, and its undo restores the `availability` rows.
- **P1 depends on production policies** the repo can't see. A read-only `pg_policies` check comes first.
- **iCal import depends on other sites' feeds** being reachable; a failing feed shows a warning on the listing and never removes existing blocks.
- **Time zones:** all dates are Nairobi dates, as the trigger already uses (`Africa/Nairobi`).
