-- Elie production readiness, Phase 0 (docs/elie/PRODUCTION_READINESS_PLAN.md).
-- READ-ONLY: every statement is a SELECT. Nothing is changed.
-- Run each numbered query on its own in the Supabase SQL Editor and share
-- the result grid.

-- 1. messages columns. Expected: no "body" row; ciphertext, iv, key_version,
--    is_auto_reply, message_type and listing_id present.
select column_name, data_type, is_nullable, column_default
  from information_schema.columns
 where table_schema = 'public'
   and table_name = 'messages'
   and column_name in ('body', 'ciphertext', 'iv', 'key_version', 'is_auto_reply', 'message_type', 'listing_id')
 order by column_name;

-- 2. Auto-replies ever saved, and since chat encryption (2026-09-24).
--    Expected: none since encryption (confirms the auto-reply outage).
select count(*) filter (where is_auto_reply) as auto_replies_total,
       count(*) filter (where is_auto_reply and created_at >= '2026-09-24') as auto_replies_since_encryption,
       max(created_at) filter (where is_auto_reply) as last_auto_reply_at
  from public.messages;

-- 3. Live messages that cannot be decrypted (they would break the chat
--    message list). Expected: 0.
select count(*) as undecryptable_live_messages
  from public.messages
 where deleted_at is null
   and (ciphertext is null or iv is null or key_version is null);

-- 4. Hosts with Away mode on (how many people the outage affects).
select count(*) as hosts_away
  from public.profiles
 where away_mode;

-- 5. Listing category values as stored. Elie maps searches onto:
--    airbnb, hotel, event venues, office, shop, property.
select category, count(*) as listings
  from public.listings
 group by category
 order by listings desc;

-- 6. Listing availability values. Elie only returns 'available'.
select availability_status, count(*) as listings
  from public.listings
 group by availability_status
 order by listings desc;

-- 7. Columns Elie search and auto-reply read on listings, booking details
--    and conversations (conversations.last_message_at is written by the
--    current Python code; the plan removes that write if it does not exist).
select table_name, column_name, data_type
  from information_schema.columns
 where table_schema = 'public'
   and (
        (table_name = 'listings' and column_name in ('verified', 'availability_status', 'category', 'location_text', 'host_id'))
     or (table_name = 'listing_booking_details' and column_name in ('listing_id', 'price_amount', 'price_unit', 'max_guests', 'size_or_type', 'amenities'))
     or (table_name = 'conversations' and column_name in ('listing_id', 'host_id', 'client_id', 'last_message_at'))
   )
 order by table_name, column_name;

-- 8. Notification idempotency index used for auto-reply notifications.
--    Expected: one unique index on event_key.
select indexname, indexdef
  from pg_indexes
 where schemaname = 'public'
   and tablename = 'notifications'
   and indexdef ilike '%event_key%';

-- 9. Elie history tables exist with row-level security on.
--    Expected: two rows, both rls_enabled = true.
select c.relname as table_name, c.relrowsecurity as rls_enabled
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public'
   and c.relname in ('elie_sessions', 'elie_messages');
