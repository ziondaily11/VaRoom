const express = require('express');
const { v4: uuidv4 } = require('uuid');
const supabaseAdmin = require('../lib/supabaseClient');
const mediaStorageService = require('../lib/mediaStorageService');
const mediaOptimizationService = require('../lib/mediaOptimizationService');
const { isNewR2PhotoObjectKey, isR2PhotoObjectKey } = require('../lib/photoStorageKeys');
const { ValidationError, assertAllowedKeys, text, number, enumValue } = require('../lib/inputValidation');
const { rejectSuspendedActivity } = require('../lib/accountAccess');

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

    const { category, filename, mimeType, fileSize } = req.body || {};
    try {
      assertAllowedKeys(req.body, ['category', 'filename', 'mimeType', 'fileSize']);
      enumValue(category, 'category', [...PHOTO_CATEGORIES]);
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

    const key = mediaStorageService.generatePhotoObjectKey(user.id, category, uuidv4(), extension);
    const upload = await mediaStorageService.generateR2UploadAuthorization(key, mimeType, MAX_PHOTO_SIZE);
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
    const { category, key } = req.body || {};
    if (category === 'profile-banners' && !(await requireHost(user.id, res))) return;
    const ownerPrefix = `photos/${mediaStorageService.ENVIRONMENT}/${category}/${user.id}/`;
    if (!PHOTO_CATEGORIES.has(category)
      || !isNewR2PhotoObjectKey(category, key, mediaStorageService.ENVIRONMENT)
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
    const { category, key } = req.body || {};
    const ownerPrefix = `photos/${mediaStorageService.ENVIRONMENT}/${category}/${user.id}/`;
    if (!PHOTO_CATEGORIES.has(category)
      || !isNewR2PhotoObjectKey(category, key, mediaStorageService.ENVIRONMENT)
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

// Images were already public in Supabase Storage. Keep that behaviour while
// R2 itself remains private: this endpoint only signs keys in public photo
// namespaces and redirects to a short-lived R2 URL.
router.get('/photos/:category/*', async (req, res) => {
  try {
    const category = req.params.category;
    const key = req.params[0] ? decodeURIComponent(req.params[0]) : '';
    if (!PHOTO_CATEGORIES.has(category)
      || !isR2PhotoObjectKey(category, key, mediaStorageService.ENVIRONMENT)) return res.sendStatus(404);
    const download = await mediaStorageService.generateR2DownloadAuthorization(key, undefined, 60 * 60);
    res.set('Cache-Control', 'public, max-age=300');
    return res.redirect(302, download.url);
  } catch (error) {
    console.error('Photo download authorization failed:', error);
    return res.sendStatus(404);
  }
});

module.exports = router;
