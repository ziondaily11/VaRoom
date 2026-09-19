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

alter table public.notifications
  add column if not exists recipient_user_id uuid references public.profiles(id) on delete cascade,
  add column if not exists actor_user_id uuid references public.profiles(id) on delete set null,
  add column if not exists title text,
  add column if not exists related_entity_type text,
  add column if not exists related_entity_id uuid,
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists event_key text;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'notifications'
      and column_name = 'user_id'
  ) then
    update public.notifications
    set recipient_user_id = user_id
    where recipient_user_id is null;
  end if;
end $$;

update public.notifications
set title = case type
  when 'booking_approved' then 'Booking confirmed'
  when 'booking_declined' then 'Booking declined'
  when 'booking_cancelled' then 'Booking cancelled'
  when 'booking_request' then 'New booking request'
  else coalesce(nullif(message, ''), 'Notification')
end
where title is null;

alter table public.notifications
  alter column recipient_user_id set not null,
  alter column title set not null;

create unique index if not exists notifications_event_key_idx
  on public.notifications(event_key);

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
