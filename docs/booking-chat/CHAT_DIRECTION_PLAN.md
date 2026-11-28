# One chat per pair per direction

Status: **approved 2026-11-28; implemented on `claude/chat-direction`** · follows PR #771 ([HOST_GUEST_CHAT_PLAN.md](HOST_GUEST_CHAT_PLAN.md))

## Problem

Anyone can be a guest on VaRoom, including a host, so two hosts can each be the other's guest. Each conversation
stores one person as `host_id` and the other as `client_id`, set by whoever started it, but the server reuses
*any* conversation between the two (`server/lib/chatStart.js` → `conversationsBetween`, which matches either
direction). When the roles are reversed:

- **Elie's away replies go to the wrong side.** She answers when the stored client writes, and replies as the
  stored host (`chatRoutes.js`, `conversation.client_id === user.id` → `autoReply.handleGuestMessage`).
- **Host tools fail.** Elie drafts and `@reply` require `conversation.host_id === user.id`, so the real host of
  the booking cannot use them in that chat.
- **History is mislabelled.** Elie's history labels each speaker as host or guest from the stored roles.

Example: Amina once asked about Brian's listing (Brian is stored as host, Amina as client). Brian later books
Amina's listing, and her approval message, his replies and Elie all land in that one chat with the roles reversed.

This applies to "Message host" (since before #771), "Message guest" and the approval message (#771).

## What exists today

| Area | Today | Where |
|---|---|---|
| Find or create | Reuses any conversation between the two (either direction), else creates one | `server/lib/chatStart.js` |
| Inbox | Lists **one row per person**: the most recently active conversation with them; the others are hidden | `chatRoutes.js` `GET /chat/conversations` (`latestByParticipant`) |
| Thread | Loads one conversation's messages only | `GET /chat/conversations/:id/messages` |
| Delete chat | Clears **every** conversation with that person | `server/lib/chatClears.js` `clearChat` |
| Privacy "relationship" | Any conversation or booking between the two, either direction | `server/lib/privacySettings.js` `haveRelationship` |
| Unique key | `(listing_id, client_id)` | `conversations` |

So a second conversation with the same person would currently be **hidden** in the inbox. The inbox has to
change along with the reuse rule.

## The design

### 1. Reuse only a conversation in the same direction

`existingConversation(admin, hostId, clientId)` matches `host_id = hostId and client_id = clientId` (not either
way round). All three callers already pass the right roles: listing start (host = listing owner, client = the
person asking), booking start and approval (host = booking host, client = booking guest). Otherwise a new
conversation is created as now, and the `(listing_id, client_id)` key cannot clash, because such a row would
already have the same direction and would have been found.

### 2. Inbox: one row per person **per direction**

The dedupe key becomes the person plus my role in the conversation. Someone you have only hosted, or only stayed
with, still has one row, exactly as today. Several older conversations in the same direction (from per-listing
chats) still merge into one row as today. Only a pair with both directions gets **two rows**.

Each conversation in the response gains `role: 'host' | 'client'` (my side, computed on the server, so it is
correct when working as a company).

### 3. Telling the two rows apart

When the same person appears twice, both inbox rows and the open thread's header show a small tag after the name:
**"Your guest"** on the conversation where you are the host, and **"Your host"** where you are the guest. People with
only one row show no tag, so the inbox looks as it does today for almost everyone. (`pages/chats.tsx` inbox row
and header; a helper in `lib/chat/inbox.ts`.)

### 4. Delete chat clears one direction

`clearChat` clears the person's conversations **in that direction** only, so deleting the "Your guest" row does not
also empty the "Your host" one. Same-direction older conversations still clear together, as today.

### 5. No change

- Privacy `haveRelationship`: a relationship in either direction still counts.
- Elie and the auto-reply code: nothing changes. New conversations have the right roles, so her existing rules
  apply correctly.
- Unread count and notifications work per conversation already.

## Existing data

Conversations that already mix both directions cannot be split reliably, so they are left as they are. From now
on, a start in the other direction creates its own conversation. Amina and Brian's old chat stays one row; Brian's
booking and Amina's approval open a new, correctly-stored one.

## Files

| File | Change |
|---|---|
| `server/lib/chatStart.js` | same-direction lookup |
| `server/lib/chatClears.js` | `clearChat` in the same direction |
| `server/routes/chatRoutes.js` | inbox dedupe by person + role; `role` on each conversation |
| `client/lib/chatCache.ts` | `role` on `ChatConversation` |
| `client/lib/chat/inbox.ts` | `directionTag(conversations, c)` → "Your guest" / "Your host" / null |
| `client/pages/chats.tsx` (+ its styles) | the tag in the inbox row and thread header |
| tests | server: reuse, inbox, clear; client: tag helper and render |

**No SQL migration.**

## Risks

- **Two rows for the same person** can surprise people at first. The tag explains the difference, and it only shows
  for pairs who have hosted each other.
- **Existing mixed chats keep the old problem** until those two people start a chat in the other direction.
- **Chats cache.** `role` is new. Cached inbox entries from before the change have no `role`, so no tag shows
  until the next refresh. No errors.
- `pages/chats.tsx` is large and shared. The change is limited to the row and header name.

## Tests

- Server: a pair with a conversation in one direction → a start in the other direction creates a new one, and the
  same direction reuses. The inbox lists both directions as two rows, with older same-direction conversations still
  merged. Delete chat clears only that direction. Approval in the reversed case posts to the new conversation.
  Elie answers in the new conversation as the correct host.
- Client: tag helper (one row → none; two rows → "Your guest" / "Your host"); inbox row render.
- Manually: two test hosts book each other → two rows with tags, and each thread has the right Elie and host tools.
  Do not use the real-group test accounts for group writes.
- `npm test` (client + server), `tsc --noEmit`, `next build`.

## Branch

`claude/chat-direction` from `main`. One PR. It touches Chats and the chat server, not `pages/bookings.tsx`.
