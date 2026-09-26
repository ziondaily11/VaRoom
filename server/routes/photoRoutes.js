const express = require('express');
const { v4: uuidv4 } = require('uuid');
const supabaseAdmin = require('../lib/supabaseClient');
const mediaStorageService = require('../lib/mediaStorageService');
const { ValidationError, assertAllowedKeys, text, number, enumValue } = require('../lib/inputValidation');
const { rejectSuspendedActivity } = require('../lib/accountAccess');

const router = express.Router();
const PHOTO_CATEGORIES = new Set(['listing-photos', 'avatars', 'update-images']);
const PHOTO_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const MAX_PHOTO_SIZE = 15 * 1024 * 1024;

async function authenticatedUser(req) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return null;
  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
  return error ? null : user;
}

function extensionOf(filename, mimeType) {
  const extension = String(filename || '').toLowerCase().match(/\.([a-z0-9]{1,12})$/)?.[1];
  if (extension) return extension;
  return { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' }[mimeType];
}

function isPhotoKey(category, key) {
  return typeof key === 'string'
    && key.startsWith(`photos/${mediaStorageService.ENVIRONMENT}/${category}/`)
    && !key.includes('..');
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
    if (!PHOTO_CATEGORIES.has(category) || !isPhotoKey(category, key) || !key.includes(`/${user.id}/`)) {
      return res.status(400).json({ error: 'Invalid photo key' });
    }
    if (!(await mediaStorageService.verifyR2ObjectExists(key))) {
      return res.status(400).json({ error: 'Uploaded photo was not found in R2' });
    }
    return res.json({ key, publicUrl: `/api/photos/${encodeURIComponent(category)}/${key.split('/').map(encodeURIComponent).join('/')}` });
  } catch (error) {
    console.error('Photo upload completion failed:', error);
    return res.status(500).json({ error: 'Unable to finalize photo upload' });
  }
});

// Images were already public in Supabase Storage. Keep that behaviour while
// R2 itself remains private: this endpoint only signs keys in public photo
// namespaces and redirects to a short-lived R2 URL.
router.get('/photos/:category/*', async (req, res) => {
  try {
    const category = req.params.category;
    const key = req.params[0] ? decodeURIComponent(req.params[0]) : '';
    if (!PHOTO_CATEGORIES.has(category) || !isPhotoKey(category, key)) return res.sendStatus(404);
    const download = await mediaStorageService.generateR2DownloadAuthorization(key, undefined, 60 * 60);
    res.set('Cache-Control', 'public, max-age=300');
    return res.redirect(302, download.url);
  } catch (error) {
    console.error('Photo download authorization failed:', error);
    return res.sendStatus(404);
  }
});

module.exports = router;
