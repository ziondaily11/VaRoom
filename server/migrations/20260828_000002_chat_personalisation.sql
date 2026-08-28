-- Client chat personalisation preferences.
-- These values belong to the account, but only affect that account's chat view.

alter table profiles
  add column if not exists chat_theme_preference text not null default 'varoom-red',
  add column if not exists chat_background_preference text not null default 'clean';

alter table profiles
  drop constraint if exists profiles_chat_theme_preference_check;
alter table profiles
  add constraint profiles_chat_theme_preference_check
  check (chat_theme_preference in ('varoom-red', 'ocean', 'emerald', 'violet', 'dark'));

alter table profiles
  drop constraint if exists profiles_chat_background_preference_check;
alter table profiles
  add constraint profiles_chat_background_preference_check
  check (chat_background_preference in ('clean', 'soft', 'dark'));
