'use strict';

// "Delete chat" (inbox menu): the person's copy of a conversation is cleared
// at that moment. Older messages are hidden for them everywhere; the chat
// leaves their inbox until a new message arrives, which shows on its own.
// The other person's copy is unchanged.

/** When this person cleared each of their conversations (conversation id → ms). */
async function clearedAtByConversation(admin, userId) {
  const { data, error } = await admin.from('conversation_clears').select('conversation_id,cleared_at').eq('user_id', userId);
  if (error) throw error;
  return new Map((data || []).map((row) => [row.conversation_id, Date.parse(row.cleared_at)]));
}

/** The message is newer than the person's clear of its conversation (or there was none). */
function visibleAfterClear(clears, message) {
  const clearedAt = clears.get(message.conversation_id);
  return clearedAt === undefined || Date.parse(message.created_at) > clearedAt;
}

/** Every conversation between these two people (the inbox shows them as one chat). */
async function conversationsBetween(admin, firstId, secondId) {
  const { data, error } = await admin
    .from('conversations')
    .select('id')
    .or(`and(host_id.eq.${firstId},client_id.eq.${secondId}),and(host_id.eq.${secondId},client_id.eq.${firstId})`);
  if (error) throw error;
  return (data || []).map((row) => row.id);
}

/** Clears this person's copy of all their conversations with the other person, and unarchives them. */
async function clearChat(admin, userId, conversation) {
  const otherId = conversation.host_id === userId ? conversation.client_id : conversation.host_id;
  const ids = await conversationsBetween(admin, userId, otherId);
  if (!ids.includes(conversation.id)) ids.push(conversation.id);
  const clearedAt = new Date().toISOString();
  const { error } = await admin
    .from('conversation_clears')
    .upsert(ids.map((id) => ({ user_id: userId, conversation_id: id, cleared_at: clearedAt })), { onConflict: 'user_id,conversation_id' });
  if (error) throw error;
  // A new message brings the chat back to the inbox, not to Archived.
  const { error: archiveError } = await admin.from('conversation_archives').delete().eq('user_id', userId).in('conversation_id', ids);
  if (archiveError) throw archiveError;
  return ids;
}

module.exports = { clearedAtByConversation, visibleAfterClear, conversationsBetween, clearChat };
