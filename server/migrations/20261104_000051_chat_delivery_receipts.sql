-- Message ticks: delivered state and the read receipts setting.
-- Review and apply manually; the application never runs migrations.
-- Apply before deploying the server that reads these columns.
alter table public.messages
  add column if not exists delivered_at timestamptz;

-- Existing messages were already seen in the inbox: show them as delivered
-- (or read) rather than dropping them back to a single tick.
update public.messages
  set delivered_at = coalesce(read_at, created_at)
  where delivered_at is null;

-- Each person decides whether others see when they read messages. Off on
-- either side hides the read colour for both people.
alter table public.profiles
  add column if not exists read_receipts boolean not null default true;
