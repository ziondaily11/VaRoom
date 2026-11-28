-- Support by email (server/lib/supportInbox.js): mail sent to any
-- @varoom.co.ke address reaches Resend, whose webhook turns it into a ticket
-- or a reply on an existing one. Tickets and replies form one conversation:
-- inbound messages (from the person), admin replies, and the automatic
-- acknowledgement. Check first (must work): select count(*) from public.support_ticket_replies;

alter table public.support_tickets
  add column if not exists source text not null default 'web',
  add column if not exists category text not null default 'other',
  add column if not exists inbound_email_id text;
alter table public.support_tickets drop constraint if exists support_tickets_source_check;
alter table public.support_tickets add constraint support_tickets_source_check check (source in ('web', 'email'));
alter table public.support_tickets drop constraint if exists support_tickets_category_check;
alter table public.support_tickets add constraint support_tickets_category_check
  check (category in ('appeal', 'sign_in', 'billing', 'booking', 'report', 'other'));
create unique index if not exists support_tickets_inbound_email_idx
  on public.support_tickets (inbound_email_id) where inbound_email_id is not null;
create index if not exists support_tickets_message_id_idx
  on public.support_tickets (message_id) where message_id is not null;
create index if not exists support_tickets_email_created_idx
  on public.support_tickets (email, created_at desc);

-- A reply is outbound (an admin, or automatic with no admin) or inbound (the
-- person answering by email).
alter table public.support_ticket_replies alter column admin_id drop not null;
alter table public.support_ticket_replies
  add column if not exists direction text not null default 'outbound',
  add column if not exists automatic boolean not null default false,
  add column if not exists inbound_email_id text;
alter table public.support_ticket_replies drop constraint if exists support_ticket_replies_direction_check;
alter table public.support_ticket_replies add constraint support_ticket_replies_direction_check
  check (direction in ('outbound', 'inbound'));
alter table public.support_ticket_replies drop constraint if exists support_ticket_replies_delivery_status_check;
alter table public.support_ticket_replies add constraint support_ticket_replies_delivery_status_check
  check (delivery_status in ('pending', 'sent', 'failed', 'received'));
create unique index if not exists support_ticket_replies_inbound_email_idx
  on public.support_ticket_replies (inbound_email_id) where inbound_email_id is not null;
create index if not exists support_ticket_replies_message_id_idx
  on public.support_ticket_replies (message_id) where message_id is not null;

-- Saved replies admins insert into a reply ({{name}} and {{ticket}} are filled in).
create table if not exists public.support_reply_templates (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 120),
  body text not null check (char_length(body) between 1 and 5000),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.admins(id) on delete set null
);
alter table public.support_reply_templates enable row level security;

insert into public.support_reply_templates (title, body)
select title, body from (values
  ('Appeal received', E'Hi {{name}},\n\nThank you for your appeal (ticket {{ticket}}). A member of our team is reviewing your account and will get back to you with a decision.\n\nVaRoom Support'),
  ('Appeal accepted', E'Hi {{name}},\n\nWe have reviewed your appeal (ticket {{ticket}}) and restored your account. Thank you for your patience.\n\nVaRoom Support'),
  ('Appeal declined', E'Hi {{name}},\n\nWe have reviewed your appeal (ticket {{ticket}}). After looking at your account carefully, the restriction stays in place.\n\nVaRoom Support'),
  ('Sign-in help', E'Hi {{name}},\n\nTo sign in, open varoom.co.ke and choose Sign in. If your code does not arrive, check your spam folder and wait a minute before asking for a new one. If you signed up with Google, use Continue with Google.\n\nVaRoom Support'),
  ('Need more details', E'Hi {{name}},\n\nThanks for getting in touch (ticket {{ticket}}). Could you tell us a little more, such as the listing or booking involved and what happened, so we can help?\n\nVaRoom Support')
) as seed(title, body)
where not exists (select 1 from public.support_reply_templates);

-- The account an email address belongs to (server only), to link an
-- authenticated sender's email to their account.
create or replace function public.varoom_user_id_by_email(p_email text)
returns uuid language sql stable security definer set search_path = public, auth as $$
  select id from auth.users where lower(email) = lower(trim(p_email)) limit 1;
$$;
revoke all on function public.varoom_user_id_by_email(text) from public, anon, authenticated;
