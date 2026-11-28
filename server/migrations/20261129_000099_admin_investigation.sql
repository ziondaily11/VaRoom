-- Admin investigation tools (server/lib/adminInvestigation.js): private notes
-- on an account, and account search by email, name or username.
-- Check first (must work): select count(*) from public.admins;

-- Notes admins keep on an account; never shown to the person. Append-only.
create table if not exists public.admin_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  admin_id uuid references public.admins(id) on delete set null,
  body text not null check (char_length(body) between 1 and 4000),
  created_at timestamptz not null default now()
);
create index if not exists admin_notes_user_idx on public.admin_notes (user_id, created_at desc);
alter table public.admin_notes enable row level security;

-- Accounts whose email, name or username contains the text (server only).
create or replace function public.admin_search_accounts(p_query text)
returns table (id uuid, email text, full_name text, username text, created_at timestamptz)
language sql stable security definer set search_path = public, auth as $$
  with q as (select '%' || replace(replace(replace(trim(p_query), '\', '\\'), '%', '\%'), '_', '\_') || '%' as pattern)
  select u.id, u.email::text, p.full_name, p.username, u.created_at
  from auth.users u
  left join public.profiles p on p.id = u.id, q
  where u.email ilike q.pattern or p.full_name ilike q.pattern or p.username ilike q.pattern
  order by u.created_at desc
  limit 20;
$$;
revoke all on function public.admin_search_accounts(text) from public, anon, authenticated;
