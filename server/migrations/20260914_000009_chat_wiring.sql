-- Chat wiring support. Review and apply manually; the application never runs migrations.
alter table public.messages
  add column if not exists read_at timestamptz;

create index if not exists messages_conversation_created_idx
  on public.messages(conversation_id, created_at);

alter table public.messages drop constraint if exists messages_message_type_check;
alter table public.messages add constraint messages_message_type_check
  check (message_type in ('text', 'photo', 'file', 'voice', 'listing'));

alter table public.message_attachments drop constraint if exists message_attachments_kind_check;
alter table public.message_attachments add constraint message_attachments_kind_check
  check (kind in ('photo', 'file', 'voice'));
