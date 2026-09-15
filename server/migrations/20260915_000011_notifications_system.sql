create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_user_id uuid not null references public.profiles(id) on delete cascade,
  actor_user_id uuid references public.profiles(id) on delete set null,
  type text not null,
  title text not null,
  message text not null,
  related_entity_type text,
  related_entity_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  read boolean not null default false,
  is_read boolean generated always as (read) stored,
  booking_id uuid,
  event_key text,
  created_at timestamptz not null default now()
);

create unique index if not exists notifications_event_key_idx
  on public.notifications(event_key)
  where event_key is not null;

create index if not exists notifications_recipient_created_idx
  on public.notifications(recipient_user_id, created_at desc);

create index if not exists notifications_recipient_unread_idx
  on public.notifications(recipient_user_id, read, created_at desc);

alter table public.notifications enable row level security;

create policy if not exists notifications_select_own
  on public.notifications for select
  using (recipient_user_id = auth.uid());

create policy if not exists notifications_update_own
  on public.notifications for update
  using (recipient_user_id = auth.uid())
  with check (recipient_user_id = auth.uid());

create policy if not exists notifications_insert_own_or_actor
  on public.notifications for insert
  with check (
    recipient_user_id = auth.uid()
    or actor_user_id = auth.uid()
  );
