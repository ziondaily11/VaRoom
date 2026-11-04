-- Chat Settings → Theme: the colours of message bubbles on this person's
-- screen. Charcoal / Cool Grey is the default for everyone.
-- Review and apply manually; the application never runs migrations.
alter table public.profiles
  add column if not exists chat_theme text not null default 'charcoal';

alter table public.profiles drop constraint if exists profiles_chat_theme_check;
alter table public.profiles add constraint profiles_chat_theme_check
  check (chat_theme in ('charcoal', 'teal', 'indigo', 'beige', 'coral'));
