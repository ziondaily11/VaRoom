-- The sign-in panel shows a review's author as their profile picture and
-- @username instead of their name. varoom_featured_review() now also returns
-- the author's username and avatar, read live from their profile, so a new
-- picture or username shows without editing the review.
--
-- Privacy: a private profile (Settings → Privacy & Security → Profile
-- visibility) or a deactivated account returns no username and no picture;
-- the panel then shows the short name as before. Still no account ids.
-- Safe to re-run.

-- The returned columns change, so the function is dropped first.
drop function if exists public.varoom_featured_review();

create function public.varoom_featured_review()
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
  limit 1;
$$;

revoke all on function public.varoom_featured_review() from public;
grant execute on function public.varoom_featured_review() to anon, authenticated, service_role;

-- Rollback: re-run the function from 20261117_000071_varoom_reviews.sql
-- after `drop function if exists public.varoom_featured_review();`.
