const express = require('express');
const { v4: uuidv4 } = require('uuid');
const supabaseAdmin = require('../lib/supabaseClient');
const mediaStorageService = require('../lib/mediaStorageService');
const mediaOptimizationService = require('../lib/mediaOptimizationService');
const { isNewR2PhotoObjectKey, isDraftR2PhotoObjectKey, isR2PhotoObjectKey } = require('../lib/photoStorageKeys');
const { ValidationError, assertAllowedKeys, text, number, enumValue, uuid } = require('../lib/inputValidation');
const { rejectSuspendedActivity } = require('../lib/accountAccess');
const { decideListingMediaAccess } = require('../lib/listingMediaAccess');

const router = express.Router();
const PHOTO_CATEGORIES = new Set(['listing-photos', 'avatars', 'update-images', 'profile-banners']);
const PHOTO_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const MAX_PHOTO_SIZE = 15 * 1024 * 1024;

function hasImageSignature(buffer, mimeType) {
  if (!Buffer.isBuffer(buffer)) return false;
  if (mimeType === 'image/jpeg') return buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  if (mimeType === 'image/png') return buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
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

async function requireHost(userId, res) {
  const { data: profile, error } = await supabaseAdmin.from('profiles').select('role').eq('id', userId).maybeSingle();
  if (error) throw error;
  if (!profile || profile.role !== 'host') {
    res.status(403).json({ error: 'Only hosts can upload profile banners' });
    return false;
  }
  return true;
}

function extensionOf(filename, mimeType) {
  const extension = String(filename || '').toLowerCase().match(/\.([a-z0-9]{1,12})$/)?.[1];
  if (extension) return extension;
  return { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' }[mimeType];
}

// The browser uploads directly to R2 using a short-lived signed URL.  It
// never receives R2 credentials or gets to choose an object key.
router.post('/photos/upload-init', async (req, res) => {
  try {
    const user = await authenticatedUser(req);
    if (!user) return res.status(401).json({ error: 'Invalid or expired session' });
    if (await rejectSuspendedActivity(res, user.id)) return;

    const { category, filename, mimeType, fileSize, listingId } = req.body || {};
    try {
      assertAllowedKeys(req.body, ['category', 'filename', 'mimeType', 'fileSize', 'listingId']);
      enumValue(category, 'category', [...PHOTO_CATEGORIES]);
      if (category === 'listing-photos') uuid(listingId, 'listingId');
      text(filename, 'filename', { max: 255 });
      text(mimeType, 'mimeType', { max: 100 });
      number(fileSize, 'fileSize', { integer: true, min: 1, max: MAX_PHOTO_SIZE });
    } catch (error) {
      if (error instanceof ValidationError) return res.status(400).json({ error: 'Invalid photo metadata' });
      throw error;
    }
    if (category === 'profile-banners' && !(await requireHost(user.id, res))) return;
    if (!PHOTO_TYPES.has(mimeType)) return res.status(400).json({ error: 'Only JPEG, PNG, WebP, and GIF images are supported' });
    const extension = extensionOf(filename, mimeType);
    if (!extension) return res.status(400).json({ error: 'Photo filename must include a valid extension' });

    let listing = null;
    if (category === 'listing-photos') {
      const { data, error } = await supabaseAdmin.from('listings')
        .select('id,host_id,publication_state,availability_status,created_at')
        .eq('id', listingId).maybeSingle();
      if (error) throw error;
      listing = data;
      const access = decideListingMediaAccess(listing, user.id);
      if (!access.allowed || !access.owner) return res.status(404).json({ error: 'Listing is not available for media uploads' });
    }
    const privateDraft = listing && ['draft', 'payment_pending', 'failed'].includes(listing.publication_state);
    const key = privateDraft
      ? mediaStorageService.generateDraftPhotoObjectKey(user.id, listingId, uuidv4(), extension)
      : mediaStorageService.generatePhotoObjectKey(user.id, category, uuidv4(), extension);
    const upload = await mediaStorageService.generateR2UploadAuthorization(key, mimeType, MAX_PHOTO_SIZE);
    if (privateDraft) {
      const { data: reserved, error: reserveError } = await supabaseAdmin.rpc('reserve_draft_photo_upload', {
        p_listing_id: listingId,
        p_host_id: user.id,
        p_object_key: key,
        p_expires_at: upload.expiresAt,
      });
      if (reserveError) throw reserveError;
      if (!reserved) return res.status(409).json({ error: 'Draft is no longer available for uploads' });
    }
    return res.json({ key, uploadUrl: upload.uploadUrl, expiresAt: upload.expiresAt });
  } catch (error) {
    console.error('Photo upload initialization failed:', error);
    return res.status(500).json({ error: 'Unable to prepare photo upload' });
  }
});

router.post('/photos/upload-complete', async (req, res) => {
  try {
    const user = await authenticatedUser(req);
    if (!user) return res.status(401).json({ error: 'Invalid or expired session' });
    const { category, key, listingId } = req.body || {};
    if (category === 'profile-banners' && !(await requireHost(user.id, res))) return;
    let ownerPrefix = `photos/${mediaStorageService.ENVIRONMENT}/${category}/${user.id}/`;
    if (category === 'listing-photos') {
      if (!listingId) return res.status(400).json({ error: 'Listing id is required' });
      uuid(listingId, 'listingId');
      const { data: listing, error: listingError } = await supabaseAdmin.from('listings')
        .select('id,host_id,publication_state,availability_status,created_at')
        .eq('id', listingId).maybeSingle();
      if (listingError) throw listingError;
      const access = decideListingMediaAccess(listing, user.id);
      if (!access.allowed || !access.owner) return res.status(404).json({ error: 'Listing is not available for media uploads' });
      ownerPrefix = ['draft', 'payment_pending', 'failed'].includes(listing.publication_state)
        ? `drafts/photos/${mediaStorageService.ENVIRONMENT}/${user.id}/${listingId}/`
        : `photos/${mediaStorageService.ENVIRONMENT}/listing-photos/${user.id}/`;
      if (isDraftR2PhotoObjectKey(category, key, mediaStorageService.ENVIRONMENT)) {
        const { data: session, error: sessionError } = await supabaseAdmin.from('draft_media_upload_sessions')
          .select('object_key').eq('object_key', key).eq('listing_id', listingId).eq('host_id', user.id).maybeSingle();
        if (sessionError) throw sessionError;
        if (!session) return res.status(404).json({ error: 'Photo upload session not found' });
        const { error: completedError } = await supabaseAdmin.from('draft_media_upload_sessions')
          .update({ completed_at: new Date().toISOString() }).eq('object_key', key).eq('listing_id', listingId).eq('host_id', user.id);
        if (completedError) throw completedError;
      }
    }
    if (!PHOTO_CATEGORIES.has(category)
      || !(isNewR2PhotoObjectKey(category, key, mediaStorageService.ENVIRONMENT)
        || isDraftR2PhotoObjectKey(category, key, mediaStorageService.ENVIRONMENT))
      || !key.startsWith(ownerPrefix)) {
      return res.status(400).json({ error: 'Invalid photo key' });
    }
    if (!(await mediaStorageService.verifyR2ObjectExists(key))) {
      return res.status(400).json({ error: 'Uploaded photo was not found in R2' });
    }

    try {
      const objectMetadata = await mediaStorageService.getR2ObjectMetadata(key);
      if (category === 'profile-banners') {
        const contentType = String(objectMetadata.contentType || '').toLowerCase();
        if (!PHOTO_TYPES.has(contentType) || objectMetadata.contentLength < 1 || objectMetadata.contentLength > MAX_PHOTO_SIZE) {
          return res.status(400).json({ error: 'Banner must be a supported image under 15 MB' });
        }
        const bytes = await mediaStorageService.downloadR2Object(key);
        if (!hasImageSignature(bytes, contentType)) return res.status(400).json({ error: 'Banner file contents do not match its image type' });
      }
      const optimization = await mediaOptimizationService.optimizeStoredMediaObject(
        key,
        objectMetadata.contentType || 'image/jpeg',
        key.split('/').pop() || 'photo'
      );
      if (optimization.optimized && optimization.outputContentType && optimization.outputContentType !== objectMetadata.contentType) {
        console.info(`Optimized photo upload for ${key} from ${objectMetadata.contentType || 'unknown'} to ${optimization.outputContentType} (${optimization.bytesSaved} bytes saved)`);
      }
    } catch (error) {
      console.error('Photo optimization failed during upload completion:', error);
      return res.status(500).json({ error: 'Uploaded photo could not be optimized. Please try again.' });
    }

    return res.json({ key, publicUrl: `/api/photos/${encodeURIComponent(category)}/${key.split('/').map(encodeURIComponent).join('/')}` });
  } catch (error) {
    console.error('Photo upload completion failed:', error);
    return res.status(500).json({ error: 'Unable to finalize photo upload' });
  }
});

router.post('/photos/upload-discard', async (req, res) => {
  try {
    const user = await authenticatedUser(req);
    if (!user) return res.status(401).json({ error: 'Invalid or expired session' });
    const { category, key, listingId } = req.body || {};
    let ownerPrefix = `photos/${mediaStorageService.ENVIRONMENT}/${category}/${user.id}/`;
    if (category === 'listing-photos' && isDraftR2PhotoObjectKey(category, key, mediaStorageService.ENVIRONMENT)) {
      const parts = String(key).split('/');
      if (parts[3] !== user.id || !parts[4] || (listingId && parts[4] !== listingId)) {
        return res.status(400).json({ error: 'Invalid photo key' });
      }
      const { data: listing, error } = await supabaseAdmin.from('listings')
        .select('id,host_id,publication_state,availability_status,created_at')
        .eq('id', parts[4]).maybeSingle();
      if (error) throw error;
      const access = decideListingMediaAccess(listing, user.id);
      if (!access.allowed || !access.owner) return res.status(404).json({ error: 'Listing is not available for media uploads' });
      ownerPrefix = `drafts/photos/${mediaStorageService.ENVIRONMENT}/${user.id}/${parts[4]}/`;
    }
    if (!PHOTO_CATEGORIES.has(category)
      || !(isNewR2PhotoObjectKey(category, key, mediaStorageService.ENVIRONMENT)
        || isDraftR2PhotoObjectKey(category, key, mediaStorageService.ENVIRONMENT))
      || !key.startsWith(ownerPrefix)) {
      return res.status(400).json({ error: 'Invalid photo key' });
    }
    await mediaStorageService.deleteR2Object(key);
    return res.json({ success: true });
  } catch (error) {
    console.error('Photo upload discard failed:', error);
    return res.status(500).json({ error: 'Unable to remove uploaded photo' });
  }
});

// Listing-photo access is tied to the listing record. R2 and legacy Supabase
// objects are both served through short-lived URLs after the same check.
router.get('/photos/:category/*', async (req, res) => {
  try {
    const category = req.params.category;
    const key = req.params[0] ? decodeURIComponent(req.params[0]) : '';
    if (!PHOTO_CATEGORIES.has(category)) return res.sendStatus(404);
    if (category === 'listing-photos') {
      const authHeader = req.headers.authorization || '';
      const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
      let userId = null;
      if (token) {
        const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
        if (authError || !user) return res.status(401).json({ error: 'Invalid or expired session' });
        userId = user.id;
      }
      if (key.includes('..') || key.includes('\\')) return res.sendStatus(404);
      const { data: photo, error: photoError } = await supabaseAdmin.from('listing_photos')
        .select('listing_id,storage_path').eq('storage_path', key).maybeSingle();
      if (photoError) throw photoError;
      if (!photo) return res.sendStatus(404);
      const { data: listing, error: listingError } = await supabaseAdmin.from('listings')
        .select('id,host_id,publication_state,availability_status,created_at')
        .eq('id', photo.listing_id).maybeSingle();
      if (listingError) throw listingError;
      const access = decideListingMediaAccess(listing, userId);
      if (!access.allowed) return res.sendStatus(404);
      if (isR2PhotoObjectKey(category, key, mediaStorageService.ENVIRONMENT)) {
        const download = await mediaStorageService.generateR2DownloadAuthorization(key, undefined, 300);
        res.set('Cache-Control', access.published ? 'public, max-age=300' : 'private, no-store');
        return res.redirect(302, download.url);
      }
      const { data, error } = await supabaseAdmin.storage.from('listing-photos').createSignedUrl(key, 300);
      if (error || !data?.signedUrl) throw error || new Error('Unable to sign legacy listing photo');
      res.set('Cache-Control', access.published ? 'public, max-age=300' : 'private, no-store');
      return res.redirect(302, data.signedUrl);
    }
    if (!isR2PhotoObjectKey(category, key, mediaStorageService.ENVIRONMENT)) return res.sendStatus(404);
    const download = await mediaStorageService.generateR2DownloadAuthorization(key, undefined, 300);
    res.set('Cache-Control', 'public, max-age=300');
    return res.redirect(302, download.url);
  } catch (error) {
    console.error('Photo download authorization failed:', error);
    return res.sendStatus(404);
  }
});

module.exports = router;
