-- Suspension preserves login and read access. These database guards make the
-- browse-only policy effective even if a client bypasses the interface.
create or replace function public.varoom_reject_suspended_activity()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and exists (
    select 1 from public.account_controls
    where user_id = auth.uid() and status <> 'active'
  ) then
    raise exception 'Account suspended: browsing is available but new activity is not';
  end if;
  return new;
end;
$$;

drop trigger if exists varoom_restrict_suspended_listings on public.listings;
create trigger varoom_restrict_suspended_listings before insert or update or delete on public.listings
for each row execute function public.varoom_reject_suspended_activity();

drop trigger if exists varoom_restrict_suspended_bookings on public.bookings;
create trigger varoom_restrict_suspended_bookings before insert or update on public.bookings
for each row execute function public.varoom_reject_suspended_activity();

drop trigger if exists varoom_restrict_suspended_conversations on public.conversations;
create trigger varoom_restrict_suspended_conversations before insert on public.conversations
for each row execute function public.varoom_reject_suspended_activity();

drop trigger if exists varoom_restrict_suspended_messages on public.messages;
create trigger varoom_restrict_suspended_messages before insert on public.messages
for each row execute function public.varoom_reject_suspended_activity();
