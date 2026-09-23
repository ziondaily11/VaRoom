-- Permanently removes all VaRoom rows owned by one authenticated user.
-- The API collects and removes external storage objects before calling this
-- function, then removes the auth.users row after the transaction succeeds.

create or replace function public.varoom_delete_user_data(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  listing_ids uuid[] := coalesce(array(
    select id from public.listings where host_id = p_user_id
  ), '{}'::uuid[]);
  booking_ids uuid[] := coalesce(array(
    select id from public.bookings
    where client_id = p_user_id
       or listing_id = any(listing_ids)
  ), '{}'::uuid[]);
  conversation_ids uuid[] := coalesce(array(
    select id from public.conversations
    where host_id = p_user_id or client_id = p_user_id
  ), '{}'::uuid[]);
  constraint_row record;
  table_name text;
begin
  if p_user_id is null then
    raise exception 'A user id is required';
  end if;

  -- Delete records whose constraints are not consistently configured with
  -- ON DELETE CASCADE in older VaRoom installations.
  delete from public.reviews
   where client_id = p_user_id
      or host_id = p_user_id
      or booking_id = any(booking_ids)
      or listing_id = any(listing_ids);

  delete from public.message_attachments
   where uploader_id = p_user_id
      or conversation_id = any(conversation_ids);
  delete from public.messages
   where sender_id = p_user_id
      or conversation_id = any(conversation_ids);
  delete from public.chat_user_reports
   where reporter_user_id = p_user_id or reported_user_id = p_user_id;
  delete from public.conversations
   where id = any(conversation_ids);

  delete from public.bookings
   where id = any(booking_ids) or client_id = p_user_id;

  delete from public.property_media
   where host_id = p_user_id or property_id = any(listing_ids);
  delete from public.availability where listing_id = any(listing_ids);
  delete from public.bookmarks
   where client_id = p_user_id or listing_id = any(listing_ids);
  delete from public.listing_photos where listing_id = any(listing_ids);
  delete from public.listing_booking_details where listing_id = any(listing_ids);
  delete from public.listings where id = any(listing_ids) or host_id = p_user_id;

  delete from public.notifications
   where recipient_user_id = p_user_id
      or actor_user_id = p_user_id
      or user_id = p_user_id;
  delete from public.elie_messages
   where session_id in (select id from public.elie_sessions where user_id = p_user_id);
  delete from public.elie_sessions where user_id = p_user_id;
  delete from public.billing_payments where host_id = p_user_id;
  delete from public.host_subscriptions where host_id = p_user_id;
  delete from public.account_controls where user_id = p_user_id;
  delete from public.support_tickets where user_id = p_user_id;

  -- Remove direct user/profile foreign-key records introduced by future
  -- migrations as well as legacy tables not present in every environment.
  for constraint_row in
    select
      n.nspname as schema_name,
      c.relname as relation_name,
      a.attname as column_name
    from pg_constraint fk
    join pg_class c on c.oid = fk.conrelid
    join pg_namespace n on n.oid = c.relnamespace
    join pg_attribute a on a.attrelid = c.oid and a.attnum = fk.conkey[1]
    join pg_class parent on parent.oid = fk.confrelid
    join pg_namespace parent_n on parent_n.oid = parent.relnamespace
    where fk.contype = 'f'
      and array_length(fk.conkey, 1) = 1
      and (
        (parent_n.nspname = 'public' and parent.relname = 'profiles')
        or (parent_n.nspname = 'auth' and parent.relname = 'users')
      )
      and not (
        n.nspname = 'public'
        and c.relname in (
          'profiles', 'messages', 'message_attachments', 'conversations',
          'bookings', 'property_media', 'availability', 'bookmarks',
          'listing_photos', 'listing_booking_details', 'listings',
          'notifications', 'elie_messages', 'elie_sessions',
          'billing_payments', 'host_subscriptions', 'account_controls',
          'support_tickets', 'reviews', 'chat_user_reports'
        )
      )
  loop
    execute format(
      'delete from %I.%I where %I = $1',
      constraint_row.schema_name,
      constraint_row.relation_name,
      constraint_row.column_name
    ) using p_user_id;
  end loop;

  -- account_deletions is deliberately not retained: it contains the deleted
  -- user's email and UUID and would allow the identity to be reconstructed.
  if to_regclass('public.account_deletions') is not null then
    delete from public.account_deletions where account_id = p_user_id;
  end if;

  delete from public.profiles where id = p_user_id;

  return jsonb_build_object(
    'listing_ids', to_jsonb(listing_ids),
    'booking_ids', to_jsonb(booking_ids),
    'conversation_ids', to_jsonb(conversation_ids)
  );
end;
$$;

revoke all on function public.varoom_delete_user_data(uuid) from public;
grant execute on function public.varoom_delete_user_data(uuid) to service_role;
