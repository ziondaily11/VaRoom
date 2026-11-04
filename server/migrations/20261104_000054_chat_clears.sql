-- "Delete chat" from the inbox: when each person cleared their copy of a
-- conversation. Messages up to then are hidden for them; the other person's
-- copy is unchanged.
-- Review and apply manually; the application never runs migrations.
-- Apply before deploying the server that reads this table.
create table if not exists public.conversation_clears (
  user_id uuid not null references auth.users(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  cleared_at timestamptz not null default now(),
  primary key (user_id, conversation_id)
);

create index if not exists conversation_clears_conversation_idx
  on public.conversation_clears(conversation_id);

-- The chat API (service role) reads and writes it; clients have no direct access.
alter table public.conversation_clears enable row level security;
