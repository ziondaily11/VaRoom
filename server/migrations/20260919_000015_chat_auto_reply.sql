alter table public.messages
  add column if not exists is_auto_reply boolean not null default false;
