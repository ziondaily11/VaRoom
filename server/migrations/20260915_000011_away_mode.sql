alter table public.profiles
  add column if not exists away_mode boolean not null default false;
