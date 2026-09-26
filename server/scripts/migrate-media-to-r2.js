require('dotenv').config();
const supabase = require('../lib/supabaseClient');
const mediaStorage = require('../lib/mediaStorageService');
const crypto = require('crypto');

const ALLOWED_EXTENSIONS = new Set([
  'jpg', 'jpeg', 'png', 'webp', 'gif', 'avif',
  'mp4', 'mov', 'webm', 'm4v', 'mpeg', 'mpg',
]);
const APPLY = process.argv.includes('--apply');
const LIMIT_ARGUMENT = process.argv.find((argument) => argument.startsWith('--limit='));
const LIMIT = LIMIT_ARGUMENT ? Number(LIMIT_ARGUMENT.slice('--limit='.length)) : Infinity;

function getExtension(value, mimeType) {
  const path = String(value || '').split('?')[0];
  const match = path.match(/\.([a-z0-9]+)$/i);
  let extension = match ? match[1].toLowerCase() : '';
  if (!extension && mimeType) {
    extension = ({
      'image/jpeg': 'jpg',
      'image/png': 'png',
      'image/webp': 'webp',
      'image/gif': 'gif',
      'image/avif': 'avif',
    })[mimeType.toLowerCase()] || '';
  }
  if (extension === 'jpeg') extension = 'jpg';
  if (!ALLOWED_EXTENSIONS.has(extension)) throw new Error('Unsupported image extension');
  return extension;
}

function legacyObjectPath(value, bucket) {
  if (typeof value !== 'string' || !value) throw new Error('Missing legacy storage reference');
  if (!/^https?:\/\//i.test(value)) return value.replace(/^\/+/, '');
  let pathname;
  try {
    pathname = new URL(value).pathname;
  } catch {
    throw new Error('Invalid legacy media URL');
  }
  const marker = `/storage/v1/object/public/${bucket}/`;
  const signedMarker = `/storage/v1/object/sign/${bucket}/`;
  const start = pathname.includes(marker) ? marker : pathname.includes(signedMarker) ? signedMarker : null;
  if (!start) throw new Error(`URL is not a Supabase ${bucket} object`);
  return decodeURIComponent(pathname.slice(pathname.indexOf(start) + start.length));
}

async function readLegacyObject(bucket, reference) {
  const key = legacyObjectPath(reference, bucket);
  const { data, error } = await supabase.storage.from(bucket).download(key);
  if (error) throw new Error(`Unable to read ${bucket}/${key}: ${error.message}`);
  return {
    key,
    body: Buffer.from(await data.arrayBuffer()),
    contentType: data.type || null,
  };
}

async function migrateObject({ bucket, reference, objectKey, contentType, updateReference }) {
  const source = await readLegacyObject(bucket, reference);
  const mediaType = contentType || source.contentType || 'application/octet-stream';
  const current = await mediaStorage.getR2ObjectMetadata(objectKey);
  if (!current.exists || current.contentLength !== source.body.length
    || current.contentType !== mediaType) {
    await mediaStorage.uploadR2Object(objectKey, source.body, mediaType);
  }
  const verified = await mediaStorage.getR2ObjectMetadata(objectKey);
  if (!verified.exists || verified.contentLength !== source.body.length
    || verified.contentType !== mediaType) {
    throw new Error('R2 copy verification failed');
  }
  await updateReference({
    objectKey,
    fileSize: source.body.length,
    contentType: mediaType,
    legacyKey: source.key,
  });
}

async function fetchRows(table, select) {
  const { data, error } = await supabase.from(table).select(select);
  if (error) throw new Error(`Unable to read ${table}: ${error.message}`);
  return data || [];
}

async function runCategory(name, records, migrateRecord) {
  const alreadyOnR2 = records.filter((record) => record.alreadyOnR2);
  const candidates = records.filter((record) => !record.alreadyOnR2);
  const rows = Number.isFinite(LIMIT) ? candidates.slice(0, LIMIT) : candidates;
  const result = {
    total: records.length,
    migrated: 0,
    alreadyOnR2: alreadyOnR2.length,
    skipped: candidates.length - rows.length,
    failed: 0,
  };
  for (const record of alreadyOnR2) {
    console.log(`[${name}] already on R2: ${record.id}`);
  }
  for (let index = 0; index < rows.length; index += 1) {
    const record = rows[index];
    if (!APPLY) {
      result.skipped += 1;
      console.log(`[${name}] ${index + 1}/${rows.length} would migrate: ${record.id}`);
      continue;
    }
    try {
      await migrateRecord(record);
      result.migrated += 1;
      console.log(`[${name}] ${index + 1}/${rows.length} migrated: ${record.id}`);
    } catch (error) {
      result.failed += 1;
      console.error(`[${name}] ${index + 1}/${rows.length} failed: ${record.id}: ${error.message}`);
    }
  }
  return result;
}

async function migrateListingPhotos() {
  const records = await fetchRows('listing_photos',
    'media_id,listing_id,storage_path,storage_provider,storage_bucket,mime_type,file_size_bytes');
  return runCategory('listing_photos', records.map((photo) => ({
    ...photo,
    id: photo.media_id,
    alreadyOnR2: photo.storage_provider === 'r2',
  })), async (photo) => {
    if (!photo.id || !photo.listing_id) throw new Error('Listing photo is missing its ID or listing association');
    const extension = getExtension(photo.storage_path, photo.mime_type);
    const objectKey = mediaStorage.generateListingPhotoObjectKey(photo.listing_id, photo.id, extension);
    await migrateObject({
      bucket: photo.storage_bucket || 'listing-photos',
      reference: photo.storage_path,
      objectKey,
      contentType: photo.mime_type,
      updateReference: async ({ objectKey: newKey, contentType, fileSize }) => {
        const { error } = await supabase.from('listing_photos').update({
          storage_path: newKey,
          storage_provider: 'r2',
          storage_bucket: mediaStorage.R2_BUCKET_NAME,
          mime_type: contentType,
          file_size_bytes: fileSize,
        }).eq('media_id', photo.id);
        if (error) throw new Error(`Unable to update listing photo reference: ${error.message}`);
      },
    });
  });
}

async function migratePropertyMedia() {
  const records = await fetchRows('property_media',
    'id,property_id,host_id,media_type,storage_provider,storage_bucket,storage_key,thumbnail_key,mime_type,file_size_bytes,original_filename,deleted_at');
  const active = records.filter((record) => !record.deleted_at && record.storage_key);
  return runCategory('property_media', active.map((record) => ({
    ...record,
    alreadyOnR2: record.storage_provider === 'r2',
  })), async (media) => {
    const extension = getExtension(media.original_filename || media.storage_key, media.mime_type);
    const originalKey = media.media_type === 'video'
      ? mediaStorage.generateR2ObjectKey(media.host_id, media.property_id, media.id, extension)
      : mediaStorage.generatePropertyImageObjectKey(media.property_id, media.id, extension);
    let newThumbnailKey = media.thumbnail_key;
    if (media.thumbnail_key) {
      const thumbnailExtension = getExtension(media.thumbnail_key, 'image/jpeg');
      newThumbnailKey = media.media_type === 'video'
        ? originalKey.replace(/\/original\.[^/.]+$/i, `/thumbnail.${thumbnailExtension}`)
        : mediaStorage.generatePropertyImageThumbnailObjectKey(
          media.property_id, media.id, thumbnailExtension
        );
      await migrateObject({
        bucket: media.storage_bucket,
        reference: media.thumbnail_key,
        objectKey: newThumbnailKey,
      });
    }
    await migrateObject({
      bucket: media.storage_bucket,
      reference: media.storage_key,
      objectKey: originalKey,
      contentType: media.mime_type,
      updateReference: async ({ objectKey, contentType, fileSize }) => {
        const { error } = await supabase.from('property_media').update({
          storage_provider: 'r2',
          storage_bucket: mediaStorage.R2_BUCKET_NAME,
          storage_key: objectKey,
          thumbnail_key: newThumbnailKey,
          mime_type: contentType,
          file_size_bytes: fileSize,
        }).eq('id', media.id);
        if (error) throw new Error(`Unable to update property media reference: ${error.message}`);
      },
    });
  });
}

async function migrateAvatars() {
  const records = await fetchRows('profiles', 'id,avatar_url,avatar_storage_provider');
  const avatars = records.filter((profile) => profile.avatar_url);
  const managedAvatars = avatars.filter((profile) => !/^https?:\/\//i.test(profile.avatar_url)
    || profile.avatar_url.includes('/storage/v1/object/'));
  const result = await runCategory('profile_avatars', managedAvatars.map((profile) => ({
    ...profile,
    alreadyOnR2: profile.avatar_storage_provider === 'r2'
      || String(profile.avatar_url).startsWith(`avatars/${mediaStorage.ENVIRONMENT}/`),
  })), async (profile) => {
    if (/^https?:\/\//i.test(profile.avatar_url)
      && !profile.avatar_url.includes('/storage/v1/object/')) {
      throw new Error('External profile image is not a VaRoom-managed storage object');
    }
    const extension = getExtension(profile.avatar_url);
    const digest = crypto.createHash('sha256')
      .update(`${profile.id}:${profile.avatar_url}`).digest('hex').slice(0, 32);
    const mediaId = `${digest.slice(0, 8)}-${digest.slice(8, 12)}-${digest.slice(12, 16)}-${digest.slice(16, 20)}-${digest.slice(20)}`;
    const objectKey = mediaStorage.generateProfilePhotoObjectKey(profile.id, mediaId, extension);
    await migrateObject({
      bucket: 'avatars',
      reference: profile.avatar_url,
      objectKey,
      updateReference: async ({ objectKey: newKey }) => {
        const { error } = await supabase.from('profiles').update({
          avatar_url: newKey,
          avatar_storage_provider: 'r2',
        }).eq('id', profile.id);
        if (error) throw new Error(`Unable to update avatar reference: ${error.message}`);
      },
    });
  });
  result.skipped += avatars.length - managedAvatars.length;
  return result;
}

function isLegacyUpdateImage(value) {
  return typeof value === 'string'
    && (value.includes('/storage/v1/object/public/update-images/')
      || value.includes('/storage/v1/object/sign/update-images/')
      || (!/^https?:\/\//i.test(value) && !value.startsWith('updates/')));
}

async function migrateUpdates() {
  const records = await fetchRows('varoom_updates', 'id,image_url,image_urls');
  const updates = records.filter((record) => isLegacyUpdateImage(record.image_url)
    || (Array.isArray(record.image_urls) && record.image_urls.some(isLegacyUpdateImage)));
  return runCategory('varoom_updates', updates.map((record) => ({ ...record, alreadyOnR2: false })),
    async (record) => {
      const oldImages = Array.isArray(record.image_urls) && record.image_urls.length
        ? record.image_urls
        : record.image_url ? [record.image_url] : [];
      const newImages = [...oldImages];
      const singleImageRequiresSeparateMigration = record.image_url
        && isLegacyUpdateImage(record.image_url)
        && !oldImages.includes(record.image_url);
      let changed = false;
      for (let index = 0; index < oldImages.length; index += 1) {
        const image = oldImages[index];
        if (!isLegacyUpdateImage(image)) continue;
        const extension = getExtension(image);
        const objectKey = mediaStorage.generateMigratedUpdateImageObjectKey(record.id, index, extension);
        await migrateObject({
          bucket: 'update-images',
          reference: image,
          objectKey,
          updateReference: async () => {},
        });
        newImages[index] = objectKey;
        changed = true;
      }
      if (!changed && !singleImageRequiresSeparateMigration) return;
      const updateValues = {};
      if (Array.isArray(record.image_urls)) updateValues.image_urls = newImages;
      if (record.image_url && isLegacyUpdateImage(record.image_url)) {
        const imageIndex = oldImages.indexOf(record.image_url);
        if (imageIndex >= 0) updateValues.image_url = newImages[imageIndex];
        else {
          const extension = getExtension(record.image_url);
          const objectKey = mediaStorage.generateMigratedUpdateImageObjectKey(
            record.id, oldImages.length, extension
          );
          await migrateObject({
            bucket: 'update-images',
            reference: record.image_url,
            objectKey,
            updateReference: async () => {},
          });
          updateValues.image_url = objectKey;
        }
      }
      const { error } = await supabase.from('varoom_updates').update(updateValues).eq('id', record.id);
      if (error) throw new Error(`Unable to update post image references: ${error.message}`);
    });
}

async function main() {
  if (LIMIT_ARGUMENT && (!Number.isInteger(LIMIT) || LIMIT < 1)) {
    throw new Error('--limit must be a positive integer');
  }
  console.log(`VaRoom media migration${APPLY ? '' : ' (dry run)'}${Number.isFinite(LIMIT) ? `; limit ${LIMIT}` : ''}`);
  const results = {
    listing_photos: await migrateListingPhotos(),
    property_media: await migratePropertyMedia(),
    profile_avatars: await migrateAvatars(),
    varoom_updates: await migrateUpdates(),
  };
  console.log('\nMigration summary');
  for (const [category, result] of Object.entries(results)) {
    console.log(`${category}: total=${result.total} migrated=${result.migrated} alreadyOnR2=${result.alreadyOnR2} skipped=${result.skipped} failed=${result.failed}`);
  }
  if (Object.values(results).some((result) => result.failed > 0)) process.exitCode = 1;
  if (!APPLY) console.log('\nDry run only. Pass --apply to copy media and update database references.');
}

main().catch((error) => {
  console.error('Media migration stopped:', error.message);
  process.exitCode = 1;
});
