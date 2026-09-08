const express = require('express');
const { v4: uuidv4 } = require('uuid');
const supabaseAdmin = require('../lib/supabaseClient');
const mediaStorageService = require('../lib/mediaStorageService');
const { ValidationError, assertAllowedKeys, text, uuid, number, enumValue } = require('../lib/inputValidation');

const router = express.Router();
const MAX_FILE_SIZE = 25 * 1024 * 1024;
const ALLOWED_TYPES = new Set([
  'image/jpeg', 'image/png', 'image/webp', 'image/gif',
  'application/pdf', 'text/plain', 'application/zip',
  'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
]);

async function authenticatedUser(req) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return null;
  const { data: { user } } = await supabaseAdmin.auth.getUser(token);
  return user || null;
}

async function conversationMember(conversationId, userId) {
  const { data, error } = await supabaseAdmin
    .from('conversations')
    .select('id, listing_id, host_id, client_id')
    .eq('id', conversationId)
    .maybeSingle();
  if (error || !data || (data.host_id !== userId && data.client_id !== userId)) return null;
  return data;
}

function extensionOf(filename) {
  const match = String(filename).toLowerCase().match(/\.([a-z0-9]{1,12})$/);
  return match ? match[1] : 'bin';
}

router.post('/chat/conversations/:conversationId/attachments/upload-init', async (req, res) => {
  try {
    const user = await authenticatedUser(req);
    if (!user) return res.status(401).json({ error: 'Invalid or expired session' });
    const conversationId = req.params.conversationId;
    const conversation = await conversationMember(conversationId, user.id);
    if (!conversation) return res.status(403).json({ error: 'Conversation access denied' });

    const { filename, mimeType, fileSize, kind } = req.body || {};
    try {
      assertAllowedKeys(req.body, ['filename', 'mimeType', 'fileSize', 'kind']);
      uuid(conversationId, 'conversation id');
      text(filename, 'filename', { max: 255 });
      text(mimeType, 'mimeType', { max: 150 });
      number(fileSize, 'fileSize', { integer: true, min: 1, max: MAX_FILE_SIZE });
      enumValue(kind, 'kind', ['photo', 'file']);
    } catch (error) {
      if (error instanceof ValidationError) return res.status(400).json({ error: 'Invalid attachment metadata' });
      throw error;
    }
    if (!ALLOWED_TYPES.has(mimeType) || (kind === 'photo' && !mimeType.startsWith('image/'))) {
      return res.status(400).json({ error: 'This file type is not supported' });
    }

    const attachmentId = uuidv4();
    const objectKey = mediaStorageService.generateChatAttachmentObjectKey(
      user.id, conversationId, attachmentId, extensionOf(filename)
    );
    const uploadAuthorization = await mediaStorageService.generateR2UploadAuthorization(
      objectKey, mimeType, MAX_FILE_SIZE
    );
    const { error } = await supabaseAdmin.from('message_attachments').insert({
      id: attachmentId,
      conversation_id: conversationId,
      uploader_id: user.id,
      storage_provider: 'r2',
      storage_bucket: mediaStorageService.R2_BUCKET_NAME,
      storage_key: objectKey,
      original_filename: filename,
      mime_type: mimeType,
      file_size_bytes: fileSize,
      kind,
      status: 'pending',
    });
    if (error) {
      console.error('Chat attachment metadata insert failed:', error);
      return res.status(500).json({ error: 'Unable to prepare attachment upload' });
    }
    return res.json({
      attachmentId,
      uploadUrl: uploadAuthorization.uploadUrl,
      objectKey,
      expiresAt: uploadAuthorization.expiresAt,
    });
  } catch (error) {
    console.error('Chat attachment upload init failed:', error);
    return res.status(500).json({ error: 'Unable to prepare attachment upload' });
  }
});

router.post('/chat/conversations/:conversationId/attachments/:attachmentId/complete', async (req, res) => {
  try {
    const user = await authenticatedUser(req);
    if (!user) return res.status(401).json({ error: 'Invalid or expired session' });
    uuid(req.params.conversationId, 'conversation id');
    uuid(req.params.attachmentId, 'attachment id');
    const conversation = await conversationMember(req.params.conversationId, user.id);
    if (!conversation) return res.status(403).json({ error: 'Conversation access denied' });
    const { data: attachment, error } = await supabaseAdmin.from('message_attachments')
      .select('*').eq('id', req.params.attachmentId).eq('conversation_id', req.params.conversationId)
      .eq('uploader_id', user.id).single();
    if (error || !attachment) return res.status(404).json({ error: 'Attachment not found' });
    if (!(await mediaStorageService.verifyR2ObjectExists(attachment.storage_key))) {
      await supabaseAdmin.from('message_attachments').update({ status: 'failed' }).eq('id', attachment.id);
      return res.status(400).json({ error: 'Uploaded file was not found in R2' });
    }
    const { data: ready, error: updateError } = await supabaseAdmin.from('message_attachments')
      .update({ status: 'ready' }).eq('id', attachment.id).select().single();
    if (updateError) return res.status(500).json({ error: 'Unable to finalize attachment' });
    return res.json({ attachment: ready });
  } catch (error) {
    if (error instanceof ValidationError) return res.status(400).json({ error: 'Invalid attachment id' });
    console.error('Chat attachment completion failed:', error);
    return res.status(500).json({ error: 'Unable to finalize attachment' });
  }
});

router.get('/chat/attachments/:attachmentId/download', async (req, res) => {
  try {
    const user = await authenticatedUser(req);
    if (!user) return res.status(401).json({ error: 'Invalid or expired session' });
    uuid(req.params.attachmentId, 'attachment id');
    const { data: attachment } = await supabaseAdmin.from('message_attachments')
      .select('conversation_id,storage_key,mime_type,status')
      .eq('id', req.params.attachmentId).eq('status', 'ready').maybeSingle();
    if (!attachment) return res.status(404).json({ error: 'Attachment not found' });
    if (!(await conversationMember(attachment.conversation_id, user.id))) {
      return res.status(403).json({ error: 'Attachment access denied' });
    }
    const download = await mediaStorageService.generateR2DownloadAuthorization(
      attachment.storage_key, attachment.mime_type
    );
    return res.json(download);
  } catch (error) {
    console.error('Chat attachment download failed:', error);
    return res.status(500).json({ error: 'Unable to open attachment' });
  }
});

router.delete('/chat/conversations/:conversationId/attachments/:attachmentId', async (req, res) => {
  try {
    const user = await authenticatedUser(req);
    if (!user) return res.status(401).json({ error: 'Invalid or expired session' });
    const conversation = await conversationMember(req.params.conversationId, user.id);
    if (!conversation) return res.status(403).json({ error: 'Conversation access denied' });
    const { data: attachment } = await supabaseAdmin.from('message_attachments')
      .select('id,storage_key').eq('id', req.params.attachmentId)
      .eq('conversation_id', req.params.conversationId).eq('uploader_id', user.id).maybeSingle();
    if (!attachment) return res.status(404).json({ error: 'Attachment not found' });
    await mediaStorageService.deleteR2Object(attachment.storage_key);
    const { error } = await supabaseAdmin.from('message_attachments')
      .update({ status: 'deleted' }).eq('id', attachment.id);
    if (error) return res.status(500).json({ error: 'Unable to remove attachment metadata' });
    return res.status(204).send();
  } catch (error) {
    console.error('Chat attachment deletion failed:', error);
    return res.status(500).json({ error: 'Unable to remove attachment' });
  }
});

module.exports = router;
