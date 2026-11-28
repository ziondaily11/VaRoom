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
2. **Support email automation** — done in `claude/admin-support-email`
   (migration `20261129_000098_support_inbound_email.sql`). varoom.co.ke
   has no mailbox: its MX already points at Resend's receiving servers, so
   mail to any @varoom.co.ke address reaches Resend, whose `email.received`
   webhook (`/api/support/inbound-email`, secret `RESEND_WEBHOOK_SECRET`)
   lands it in Support (`server/lib/supportInbox.js`).
   - A reply joins its ticket by its reply headers, or by `[#REF]` in the
     subject from the ticket's own address, and reopens it.
   - Every new ticket (email or Support page) is acknowledged at once (at
     most one per address per hour). A restricted account's message is
     filed as a high-priority appeal and the acknowledgement says where the
     account stands, but only when the email passes DMARC (or SPF and
     DKIM), so a forged sender learns nothing.
   - Auto-replies, bounces and VaRoom's own mail never open tickets; at most
     10 new tickets per address a day.
   - The Support section shows each ticket's conversation and saved replies
     (`support_reply_templates`); tickets answered with no word back for 7
     days close, and an email reopens them.
3. **Investigation tools** — done in `claude/admin-investigation`
   (migration `20261129_000099_admin_investigation.sql`,
   `server/lib/adminInvestigation.js`).
   - The account page (Users → View, or any name): profile, linked accounts,
     team, listings, bookings as host and guest, reports about and by the
     person, tickets (by account and email), plans and payments, V-Coins,
     warnings and suspensions, private admin notes (`admin_notes`) and the
     admin trail, with the account actions.
   - The header search: accounts (`admin_search_accounts`), listings,
     tickets (also by #REF) and payments (by reference).
   - Reports show names, the host, details, and act in one step: hide or
     take down the listing, warn or suspend the host or the reported
     person (account actions need a super admin).
   - A reported conversation can be read from its report only, by support
     and super admins; every reading is recorded in Admin activity. The
     Privacy Policy says so, and that messages are checked automatically
     for scams.
4. **Money** — real VaRoom revenue (subscriptions in `billing_payments`, V-Coin
   packs), failed payments, refunds; comp or extend a plan, grant V-Coins.
5. **Coverage and hardening** — guest reviews and listing documents queues,
   paging past 1,000 users (`listUsers` cap), admin two-step verification,
   removing admins and changing roles, a health panel (failed emails,
   webhooks, background jobs, Elie, Property News).
