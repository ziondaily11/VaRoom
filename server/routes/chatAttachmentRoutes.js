const express = require('express');
const { v4: uuidv4 } = require('uuid');
const supabaseAdmin = require('../lib/supabaseClient');
const mediaStorageService = require('../lib/mediaStorageService');
const attachmentProcessing = require('../lib/chatAttachmentProcessingService');
const { generateVideoThumbnail } = require('../lib/videoThumbnailService');
const { ValidationError, assertAllowedKeys, text, uuid, number, enumValue } = require('../lib/inputValidation');
const { rejectSuspendedActivity } = require('../lib/accountAccess');

const router = express.Router();
const MAX_FILE_SIZE = 25 * 1024 * 1024;
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

function attachmentPayload(attachment) {
  const metadata = { ...attachment };
  const thumbnailKey = metadata.thumbnail_key;
  delete metadata.thumbnail_key;
  delete metadata.thumbnail_mime_type;
  delete metadata.source_storage_key;
  delete metadata.original_filename;
  return {
    ...metadata,
    thumbnail_available: Boolean(thumbnailKey),
  };
}

router.post('/chat/conversations/:conversationId/attachments/upload-init', async (req, res) => {
  try {
    const user = await authenticatedUser(req);
    if (!user) return res.status(401).json({ error: 'Invalid or expired session' });
    if (await rejectSuspendedActivity(res, user.id)) return;
    const conversationId = req.params.conversationId;
    const conversation = await conversationMember(conversationId, user.id);
    if (!conversation) return res.status(403).json({ error: 'Conversation access denied' });

    const { filename, mimeType, originalMimeType, fileSize, originalFileSize, optimizationFailed, kind } = req.body || {};
    try {
      assertAllowedKeys(req.body, ['filename', 'mimeType', 'originalMimeType', 'fileSize', 'originalFileSize', 'optimizationFailed', 'kind']);
      uuid(conversationId, 'conversation id');
      text(filename, 'filename', { max: 255 });
      text(mimeType, 'mimeType', { max: 150 });
      text(originalMimeType, 'originalMimeType', { max: 150 });
      number(fileSize, 'fileSize', { integer: true, min: 1, max: MAX_FILE_SIZE });
      number(originalFileSize, 'originalFileSize', { integer: true, min: 1, max: MAX_FILE_SIZE });
      enumValue(kind, 'kind', ['photo', 'file', 'voice']);
      if (typeof optimizationFailed !== 'boolean') throw new ValidationError('Invalid optimization status');
      attachmentProcessing.validateUploadMetadata(
        filename, mimeType, originalMimeType, fileSize, originalFileSize, kind, MAX_FILE_SIZE, optimizationFailed
      );
    } catch (error) {
      if (error instanceof ValidationError || error.message === 'Unsupported attachment type'
        || error.message === 'Attachment size is invalid'
        || error.message === 'Photo attachments must be images'
        || error.message === 'Voice attachments must be audio'
        || error.message === 'Only images can be optimized before upload'
        || error.message === 'Optimization status is invalid'
        || error.message === 'Unsupported attachment kind') {
        return res.status(400).json({ error: 'This attachment type, name, or size is not supported' });
      }
      throw error;
    }

    const attachmentId = uuidv4();
    const objectKey = mediaStorageService.generateChatAttachmentObjectKey(
      user.id,
      conversationId,
      attachmentId,
      mimeType === 'image/webp' ? 'webp' : attachmentProcessing.extensionOf(filename)
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
      original_mime_type: originalMimeType,
      original_file_size_bytes: originalFileSize,
      optimized_file_size_bytes: null,
      mime_type: mimeType,
      file_size_bytes: fileSize,
      kind,
      status: 'pending',
      processing_status: 'pending',
      optimization_status: mimeType.startsWith('image/') && optimizationFailed ? 'failed' : 'not_applicable',
      thumbnail_status: mimeType.startsWith('image/') || mimeType.startsWith('video/') ? 'pending' : 'not_applicable',
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
    if (await rejectSuspendedActivity(res, user.id)) return;
    uuid(req.params.conversationId, 'conversation id');
    uuid(req.params.attachmentId, 'attachment id');
    const conversation = await conversationMember(req.params.conversationId, user.id);
    if (!conversation) return res.status(403).json({ error: 'Conversation access denied' });
    const { data: attachment, error } = await supabaseAdmin.from('message_attachments')
      .select('*').eq('id', req.params.attachmentId).eq('conversation_id', req.params.conversationId)
      .eq('uploader_id', user.id).single();
    if (error || !attachment) return res.status(404).json({ error: 'Attachment not found' });
    if (attachment.status === 'ready') {
      if (attachment.source_storage_key) {
        try {
          await mediaStorageService.deleteR2Object(attachment.source_storage_key);
          const { error: cleanupMetadataError } = await supabaseAdmin.from('message_attachments')
            .update({ source_storage_key: null }).eq('id', attachment.id);
          if (cleanupMetadataError) throw cleanupMetadataError;
        } catch (cleanupError) {
          console.error('Unable to clean up staged chat attachment:', cleanupError);
        }
      }
      return res.json({ attachment: attachmentPayload(attachment) });
    }
    if (attachment.status !== 'pending' && attachment.status !== 'failed') {
      return res.status(409).json({ error: 'Attachment is already being processed' });
    }
    const processingStartedAt = attachment.processing_started_at
      ? new Date(attachment.processing_started_at).getTime()
      : 0;
    const processingIsFresh = attachment.processing_status === 'processing'
      && Date.now() - processingStartedAt < 5 * 60 * 1000;
    if (processingIsFresh) return res.status(409).json({ error: 'Attachment is already being processed' });
    const sourceMetadata = await mediaStorageService.getR2ObjectMetadata(attachment.storage_key);
    if (!sourceMetadata.exists) {
      await supabaseAdmin.from('message_attachments').update({
        status: 'failed',
        processing_status: 'failed',
        processing_started_at: null,
      }).eq('id', attachment.id);
      return res.status(400).json({ error: 'Attachment upload was not found' });
    }
    if (sourceMetadata.contentLength !== attachment.file_size_bytes
      || sourceMetadata.contentLength > MAX_FILE_SIZE) {
      await supabaseAdmin.from('message_attachments').update({
        status: 'failed',
        processing_status: 'failed',
        processing_started_at: null,
      }).eq('id', attachment.id);
      return res.status(400).json({ error: 'Attachment upload could not be verified' });
    }
    let claim = supabaseAdmin.from('message_attachments')
      .update({
        processing_status: 'processing',
        processing_started_at: new Date().toISOString(),
      })
      .eq('id', attachment.id)
      .eq('processing_status', attachment.processing_status);
    claim = attachment.processing_started_at
      ? claim.eq('processing_started_at', attachment.processing_started_at)
      : claim.is('processing_started_at', null);
    const { data: claimed, error: processingError } = await claim.select('id').maybeSingle();
    if (processingError) throw processingError;
    if (!claimed) return res.status(409).json({ error: 'Attachment is already being processed' });

    let originalBuffer;
    try {
      originalBuffer = await mediaStorageService.downloadR2Object(attachment.storage_key);
    } catch (downloadError) {
      const { error: resetError } = await supabaseAdmin.from('message_attachments')
        .update({ processing_status: 'failed', processing_started_at: null }).eq('id', attachment.id);
      if (resetError) console.error('Unable to reset failed chat attachment download:', resetError);
      throw downloadError;
    }
    try {
      if (originalBuffer.length !== sourceMetadata.contentLength) {
        throw new Error('Uploaded attachment size changed during processing');
      }
      attachmentProcessing.validateFileSignature(originalBuffer, attachment.mime_type);
    } catch (validationError) {
      console.error('Chat attachment validation failed:', validationError);
      await supabaseAdmin.from('message_attachments').update({
        status: 'failed',
        processing_status: 'failed',
        processing_started_at: null,
        optimization_status: 'failed',
        thumbnail_status: attachment.mime_type.startsWith('image/') || attachment.mime_type.startsWith('video/') ? 'failed' : 'not_applicable',
      }).eq('id', attachment.id);
      return res.status(400).json({ error: 'This attachment could not be processed. Choose a supported file and try again.' });
    }

    let finalObjectKey = attachment.storage_key;
    let finalMimeType = attachment.mime_type;
    const isImage = finalMimeType.startsWith('image/');
    let optimizationStatus = isImage
      ? attachment.optimization_status === 'failed'
        ? 'failed'
        : (attachment.mime_type !== attachment.original_mime_type
          || attachment.file_size_bytes < attachment.original_file_size_bytes ? 'optimized' : 'unchanged')
      : 'not_applicable';
    const clientOptimized = optimizationStatus === 'optimized';
    let finalWidth = null;
    let finalHeight = null;
    let optimizedSize = originalBuffer.length;
    let thumbnailKey = null;
    let thumbnailMimeType = null;
    let thumbnailStatus = 'not_applicable';
    let optimizedKeyToClean = null;

    if (isImage) {
      let imageInfo;
      try {
        imageInfo = await attachmentProcessing.inspectImage(originalBuffer, finalMimeType);
      } catch (imageError) {
        console.error('Chat image validation failed:', imageError);
        await supabaseAdmin.from('message_attachments').update({
          status: 'failed',
          processing_status: 'failed',
          processing_started_at: null,
          optimization_status: 'failed',
          thumbnail_status: 'failed',
        }).eq('id', attachment.id);
        return res.status(400).json({ error: 'This image could not be processed. Choose a supported image and try again.' });
      }
      finalWidth = imageInfo.width;
      finalHeight = imageInfo.height;
      const optimized = await attachmentProcessing.optimizeImage(originalBuffer, finalMimeType, imageInfo);
      if (optimized.optimizationStatus !== 'unchanged' || optimizationStatus === 'unchanged') {
        optimizationStatus = optimized.optimizationStatus;
      }
      let thumbBuffer = null;
      try {
        thumbBuffer = await attachmentProcessing.createImageThumbnail(originalBuffer);
      } catch (thumbnailError) {
        console.error('Chat image thumbnail generation failed:', thumbnailError);
        thumbnailStatus = 'failed';
      }
      if (optimized.buffer) {
        const targetKey = attachmentProcessing.optimizedObjectKey(attachment.storage_key);
        try {
          await mediaStorageService.uploadR2Object(targetKey, optimized.buffer, optimized.mimeType);
          finalObjectKey = targetKey;
          finalMimeType = optimized.mimeType;
          finalWidth = optimized.width;
          finalHeight = optimized.height;
          optimizedSize = optimized.buffer.length;
          optimizedKeyToClean = targetKey;
        } catch (optimizationError) {
          console.error('Chat image optimization storage failed; keeping original:', optimizationError);
          optimizationStatus = clientOptimized ? 'optimized' : 'failed';
        }
      }
      if (thumbBuffer) {
        const targetThumbnailKey = attachmentProcessing.thumbnailObjectKey(attachment.storage_key);
        try {
          await mediaStorageService.uploadR2Object(targetThumbnailKey, thumbBuffer, 'image/webp');
          thumbnailKey = targetThumbnailKey;
          thumbnailMimeType = 'image/webp';
          thumbnailStatus = 'ready';
        } catch (thumbnailError) {
          console.error('Chat image thumbnail storage failed:', thumbnailError);
          thumbnailStatus = 'failed';
        }
      }
    } else if (finalMimeType.startsWith('video/')) {
      try {
        thumbnailKey = await generateVideoThumbnail(attachment.storage_key, {
          width: 480,
          height: 360,
          timeoutMs: 20_000,
        });
        thumbnailMimeType = 'image/jpeg';
        thumbnailStatus = 'ready';
      } catch (thumbnailError) {
        console.error('Chat video thumbnail generation failed:', thumbnailError);
        thumbnailStatus = 'failed';
      }
    }

    const { data: ready, error: updateError } = await supabaseAdmin.from('message_attachments')
      .update({
        storage_key: finalObjectKey,
        mime_type: finalMimeType,
        optimized_file_size_bytes: optimizedSize,
        width: finalWidth,
        height: finalHeight,
        thumbnail_key: thumbnailKey,
        thumbnail_mime_type: thumbnailMimeType,
        source_storage_key: optimizedKeyToClean ? attachment.storage_key : null,
        status: 'ready',
        processing_status: 'ready',
        processing_started_at: null,
        optimization_status: optimizationStatus,
        thumbnail_status: thumbnailStatus,
      }).eq('id', attachment.id).select().single();
    if (updateError) {
      if (optimizedKeyToClean) {
        await mediaStorageService.deleteR2Object(optimizedKeyToClean).catch((cleanupError) => {
          console.error('Unable to clean up optimized chat attachment:', cleanupError);
        });
      }
      if (thumbnailKey) {
        await mediaStorageService.deleteR2Object(thumbnailKey).catch((cleanupError) => {
          console.error('Unable to clean up chat attachment thumbnail:', cleanupError);
        });
      }
      const { error: resetError } = await supabaseAdmin.from('message_attachments')
        .update({ processing_status: 'failed', processing_started_at: null }).eq('id', attachment.id);
      if (resetError) console.error('Unable to reset failed chat attachment finalization:', resetError);
      throw updateError;
    }
    if (optimizedKeyToClean && optimizedKeyToClean !== attachment.storage_key) {
      try {
        await mediaStorageService.deleteR2Object(attachment.storage_key);
        const { error: cleanupMetadataError } = await supabaseAdmin.from('message_attachments')
          .update({ source_storage_key: null }).eq('id', attachment.id);
        if (cleanupMetadataError) throw cleanupMetadataError;
      } catch (cleanupError) {
        console.error('Unable to remove staged original after chat image optimization:', cleanupError);
      }
    }
    return res.json({ attachment: attachmentPayload(ready) });
  } catch (error) {
    if (error instanceof ValidationError) return res.status(400).json({ error: 'Invalid attachment id' });
    console.error('Chat attachment completion failed:', error);
    return res.status(500).json({ error: 'Unable to finalize attachment' });
  }
});

router.get('/chat/attachments/:attachmentId/thumbnail', async (req, res) => {
  try {
    const user = await authenticatedUser(req);
    if (!user) return res.status(401).json({ error: 'Invalid or expired session' });
    uuid(req.params.attachmentId, 'attachment id');
    const { data: attachment } = await supabaseAdmin.from('message_attachments')
      .select('id,conversation_id,storage_key,mime_type,thumbnail_key,thumbnail_mime_type,thumbnail_status,status')
      .eq('id', req.params.attachmentId).eq('status', 'ready').maybeSingle();
    if (!attachment) return res.status(404).json({ error: 'Attachment thumbnail not found' });
    if (!(await conversationMember(attachment.conversation_id, user.id))) {
      return res.status(403).json({ error: 'Attachment access denied' });
    }
    if (!attachment.thumbnail_key && attachment.thumbnail_status === 'pending') {
      let generatedKey = null;
      let generatedMimeType = null;
      let dimensions = {};
      try {
        if (attachment.mime_type.startsWith('image/')) {
          const imageBuffer = await mediaStorageService.downloadR2Object(attachment.storage_key);
          const imageInfo = await attachmentProcessing.inspectImage(imageBuffer, attachment.mime_type);
          const thumbnailBuffer = await attachmentProcessing.createImageThumbnail(imageBuffer);
          generatedKey = attachmentProcessing.thumbnailObjectKey(attachment.storage_key);
          await mediaStorageService.uploadR2Object(generatedKey, thumbnailBuffer, 'image/webp');
          generatedMimeType = 'image/webp';
          dimensions = { width: imageInfo.width, height: imageInfo.height };
        } else if (attachment.mime_type.startsWith('video/')) {
          const videoBuffer = await mediaStorageService.downloadR2Object(attachment.storage_key);
          attachmentProcessing.validateFileSignature(videoBuffer, attachment.mime_type);
          generatedKey = await generateVideoThumbnail(attachment.storage_key, {
            width: 480,
            height: 360,
            timeoutMs: 20_000,
          });
          generatedMimeType = 'image/jpeg';
        }
      } catch (generationError) {
        console.error('Legacy chat attachment thumbnail generation failed:', generationError);
        return res.status(500).json({ error: 'Unable to open attachment preview' });
      }
      if (!generatedKey) return res.status(404).json({ error: 'Attachment thumbnail not found' });
      const { data: updated, error: updateError } = await supabaseAdmin.from('message_attachments')
        .update({
          thumbnail_key: generatedKey,
          thumbnail_mime_type: generatedMimeType,
          thumbnail_status: 'ready',
          ...dimensions,
        }).eq('id', attachment.id).eq('status', 'ready').select('id').maybeSingle();
      if (updateError || !updated) {
        await mediaStorageService.deleteR2Object(generatedKey).catch((cleanupError) => {
          console.error('Unable to clean up generated legacy chat thumbnail:', cleanupError);
        });
        if (updateError) throw updateError;
        return res.status(404).json({ error: 'Attachment thumbnail not found' });
      }
      attachment.thumbnail_key = generatedKey;
      attachment.thumbnail_mime_type = generatedMimeType;
    }
    if (!attachment.thumbnail_key) return res.status(404).json({ error: 'Attachment thumbnail not found' });
    const thumbnail = await mediaStorageService.generateR2DownloadAuthorization(
      attachment.thumbnail_key, attachment.thumbnail_mime_type || 'image/webp'
    );
    return res.json(thumbnail);
  } catch (error) {
    console.error('Chat attachment thumbnail failed:', error);
    return res.status(500).json({ error: 'Unable to open attachment preview' });
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
      .select('id,storage_key,source_storage_key,thumbnail_key').eq('id', req.params.attachmentId)
      .eq('conversation_id', req.params.conversationId).eq('uploader_id', user.id).maybeSingle();
    if (!attachment) return res.status(404).json({ error: 'Attachment not found' });
    await mediaStorageService.deleteR2Object(attachment.storage_key);
    if (attachment.source_storage_key && attachment.source_storage_key !== attachment.storage_key) {
      await mediaStorageService.deleteR2Object(attachment.source_storage_key);
    }
    if (attachment.thumbnail_key) await mediaStorageService.deleteR2Object(attachment.thumbnail_key);
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
