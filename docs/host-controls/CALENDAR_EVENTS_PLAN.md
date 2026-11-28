# Calendar: wide view, event bookings, and the new add card

Status: **approved 2026-11-29 with both recommendations (venue day hires as cards; a one-week grace before the event type is required). PR 1 (A + E) merged (#772). PR 2 (B + C + D, migration 000097) on `claude/calendar-event-types`.** Follows `CALENDAR_UI_PLAN.md` (PRs #765–#768, merged).

References: our Week view (dark screenshot, 29 Nov) and the "Skejulio" calendar (light: Day/Week/Month, cards with a tag, title, short description and people, and a "Create Schedule" card).

## What the owner asked for

1. A way to **close the right column**, so the calendar spreads across the page and shows more.
2. **Venue bookings say what the event is.** The guest picks the type of event from a list (wedding, graduation, corporate…) and may add extra information. The host reviews the request with that context.
3. On the calendar, the host sees **the event and the booker** (e.g. "Wedding · Divine Venues"), not only the booker's name.
4. With the column closed, entries show **richer cards** (screenshot 2): a tag, the title, a short description, people.
5. The **add card** restyled after screenshot 2's "Create Schedule".

## What exists today (investigation)

- Guests book from `BookingWidget.tsx`; `pages/booking.tsx` inserts into `bookings` from the browser (`bookingPayload` in `lib/booking/bookingListing.ts`). The database checks the rules (`varoom_apply_booking_rules`).
- `bookings` has no event type or note. Only table reservations have an "occasion".
- The host sees requests in Bookings (`HOST_BOOKINGS_SELECT`) and in the calendar (`host_calendar`, latest in 000096). The new-request notification is made by a trigger (000064).
- Venue **day hires** show as a thin bar in Week's "All day" row (screenshot 1). Only hourly bookings get a card in the hour grid.
- The add form (`EventForm.tsx`) is a centred dialog: kind cards, then plain fields.
- Since #770 phones have no bottom navigation, so the calendar's phone + button can sit at the normal corner.

## The plan

### A. Close the right column (desktop)
- A **panel button** in the header (an icon with "Hide details" / "Show details") closes or opens the right column. The choice is remembered on the device, as the view is.
- Closed: the grid becomes **left column + calendar**, so the calendar gains about 360px. Picking an entry or a day then opens its details **sliding over from the right** (as below 1280px today), and they close back.
- Below 1280px nothing changes: the column already slides over.

### B. The event type on venue bookings (needs a database change)
- **Guest, venue listings only:** a required **"Type of event"** dropdown and an optional **"Anything the host should know"** box (up to 500 characters), above the request button. The list:
  - Wedding
  - Traditional ceremony (ruracio, ngurario…)
  - Graduation
  - Birthday
  - Corporate event
  - Conference or meeting
  - Church or religious event
  - Baby shower
  - Memorial
  - Concert or show
  - Photo or video shoot
  - Party
  - Other
- **Database (migration 000097):**
  - `bookings` gains `event_type` (one of the list, or null) and `event_notes` (up to 500 characters, or null).
  - A small trigger requires `event_type` when the listing is a venue and clears both fields for other listings. Guests book from the browser, so the page alone can't be trusted.
  - `host_calendar` returns both fields: 000096's version plus two fields, nothing else changed.
  - The new-request notification says the event ("New booking request: Wedding on 12 Dec").
- **Host review:**
  - Bookings shows the event and the notes on each request.
  - The calendar's details card shows "Wedding", the booker, guests, date and hours, the notes, and Approve / Decline.
- **The guest** sees their event type on their booking.

### C. The event and the booker on the calendar
- A venue booking's title becomes **"Wedding · Divine Venues"**: the event first, then the booker. Search finds it by either.
- **Recommended:** a venue's **day hire shows as a card over its hire hours** in Week and Day (08:00–22:00 when the venue sets no hours), not as a thin "All day" bar. Then venue bookings look like screenshot 2. Stays (nights) stay as bars.

### D. Richer cards (screenshot 2)
- In Week and Day, a card shows:
  - a **tag** (the event type, or the kind: Booked, Request, Viewing, Note, Other site, with the place's colour);
  - the **title**;
  - **two lines of description** (the guest's notes, or the event's notes);
  - a footer with the **booker's photo** and **guests**.
- The card fills the columns' width. With the right column closed there is room for all of it. In narrow columns it drops the description, then the footer, so short entries stay readable.
- Month stays as bars, which is clearer for stays.

### E. The add card (screenshot 2's "Create Schedule")
- The same fields and saving as today, laid out like the reference:
  - a header icon with "Add to calendar" and a one-line hint;
  - rows with an icon and a label: **Title, Notes, Date, Time (from → to), Place, Kind (Booked offline / Viewing / Note), Colour, Reminder**;
  - **Cancel** and a black **Save** at the bottom.
- **Clicking an empty hour** in Week or Day opens the card with that day and hour filled in. Today a click there only selects the day.
- Desktop: the card opens beside the clicked hour when there is room, otherwise centred. Phones: a bottom sheet, as now.
- Motion follows `animation.md`: it grows from where it was opened (.95, 200 ms), and the exit is shorter.

## Delivery (one PR each)
1. **A + E:** close the right column, the add card, and click-an-hour to add. No database change.
2. **B + C + D:** migration 000097, the guest's event type, the host's review, titles, venue day hires as cards, and the richer cards.

## Risks
- The trigger must not block a booking from an older page that has no event type. It requires the type only for **venues**, and the new page is deployed with the migration. Until both are live, venue requests from a page still open in a tab would be refused with a clear message. To avoid that, the migration can first allow a missing type for a week, then require it.
- `host_calendar` is redefined again, so it is checked against 000096 line by line in a test, as before.

## Tests
- The pure helpers: titles, the day-hire card hours, card sizing by width, and the event-type list.
- The migration's check and trigger, in PGlite.
- The full client and server suites, `tsc` and the build.
- A signed-in check on the preview, in light and dark.
