'use strict';

// A chat attachment whose message was deleted for everyone: marked deleted
// first (the download route serves only 'ready' attachments), then its file
// is removed from storage.
async function removeChatAttachment(supabaseAdmin, storage, attachmentId) {
  if (!attachmentId) return;
  const { data, error } = await supabaseAdmin
    .from('message_attachments')
    .select('id,storage_key')
    .eq('id', attachmentId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return;
  const { error: updateError } = await supabaseAdmin
    .from('message_attachments')
    .update({ status: 'deleted' })
    .eq('id', data.id);
  if (updateError) throw updateError;
  if (data.storage_key) await storage.deleteR2Object(data.storage_key);
}

module.exports = { removeChatAttachment };
