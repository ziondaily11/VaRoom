-- Chat Settings → Quick replies: answers a person saves and drops into the
-- composer. Private to their owner (they may hold payment numbers or gate
-- codes), so unlike profile settings they live in their own table that only
-- the owner can read or change. At most 20 per person.
-- Review and apply manually; the application never runs migrations.
create table if not exists public.quick_replies (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 60),
  body text not null check (char_length(btrim(body)) between 1 and 1000),
  created_at timestamptz not null default now()
);

create index if not exists quick_replies_user_idx on public.quick_replies(user_id, created_at);

alter table public.quick_replies enable row level security;

drop policy if exists quick_replies_own on public.quick_replies;
create policy quick_replies_own on public.quick_replies
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create or replace function public.quick_replies_limit() returns trigger
language plpgsql set search_path = public as $$
begin
  if (select count(*) from public.quick_replies where user_id = new.user_id) >= 20 then
    raise exception 'You can keep at most 20 quick replies';
  end if;
  return new;
end;
$$;

drop trigger if exists quick_replies_limit on public.quick_replies;
create trigger quick_replies_limit before insert on public.quick_replies
  for each row execute function public.quick_replies_limit();
