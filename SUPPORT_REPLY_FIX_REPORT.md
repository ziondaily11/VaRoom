# Admin support reply fix

## Problem

Replies submitted from the admin Support page returned HTTP 502 even though the reply email could already have been sent.

## Root cause

The deployed database did not have the unique `notifications(event_key)` index required by the notification upsert used after a reply. PostgreSQL therefore returned `there is no unique or exclusion constraint matching the ON CONFLICT specification`.

That notification write was inside the same `try` block as email delivery. A notification failure was treated as an email failure, causing the endpoint to return 502 and mark an already-sent reply as failed.

The admin reply route also used a hard-coded sender, which bypassed the existing `RESEND_FROM_EMAIL` deployment setting. If the configured Resend account verified a different sender, Resend could reject the reply because the `from` address was not authorised for that account.

The dashboard also called `crypto.randomUUID()` directly when creating an idempotency key. Browsers or non-secure deployments without that API could fail before the reply request was sent.

## Fix

- The reply route now uses `RESEND_FROM_EMAIL` when configured, with the previous VaRoom sender retained as a fallback.
- The dashboard uses a safe idempotency-key helper that prefers `crypto.randomUUID()` and falls back to a unique timestamp/random value.
- The notification index migration was added for databases where the notifications migration was incomplete.
- Notification delivery is now isolated from email delivery: a notification failure is logged but cannot turn a successful email reply into HTTP 502 or mark it failed.
- Existing ticket storage, Resend delivery, threading headers, idempotency handling, and admin authentication were preserved.

## Validation

- Server JavaScript syntax check passed.
- The admin reply call path was reviewed end to end, including the browser idempotency-key creation and server delivery route.
- The working tree was checked with `git diff --check`.
