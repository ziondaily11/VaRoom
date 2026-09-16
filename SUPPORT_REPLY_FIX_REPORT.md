# Admin support reply fix

## Problem

Replies submitted from the admin Support page could be rejected by the email provider even though the ticket was present and the reply action was available.

## Root cause

The admin reply route always used the hard-coded sender `support@varoom.co.ke`. This bypassed the existing `RESEND_FROM_EMAIL` deployment setting. If the configured Resend account verified a different sender, Resend rejected the reply because the `from` address was not authorised for that account.

The dashboard also called `crypto.randomUUID()` directly when creating an idempotency key. Browsers or non-secure deployments without that API could fail before the reply request was sent.

## Fix

- The reply route now uses `RESEND_FROM_EMAIL` when configured, with the previous VaRoom sender retained as a fallback.
- The dashboard uses a safe idempotency-key helper that prefers `crypto.randomUUID()` and falls back to a unique timestamp/random value.
- Existing ticket storage, Resend delivery, threading headers, idempotency handling, and admin authentication were preserved.

## Validation

- Server JavaScript syntax check passed.
- The admin reply call path was reviewed end to end, including the browser idempotency-key creation and server delivery route.
- The working tree was checked with `git diff --check`.
