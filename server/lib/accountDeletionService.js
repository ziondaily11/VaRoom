const supabaseAdmin = require('./supabaseClient');
const mediaStorageService = require('./mediaStorageService');

function unique(values) {
  return [...new Set((values || []).filter(Boolean))];
}

function storagePath(value, bucket) {
  if (!value) return null;
  const path = String(value);
  const marker = `/object/public/${bucket}/`;
  return path.includes(marker) ? path.split(marker)[1] : path;
}

async function deleteSupabaseObjects(objects) {
  const grouped = new Map();
  for (const object of objects) {
    if (!object.bucket || !object.key) continue;
    const keys = grouped.get(object.bucket) || [];
    keys.push(object.key);
    grouped.set(object.bucket, keys);
  }

  for (const [bucket, keys] of grouped) {
    const { error } = await supabaseAdmin.storage.from(bucket).remove(unique(keys));
    if (error) throw new Error(`Unable to remove objects from ${bucket}: ${error.message}`);
  }
}

async function deleteR2Objects(keys) {
  for (const key of unique(keys)) {
    await mediaStorageService.deleteR2Object(key);
  }
}

async function collectOwnedStorage(userId) {
  const [{ data: profile, error: profileError }, { data: listings, error: listingsError }] = await Promise.all([
    supabaseAdmin.from('profiles').select('avatar_url').eq('id', userId).maybeSingle(),
    supabaseAdmin.from('listings').select('id').eq('host_id', userId),
  ]);
  if (profileError) throw new Error(`Unable to load profile media: ${profileError.message}`);
  if (listingsError) throw new Error(`Unable to load listings: ${listingsError.message}`);

  const listingIds = (listings || []).map((listing) => listing.id);
  const { data: conversations, error: conversationsError } = await supabaseAdmin
    .from('conversations')
    .select('id')
    .or(`host_id.eq.${userId},client_id.eq.${userId}`);
  if (conversationsError) throw new Error(`Unable to load conversations: ${conversationsError.message}`);
  const conversationIds = (conversations || []).map((conversation) => conversation.id);
  const [{ data: propertyMedia, error: mediaError }, { data: photos, error: photosError }, { data: attachments, error: attachmentsError }] = await Promise.all([
    supabaseAdmin.from('property_media').select('storage_provider,storage_bucket,storage_key,thumbnail_key').or(`host_id.eq.${userId},property_id.in.(${listingIds.join(',') || '00000000-0000-0000-0000-000000000000'})`),
    listingIds.length
      ? supabaseAdmin.from('listing_photos').select('storage_path').in('listing_id', listingIds)
      : Promise.resolve({ data: [], error: null }),
    conversationIds.length
      ? supabaseAdmin.from('message_attachments').select('storage_provider,storage_bucket,storage_key,source_storage_key,thumbnail_key').or(`uploader_id.eq.${userId},conversation_id.in.(${conversationIds.join(',')})`)
      : supabaseAdmin.from('message_attachments').select('storage_provider,storage_bucket,storage_key,source_storage_key,thumbnail_key').eq('uploader_id', userId),
  ]);
  if (mediaError) throw new Error(`Unable to load property media: ${mediaError.message}`);
  if (photosError) throw new Error(`Unable to load listing photos: ${photosError.message}`);
  if (attachmentsError) throw new Error(`Unable to load chat attachments: ${attachmentsError.message}`);

  const supabaseObjects = [];
  const r2Keys = [];
  if (profile && profile.avatar_url) {
    const avatarPath = storagePath(profile.avatar_url, 'avatars');
    if (avatarPath) supabaseObjects.push({ bucket: 'avatars', key: avatarPath });
  }
  for (const photo of photos || []) {
    if (photo.storage_path) supabaseObjects.push({ bucket: 'listing-photos', key: photo.storage_path });
  }
  for (const media of propertyMedia || []) {
    if (media.storage_provider === 'r2') {
      r2Keys.push(media.storage_key, media.thumbnail_key);
    } else {
      supabaseObjects.push({ bucket: media.storage_bucket, key: media.storage_key });
      if (media.thumbnail_key) supabaseObjects.push({ bucket: media.storage_bucket, key: media.thumbnail_key });
    }
  }
  for (const attachment of attachments || []) {
    if (attachment.storage_provider === 'r2') r2Keys.push(attachment.storage_key, attachment.source_storage_key, attachment.thumbnail_key);
    else {
      supabaseObjects.push({ bucket: attachment.storage_bucket, key: attachment.storage_key });
      if (attachment.source_storage_key) supabaseObjects.push({ bucket: attachment.storage_bucket, key: attachment.source_storage_key });
      if (attachment.thumbnail_key) supabaseObjects.push({ bucket: attachment.storage_bucket, key: attachment.thumbnail_key });
    }
  }
  return { supabaseObjects, r2Keys };
}

async function permanentlyDeleteAccount(userId) {
  const storage = await collectOwnedStorage(userId);
  await deleteSupabaseObjects(storage.supabaseObjects);
  await deleteR2Objects(storage.r2Keys);

  const { error: dataError } = await supabaseAdmin.rpc('varoom_delete_user_data', { p_user_id: userId });
  if (dataError) throw new Error(`Unable to delete account data: ${dataError.message}`);

  const { error: authError } = await supabaseAdmin.auth.admin.deleteUser(userId);
  if (authError) throw new Error(`Unable to delete authentication identity: ${authError.message}`);
}

module.exports = { permanentlyDeleteAccount };
