-- Chat Settings saved on the account instead of one browser.
-- Review and apply manually; the application never runs migrations.
-- Apply before deploying the server that reads these columns.

-- The host's away message (auto-reply sends it first), and the person's
-- notification and typing preferences.
alter table public.profiles
  add column if not exists away_message text,
  add column if not exists message_notifications boolean not null default true,
  add column if not exists message_previews boolean not null default true,
  add column if not exists typing_indicators boolean not null default true;

alter table public.profiles drop constraint if exists profiles_away_message_length;
alter table public.profiles add constraint profiles_away_message_length
  check (away_message is null or char_length(away_message) <= 500);

-- Conversations a person has archived (for them only). The chat API (service
-- role) reads and writes it; clients have no direct access.
create table if not exists public.conversation_archives (
  user_id uuid not null references auth.users(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  archived_at timestamptz not null default now(),
  primary key (user_id, conversation_id)
);

create index if not exists conversation_archives_conversation_idx
  on public.conversation_archives(conversation_id);

alter table public.conversation_archives enable row level security;
