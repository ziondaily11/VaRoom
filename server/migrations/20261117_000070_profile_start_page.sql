-- Start page: the page a host pins in the sidebar opens first after signing
-- in (email and Google). Stored on the profile so it follows the account to
-- every device. NULL means the role's usual home.
--
-- Only an in-app path is accepted ("/bookings", "/host-home?view=my-listings"):
-- a single segment of lowercase letters and dashes, optionally one ?view=.
-- That rules out other sites ("//evil.example", "https://…") at the
-- database too; the app also checks it against the sidebar's own pages.
-- The row is written through the existing "update own profile" policies.
-- Safe to re-run.

alter table public.profiles add column if not exists start_page text;

alter table public.profiles drop constraint if exists profiles_start_page_path;
alter table public.profiles add constraint profiles_start_page_path
  check (start_page is null or start_page ~ '^/[a-z-]+(\?view=[a-z-]+)?$');

-- Rollback: alter table public.profiles drop column start_page;
