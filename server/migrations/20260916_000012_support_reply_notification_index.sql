create unique index if not exists notifications_event_key_idx
  on public.notifications(event_key)
  where event_key is not null;
