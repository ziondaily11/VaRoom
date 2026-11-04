-- Reach Out (booking-page contact options), database investigation.
-- READ-ONLY: every statement is a SELECT. Nothing is changed.
-- Run each numbered query on its own in the Supabase SQL Editor and share
-- the result grid.

-- 1. profiles columns. profiles predates server/migrations, so the repo has
--    no create table for it. Looking for: phone (type), and whether any
--    email / whatsapp / contact column already exists.
select column_name, data_type, is_nullable, column_default
  from information_schema.columns
 where table_schema = 'public'
   and table_name = 'profiles'
 order by ordinal_position;

-- 2. RLS on profiles and listings: is it enabled, and who may read whose
--    row? The booking page reads the host's phone through
--    listings -> profiles, so this decides who can already see phone
--    numbers, and who could see any new contact column.
select c.relname as table_name, c.relrowsecurity as rls_enabled, c.relforcerowsecurity as rls_forced
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public'
   and c.relname in ('profiles', 'listings');

select tablename, policyname, cmd, roles, permissive, qual, with_check
  from pg_policies
 where schemaname = 'public'
   and tablename in ('profiles', 'listings')
 order by tablename, cmd, policyname;

-- 3. Column-level grants on profiles for the browser roles. Empty means
--    table-level grants apply (every column readable wherever RLS allows).
select grantee, privilege_type, column_name
  from information_schema.column_privileges
 where table_schema = 'public'
   and table_name = 'profiles'
   and grantee in ('anon', 'authenticated')
 order by grantee, privilege_type, column_name;

select grantee, privilege_type
  from information_schema.table_privileges
 where table_schema = 'public'
   and table_name = 'profiles'
   and grantee in ('anon', 'authenticated')
 order by grantee, privilege_type;

-- 4. Triggers on profiles (an update from the new Settings section must
--    pass them).
select trigger_name, event_manipulation, action_timing, action_statement
  from information_schema.triggers
 where event_object_schema = 'public'
   and event_object_table = 'profiles'
 order by trigger_name;

-- 5. How phone numbers are stored. Onboarding saves +254XXXXXXXXX for
--    Kenyan numbers; older rows may differ. Counts only, no numbers shown.
select coalesce(role, '(none)') as role,
       count(*) as profiles,
       count(*) filter (where phone is null or btrim(phone) = '') as no_phone,
       count(*) filter (where phone ~ '^\+254[17][0-9]{8}$') as kenyan_e164,
       count(*) filter (where phone ~ '^0[17][0-9]{8}$') as kenyan_local_0,
       count(*) filter (where phone ~ '^254[17][0-9]{8}$') as kenyan_no_plus,
       count(*) filter (where phone ~ '^\+' and phone !~ '^\+254') as other_international,
       count(*) filter (where phone is not null and btrim(phone) <> ''
                          and phone !~ '^\+254[17][0-9]{8}$'
                          and phone !~ '^0[17][0-9]{8}$'
                          and phone !~ '^254[17][0-9]{8}$'
                          and phone !~ '^\+') as unrecognised
  from public.profiles
 group by role
 order by profiles desc;

-- 6. Hosts with published listings: how many could be reached today by
--    phone (profiles.phone) and by email (auth.users.email).
select count(distinct l.host_id) as hosts_with_listings,
       count(distinct l.host_id) filter (where p.phone is null or btrim(p.phone) = '') as hosts_without_phone,
       count(distinct l.host_id) filter (where u.email is null or btrim(u.email) = '') as hosts_without_email
  from public.listings l
  join public.profiles p on p.id = l.host_id
  join auth.users u on u.id = l.host_id;

-- 7. Existing functions with contact / email in the name (to reuse rather
--    than duplicate).
select p.proname as function_name, p.prosecdef as security_definer, pg_get_function_identity_arguments(p.oid) as args
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public'
   and (p.proname ilike '%contact%' or p.proname ilike '%email%' or p.proname ilike '%phone%')
 order by p.proname;
