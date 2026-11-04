'use strict';

// Message ticks: sent (row exists), delivered (delivered_at) and read
// (read_at). read_at always records reads, because unread counts depend on
// it; read receipts only decide whether the sender is shown that time.

async function markDelivered(supabaseAdmin, userId, conversationIds) {
  if (!userId || !conversationIds.length) return;
  const { error } = await supabaseAdmin
    .from('messages')
    .update({ delivered_at: new Date().toISOString() })
    .in('conversation_id', conversationIds)
    .neq('sender_id', userId)
    .is('delivered_at', null);
  if (error) throw error;
}

// Read receipts are off when either person has turned them off.
async function readReceiptsShared(supabaseAdmin, conversation) {
  const ids = [conversation.host_id, conversation.client_id].filter(Boolean);
  if (!ids.length) return true;
  const { data, error } = await supabaseAdmin
    .from('profiles')
    .select('id,read_receipts')
    .in('id', ids);
  if (error) throw error;
  return !(data || []).some((profile) => profile.read_receipts === false);
}

// The sender's own messages lose read_at when receipts are off: they show as
// delivered. Messages from the other person keep it (it is the viewer's own read).
function withVisibleReceipts(message, viewerId, receiptsShared) {
  if (receiptsShared || message.sender_id !== viewerId || !message.read_at) return message;
  return { ...message, read_at: null };
}

module.exports = { markDelivered, readReceiptsShared, withVisibleReceipts };
