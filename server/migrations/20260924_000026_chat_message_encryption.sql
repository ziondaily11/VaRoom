-- Store chat message content encrypted by the application with AES-256-GCM.
alter table public.messages
  add column if not exists ciphertext text,
  add column if not exists iv text,
  add column if not exists key_version integer;

-- This installation contains test-only chat data. Remove message rows and
-- their database attachment metadata before removing the legacy body column.
-- R2 objects are external to PostgreSQL and must be removed separately.
delete from public.messages;
delete from public.message_attachments;

alter table public.messages drop constraint if exists messages_key_version_check;
alter table public.messages
  add constraint messages_key_version_check
  check (key_version is null or key_version > 0);

-- Message content is now returned by the API only after backend decryption.
-- Refuse to remove historical plaintext silently; those rows require a
-- controlled application-level backfill before this migration is applied.
do $$
begin
  if exists (select 1 from public.messages where body is not null) then
    raise exception 'messages.body contains plaintext rows; backfill them before enabling encryption';
  end if;
end;
$$;
alter table public.messages drop column if exists body;

alter table public.messages enable row level security;
drop policy if exists messages_participant_select on public.messages;
create policy messages_participant_select
  on public.messages for select to authenticated
  using (exists (
    select 1 from public.conversations c
    where c.id = conversation_id
      and (c.host_id = auth.uid() or c.client_id = auth.uid())
  ));
