require('dotenv').config();
const supabase = require('../lib/supabaseClient');
const mediaStorage = require('../lib/mediaStorageService');

function isR2Key(value, prefix) {
  return typeof value === 'string' && value.startsWith(`${prefix}/`);
}

function isLegacySupabaseUrl(value, bucket) {
  return typeof value === 'string'
    && value.includes(`/storage/v1/object/`)
    && value.includes(`/${bucket}/`);
}

async function fetchRows(table, select) {
  const { data, error } = await supabase.from(table).select(select);
  if (error) throw new Error(`Unable to read ${table}: ${error.message}`);
  return data || [];
}

async function main() {
  const issues = {
    legacy: [],
    missing: [],
    invalid: [],
    duplicates: [],
    orphaned: [],
    cleanupPending: [],
  };
  const deferred = [];
  const references = new Map();
  const notYetRequired = new Set();
  const register = (key, source) => {
    if (!key || typeof key !== 'string') {
      issues.invalid.push(`${source}: missing object key`);
      return;
    }
    const entries = references.get(key) || [];
    entries.push(source);
    references.set(key, entries);
  };
  const [
    photos,
    profiles,
    updates,
    propertyMedia,
    attachments,
    cleanupQueue,
  ] = await Promise.all([
    fetchRows('listing_photos', 'media_id,listing_id,storage_path,storage_provider,storage_bucket'),
    fetchRows('profiles', 'id,avatar_url,avatar_storage_provider'),
    fetchRows('varoom_updates', 'id,image_url,image_urls'),
    fetchRows('property_media', 'id,property_id,media_type,storage_provider,storage_bucket,storage_key,thumbnail_key,status,deleted_at'),
    fetchRows('message_attachments', 'id,storage_provider,storage_bucket,storage_key,source_storage_key,thumbnail_key,status'),
    fetchRows('media_cleanup_queue', 'id,storage_provider,storage_bucket,storage_key,attempts,last_error'),
  ]);
  const cleanupKeys = new Set((cleanupQueue || []).map((task) => task.storage_key));
  for (const task of cleanupQueue || []) {
    issues.cleanupPending.push(`${task.id}: ${task.storage_provider}/${task.storage_bucket}/${task.storage_key}`);
  }

  for (const photo of photos) {
    const source = `listing_photos:${photo.media_id}`;
    if (photo.storage_provider !== 'r2') {
      issues.legacy.push(source);
      continue;
    }
    if (!isR2Key(photo.storage_path, 'listing-photos')) issues.invalid.push(source);
    else register(photo.storage_path, source);
    if (photo.storage_bucket && photo.storage_bucket !== mediaStorage.R2_BUCKET_NAME) {
      issues.invalid.push(`${source}: bucket does not match configured R2 bucket`);
    }
  }

  for (const profile of profiles) {
    if (!profile.avatar_url) continue;
    if (/^https?:\/\//i.test(profile.avatar_url) && !isLegacySupabaseUrl(profile.avatar_url, 'avatars')) continue;
    const source = `profiles:${profile.id}:avatar`;
    if (profile.avatar_storage_provider !== 'r2') {
      issues.legacy.push(source);
      continue;
    }
    if (!isR2Key(profile.avatar_url, 'avatars')) issues.invalid.push(source);
    else register(profile.avatar_url, source);
  }

  for (const update of updates) {
    const values = [
      ...(Array.isArray(update.image_urls) ? update.image_urls : []),
      update.image_url,
    ].filter((value, index, all) => value && all.indexOf(value) === index);
    for (let index = 0; index < values.length; index += 1) {
      const value = values[index];
      const source = `varoom_updates:${update.id}:image:${index}`;
      if (isLegacySupabaseUrl(value, 'update-images')) {
        issues.legacy.push(source);
      } else if (typeof value === 'string' && value.startsWith('updates/')) {
          if (!/^updates\/[a-z0-9_-]+\/(?:[a-f0-9-]{36}\/[a-f0-9-]{36}|migrated\/[a-z0-9_-]{1,128}\/\d+)\.(?:jpg|jpeg|png|webp|gif|avif)$/i.test(value)) {
            issues.invalid.push(source);
          } else register(value, source);
        }
    }
  }

  for (const media of propertyMedia) {
    if (media.deleted_at) continue;
    const source = `property_media:${media.id}`;
    if (media.storage_provider !== 'r2') {
      issues.legacy.push(source);
      continue;
    }
    const expectedPrefix = media.media_type === 'video' ? 'videos/' : 'listing-photos/';
    if (!isR2Key(media.storage_key, expectedPrefix.slice(0, -1))) {
      issues.invalid.push(source);
      continue;
    }
    register(media.storage_key, source);
    if (media.status !== 'ready' && media.status !== 'processing') {
      notYetRequired.add(media.storage_key);
      deferred.push(`${source}: status=${media.status}`);
    }
    if (media.thumbnail_key) register(media.thumbnail_key, `${source}:thumbnail`);
    if (media.storage_bucket && media.storage_bucket !== mediaStorage.R2_BUCKET_NAME) {
      issues.invalid.push(`${source}: bucket does not match configured R2 bucket`);
    }
  }

  for (const attachment of attachments) {
    if (attachment.status === 'deleted') continue;
    const source = `message_attachments:${attachment.id}`;
    if (attachment.storage_provider !== 'r2') {
      issues.legacy.push(source);
      continue;
    }
    if (!isR2Key(attachment.storage_key, 'chat-attachments')) issues.invalid.push(source);
    register(attachment.storage_key, source);
    if (attachment.source_storage_key) register(attachment.source_storage_key, `${source}:source`);
    if (attachment.thumbnail_key) register(attachment.thumbnail_key, `${source}:thumbnail`);
    if (attachment.status !== 'ready' && attachment.status !== 'processing') {
      notYetRequired.add(attachment.storage_key);
      deferred.push(`${source}: status=${attachment.status}`);
    }
    if (attachment.storage_bucket && attachment.storage_bucket !== mediaStorage.R2_BUCKET_NAME) {
      issues.invalid.push(`${source}: bucket does not match configured R2 bucket`);
    }
  }

  for (const [key, sources] of references) {
    if (sources.length > 1) issues.duplicates.push(`${key}: ${sources.join(', ')}`);
  }

  const prefixes = ['listing-photos/', 'avatars/', 'updates/', 'videos/', 'chat-attachments/'];
  const objectKeys = new Set();
  for (const prefix of prefixes) {
    const objects = await mediaStorage.listR2Objects(prefix);
    for (const object of objects) objectKeys.add(object.key);
  }
  for (const key of references.keys()) {
    if (!objectKeys.has(key) && !notYetRequired.has(key)) issues.missing.push(key);
  }
  for (const key of objectKeys) {
    if (/^(?:listing-photos|avatars|updates|videos|chat-attachments)\//.test(key)
      && !references.has(key)
      && !cleanupKeys.has(key)) {
      issues.orphaned.push(key);
    }
  }

  console.log('VaRoom media verification');
  console.log(`Listing photos: ${photos.length}`);
  console.log(`Profile avatars: ${profiles.filter((profile) => profile.avatar_url).length}`);
  console.log(`Update posts: ${updates.length}`);
  console.log(`Property media: ${propertyMedia.filter((media) => !media.deleted_at).length}`);
  console.log(`Chat attachments: ${attachments.filter((item) => item.status !== 'deleted').length}`);
  console.log(`Expected R2 objects: ${references.size}`);
  console.log(`Pending media cleanup tasks: ${cleanupQueue.length}`);
  console.log(`Deferred lifecycle records: ${deferred.length}`);
  for (const value of deferred) console.log(`- ${value}`);
  for (const [name, values] of Object.entries(issues)) {
    console.log(`${name}: ${values.length}`);
    for (const value of values) console.log(`- ${value}`);
  }

  if (Object.values(issues).some((values) => values.length)) process.exitCode = 1;
}

main().catch((error) => {
  console.error('Media verification stopped:', error.message);
  process.exitCode = 1;
});
