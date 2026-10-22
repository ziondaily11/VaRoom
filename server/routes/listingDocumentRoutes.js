'use strict';

const express = require('express');
const { v4: uuidv4 } = require('uuid');
const supabaseAdmin = require('../lib/supabaseClient');
const mediaStorageService = require('../lib/mediaStorageService');
const { assertAllowedKeys, enumValue, number, text, uuid, ValidationError } = require('../lib/inputValidation');
const { rejectSuspendedActivity } = require('../lib/accountAccess');

const router = express.Router();
const MAX_DOCUMENT_SIZE = 15 * 1024 * 1024;
const DOCUMENT_RULES = {
  'application/pdf': new Set(['pdf']),
  'image/jpeg': new Set(['jpg', 'jpeg']),
  'image/png': new Set(['png']),
  'image/webp': new Set(['webp']),
  'image/gif': new Set(['gif']),
};
const DOCUMENT_TYPES = new Set(['property_policy', 'floor_plan', 'commercial_policy', 'ownership_management']);
const OFFICE_SHOP_TYPES = new Set(['floor_plan', 'commercial_policy', 'ownership_management']);
const SINGLETON_TYPES = new Set(['property_policy', 'floor_plan', 'commercial_policy']);
const TERMINAL_LISTING_STATES = new Set(['discarded', 'cleanup_pending', 'expired']);

function fileExtension(filename) {
  return String(filename || '').toLowerCase().match(/\.([a-z0-9]{1,8})$/)?.[1] || '';
}

function hasSupportedContent(buffer, mimeType) {
  if (!Buffer.isBuffer(buffer)) return false;
  if (mimeType === 'application/pdf') {
    return buffer.length >= 12 && buffer.subarray(0, 5).toString('ascii') === '%PDF-'
      && buffer.subarray(Math.max(0, buffer.length - 4096)).toString('latin1').includes('%%EOF');
  }
  if (mimeType === 'image/jpeg') return buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  if (mimeType === 'image/png') return buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  if (mimeType === 'image/webp') return buffer.length >= 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP';
  if (mimeType === 'image/gif') return ['GIF87a', 'GIF89a'].includes(buffer.toString('ascii', 0, 6));
  return false;
}

async function authenticatedUser(req) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return null;
  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
  return error ? null : user;
}

async function listingForDocument(listingId) {
  const { data, error } = await supabaseAdmin.from('listings')
    .select('id,host_id,category,publication_state,availability_status,moderation_status,created_at')
    .eq('id', listingId).maybeSingle();
  if (error) throw error;
  return data;
}

function publicListing(listing) {
  return Boolean(listing && listing.publication_state === 'published'
    && (!listing.moderation_status || listing.moderation_status === 'active'));
}

function documentTypeMatchesCategory(documentType, category) {
  if (category === 'property') return documentType === 'property_policy';
  if (category === 'office' || category === 'shop') return OFFICE_SHOP_TYPES.has(documentType);
  return false;
}

function filenameForHeader(filename) {
  const original = String(filename || 'listing-document').replace(/[\r\n]/g, '_').slice(0, 180);
  const safe = original.replace(/[^\x20-\x7E]|["\\]/g, '_');
  return `attachment; filename="${safe}"; filename*=UTF-8''${encodeURIComponent(original)}`;
}

function inlineFilenameForHeader(filename) {
  const original = String(filename || 'listing-document').replace(/[\r\n]/g, '_').slice(0, 180);
  const safe = original.replace(/[^\x20-\x7E]|["\\]/g, '_');
  return `inline; filename="${safe}"; filename*=UTF-8''${encodeURIComponent(original)}`;
}

async function getOwnedDocument(id, hostId) {
  const { data, error } = await supabaseAdmin.from('listing_documents')
    .select('id,listing_id,host_id,document_type,storage_provider,storage_bucket,storage_key,original_filename,mime_type,file_size_bytes,sha256,status,visibility,upload_expires_at')
    .eq('id', id).eq('host_id', hostId).is('deleted_at', null).maybeSingle();
  if (error) throw error;
  return data;
}

router.post('/listing-documents/upload-init', async (req, res) => {
  try {
    const user = await authenticatedUser(req);
    if (!user) return res.status(401).json({ error: 'Invalid or expired session' });
    if (await rejectSuspendedActivity(res, user.id)) return;
    let listingId, documentType, filename, mimeType, fileSize;
    try {
      assertAllowedKeys(req.body, ['listingId', 'documentType', 'filename', 'mimeType', 'fileSize']);
      listingId = uuid(req.body.listingId, 'listingId');
      documentType = enumValue(req.body.documentType, 'documentType', [...DOCUMENT_TYPES]);
      filename = text(req.body.filename, 'filename', { max: 255 });
      mimeType = text(req.body.mimeType, 'mimeType', { max: 100 }).toLowerCase();
      fileSize = number(req.body.fileSize, 'fileSize', { integer: true, min: 1, max: MAX_DOCUMENT_SIZE });
      const extension = fileExtension(filename);
      if (!DOCUMENT_RULES[mimeType] || !DOCUMENT_RULES[mimeType].has(extension)) throw new ValidationError('File type and extension do not match');
    } catch (error) {
      if (error instanceof ValidationError) return res.status(400).json({ error: 'Choose a PDF, JPEG, PNG, WebP, or GIF file up to 15 MB.' });
      throw error;
    }

    const listing = await listingForDocument(listingId);
    if (!listing || listing.host_id !== user.id || TERMINAL_LISTING_STATES.has(listing.publication_state)) {
      return res.status(404).json({ error: 'Listing is not available for document uploads' });
    }
    if ((listing.category === 'property' && documentType !== 'property_policy')
        || (['office', 'shop'].includes(listing.category) && !OFFICE_SHOP_TYPES.has(documentType))
        || !['property', 'office', 'shop'].includes(listing.category)) {
      return res.status(400).json({ error: 'This document type is not available for this listing category' });
    }
    if (!mediaStorageService.R2_BUCKET_NAME) return res.status(503).json({ error: 'Document storage is not configured' });

    const id = uuidv4();
    const key = `listing-documents/${mediaStorageService.ENVIRONMENT}/${user.id}/${listingId}/${id}/incoming.${fileExtension(filename)}`;
    const visibility = documentType === 'ownership_management' ? 'host_only' : 'listing';
    const uploadExpiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    const authorization = await mediaStorageService.generateR2UploadAuthorization(
      key, mimeType, MAX_DOCUMENT_SIZE, 10 * 60, fileSize,
    );
    const { error: insertError } = await supabaseAdmin.from('listing_documents').insert({
      id, listing_id: listingId, host_id: user.id, document_type: documentType,
      storage_provider: 'r2', storage_bucket: mediaStorageService.R2_BUCKET_NAME,
      storage_key: key, original_filename: filename, mime_type: mimeType,
      file_size_bytes: fileSize, status: 'pending', visibility,
      upload_expires_at: uploadExpiresAt,
    });
    if (insertError) throw insertError;
    res.set('Cache-Control', 'no-store');
    return res.status(201).json({ document: { id, documentType, filename, mimeType, fileSize }, upload: authorization });
  } catch (error) {
    console.error('Listing document upload initialization failed:', error.message);
    return res.status(500).json({ error: 'Unable to prepare this document upload' });
  }
});

router.post('/listing-documents/:id/complete', async (req, res) => {
  let document = null;
  let verifiedKey = null;
  try {
    const user = await authenticatedUser(req);
    if (!user) return res.status(401).json({ error: 'Invalid or expired session' });
    if (await rejectSuspendedActivity(res, user.id)) return;
    let id;
    try { id = uuid(req.params.id, 'document id'); }
    catch (_) { return res.status(400).json({ error: 'Invalid document id' }); }
    document = await getOwnedDocument(id, user.id);
    if (!document) return res.status(404).json({ error: 'Document upload not found' });
    if (document.status === 'ready') return res.json({ document: { id, documentType: document.document_type, filename: document.original_filename, mimeType: document.mime_type, fileSize: document.file_size_bytes } });
    if (document.status !== 'pending') return res.status(409).json({ error: 'This document upload is no longer available' });
    if (document.upload_expires_at && Date.now() > new Date(document.upload_expires_at).getTime()) {
      throw new Error('Document upload authorization expired');
    }

    const listing = await listingForDocument(document.listing_id);
    if (!listing || listing.host_id !== user.id || !documentTypeMatchesCategory(document.document_type, listing.category)
        || TERMINAL_LISTING_STATES.has(listing.publication_state)) {
      return res.status(409).json({ error: 'The listing changed before the document upload completed' });
    }

    const { data: verifying, error: claimError } = await supabaseAdmin.from('listing_documents')
      .update({ status: 'verifying', updated_at: new Date().toISOString() })
      .eq('id', id).eq('host_id', user.id).eq('status', 'pending').select('id').maybeSingle();
    if (claimError) throw claimError;
    if (!verifying) {
      const current = await getOwnedDocument(id, user.id);
      if (current && current.status === 'ready') {
        return res.json({ document: { id, documentType: current.document_type, filename: current.original_filename, mimeType: current.mime_type, fileSize: current.file_size_bytes } });
      }
      return res.status(409).json({ error: 'This document upload is already being verified' });
    }
    document.status = 'verifying';

    const metadata = await mediaStorageService.getR2ObjectMetadata(document.storage_key);
    if (!metadata.exists) {
      await supabaseAdmin.from('listing_documents').update({ status: 'pending', updated_at: new Date().toISOString() })
        .eq('id', id).eq('host_id', user.id).eq('status', 'verifying');
      document.status = 'pending';
      return res.status(409).json({ error: 'The document has not finished uploading' });
    }
    const normalizedType = String(metadata.contentType || '').split(';')[0].trim().toLowerCase();
    if (metadata.contentLength !== Number(document.file_size_bytes) || normalizedType !== document.mime_type
        || metadata.contentLength > MAX_DOCUMENT_SIZE) {
      throw new Error('Uploaded document metadata did not match the authorized upload');
    }
    verifiedKey = document.storage_key.replace(/\/incoming\./, '/verified.');
    if (verifiedKey === document.storage_key) throw new Error('The upload key was not in the expected staging namespace');
    await mediaStorageService.copyR2Object(document.storage_key, verifiedKey);
    const verifiedMetadata = await mediaStorageService.getR2ObjectMetadata(verifiedKey);
    if (!verifiedMetadata.exists || verifiedMetadata.contentLength !== metadata.contentLength
        || String(verifiedMetadata.contentType || '').split(';')[0].trim().toLowerCase() !== document.mime_type) {
      throw new Error('Verified document copy did not match the uploaded object');
    }
    const bytes = await mediaStorageService.downloadR2Object(verifiedKey);
    if (bytes.length !== verifiedMetadata.contentLength || !hasSupportedContent(bytes, document.mime_type)) {
      throw new Error('Uploaded document content did not match its declared type');
    }
    const sha256 = require('crypto').createHash('sha256').update(bytes).digest('hex');
    const { data: ready, error } = await supabaseAdmin.from('listing_documents')
      .update({ status: 'ready', storage_key: verifiedKey, sha256, updated_at: new Date().toISOString() })
      .eq('id', id).eq('host_id', user.id).eq('status', 'verifying').select('id').maybeSingle();
    if (error) throw error;
    if (!ready) {
      const current = await getOwnedDocument(id, user.id);
      if (!current || current.status !== 'ready') throw new Error('Unable to finalize document metadata');
    }

    // Replace single-file documents only after the new object is verified and
    // associated. Ownership/management documents intentionally remain a list.
    if (SINGLETON_TYPES.has(document.document_type)) {
      const { data: previous, error: previousError } = await supabaseAdmin.from('listing_documents')
        .select('id,storage_provider,storage_bucket,storage_key').eq('listing_id', document.listing_id).eq('host_id', user.id)
        .eq('document_type', document.document_type).eq('status', 'ready').is('deleted_at', null).neq('id', id);
      if (previousError) {
        console.error('Unable to inspect replaced listing documents:', previousError.message);
      } else if (previous && previous.length) {
        const oldIds = previous.map((row) => row.id);
        const { error: retireError } = await supabaseAdmin.from('listing_documents')
          .update({ status: 'deleted', deleted_at: new Date().toISOString() }).in('id', oldIds).eq('host_id', user.id);
        if (retireError) {
          console.error('Unable to retire replaced listing documents:', retireError.message);
        } else {
          for (const row of previous) {
            try {
              if (row.storage_provider === 'supabase') {
                const { error: removeError } = await supabaseAdmin.storage.from(row.storage_bucket).remove([row.storage_key]);
                if (removeError) throw removeError;
              } else await mediaStorageService.deleteR2Object(row.storage_key);
            }
            catch (cleanupError) { console.error('Replaced listing document cleanup failed:', cleanupError.message); }
          }
        }
      }
    }
    // The presigned URL targets the incoming key and cannot overwrite the
    // immutable key now referenced by the ready metadata row.
    try { await mediaStorageService.deleteR2Object(document.storage_key); }
    catch (cleanupError) { console.error('Verified listing document staging cleanup failed:', cleanupError.message); }
    res.set('Cache-Control', 'no-store');
    return res.json({ document: { id, documentType: document.document_type, filename: document.original_filename, mimeType: document.mime_type, fileSize: document.file_size_bytes } });
  } catch (error) {
    if (document && document.status === 'verifying') {
      try {
        const current = await getOwnedDocument(document.id, document.host_id);
        if (current && current.status !== 'ready') {
          await mediaStorageService.deleteR2Object(document.storage_key);
          if (verifiedKey) await mediaStorageService.deleteR2Object(verifiedKey);
          await supabaseAdmin.from('listing_documents').update({ status: 'failed', upload_expires_at: null, updated_at: new Date().toISOString() })
            .eq('id', document.id).eq('host_id', document.host_id).eq('status', 'verifying');
        }
      } catch (cleanupError) {
        console.error('Failed listing document cleanup after validation error:', cleanupError.message);
      }
    }
    console.error('Listing document finalization failed:', error.message);
    return res.status(422).json({ error: 'The uploaded document could not be verified. Please choose the file again.' });
  }
});

router.get('/listings/:listingId/documents', async (req, res) => {
  try {
    let listingId;
    try { listingId = uuid(req.params.listingId, 'listing id'); }
    catch (_) { return res.status(400).json({ error: 'Invalid listing id' }); }
    const user = await authenticatedUser(req);
    if (req.headers.authorization && !user) return res.status(401).json({ error: 'Invalid or expired session' });
    const listing = await listingForDocument(listingId);
    if (!listing || !['property', 'office', 'shop'].includes(listing.category)) return res.status(404).json({ error: 'Listing documents not found' });
    const owner = Boolean(user && user.id === listing.host_id);
    if (!owner && !publicListing(listing)) return res.status(404).json({ error: 'Listing documents not found' });
    let query = supabaseAdmin.from('listing_documents')
      .select('id,listing_id,host_id,document_type,storage_provider,storage_bucket,storage_key,original_filename,mime_type,file_size_bytes,status,visibility,created_at')
      .eq('listing_id', listingId).eq('status', 'ready').is('deleted_at', null);
    if (!owner) query = query.eq('visibility', 'listing');
    const { data, error } = await query.order('created_at', { ascending: true });
    if (error) throw error;
    res.set('Cache-Control', 'private, no-store');
    const documents = await Promise.all((data || []).filter((item) => documentTypeMatchesCategory(item.document_type, listing.category)).map(async (item) => {
      let downloadUrl;
      let previewUrl = null;
      if (item.storage_provider === 'supabase') {
        const { data: signed, error: signError } = await supabaseAdmin.storage.from(item.storage_bucket)
          .createSignedUrl(item.storage_key, 300, { download: item.original_filename });
        if (signError || !signed?.signedUrl) throw signError || new Error('Unable to sign the legacy document');
        downloadUrl = signed.signedUrl;
        if (DOCUMENT_RULES[item.mime_type]) {
          const { data: preview, error: previewError } = await supabaseAdmin.storage.from(item.storage_bucket)
            .createSignedUrl(item.storage_key, 300);
          if (previewError || !preview?.signedUrl) throw previewError || new Error('Unable to sign the document preview');
          previewUrl = preview.signedUrl;
        }
      } else {
        downloadUrl = (await mediaStorageService.generateR2DownloadAuthorization(
          item.storage_key, item.mime_type, 300, filenameForHeader(item.original_filename),
        )).url;
        if (DOCUMENT_RULES[item.mime_type]) {
          previewUrl = (await mediaStorageService.generateR2DownloadAuthorization(
            item.storage_key, item.mime_type, 300, inlineFilenameForHeader(item.original_filename),
          )).url;
        }
      }
      return {
        id: item.id, documentType: item.document_type, filename: item.original_filename,
        mimeType: item.mime_type, fileSize: item.file_size_bytes === null ? null : Number(item.file_size_bytes),
        downloadUrl, previewUrl,
      };
    }));
    return res.json({ documents });
  } catch (error) {
    console.error('Listing document lookup failed:', error.message);
    return res.status(500).json({ error: 'Unable to load listing documents' });
  }
});

router.get('/listing-documents/:id/download', async (req, res) => {
  try {
    let id;
    try { id = uuid(req.params.id, 'document id'); }
    catch (_) { return res.sendStatus(404); }
    const user = await authenticatedUser(req);
    if (req.headers.authorization && !user) return res.status(401).json({ error: 'Invalid or expired session' });
    const { data: document, error: docError } = await supabaseAdmin.from('listing_documents')
      .select('id,listing_id,host_id,document_type,storage_provider,storage_bucket,storage_key,original_filename,mime_type,status,visibility')
      .eq('id', id).eq('status', 'ready').is('deleted_at', null).maybeSingle();
    if (docError) throw docError;
    if (!document) return res.sendStatus(404);
    const listing = await listingForDocument(document.listing_id);
    if (!listing) return res.sendStatus(404);
    const owner = Boolean(user && user.id === document.host_id && listing.host_id === user.id);
    if (document.visibility === 'host_only' && !owner) return res.sendStatus(404);
    if (!owner && (!publicListing(listing) || document.visibility !== 'listing')) return res.sendStatus(404);
    if (!documentTypeMatchesCategory(document.document_type, listing.category)) return res.sendStatus(404);
    res.set('Cache-Control', 'private, no-store');
    res.set('X-Content-Type-Options', 'nosniff');
    if (document.storage_provider === 'supabase') {
      const { data: signed, error: signError } = await supabaseAdmin.storage.from(document.storage_bucket)
        .createSignedUrl(document.storage_key, 300, { download: document.original_filename });
      if (signError || !signed?.signedUrl) throw signError || new Error('Unable to sign the legacy document');
      return res.redirect(302, signed.signedUrl);
    }
    const download = await mediaStorageService.generateR2DownloadAuthorization(
      document.storage_key, document.mime_type, 300, filenameForHeader(document.original_filename),
    );
    return res.redirect(302, download.url);
  } catch (error) {
    console.error('Listing document download authorization failed:', error.message);
    return res.sendStatus(404);
  }
});

router.delete('/listing-documents/:id', async (req, res) => {
  try {
    const user = await authenticatedUser(req);
    if (!user) return res.status(401).json({ error: 'Invalid or expired session' });
    if (await rejectSuspendedActivity(res, user.id)) return;
    let id;
    try { id = uuid(req.params.id, 'document id'); }
    catch (_) { return res.status(400).json({ error: 'Invalid document id' }); }
    const document = await getOwnedDocument(id, user.id);
    if (!document) return res.status(404).json({ error: 'Document not found' });
    const { error: retireError } = await supabaseAdmin.from('listing_documents')
      .update({ status: 'deleted', deleted_at: new Date().toISOString() }).eq('id', id).eq('host_id', user.id);
    if (retireError) throw retireError;
    try {
      if (document.storage_provider === 'supabase') {
        const { error } = await supabaseAdmin.storage.from(document.storage_bucket).remove([document.storage_key]);
        if (error) throw error;
      } else await mediaStorageService.deleteR2Object(document.storage_key);
    }
    catch (error) {
      console.error('Listing document was retired but its R2 cleanup failed:', error.message);
      return res.status(202).json({ removed: true, cleanupPending: true });
    }
    await supabaseAdmin.from('listing_documents').update({ storage_cleaned_at: new Date().toISOString() }).eq('id', id).eq('host_id', user.id);
    return res.status(204).end();
  } catch (error) {
    console.error('Listing document removal failed:', error.message);
    return res.status(500).json({ error: 'Unable to remove this listing document' });
  }
});

module.exports = router;
module.exports.hasSupportedContent = hasSupportedContent;
module.exports.fileExtension = fileExtension;
module.exports.MAX_DOCUMENT_SIZE = MAX_DOCUMENT_SIZE;
