-- Team access, part 3a: Messaging staff answer the host's chats.
--
-- Staff working as a company read and reply as the company (the server sends
-- their messages with the host as sender, so guests see the business and the
-- chat logic is unchanged). messages.sent_by records which person wrote it.
-- These read rules (which also decide live updates) now include whoever may
-- act for the host as Messaging; varoom_can_act_for includes the owner, so
-- owners and guests keep exactly what they had.
-- Each statement is safe to re-run.

alter table public.messages add column if not exists sent_by uuid references public.profiles (id) on delete set null;

drop policy if exists "Participants can view their own conversations" on public.conversations;
create policy "Participants can view their own conversations" on public.conversations
  for select using (auth.uid() = client_id or public.varoom_can_act_for(host_id, 'messaging'));
drop policy if exists "Participants can update their own conversation" on public.conversations;
create policy "Participants can update their own conversation" on public.conversations
  for update using (auth.uid() = client_id or public.varoom_can_act_for(host_id, 'messaging'));

-- Two policies said the same thing; one remains.
drop policy if exists "Participants can view messages in their conversations" on public.messages;
drop policy if exists messages_participant_select on public.messages;
create policy messages_participant_select on public.messages
  for select using (exists (
    select 1 from public.conversations c
    where c.id = messages.conversation_id and (c.client_id = auth.uid() or public.varoom_can_act_for(c.host_id, 'messaging'))
  ));

drop policy if exists message_attachments_participant_select on public.message_attachments;
create policy message_attachments_participant_select on public.message_attachments
  for select using (exists (
    select 1 from public.conversations c
    where c.id = message_attachments.conversation_id and (c.client_id = auth.uid() or public.varoom_can_act_for(c.host_id, 'messaging'))
  ));

-- Rollback: recreate each policy with (c.host_id = auth.uid()) in place of varoom_can_act_for(…);
-- alter table public.messages drop column sent_by;
