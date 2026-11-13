-- Chat Settings → Business hours: a host with them switched on is away (the
-- away message, then Elie) outside the hours set for each day, Nairobi time.
-- { "enabled": bool, "days": [Sunday … Saturday] of {"open":"HH:MM","close":"HH:MM"} or null (closed) }
-- Review and apply manually; the application never runs migrations.
-- Apply before deploying the client that reads it (Chat Settings reads all its columns at once).
alter table public.profiles
  add column if not exists away_schedule jsonb;
