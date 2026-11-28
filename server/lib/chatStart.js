'use strict';

const { conversationsBetween } = require('./chatClears');

// The conversation between two people: one per pair. An existing one is
// reused (the one with the latest message, else the newest); otherwise one is
// created for the listing. Callers decide who may start a conversation.

/** The pair's conversation id, or null when they have none. */
async function existingConversation(admin, firstId, secondId) {
  const ids = await conversationsBetween(admin, firstId, secondId);
  if (!ids.length) return null;
  const { data: latest, error } = await admin.from('messages').select('conversation_id')
    .in('conversation_id', ids).order('created_at', { ascending: false }).limit(1);
  if (error) throw error;
  if (latest && latest[0]) return latest[0].conversation_id;
  const { data: newest, error: newestError } = await admin.from('conversations').select('id')
    .in('id', ids).order('created_at', { ascending: false }).limit(1);
  if (newestError) throw newestError;
  return newest && newest[0] ? newest[0].id : ids[0];
}

async function createConversation(admin, { listingId, hostId, clientId }) {
  const { data, error } = await admin.from('conversations')
    .upsert({ listing_id: listingId, host_id: hostId, client_id: clientId }, { onConflict: 'listing_id,client_id' })
    .select('id').single();
  if (error) throw error;
  return data.id;
}

/** The pair's conversation, created when there is none: { conversationId, created }. */
async function conversationFor(admin, pair) {
  const existing = await existingConversation(admin, pair.hostId, pair.clientId);
  if (existing) return { conversationId: existing, created: false };
  return { conversationId: await createConversation(admin, pair), created: true };
}

module.exports = { existingConversation, createConversation, conversationFor };
