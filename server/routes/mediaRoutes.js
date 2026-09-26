const express = require('express');
const { v4: uuidv4 } = require('uuid');
const supabaseAdmin = require('../lib/supabaseClient');
const mediaStorageService = require('../lib/mediaStorageService');
const mediaValidation = require('../lib/mediaValidation');
const mediaCleanupService = require('../lib/mediaCleanupService');
const { ValidationError, assertAllowedKeys, text, uuid, number, enumValue } = require('../lib/inputValidation');
const { rejectSuspendedActivity } = require('../lib/accountAccess');

const router = express.Router();
const { MAX_IMAGE_BYTES } = mediaValidation;

async function authenticatedUser(req) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return null;
  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
  return error ? null : user || null;
}

async function ownedListing(listingId, userId) {
  const { data, error } = await supabaseAdmin.from('listings')
    .select('id,host_id').eq('id', listingId).maybeSingle();
  if (error) throw error;
  return data && data.host_id === userId ? data : null;
}

async function isUpdatePublisher(user) {
  if (!user || !user.email) return false;
  const { data, error } = await supabaseAdmin.from('admins')
    .select('role').eq('email', user.email).maybeSingle();
  if (error) throw error;
  return Boolean(data && ['super_admin', 'support'].includes(data.role));
}

function extensionForMimeType(mimeType) {
  return mediaValidation.imageType(mimeType);
}

function publicImageContentType(objectKey) {
  const extension = objectKey.slice(objectKey.lastIndexOf('.') + 1).toLowerCase();
  return ({
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    webp: 'image/webp',
    gif: 'image/gif',
    avif: 'image/avif',
  })[extension];
}

function objectKeyFor(category, userId, listingId, mediaId, extension) {
  if (category === 'listing-photo') {
    return mediaStorageService.generateListingPhotoObjectKey(listingId, mediaId, extension);
  }
  if (category === 'profile-photo') {
    return mediaStorageService.generateProfilePhotoObjectKey(userId, mediaId, extension);
  }
  return mediaStorageService.generateUpdateImageObjectKey(userId, mediaId, extension);
}

async function verifyImageObject(objectKey, mimeType) {
  const type = extensionForMimeType(mimeType);
  if (!type) throw new ValidationError('Unsupported image type');
  const metadata = await mediaStorageService.getR2ObjectMetadata(objectKey);
  if (!metadata.exists || metadata.contentLength < 1 || metadata.contentLength > MAX_IMAGE_BYTES) {
    throw new ValidationError('Uploaded image size is invalid');
  }
  if (metadata.contentType && metadata.contentType.toLowerCase() !== mimeType) {
    throw new ValidationError('Uploaded image type does not match its metadata');
  }
  const body = await mediaStorageService.downloadR2Object(objectKey);
  if (body.length !== metadata.contentLength || body.length > MAX_IMAGE_BYTES) {
    throw new ValidationError('Uploaded image could not be verified');
  }
  await mediaValidation.verifyImageBuffer(body, mimeType);
  return { contentLength: body.length };
}

router.post('/media/upload-init', async (req, res) => {
  try {
    const user = await authenticatedUser(req);
    if (!user) return res.status(401).json({ error: 'Invalid or expired session' });
    if (await rejectSuspendedActivity(res, user.id)) return;

    let category;
    let listingId = null;
    let mimeType;
    let fileSize;
    let filename;
    try {
      assertAllowedKeys(req.body, ['category', 'listingId', 'photoId', 'sortOrder', 'filename', 'mimeType', 'fileSize']);
      category = enumValue(req.body.category, 'category', ['listing-photo', 'profile-photo', 'update-image']);
      filename = text(req.body.filename, 'filename', { max: 255 });
      mimeType = text(req.body.mimeType, 'mimeType', { max: 100 });
      number(req.body.fileSize, 'fileSize', { integer: true, min: 1, max: MAX_IMAGE_BYTES });
      fileSize = req.body.fileSize;
      if (!extensionForMimeType(mimeType)) throw new ValidationError('Unsupported image type');
      if (category === 'listing-photo') {
        listingId = uuid(req.body.listingId, 'listing id');
        if (req.body.photoId !== undefined) uuid(req.body.photoId, 'photo id');
        number(req.body.sortOrder, 'sort order', { integer: true, min: 0, max: 5 });
      } else if (req.body.listingId !== undefined || req.body.photoId !== undefined) {
        throw new ValidationError('Unexpected listing photo reference');
      }
    } catch (error) {
      if (error instanceof ValidationError) return res.status(400).json({ error: 'Unsupported image type or size' });
      throw error;
    }

    if (category === 'listing-photo' && !(await ownedListing(listingId, user.id))) {
      return res.status(403).json({ error: 'You can only upload photos to your own listing' });
    }
    if (category === 'update-image' && !(await isUpdatePublisher(user))) {
      return res.status(403).json({ error: 'Administrator access is required to upload update images' });
    }

    const mediaId = category === 'listing-photo' && req.body.photoId ? req.body.photoId : uuidv4();
    const extension = extensionForMimeType(mimeType).extension;
    const objectKey = objectKeyFor(category, user.id, listingId, mediaId, extension);
    const upload = await mediaStorageService.generateR2UploadAuthorization(objectKey, mimeType, MAX_IMAGE_BYTES);
    return res.json({
      mediaId,
      uploadUrl: upload.uploadUrl,
      objectKey,
      contentType: mimeType,
      maxFileSize: MAX_IMAGE_BYTES,
      expiresAt: upload.expiresAt,
    });
  } catch (error) {
    console.error('Media upload initialization failed:', error);
    return res.status(500).json({ error: 'Unable to prepare media upload' });
  }
});

router.post('/media/upload-complete', async (req, res) => {
  let objectKey;
  let referenceSaved = false;
  try {
    const user = await authenticatedUser(req);
    if (!user) return res.status(401).json({ error: 'Invalid or expired session' });
    if (await rejectSuspendedActivity(res, user.id)) return;

    let category;
    let listingId = null;
    let mediaId;
    let mimeType;
    try {
      assertAllowedKeys(req.body, ['category', 'listingId', 'mediaId', 'mimeType', 'sortOrder']);
      category = enumValue(req.body.category, 'category', ['listing-photo', 'profile-photo', 'update-image']);
      mediaId = uuid(req.body.mediaId, 'media id');
      mimeType = text(req.body.mimeType, 'mimeType', { max: 100 });
      if (!extensionForMimeType(mimeType)) throw new ValidationError('Unsupported image type');
      if (category === 'listing-photo') {
        listingId = uuid(req.body.listingId, 'listing id');
        number(req.body.sortOrder, 'sort order', { integer: true, min: 0, max: 5 });
      }
      else if (req.body.listingId !== undefined) throw new ValidationError('Unexpected listing id');
    } catch (error) {
      if (error instanceof ValidationError) return res.status(400).json({ error: 'Invalid media upload' });
      throw error;
    }

    if (category === 'listing-photo' && !(await ownedListing(listingId, user.id))) {
      return res.status(403).json({ error: 'You can only upload photos to your own listing' });
    }
    if (category === 'update-image' && !(await isUpdatePublisher(user))) {
      return res.status(403).json({ error: 'Administrator access is required to upload update images' });
    }
    objectKey = objectKeyFor(category, user.id, listingId, mediaId, extensionForMimeType(mimeType).extension);
    const verified = await verifyImageObject(objectKey, mimeType);

    if (category === 'listing-photo') {
      const { data: existingPhoto, error: lookupError } = await supabaseAdmin.from('listing_photos')
        .select('media_id,storage_path,storage_provider').eq('media_id', mediaId).eq('listing_id', listingId).maybeSingle();
      if (lookupError) throw lookupError;

      const photoValues = {
        listing_id: listingId,
        storage_path: objectKey,
        storage_provider: 'r2',
        storage_bucket: mediaStorageService.R2_BUCKET_NAME,
        mime_type: mimeType,
        file_size_bytes: verified.contentLength,
        sort_order: req.body.sortOrder,
        is_cover: req.body.sortOrder === 0,
      };
      const result = existingPhoto
        ? await supabaseAdmin.from('listing_photos').update(photoValues).eq('media_id', mediaId).select().single()
        : await supabaseAdmin.from('listing_photos').insert({ media_id: mediaId, ...photoValues }).select().single();
      if (result.error) throw result.error;

      referenceSaved = true;
      if (existingPhoto && existingPhoto.storage_provider === 'r2'
        && existingPhoto.storage_path !== objectKey) {
        try {
          const taskId = await mediaCleanupService.enqueueMediaCleanup(
            'r2', mediaStorageService.R2_BUCKET_NAME, existingPhoto.storage_path
          );
          const cleanup = await mediaCleanupService.processMediaCleanup(taskId);
          if (!cleanup.deleted) {
            return res.json({ mediaId, objectKey, photo: result.data, cleanupPending: true });
          }
        } catch (cleanupError) {
          console.error('Unable to clean up replaced listing photo:', cleanupError);
          return res.json({ mediaId, objectKey, photo: result.data, cleanupPending: true });
        }
      }
      return res.json({ mediaId, objectKey, photo: result.data });
    }

    if (category === 'profile-photo') {
      const { data: profile, error: profileError } = await supabaseAdmin.from('profiles')
        .select('avatar_url,avatar_storage_provider').eq('id', user.id).maybeSingle();
      if (profileError) throw profileError;
      if (!profile) return res.status(404).json({ error: 'Profile not found' });
      const { error: updateError } = await supabaseAdmin.from('profiles').update({
        avatar_url: objectKey,
        avatar_storage_provider: 'r2',
      }).eq('id', user.id);
      if (updateError) throw updateError;
      referenceSaved = true;
      if (profile.avatar_storage_provider === 'r2' && profile.avatar_url && profile.avatar_url !== objectKey) {
        try {
          const taskId = await mediaCleanupService.enqueueMediaCleanup(
            'r2', mediaStorageService.R2_BUCKET_NAME, profile.avatar_url
          );
          const cleanup = await mediaCleanupService.processMediaCleanup(taskId);
          if (!cleanup.deleted) {
            return res.json({
              mediaId,
              objectKey,
              url: `/api/media/public?key=${encodeURIComponent(objectKey)}`,
              cleanupPending: true,
            });
          }
        } catch (cleanupError) {
          console.error('Unable to clean up replaced profile photo:', cleanupError);
          return res.json({
            mediaId,
            objectKey,
            url: `/api/media/public?key=${encodeURIComponent(objectKey)}`,
            cleanupPending: true,
          });
        }
      }
      return res.json({ mediaId, objectKey, url: `/api/media/public?key=${encodeURIComponent(objectKey)}` });
    }

    return res.json({ mediaId, objectKey, url: `/api/media/public?key=${encodeURIComponent(objectKey)}` });
  } catch (error) {
    if (objectKey && !referenceSaved) {
      try {
        const { exists } = await mediaStorageService.getR2ObjectMetadata(objectKey);
        if (exists) await mediaStorageService.deleteR2Object(objectKey);
      } catch (cleanupError) {
        console.error('Unable to clean up unreferenced media upload:', cleanupError);
      }
    }
    console.error('Media upload completion failed:', error);
    return res.status(error instanceof ValidationError ? 400 : 500).json({
      error: error instanceof ValidationError ? error.message : 'Unable to complete media upload',
    });
  }
});

router.delete('/media/uploads/:category/:mediaId', async (req, res) => {
  try {
    const user = await authenticatedUser(req);
    if (!user) return res.status(401).json({ error: 'Invalid or expired session' });
    const category = enumValue(req.params.category, 'category', ['listing-photo', 'profile-photo', 'update-image']);
    const mediaId = uuid(req.params.mediaId, 'media id');
    if (category === 'update-image' && !(await isUpdatePublisher(user))) {
      return res.status(403).json({ error: 'Administrator access is required to manage update images' });
    }
    const extension = text(req.query.extension, 'extension', { max: 5 });
    if (!['jpg', 'png', 'webp'].includes(extension)) return res.status(400).json({ error: 'Invalid media reference' });
    const listingId = req.query.listingId ? uuid(req.query.listingId, 'listing id') : null;
    if (category === 'listing-photo' && (!listingId || !(await ownedListing(listingId, user.id)))) {
      return res.status(403).json({ error: 'Listing access denied' });
    }
    if (category !== 'listing-photo' && listingId) return res.status(400).json({ error: 'Invalid media reference' });
    const objectKey = objectKeyFor(category, user.id, listingId, mediaId, extension);

    if (category === 'listing-photo') {
      const { data, error } = await supabaseAdmin.from('listing_photos')
        .select('media_id').eq('storage_path', objectKey).maybeSingle();
      if (error) throw error;
      if (data) return res.status(409).json({ error: 'Media is already attached to a listing' });
    } else if (category === 'profile-photo') {
      const { data, error } = await supabaseAdmin.from('profiles')
        .select('avatar_url').eq('id', user.id).maybeSingle();
      if (error) throw error;
      if (data && data.avatar_url === objectKey) return res.status(409).json({ error: 'Media is in use' });
    } else {
      const [{ data: plural, error: pluralError }, { data: singular, error: singularError }] = await Promise.all([
        supabaseAdmin.from('varoom_updates').select('id').contains('image_urls', [objectKey]).limit(1),
        supabaseAdmin.from('varoom_updates').select('id').eq('image_url', objectKey).limit(1),
      ]);
      if (pluralError) throw pluralError;
      if (singularError) throw singularError;
      if ((plural || []).length || (singular || []).length) return res.status(409).json({ error: 'Media is in use' });
    }

    await mediaStorageService.deleteR2Object(objectKey);
    return res.json({ success: true });
  } catch (error) {
    if (error instanceof ValidationError) return res.status(400).json({ error: 'Invalid media reference' });
    console.error('Media upload cleanup failed:', error);
    return res.status(500).json({ error: 'Unable to clean up media upload' });
  }
});

router.get('/media/public', async (req, res) => {
  const objectKey = typeof req.query.key === 'string' ? req.query.key : '';
  if (!mediaValidation.isPublicMediaObjectKey(objectKey)) return res.status(404).json({ error: 'Media not found' });
  try {
    const media = await mediaStorageService.getR2ObjectStream(objectKey);
    res.set('Content-Type', publicImageContentType(objectKey));
    res.set('X-Content-Type-Options', 'nosniff');
    res.set('Cache-Control', 'public, max-age=300');
    if (media.contentLength !== undefined) res.set('Content-Length', String(media.contentLength));
    media.body.on('error', (error) => {
      console.error('Public media stream failed:', error);
      if (!res.headersSent) res.status(500).end();
      else res.destroy(error);
    });
    media.body.pipe(res);
  } catch (error) {
    if (error.$metadata && error.$metadata.httpStatusCode === 404) {
      return res.status(404).json({ error: 'Media not found' });
    }
    console.error('Public media retrieval failed:', error);
    return res.status(500).json({ error: 'Unable to load media' });
  }
});

module.exports = router;
