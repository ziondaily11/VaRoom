'use strict';

const supabaseDefault = require('./supabaseClient');
const storageDefault = require('./mediaStorageService');

function publishedObjectKey(key) {
  if (key.startsWith('drafts/videos/')) return key.replace(/^drafts\/videos\//, 'videos/');
  if (key.startsWith('drafts/photos/')) {
    const parts = key.split('/');
    if (parts.length < 7) throw new Error('Invalid draft photo key');
    return `photos/${parts[2]}/listing-photos/${parts[3]}/${parts[5]}/${parts.slice(6).join('/')}`;
  }
  return null;
}

async function promoteListingMedia(listingId, {
  supabaseAdmin = supabaseDefault,
  mediaStorageService = storageDefault,
  hostId,
} = {}) {
  const { data: sessions, error: sessionsError } = await supabaseAdmin.from('draft_media_upload_sessions')
    .select('object_key,expires_at,completed_at').eq('listing_id', listingId);
  if (sessionsError) throw new Error(`Unable to verify pending photo uploads: ${sessionsError.message}`);
  const { data: photos, error: photosError } = await supabaseAdmin.from('listing_photos')
    .select('storage_path').eq('listing_id', listingId);
  if (photosError) throw new Error(`Unable to load listing photos: ${photosError.message}`);
  const attachedPhotoKeys = new Set((photos || []).map((photo) => photo.storage_path));
  if ((sessions || []).some((session) => new Date(session.expires_at).getTime() > Date.now()
    && (!session.completed_at || !attachedPhotoKeys.has(session.object_key)))) {
    throw new Error('Listing media upload is still in progress');
  }

  const { data: media, error: mediaError } = await supabaseAdmin.from('property_media')
    .select('id,host_id,storage_key,thumbnail_key,status')
    .eq('property_id', listingId).eq('storage_provider', 'r2').is('deleted_at', null);
  if (mediaError) throw new Error(`Unable to load listing media: ${mediaError.message}`);

  for (const item of media || []) {
    if (item.status !== 'ready') throw new Error('Listing media is not ready for publication');
    const changes = {};
    for (const field of ['storage_key', 'thumbnail_key']) {
      const sourceKey = item[field];
      if (!sourceKey) continue;
      const destinationKey = publishedObjectKey(sourceKey);
      if (!destinationKey) continue;
      await retainPromotionSource(supabaseAdmin, sourceKey, listingId, item.host_id);
      await mediaStorageService.copyR2Object(sourceKey, destinationKey);
      changes[field] = destinationKey;
    }
    if (!Object.keys(changes).length) continue;
    const { data: changed, error: updateError } = await supabaseAdmin.from('property_media')
      .update(changes).eq('id', item.id).eq('property_id', listingId).eq('status', 'ready')
      .select('id').maybeSingle();
    if (updateError || !changed) throw new Error(`Unable to update promoted video media: ${updateError?.message || 'media state changed'}`);
  }

  for (const photo of photos || []) {
    const sourceKey = photo.storage_path;
    if (!sourceKey || !sourceKey.startsWith('drafts/photos/')) continue;
    const destinationKey = publishedObjectKey(sourceKey);
    await retainPromotionSource(supabaseAdmin, sourceKey, listingId, hostId);
    await mediaStorageService.copyR2Object(sourceKey, destinationKey);
    const { data: updated, error: updateError } = await supabaseAdmin.from('listing_photos')
      .update({ storage_path: destinationKey })
      .eq('listing_id', listingId).eq('storage_path', sourceKey)
      .select('storage_path').maybeSingle();
    if (updateError || !updated) throw new Error(`Unable to update promoted photo: ${updateError?.message || 'photo state changed'}`);
  }
}

async function retainPromotionSource(supabaseAdmin, sourceKey, listingId, hostId) {
  const { error } = await supabaseAdmin.from('draft_media_upload_sessions').upsert({
    object_key: sourceKey,
    listing_id: listingId,
    host_id: hostId,
    expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
    completed_at: new Date().toISOString(),
  });
  if (error) throw new Error(`Unable to schedule safe promotion source cleanup: ${error.message}`);
}

module.exports = { promoteListingMedia, publishedObjectKey };
