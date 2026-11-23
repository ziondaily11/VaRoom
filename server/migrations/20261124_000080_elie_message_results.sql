-- Elie's answers keep their results.
--
-- The Elie service now saves each answered question itself (the question and
-- Elie's answer), so an answer is not lost when the person closes the window
-- or leaves the page while Elie is working. `results` holds what the answer
-- showed besides its text: the listings and the news items, so a search
-- reopened from history shows its listing cards again. Text-only answers and
-- older rows have null. Safe to re-run.
--
-- Check before running (read only; works before this migration):
--   select column_name from information_schema.columns
--   where table_schema = 'public' and table_name = 'elie_messages' order by ordinal_position;
--   -- expect: id, session_id, user_id, role, body, created_at (no results yet)
--
-- Undo:
--   alter table public.elie_messages drop column if exists results;

alter table public.elie_messages add column if not exists results jsonb;
