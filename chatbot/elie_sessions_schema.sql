-- Elie conversation history: one row per distinct chat, one row per
-- message. Lets client-home store multiple separate conversations
-- instead of one endless in-memory thread.

create table if not exists elie_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists elie_messages (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references elie_sessions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('user', 'elie')),
  body text not null,
  created_at timestamptz not null default now()
);

create index if not exists elie_sessions_user_idx on elie_sessions(user_id, updated_at desc);
create index if not exists elie_messages_session_idx on elie_messages(session_id, created_at asc);

alter table elie_sessions enable row level security;
alter table elie_messages enable row level security;

create policy "Users manage their own elie sessions"
  on elie_sessions for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users manage their own elie messages"
  on elie_messages for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
