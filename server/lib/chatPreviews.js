'use strict';

const { decryptMessage } = require('./messageEncryptionService');
const { clearedAtByConversation, visibleAfterClear } = require('./chatClears');

// Message previews in notifications. Messages stay encrypted in the
// database; a preview is decrypted only when its recipient views their
// notifications with Message previews on, and never stored.

const PREVIEW_LENGTH = 100;
const ENTITIES = { '&nbsp;': ' ', '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'" };

/** A message body as one line of plain text (the desktop editor may add formatting). */
function plainPreview(body) {
  const text = String(body || '')
    .replace(/<br\s*\/?>|<\/(p|div|li)>/gi, ' ')
    .replace(/<[^>]*>/g, '')
    .replace(/&(nbsp|amp|lt|gt|quot|#39);/g, (entity) => ENTITIES[entity])
    .replace(/\s+/g, ' ')
    .trim();
  return text.length > PREVIEW_LENGTH ? `${text.slice(0, PREVIEW_LENGTH - 1).trimEnd()}…` : text;
}

/** What a notification shows for a message: its text, a photo's caption, or the kind of message. */
function messagePreview(message, attachment) {
  let body = '';
  try {
    body = decryptMessage(message.ciphertext, message.iv, message.key_version);
  } catch {
    body = '';
  }
  const text = plainPreview(body);
  switch (message.message_type) {
    case 'photo': return text && text !== (attachment && attachment.original_filename) ? text : 'Photo';
    case 'file': return 'File';
    case 'voice': return 'Voice message';
    case 'listing': return 'Shared a listing';
    default: return text;
  }
}

/**
 * Previews of the given messages for this person: only messages in their
 * conversations, not deleted (for everyone, for them, or by "Delete chat"), and only when their
 * Message previews setting is on.
 */
async function previewsFor(admin, userId, messageIds) {
  const { data: profile, error: profileError } = await admin.from('profiles').select('message_previews').eq('id', userId).maybeSingle();
  if (profileError) throw profileError;
  if (profile && profile.message_previews === false) return { enabled: false, previews: {} };
  if (!messageIds.length) return { enabled: true, previews: {} };

  const { data: messages, error } = await admin
    .from('messages')
    .select('id,conversation_id,sender_id,ciphertext,iv,key_version,message_type,attachment_id,created_at,deleted_at')
    .in('id', messageIds);
  if (error) throw error;
  const live = (messages || []).filter((message) => !message.deleted_at);
  if (!live.length) return { enabled: true, previews: {} };

  const conversationIds = [...new Set(live.map((message) => message.conversation_id))];
  const [{ data: conversations, error: conversationError }, { data: hidden, error: hiddenError }, clears] = await Promise.all([
    admin.from('conversations').select('id,host_id,client_id').in('id', conversationIds),
    admin.from('message_user_deletions').select('message_id').eq('user_id', userId).in('message_id', live.map((message) => message.id)),
    clearedAtByConversation(admin, userId),
  ]);
  if (conversationError) throw conversationError;
  if (hiddenError) throw hiddenError;
  const member = new Set((conversations || [])
    .filter((conversation) => conversation.host_id === userId || conversation.client_id === userId)
    .map((conversation) => conversation.id));
  const hiddenIds = new Set((hidden || []).map((row) => row.message_id));
  const visible = live.filter((message) => member.has(message.conversation_id) && !hiddenIds.has(message.id) && visibleAfterClear(clears, message));

  const photoAttachmentIds = visible.filter((message) => message.message_type === 'photo' && message.attachment_id).map((message) => message.attachment_id);
  let attachmentsById = {};
  if (photoAttachmentIds.length) {
    const { data: attachments, error: attachmentError } = await admin.from('message_attachments').select('id,original_filename').in('id', photoAttachmentIds);
    if (attachmentError) throw attachmentError;
    attachmentsById = Object.fromEntries((attachments || []).map((attachment) => [attachment.id, attachment]));
  }

  const previews = {};
  visible.forEach((message) => {
    const preview = messagePreview(message, attachmentsById[message.attachment_id]);
    if (preview) previews[message.id] = preview;
  });
  return { enabled: true, previews };
}

module.exports = { PREVIEW_LENGTH, plainPreview, messagePreview, previewsFor };
