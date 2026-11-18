-- The landing page now shows several approved reviews in turn (the sign-in
-- panel and the last page), not only the newest. varoom_featured_reviews()
-- returns up to p_limit approved reviews with words, newest first, with the
-- same columns and the same privacy rule as varoom_featured_review()
-- (20261118_000072): a private profile or a deactivated account returns no
-- username and no picture. Still no account ids.
--
-- varoom_featured_review() stays, so the site deployed before this change
-- keeps working; the new site falls back to it until this runs.
-- Safe to re-run.

create or replace function public.varoom_featured_reviews(p_limit integer default 10)
returns table (
  rating smallint,
  comment text,
  author_name text,
  author_role text,
  author_username text,
  author_avatar_url text
)
language sql
stable
security definer
set search_path = public
as $$
  select r.rating, r.comment, r.author_name, r.author_role,
         case when p.profile_visibility = 'private' or p.deactivated_at is not null then null
              else nullif(trim(p.username), '') end,
         case when p.profile_visibility = 'private' or p.deactivated_at is not null then null
              else nullif(trim(p.avatar_url), '') end
  from public.varoom_reviews r
  left join public.profiles p on p.id = r.user_id
  where r.status = 'approved' and r.comment <> ''
  order by r.approved_at desc nulls last
  -- At least 1, at most 20, whatever is asked.
  limit least(greatest(coalesce(p_limit, 10), 1), 20);
$$;

revoke all on function public.varoom_featured_reviews(integer) from public;
grant execute on function public.varoom_featured_reviews(integer) to anon, authenticated, service_role;

-- Rollback:
--   drop function if exists public.varoom_featured_reviews(integer);
