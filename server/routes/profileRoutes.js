const express = require('express');
const supabaseAdmin = require('../lib/supabaseClient');
const mediaStorageService = require('../lib/mediaStorageService');
const { isNewR2PhotoObjectKey } = require('../lib/photoStorageKeys');
const { rejectSuspendedActivity } = require('../lib/accountAccess');

const router = express.Router();
const BANNER_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const MAX_BANNER_BYTES = 15 * 1024 * 1024;

async function authenticatedUser(req) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return null;
  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
  return error ? null : user;
}

router.put('/profile/banner', async (req, res) => {
  const user = await authenticatedUser(req);
  if (!user) return res.status(401).json({ error: 'Invalid or expired session' });
  if (await rejectSuspendedActivity(res, user.id)) return;
  const { key } = req.body || {};
  if (!isNewR2PhotoObjectKey('profile-banners', key, mediaStorageService.ENVIRONMENT)
    || !key.startsWith(`photos/${mediaStorageService.ENVIRONMENT}/profile-banners/${user.id}/`)) {
    return res.status(400).json({ error: 'Invalid banner object key' });
  }
  try {
    const { data: profile, error: profileError } = await supabaseAdmin.from('profiles')
      .select('id,role,banner_image_key').eq('id', user.id).maybeSingle();
    if (profileError) throw profileError;
    if (!profile || profile.role !== 'host') return res.status(403).json({ error: 'Only hosts can manage profile banners' });
    if (!(await mediaStorageService.verifyR2ObjectExists(key))) return res.status(400).json({ error: 'Uploaded banner was not found' });
    const metadata = await mediaStorageService.getR2ObjectMetadata(key);
    if (!BANNER_TYPES.has(String(metadata.contentType || '').toLowerCase()) || metadata.contentLength < 1 || metadata.contentLength > MAX_BANNER_BYTES) {
      return res.status(400).json({ error: 'Banner must be a supported image under 15 MB' });
    }
    const { error: updateError } = await supabaseAdmin.from('profiles').update({ banner_image_key: key }).eq('id', user.id);
    if (updateError) throw updateError;
    return res.json({ key, previousKey: profile.banner_image_key || null });
  } catch (error) {
    console.error('Profile banner save failed:', error);
    return res.status(500).json({ error: 'Unable to save profile banner' });
  }
});

router.delete('/profile/banner', async (req, res) => {
  const user = await authenticatedUser(req);
  if (!user) return res.status(401).json({ error: 'Invalid or expired session' });
  if (await rejectSuspendedActivity(res, user.id)) return;
  try {
    const { data: profile, error: profileError } = await supabaseAdmin.from('profiles')
      .select('id,role,banner_image_key').eq('id', user.id).maybeSingle();
    if (profileError) throw profileError;
    if (!profile || profile.role !== 'host') return res.status(403).json({ error: 'Only hosts can manage profile banners' });
    const { error: updateError } = await supabaseAdmin.from('profiles').update({ banner_image_key: null }).eq('id', user.id);
    if (updateError) throw updateError;
    return res.json({ previousKey: profile.banner_image_key || null });
  } catch (error) {
    console.error('Profile banner removal failed:', error);
    return res.status(500).json({ error: 'Unable to remove profile banner' });
  }
});

module.exports = router;
