-- Production still has the legacy notifications.user_id NOT NULL column.
-- Keep it synchronized with the canonical recipient_user_id field until all
-- environments have been migrated away from the legacy schema.
alter table public.notifications
  add column if not exists user_id uuid references public.profiles(id) on delete cascade;

update public.notifications
set user_id = recipient_user_id
where user_id is null
  and recipient_user_id is not null;

alter table public.notifications
  alter column user_id set not null;
