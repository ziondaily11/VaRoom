alter table public.messages
  add column if not exists reply_to_message_id uuid references public.messages(id) on delete set null,
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid references public.profiles(id) on delete set null,
  add column if not exists pinned_at timestamptz,
  add column if not exists pinned_by uuid references public.profiles(id) on delete set null;

create table if not exists public.message_user_deletions (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  message_id uuid not null references public.messages(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  deleted_at timestamptz not null default now(),
  primary key (message_id, user_id)
);

create index if not exists message_user_deletions_user_conversation_idx
  on public.message_user_deletions(user_id, conversation_id);

alter table public.message_user_deletions enable row level security;
drop policy if exists message_user_deletions_select_own on public.message_user_deletions;
create policy message_user_deletions_select_own
  on public.message_user_deletions for select to authenticated
  using (user_id = auth.uid());

create or replace function public.toggle_chat_message_pin(
  p_conversation_id uuid,
  p_message_id uuid,
  p_user_id uuid
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  current_pin_id uuid;
begin
  perform 1
    from public.conversations
    where id = p_conversation_id
    for update;

  if not found then
    raise exception 'Conversation not found';
  end if;

  perform 1
    from public.messages
    where id = p_message_id
      and conversation_id = p_conversation_id
      and deleted_at is null;

  if not found then
    raise exception 'Message not found';
  end if;

  select id into current_pin_id
    from public.messages
    where conversation_id = p_conversation_id
      and pinned_at is not null
    limit 1;

  update public.messages
    set pinned_at = null, pinned_by = null
    where conversation_id = p_conversation_id
      and pinned_at is not null;

  if current_pin_id is distinct from p_message_id then
    update public.messages
      set pinned_at = now(), pinned_by = p_user_id
      where id = p_message_id;
  end if;
end;
$$;

revoke all on function public.toggle_chat_message_pin(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.toggle_chat_message_pin(uuid, uuid, uuid) to service_role;

do $$
begin
  if not exists (
    select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'message_user_deletions'
  ) then
    alter publication supabase_realtime add table public.message_user_deletions;
  end if;
end;
$$;
