-- Chat Settings → "Email me about unread messages": after how many minutes
-- an unread message is emailed about (0 never; null the account's default:
-- hosts 15, clients never), and the emails already sent, so each run of
-- unread messages in a chat is emailed about once.
-- Review and apply manually; the application never runs migrations.
-- Apply before deploying the server that reads these.
alter table public.profiles
  add column if not exists email_alert_minutes integer;

alter table public.profiles drop constraint if exists profiles_email_alert_minutes_check;
alter table public.profiles add constraint profiles_email_alert_minutes_check
  check (email_alert_minutes is null or email_alert_minutes in (0, 15, 60));

create table if not exists public.chat_email_alerts (
  user_id uuid not null references auth.users(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  last_sent_at timestamptz not null default now(),
  primary key (user_id, conversation_id)
);

-- The server (service role) reads and writes it; clients have no access.
alter table public.chat_email_alerts enable row level security;
