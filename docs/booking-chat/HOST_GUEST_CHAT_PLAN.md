# Host ↔ guest chat around bookings

Status: **approved 2026-11-28 (D1–D4); implemented on `claude/booking-host-chat`**

## Problem

Only a guest can start a conversation. A host who receives a booking request cannot ask the guest anything,
and after approving it the host has no way to reach the guest. The guest's booking shows no Reach Out
channels (WhatsApp, call, email); those exist only on the listing page.

## Approved decisions

- **D1.** Hosts can message the guest on **pending** requests as well as approved and completed bookings.
- **D2.** A host's message about a guest's own booking **passes the guest's "Who can message you: No one"** setting.
  It cannot reach anyone else, because it needs a booking between the two.
- **D3.** Approving a request **posts a message in the chat** automatically.
- **D4.** A team member working as a company **messages as the company** (`sender_id` = company,
  `sent_by` = the person), as Chats already does.

## What exists today

| Area | Today | Where |
|---|---|---|
| Starting a chat | `POST /api/chat/conversations/start {listingId}`: the signed-in person and the listing's host. It reuses any conversation between the pair, otherwise it creates one (unique on `listing_id, client_id`). It refuses the listing's owner. It checks "No one". | `server/routes/chatRoutes.js:450` |
| Guest booking card | Has a "Message host" icon (`startListingChat`) | `components/bookings/ClientBookingsView.tsx:90` |
| Host booking card / detail | Approve and Decline only, with no way to contact the guest. Table reservations have "Call Client" | `components/bookings/HostBookingsView.tsx:144-240` |
| Approve / decline | A browser-side Supabase update on `bookings` (RLS: `varoom_can_act_for(host_id,'manager')`). Triggers apply booking rules (`booking_rule:` errors), block suspended accounts (`auth.uid()`) and notify the guest (`booking_approved`) | `lib/bookings/hostBookings.ts:62`, migrations 063 / 020 / 064 / 065 |
| Sending a message | Encrypted in Node (`encryptMessage`). Elie's away mode replies only to **guest** text messages | `chatRoutes.js:771`, `:835` |
| Team roles | `manager` handles listings and bookings. `messaging` handles chats. `actAsHost(req, user, role)` reads `X-VaRoom-Host` | `server/lib/team.js` |
| Reach Out | `listing_contact` RPC → `fetchListingContact`; buttons on the listing page | `lib/reachOut/reachOut.ts`, `components/booking/ListingDetails.tsx:224` |

## The design

### 1. One helper for "the conversation between these two"

Move the reuse-or-create logic out of the start route into `server/lib/chatStart.js`:
`conversationFor(admin, { hostId, clientId, listingId })`. It returns the pair's most recent conversation
(latest message, else newest), or upserts a new one. All three callers below use it. It does not check
privacy; each caller decides that.

### 2. Host starts the chat from a booking

`POST /api/chat/conversations/start` accepts **either** `{listingId}` (unchanged) **or** `{bookingId}`:

- Authenticated as now (`actAsHost(..., 'messaging')`, so a company is used only for its Messaging staff).
  The suspension check stays.
- Load the booking. The caller must be `booking.host_id`, and the status must be `pending` (less than
  48 hours old, the same rule as approval), `approved` or `completed`. Otherwise 404.
- The guest's account is deactivated → 403 `account_deactivated`, as when sending.
- **No `acceptsNewConversations` check** (D2).
- `conversationFor({ hostId: booking.host_id, clientId: booking.client_id, listingId: booking.listing_id })`.

Client:
- `lib/chat/startChat.ts`: `startBookingChat(bookingId, actingHostId?)` sends `X-VaRoom-Host` when working
  as a company, and returns `/chats?c=…`.
- `HostBookingsView.tsx`: a **Message guest** icon on the card (the guest card's `bk-msg-link` + `MessageIcon`,
  next to the guest's name) on the Pending, Confirmed and Completed tabs, and a **Message guest** button in
  the detail panel. A click stops propagation so it does not open the card.
- **Who sees the button:** the host's own account, or a team member working as the company **with the
  Messaging role** (`workspaceHostWith('messaging')`). A Manager without Messaging could open the conversation
  but not read it, so the button stays hidden for them.

### 3. Approval goes through the server and posts the message

New `POST /api/bookings/:bookingId/respond {decision: 'approve'|'decline'}` in a small `server/routes/bookingRoutes.js`:

1. Authenticate with `actAsHost(req, user, 'manager')`. Refuse a suspended signed-in person; this replaces the
   trigger's `auth.uid()` check, which a service-role update skips.
2. `update bookings set status, responded_at where id = :id and host_id = acting host and status = 'pending'`
   (the RLS conditions, now in code). No row → 409 "already processed". The booking-rules and notify triggers
   still run, and `booking_rule: …` errors return as 409 with their text, so the toast reads the same.
3. **On approve:** `conversationFor(...)`, then one encrypted **text message with `listing_id`**, so the chat
   shows the listing card. It is sent as the host (`sender_id` = host, `sent_by` = the person who approved):
   > Your booking request for {dates · guests} is approved. Message me here if you have any questions.

   `{dates}` uses the same wording as the guest's card (`describeDates`), ported to the server.
   If the guest's account is deactivated, nothing is posted. Errors are logged but **do not undo the approval**.
   The message runs exactly once because only one update can move the request out of `pending`.
   - No extra "new message" notification, because the guest already gets `booking_approved`.
   - Elie is not triggered, because she replies only to guest messages. When the guest replies, she has the context.

Client: `respondToBooking` calls this route through `apiFetch`, with `X-VaRoom-Host` when acting for a company.
The rest of `respond()` (button result, card collapse, cache, toast, "mark rented" offer) stays as it is.
Decline uses the same route so there is only one way to answer a request.

Using a text message with a listing card needs **no schema change and no new chat rendering**. The
alternative, a dedicated `booking` message type with a "View booking" card, needs a migration, a new chat
bubble and inbox preview text. I'd keep that as a follow-up.

### 4. Reach Out on the guest's approved booking

`BookingDetail.tsx` (the rail and `/booking-approved` on phones): for **approved** bookings, add a contact row
with **Message host** plus the host's WhatsApp / Email / Call. It uses `fetchListingContact` (the same RPC and
the same rules as the listing page, so nothing new is exposed) and the existing `whatsappHref` / `mailtoHref` /
`telHref`. It loads once per listing when the detail opens and is cached per listing in memory for the session.
Without contact details, only Message host shows. The guest's phone is **not** shown to the host.

## Files

| File | Change |
|---|---|
| `server/lib/chatStart.js` | **new**: `conversationFor` |
| `server/routes/chatRoutes.js` | start: `bookingId` branch; uses `conversationFor` |
| `server/routes/bookingRoutes.js` | **new**: respond route + approval message |
| `server/index.js` (or the router index) | mount `bookingRoutes` |
| `client/lib/chat/startChat.ts` | `startBookingChat` |
| `client/lib/bookings/hostBookings.ts` | `respondToBooking` → server route |
| `client/components/bookings/HostBookingsView.tsx` | Message guest on card and detail |
| `client/components/bookings/BookingDetail.tsx` | Reach Out row for approved bookings |
| `client/components/bookings/bookingsStyles.ts` | contact row; host card icon placement |
| tests | `server/test/bookingChat.test.js` (new), client tests for the helpers |

**No SQL migration.**

## Risks

- **Approval leaves RLS.** The server must re-apply the conditions the database enforced: the acting host's
  team role, ownership, `status = 'pending'` and suspension. These are covered by tests: another host, a team
  member without Manager, a suspended member, an already-answered request, and an expired request.
- **D2 bypasses a privacy setting.** It applies only where a booking exists between the two, and only on
  pending (48 h), approved and completed bookings.
- **Approval message failure.** The booking is approved anyway. The host can still use Message guest.
- **Team Manager without Messaging** approves → the message is posted as the company, which is correct (D4),
  but they cannot see the chat. That is the role split, not a bug.
- **Chats inbox cache.** A host who opens Chats right after approving should see the new conversation. Check
  that the inbox refreshes and does not show a stale cached list.

## Tests

- Server: start with `bookingId` (own pending / approved / completed; declined, cancelled and expired refused;
  another host refused; "No one" guest allowed; deactivated guest refused; existing conversation reused).
  Respond (approve posts one encrypted message with `listing_id` and `sent_by`; decline posts nothing;
  a second approve gives 409; booking-rule text passes through; team Manager only).
- Client: `startBookingChat` header; `respondToBooking` request shape; button visibility by role and tab.
- Manually: host approves → guest sees the message in Chats and the Reach Out row on the booking. Host messages
  a pending guest whose setting is "No one". As a company: Manager + Messaging and Manager only. Phone and
  laptop layouts.
- `npm test` (client + server), `tsc --noEmit`, `next build`.

## Steps

One branch, `claude/booking-host-chat`, cut from `main`, in this order: 1 → 2 → 3 → 4, then tests, commit
and PR.
