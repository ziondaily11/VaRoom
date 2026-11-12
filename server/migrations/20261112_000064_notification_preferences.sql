-- Notifications that arrive, and the switches that control them.
--
-- 1. The type list on notifications allowed only four booking types, so every
--    other notification (new message, new review, booking cancelled, payments,
--    support replies, table reservations) was refused and never shown. The app
--    already validates types; the list goes.
-- 2. Settings → Notifications switches are enforced here, for every way a
--    notification is created: a notification the recipient turned off is not
--    stored. Messages use message_notifications (the same switch as Chat
--    settings); new switches for reviews and booking reminders.
-- 3. Booking notifications come from the database when a booking is created or
--    its status changes, so they can't be lost in the browser. The event keys
--    are the ones the app used, so a repeat from an older page is ignored.
-- Each statement is safe to re-run.

alter table public.notifications drop constraint if exists notifications_type_check;

alter table public.profiles
  add column if not exists notify_reviews boolean not null default true,
  add column if not exists notify_booking_reminders boolean not null default true;

-- ---- Preferences ----
create or replace function public.varoom_notification_wanted()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  p record;
begin
  select message_notifications, notify_bookings, notify_booking_reminders, notify_reviews, notify_account_updates
    into p from public.profiles where id = new.recipient_user_id;
  if not found then return new; end if;
  if (new.type = 'new_message' and p.message_notifications = false)
     or (new.type = 'booking_expiring' and p.notify_booking_reminders = false)
     or (new.type <> 'booking_expiring' and (new.type like 'booking\_%' or new.type = 'table_reservation') and p.notify_bookings = false)
     or (new.type in ('new_review', 'review_published', 'review_response') and p.notify_reviews = false)
     or ((new.type like 'payment\_%' or new.type like 'payout\_%' or new.type like 'support\_%' or new.type = 'security_alert') and p.notify_account_updates = false) then
    return null; -- turned off: not stored
  end if;
  return new;
end;
$$;

drop trigger if exists varoom_notification_wanted_trigger on public.notifications;
create trigger varoom_notification_wanted_trigger
  before insert on public.notifications
  for each row execute function public.varoom_notification_wanted();

-- ---- Booking notifications ----
create or replace function public.varoom_notify_booking()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  listing_title text;
  guest_name text;
  recipient uuid;
  actor uuid;
  kind text;
  heading text;
  body text;
begin
  select coalesce(title, 'this listing') into listing_title from public.listings where id = new.listing_id;
  listing_title := coalesce(listing_title, 'this listing');
  if tg_op = 'INSERT' then
    select coalesce(nullif(full_name, ''), 'A guest') into guest_name from public.profiles where id = new.client_id;
    recipient := new.host_id; actor := new.client_id; kind := 'booking_request';
    if new.status = 'approved' then
      heading := 'New booking';
      body := format('"%s" booked "%s".', coalesce(guest_name, 'A guest'), listing_title);
    else
      heading := 'New booking request';
      body := format('"%s" requested to book "%s".', coalesce(guest_name, 'A guest'), listing_title);
    end if;
  elsif new.status is not distinct from old.status then
    return new;
  elsif new.status = 'approved' then
    recipient := new.client_id; actor := new.host_id; kind := 'booking_approved';
    heading := 'Booking confirmed'; body := format('Your booking for "%s" has been confirmed.', listing_title);
  elsif new.status = 'declined' then
    recipient := new.client_id; actor := new.host_id; kind := 'booking_declined';
    heading := 'Booking declined'; body := format('Your booking request for "%s" was declined.', listing_title);
  elsif new.status = 'cancelled' then
    select coalesce(nullif(full_name, ''), 'A guest') into guest_name from public.profiles where id = new.client_id;
    recipient := new.host_id; actor := new.client_id; kind := 'booking_cancelled';
    heading := 'Booking cancelled'; body := format('"%s" cancelled their booking for "%s".', coalesce(guest_name, 'A guest'), listing_title);
  elsif new.status = 'expired' then
    recipient := new.client_id; actor := null; kind := 'booking_expired';
    heading := 'Booking request expired';
    body := format('Your booking request for "%s" expired because the host didn''t respond in time.', listing_title);
  else
    return new;
  end if;

  begin
    insert into public.notifications (user_id, recipient_user_id, actor_user_id, type, title, message,
      related_entity_type, related_entity_id, booking_id, metadata, read, event_key)
    values (recipient, recipient, actor, kind, heading, body, 'booking', new.id, new.id,
      jsonb_build_object('booking_id', new.id, 'listing_id', new.listing_id, 'listing_name', listing_title),
      false, replace(kind, '_', '-') || ':' || new.id)
    on conflict (event_key) do nothing;
  exception when others then
    raise warning 'Booking notification failed for %: %', new.id, sqlerrm; -- never blocks the booking
  end;
  return new;
end;
$$;

drop trigger if exists varoom_notify_booking_trigger on public.bookings;
create trigger varoom_notify_booking_trigger
  after insert or update of status on public.bookings
  for each row execute function public.varoom_notify_booking();

-- Rollback:
-- drop trigger varoom_notify_booking_trigger on public.bookings; drop function public.varoom_notify_booking();
-- drop trigger varoom_notification_wanted_trigger on public.notifications; drop function public.varoom_notification_wanted();
-- alter table public.profiles drop column notify_reviews, drop column notify_booking_reminders;
