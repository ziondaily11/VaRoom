-- Reviews of VaRoom itself (not of listings: those are public.reviews).
-- Signed-in people rate VaRoom from Help & Support, one review per account,
-- which they can change. Every new or changed review waits for an admin
-- (admin dashboard → VaRoom reviews) before it can be shown; the sign-in
-- panel shows the most recently approved one.
--
-- Writes come straight from the app under row-level security: a person
-- reads, adds and edits only their own review, and can never approve it.
-- The name and role shown with a review are taken from the profile by the
-- database, not from what the app sends. Anyone (signed out too) can read
-- only the one featured review, through varoom_featured_review(), which
-- returns no account ids.
-- Safe to re-run.

create table if not exists public.varoom_reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  rating smallint not null check (rating between 1 and 5),
  comment text not null default '' check (char_length(comment) <= 600),
  -- Shown with the review, e.g. "Susan W." and 'host'; filled from the profile.
  author_name text not null default '',
  author_role text not null default 'client',
  status text not null default 'pending' check (status in ('pending', 'approved', 'hidden')),
  reviewed_by uuid references public.admins(id) on delete set null,
  reviewed_at timestamptz,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists varoom_reviews_status_idx on public.varoom_reviews (status, approved_at desc);

-- The author's name and role from their profile; a person's own change of
-- rating or words sends the review back for approval. Admin changes (the
-- service role, which approves and hides) pass through untouched.
create or replace function public.varoom_reviews_prepare()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
  v_role text;
  v_parts text[];
begin
  new.updated_at := now();
  if auth.uid() is null then
    return new; -- the admin server (service role)
  end if;

  new.user_id := auth.uid();
  select coalesce(nullif(trim(p.full_name), ''), nullif(trim(p.username), ''), 'VaRoom member'),
         case when p.role = 'host' then 'host' else 'client' end
    into v_name, v_role
    from public.profiles p where p.id = auth.uid();
  -- "Susan Wanjiru" is shown as "Susan W.".
  v_parts := regexp_split_to_array(coalesce(v_name, 'VaRoom member'), '\s+');
  v_name := case
    when v_name is null then 'VaRoom member'
    when array_length(v_parts, 1) > 1 then v_parts[1] || ' ' || upper(left(v_parts[array_length(v_parts, 1)], 1)) || '.'
    else v_name
  end;
  new.author_name := v_name;
  new.author_role := coalesce(v_role, 'client');
  new.comment := trim(coalesce(new.comment, ''));

  if tg_op = 'INSERT' then
    new.status := 'pending';
    new.reviewed_by := null;
    new.reviewed_at := null;
    new.approved_at := null;
    new.created_at := now();
  else
    new.id := old.id;
    new.created_at := old.created_at;
    new.status := 'pending';
    new.reviewed_by := null;
    new.reviewed_at := null;
    new.approved_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists varoom_reviews_prepare on public.varoom_reviews;
create trigger varoom_reviews_prepare
  before insert or update on public.varoom_reviews
  for each row execute function public.varoom_reviews_prepare();

alter table public.varoom_reviews enable row level security;

drop policy if exists varoom_reviews_own_select on public.varoom_reviews;
create policy varoom_reviews_own_select on public.varoom_reviews
  for select to authenticated using (user_id = auth.uid());

drop policy if exists varoom_reviews_own_insert on public.varoom_reviews;
create policy varoom_reviews_own_insert on public.varoom_reviews
  for insert to authenticated with check (user_id = auth.uid());

drop policy if exists varoom_reviews_own_update on public.varoom_reviews;
create policy varoom_reviews_own_update on public.varoom_reviews
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists varoom_reviews_own_delete on public.varoom_reviews;
create policy varoom_reviews_own_delete on public.varoom_reviews
  for delete to authenticated using (user_id = auth.uid());

revoke all on public.varoom_reviews from anon;
grant select, insert, update, delete on public.varoom_reviews to authenticated;

-- The review the sign-in panel shows: the most recently approved one with
-- words. Only what is shown leaves the database.
create or replace function public.varoom_featured_review()
returns table (rating smallint, comment text, author_name text, author_role text)
language sql
stable
security definer
set search_path = public
as $$
  select r.rating, r.comment, r.author_name, r.author_role
  from public.varoom_reviews r
  where r.status = 'approved' and r.comment <> ''
  order by r.approved_at desc nulls last
  limit 1;
$$;

revoke all on function public.varoom_featured_review() from public;
grant execute on function public.varoom_featured_review() to anon, authenticated, service_role;

-- Rollback:
--   drop function if exists public.varoom_featured_review();
--   drop table if exists public.varoom_reviews;
--   drop function if exists public.varoom_reviews_prepare();
