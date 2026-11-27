'use strict';

const { encryptMessage, decryptMessage } = require('./messageEncryptionService');

// Chat Settings → Elie → "Save Elie's answers as drafts": Elie's automatic
// answer waits here, encrypted like messages, for the host to use or dismiss
// in the conversation. One per conversation (the latest replaces it).

async function saveElieDraft(admin, conversation, reply) {
  const { error } = await admin.from('elie_away_drafts').upsert({
    conversation_id: conversation.id,
    host_id: conversation.host_id,
    ...encryptMessage(reply),
    created_at: new Date().toISOString(),
  }, { onConflict: 'conversation_id' });
  if (error) throw error;
}

/** The waiting draft's text for this host, or null. */
async function readElieDraft(admin, conversationId, hostId) {
  const { data, error } = await admin.from('elie_away_drafts')
    .select('ciphertext,iv,key_version,created_at')
    .eq('conversation_id', conversationId).eq('host_id', hostId).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return { reply: decryptMessage(data.ciphertext, data.iv, data.key_version), createdAt: data.created_at };
}

async function discardElieDraft(admin, conversationId, hostId) {
  const { error } = await admin.from('elie_away_drafts').delete().eq('conversation_id', conversationId).eq('host_id', hostId);
  if (error) throw error;
}

module.exports = { saveElieDraft, readElieDraft, discardElieDraft };
