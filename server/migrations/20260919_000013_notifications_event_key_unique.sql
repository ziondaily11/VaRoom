-- The notification upsert targets event_key without a predicate. A partial
-- unique index cannot be used as the ON CONFLICT arbiter for that statement.
-- A regular unique index preserves the intended rule: non-null event keys are
-- unique, while PostgreSQL still permits multiple NULL values.
drop index if exists public.notifications_event_key_idx;

create unique index notifications_event_key_idx
  on public.notifications(event_key);
