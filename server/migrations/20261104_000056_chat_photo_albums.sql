-- Photos sent together (up to 4) share an album id; Chats shows them as one
-- collage. Each photo stays its own message (replies, deletion, ticks).
-- Review and apply manually; the application never runs migrations.
-- Apply before deploying the server that reads this column.
alter table public.messages
  add column if not exists album_id uuid;

create index if not exists messages_album_idx
  on public.messages(conversation_id, album_id)
  where album_id is not null;
