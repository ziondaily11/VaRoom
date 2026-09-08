-- Chat attachments keep file binaries in Cloudflare R2 and only metadata in Supabase.
create table if not exists public.message_attachments (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  uploader_id uuid not null references public.profiles(id),
  storage_provider text not null default 'r2',
  storage_bucket text not null,
  storage_key text not null unique,
  original_filename text not null,
  mime_type text not null,
  file_size_bytes bigint not null,
  kind text not null check (kind in ('photo', 'file')),
  status text not null default 'pending' check (status in ('pending', 'ready', 'failed', 'deleted')),
  created_at timestamptz not null default now()
);
create index if not exists message_attachments_conversation_idx
  on public.message_attachments(conversation_id, created_at);

alter table public.message_attachments enable row level security;
drop policy if exists message_attachments_participant_select on public.message_attachments;
create policy message_attachments_participant_select
  on public.message_attachments for select to authenticated
  using (exists (
    select 1 from public.conversations c
    where c.id = conversation_id
      and (c.host_id = auth.uid() or c.client_id = auth.uid())
  ));

alter table public.messages add column if not exists message_type text not null default 'text';
alter table public.messages add column if not exists attachment_id uuid references public.message_attachments(id);
alter table public.messages add column if not exists listing_id uuid references public.listings(id);
alter table public.messages drop constraint if exists messages_message_type_check;
alter table public.messages add constraint messages_message_type_check
  check (message_type in ('text', 'photo', 'file', 'listing'));
