alter table public.support_tickets
  add column if not exists message_id text;

alter table public.support_ticket_replies
  add column if not exists resend_email_id text,
  add column if not exists delivery_status text not null default 'sent',
  add column if not exists sender text,
  add column if not exists recipient text,
  add column if not exists subject text,
  add column if not exists message_id text,
  add column if not exists in_reply_to text,
  add column if not exists references_header text,
  add column if not exists idempotency_key text,
  add column if not exists provider_error text;

alter table public.support_ticket_replies
  drop constraint if exists support_ticket_replies_delivery_status_check;

alter table public.support_ticket_replies
  add constraint support_ticket_replies_delivery_status_check
  check (delivery_status in ('pending', 'sent', 'failed'));

create unique index if not exists support_ticket_replies_idempotency_key_idx
  on public.support_ticket_replies(idempotency_key)
  where idempotency_key is not null;
