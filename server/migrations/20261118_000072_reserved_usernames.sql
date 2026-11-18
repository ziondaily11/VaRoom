-- Public host profiles move to varoom.co.ke/<username>, beside the site's own
-- pages (/profile, /settings, /marketplace ...). A username may therefore
-- never be a word the site uses for a page, a redirect, a server path or a
-- public folder, or keeps for pages it may add.
--
-- One rule for every write (onboarding, Settings, any future path):
--   3–20 lowercase letters, numbers or underscores, and not a reserved name.
-- The list must stay equal to RESERVED_USERNAMES in
-- client/lib/profile/usernames.ts (client/test/reserved-usernames.test.js
-- checks this).
--
-- Before running, this must return no rows (a row means an account already
-- uses a name the rule refuses; the constraint below would then fail and
-- nothing changes):
--   select id, username from public.profiles
--   where username is not null
--     and (username !~ '^[a-z0-9_]{3,20}$' or public.varoom_username_reserved(username));
-- Safe to re-run.

create or replace function public.varoom_username_reserved(p_username text)
returns boolean
language sql
immutable
parallel safe
as $$
  select lower(p_username) = any (array[
    '404', '500', '_app', '_document', '_error', '_next', 'index', 'admin',
    'analytics', 'api', 'booking', 'bookings', 'chats', 'host', 'list',
    'map', 'marketplace', 'notifications', 'onboarding', 'pricing',
    'privacy', 'profile', 'properties', 'settings', 'support', 'terms',
    'chat', 'elie', 'login', 'register', 'varoomadmin', 'assets', 'favicon',
    'about', 'account', 'accounts', 'auth', 'billing', 'blog',
    'callback', 'careers', 'checkout', 'contact', 'dashboard', 'discover',
    'download', 'explore', 'faq', 'feed', 'guest', 'guests', 'help', 'home',
    'hosts', 'inbox', 'legal', 'listing', 'listings', 'logout', 'messages',
    'new', 'news', 'null', 'official', 'payments', 'press', 'property',
    'reviews', 'root', 'search', 'security', 'signin', 'signout', 'signup',
    'static', 'staff', 'status', 'system', 'team', 'transactions',
    'undefined', 'user', 'users', 'varoom', 'verify', 'wallet', 'www'
  ]::text[]);
$$;

alter table public.profiles drop constraint if exists profiles_username_allowed;
alter table public.profiles add constraint profiles_username_allowed
  check (username is null or (username ~ '^[a-z0-9_]{3,20}$' and not public.varoom_username_reserved(username)));

-- Rollback:
--   alter table public.profiles drop constraint if exists profiles_username_allowed;
--   drop function if exists public.varoom_username_reserved(text);
