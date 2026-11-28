# Admin upgrade plan

Goal: the admin page acts on problems automatically, answers people without
waiting for an admin, and gives admins what they need to investigate.

## Owner's decisions (2026-11-28)

- Reports from 3 different people within 7 days suspend an account **until an
  admin reviews it**. Every rule starts in **shadow mode** (records what it
  would do) and is switched to enforce from the Rules page.
- Admins may open a conversation **only after it is reported**; each opening
  is logged. (Phase 3; the Privacy Policy gets a line saying so.)
- Support email is received on a subdomain or by forwarding, so the current
  mailbox stays where it is. (Phase 2)
- Replies are templates only for now; Elie-drafted replies may come later.

## Phases (one branch and PR each)

1. **Enforcement foundation** — done in `claude/admin-enforcement`
   (migration `20261128_000097_admin_enforcement.sql`).
   - Penalty ladder: warning → 7-day suspension (lifts itself) → suspended
     until reviewed → disabled (sign-in blocked; admins only).
   - Every action, by an admin or a rule, goes through
     `server/lib/enforcement.js`: `account_controls`, a row in
     `account_enforcement_actions`, `admin_activity` ("System" for rules), an
     in-app notice and an email with the reason and how to appeal.
   - Rules (`moderation_rules`, editable on the Rules page; what they saw and
     did in `moderation_rule_hits`):
     | Rule | Default | Action |
     |---|---|---|
     | `account_reports` | 3 different reporters / 7 days | suspend until reviewed |
     | `listing_reports` | 3 different reporters / 7 days | hide the listing, tell the host |
     | `scam_messages` | 3 flagged messages / 7 days | next step on the ladder |
     | `conversation_burst` | 15 new conversations / 1 hour | next step on the ladder |
     | `expired_requests` | 3 expired booking requests / 30 days | next step on the ladder |
     | `linked_accounts` | — | a restriction reaches linked accounts |
   - Support tickets show the sender's real account status (appeals stand out).
2. **Support email automation** — Resend inbound webhook → tickets (replies
   join their ticket by Message-ID), instant acknowledgement with the ticket
   number, suspension appeals detected and linked to the account, reply
   templates, auto-close after inactivity.
3. **Investigation tools** — one page per account (linked accounts, teams,
   listings, bookings, reports filed and received, tickets, payments,
   V-Coins, admin history, private notes), report detail with one-step
   actions, the reported-conversation view, global search.
4. **Money** — real VaRoom revenue (subscriptions in `billing_payments`, V-Coin
   packs), failed payments, refunds; comp or extend a plan, grant V-Coins.
5. **Coverage and hardening** — guest reviews and listing documents queues,
   paging past 1,000 users (`listUsers` cap), admin two-step verification,
   removing admins and changing roles, a health panel (failed emails,
   webhooks, background jobs, Elie, Property News).
