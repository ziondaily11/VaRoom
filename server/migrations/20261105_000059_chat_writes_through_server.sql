-- Settings → Privacy → "Who can message you" is enforced by the server
-- (POST /api/chat/conversations/start). These two policies let any signed-in
-- user insert a conversation or a message directly with the public key,
-- skipping that check (and the server's message encryption). Nothing in the
-- app writes these tables directly: every write goes through the server,
-- which uses the service role and is unaffected.
--
-- Reading conversations and messages is unchanged.

drop policy if exists "Participants can start a conversation" on public.conversations;
drop policy if exists "Participants can send messages in their conversations" on public.messages;

-- Rollback:
-- create policy "Participants can start a conversation" on public.conversations
--   for insert with check ((auth.uid() = host_id) or (auth.uid() = client_id));
-- create policy "Participants can send messages in their conversations" on public.messages
--   for insert with check ((auth.uid() = sender_id) and exists (
--     select 1 from public.conversations c
--     where c.id = messages.conversation_id and ((auth.uid() = c.host_id) or (auth.uid() = c.client_id))));
