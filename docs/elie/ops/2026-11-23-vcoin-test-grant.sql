-- Optional: give test accounts extra V-Coins for testing Elie (run after
-- migration 20261123_000079). Replace the emails, then run in the SQL Editor.
-- Each run adds 500 coins per account as a 'grant' row.
--
-- Check first (read only): the accounts and their current balance.
--   select u.email, coalesce(sum(l.delta), 0) as balance
--   from auth.users u left join public.elie_ledger l on l.user_id = u.id
--   where u.email in ('tester-one@example.com', 'tester-two@example.com')
--   group by u.email;

insert into public.elie_ledger (user_id, delta, kind)
select p.id, 500, 'grant'
from auth.users u
join public.profiles p on p.id = u.id
where u.email in ('tester-one@example.com', 'tester-two@example.com');

-- Undo (removes every test grant on those accounts):
--   delete from public.elie_ledger l using auth.users u
--   where l.user_id = u.id and l.kind = 'grant'
--     and u.email in ('tester-one@example.com', 'tester-two@example.com');
