-- Admin hardening (server/lib/adminSecurity.js, adminRoutes.js): two-step
-- sign-in and a lockout that survives restarts; removing admins; account
-- lists, sign-ins and sign-ups counted in the database instead of from the
-- first 1,000 auth users. Check first (must work): select count(*) from public.admins;

-- Two-step sign-in (an authenticator app code). The secret is encrypted by
-- the server; totp_enabled_at is set once the admin confirms a first code.
-- failed_logins and locked_until replace the in-memory lockout.
alter table public.admins
  add column if not exists totp_secret_encrypted text,
  add column if not exists totp_enabled_at timestamptz,
  add column if not exists failed_logins integer not null default 0,
  add column if not exists locked_until timestamptz;

-- A removed admin's replies stay on their tickets (every other reference to
-- an admin already clears itself).
alter table public.support_ticket_replies drop constraint if exists support_ticket_replies_admin_id_fkey;
alter table public.support_ticket_replies add constraint support_ticket_replies_admin_id_fkey
  foreign key (admin_id) references public.admins(id) on delete set null;

-- Accounts, newest first, optionally matching email, name or username, a page at a time.
create or replace function public.admin_list_accounts(p_query text, p_limit integer, p_offset integer)
returns table (id uuid, email text, created_at timestamptz, last_sign_in_at timestamptz, provider text,
               banned_until timestamptz, full_name text, username text, total bigint)
language sql stable security definer set search_path = public, auth as $$
  with q as (
    select case when coalesce(trim(p_query), '') = '' then null
      else '%' || replace(replace(replace(trim(p_query), '\', '\\'), '%', '\%'), '_', '\_') || '%' end as pattern
  ), matched as (
    select u.id, u.email::text as email, u.created_at, u.last_sign_in_at,
           coalesce(u.raw_app_meta_data ->> 'provider', 'email') as provider, u.banned_until, p.full_name, p.username
    from auth.users u
    left join public.profiles p on p.id = u.id, q
    where q.pattern is null or u.email ilike q.pattern or p.full_name ilike q.pattern or p.username ilike q.pattern
  )
  select m.*, count(*) over () as total from matched m
  order by m.created_at desc
  limit least(greatest(p_limit, 1), 200) offset greatest(p_offset, 0);
$$;
revoke all on function public.admin_list_accounts(text, integer, integer) from public, anon, authenticated;

-- Everyone whose latest sign-in is since p_since, latest first.
create or replace function public.admin_recent_signins(p_since timestamptz)
returns table (email text, provider text, last_sign_in_at timestamptz)
language sql stable security definer set search_path = public, auth as $$
  select u.email::text, coalesce(u.raw_app_meta_data ->> 'provider', 'email'), u.last_sign_in_at
  from auth.users u where u.last_sign_in_at >= p_since order by u.last_sign_in_at desc limit 5000;
$$;
revoke all on function public.admin_recent_signins(timestamptz) from public, anon, authenticated;

-- Sign-ups per day since p_since.
create or replace function public.admin_signup_days(p_since timestamptz)
returns table (day date, signups bigint)
language sql stable security definer set search_path = public, auth as $$
  select (u.created_at at time zone 'UTC')::date, count(*) from auth.users u
  where u.created_at >= p_since group by 1 order by 1;
$$;
revoke all on function public.admin_signup_days(timestamptz) from public, anon, authenticated;
