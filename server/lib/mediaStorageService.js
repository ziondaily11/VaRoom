/**
 * MediaStorageService
 *
 * Centralizes media storage operations in Cloudflare R2.
 * Centralizes credentials, URL generation, and provider-specific logic.
 *
 * R2 is S3-compatible, so we use the AWS SDK v3 to properly sign every
 * request (uploads, playback, existence checks, deletes). Cloudflare R2
 * rejects unsigned requests on private buckets, which is why the previous
 * version of this file (plain fetch calls, unsigned URLs) never worked.
 *
 * Install first:
 *   npm install @aws-sdk/client-s3 @aws-sdk/s3-request-presigner
 */

require('dotenv').config();
const {
  S3Client,
  PutObjectCommand,
  HeadObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
} = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID;
const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME;
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;
const configuredR2Endpoint = process.env.R2_ENDPOINT;
const R2_ENDPOINT = R2_ACCOUNT_ID
  ? `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`
  : configuredR2Endpoint;
const ENVIRONMENT = (process.env.NODE_ENV || 'development').replace(/[^a-z0-9_-]/gi, '-');

const R2_CONFIGURED = Boolean(
  R2_ACCOUNT_ID && R2_BUCKET_NAME && R2_ACCESS_KEY_ID && R2_SECRET_ACCESS_KEY && R2_ENDPOINT
);

if (!R2_CONFIGURED) {
  console.warn(
    'WARNING: R2 credentials incomplete. Video upload will not work. ' +
    'Ensure R2_ACCOUNT_ID, R2_BUCKET_NAME, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, and R2_ENDPOINT are set.'
  );
}

if (
  configuredR2Endpoint &&
  R2_ACCOUNT_ID &&
  configuredR2Endpoint.replace(/\/+$/, '') !== R2_ENDPOINT
) {
  console.warn(
    `R2_ENDPOINT is not the canonical account endpoint; using ${R2_ENDPOINT} for signed URLs.`
  );
}

// Single shared S3 client configured for R2's S3-compatible endpoint.
// region is required by the SDK but ignored by R2 — 'auto' is the
// conventional value Cloudflare's own docs use.
const s3Client = R2_CONFIGURED
  ? new S3Client({
      region: 'auto',
      endpoint: R2_ENDPOINT,
    // Keep the bucket in the URL path. Virtual-hosted URLs can produce
    // bucket-prefixed R2 hostnames that fail DNS resolution in browsers.
    forcePathStyle: true,
    credentials: {
        accessKeyId: R2_ACCESS_KEY_ID,
        secretAccessKey: R2_SECRET_ACCESS_KEY,
      },
    })
  : null;

function assertConfigured() {
  if (!R2_CONFIGURED || !s3Client) {
    throw new Error('R2 credentials not configured');
  }
}

function keySegment(value, label) {
  const segment = String(value || '');
  if (!/^[a-z0-9_-]{1,128}$/i.test(segment)) {
    throw new Error(`Invalid ${label} for R2 object key`);
  }
  return segment;
}

function keyExtension(extension) {
  const normalized = String(extension || '').toLowerCase();
  if (!/^[a-z0-9]{1,10}$/.test(normalized)) {
    throw new Error('Invalid file extension');
  }
  return normalized;
}

/**
 * Generate server-side R2 object key
 * Structure: videos/{environment}/{host_id}/{property_id}/{media_id}/original.{extension}
 * Never trust client-provided paths
 */
function generateR2ObjectKey(hostId, propertyId, mediaId, extension) {
  if (!hostId || !propertyId || !mediaId || !extension) {
    throw new Error('Missing required parameters for R2 key generation');
  }

  const cleanExt = keyExtension(extension);
  return `videos/${ENVIRONMENT}/${keySegment(hostId, 'host id')}/${keySegment(propertyId, 'property id')}/${keySegment(mediaId, 'media id')}/original.${cleanExt}`;
}

function generateChatAttachmentObjectKey(userId, conversationId, attachmentId, extension) {
  if (!userId || !conversationId || !attachmentId || !extension) {
    throw new Error('Missing required parameters for chat attachment key generation');
  }
  const cleanExt = keyExtension(extension);
  return `chat-attachments/${ENVIRONMENT}/${keySegment(conversationId, 'conversation id')}/${keySegment(userId, 'user id')}/${keySegment(attachmentId, 'attachment id')}/original.${cleanExt}`;
}

function generateListingPhotoObjectKey(listingId, mediaId, extension) {
  if (!listingId || !mediaId || !extension) {
    throw new Error('Missing required parameters for listing photo key generation');
  }
  const cleanExt = keyExtension(extension);
  return `listing-photos/${ENVIRONMENT}/${keySegment(listingId, 'listing id')}/${keySegment(mediaId, 'media id')}.${cleanExt}`;
}

function generatePropertyImageObjectKey(listingId, mediaId, extension) {
  if (!listingId || !mediaId || !extension) {
    throw new Error('Missing required parameters for property image key generation');
  }
  const cleanExt = keyExtension(extension);
  return `listing-photos/${ENVIRONMENT}/${keySegment(listingId, 'listing id')}/${keySegment(mediaId, 'media id')}.${cleanExt}`;
}

function generatePropertyImageThumbnailObjectKey(listingId, mediaId, extension) {
  if (!listingId || !mediaId || !extension) {
    throw new Error('Missing required parameters for property image thumbnail key generation');
  }
  const cleanExt = keyExtension(extension);
  return `listing-photos/${ENVIRONMENT}/${keySegment(listingId, 'listing id')}/${keySegment(mediaId, 'media id')}/thumbnail.${cleanExt}`;
}

function generateProfilePhotoObjectKey(userId, mediaId, extension) {
  if (!userId || !mediaId || !extension) {
    throw new Error('Missing required parameters for profile photo key generation');
  }
  const cleanExt = keyExtension(extension);
  return `avatars/${ENVIRONMENT}/${keySegment(userId, 'user id')}/${keySegment(mediaId, 'media id')}.${cleanExt}`;
}

function generateUpdateImageObjectKey(userId, mediaId, extension) {
  if (!userId || !mediaId || !extension) {
    throw new Error('Missing required parameters for update image key generation');
  }
  const cleanExt = keyExtension(extension);
  return `updates/${ENVIRONMENT}/${keySegment(userId, 'user id')}/${keySegment(mediaId, 'media id')}.${cleanExt}`;
}

function generateMigratedUpdateImageObjectKey(updateId, index, extension) {
  if (!updateId || !Number.isInteger(index) || index < 0 || !extension) {
    throw new Error('Missing required parameters for migrated update image key generation');
  }
  const cleanExt = keyExtension(extension);
  return `updates/${ENVIRONMENT}/migrated/${keySegment(updateId, 'update id')}/${index}.${cleanExt}`;
}

/**
 * Generate a short-lived signed PUT URL for uploading directly to R2.
 *
 * The frontend uploads the raw file bytes with:
 *   fetch(uploadUrl, { method: 'PUT', headers: { 'Content-Type': contentType }, body: file })
 *
 * No access keys ever reach the browser — only this single-use, expiring URL.
 */
async function generateR2UploadAuthorization(objectKey, contentType, maxFileSize) {
  assertConfigured();

  const command = new PutObjectCommand({
    Bucket: R2_BUCKET_NAME,
    Key: objectKey,
    ContentType: contentType || 'video/mp4',
  });

  const uploadUrl = await getSignedUrl(s3Client, command, { expiresIn: 30 * 60 }); // 30 min

  return {
    uploadUrl,
    endpoint: R2_ENDPOINT,
    bucketName: R2_BUCKET_NAME,
    objectKey,
    contentType: contentType || 'video/mp4',
    maxFileSize: maxFileSize || 500 * 1024 * 1024, // 500MB default
    expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
  };
}

/**
 * Generate a short-lived signed GET URL for video playback.
 */
async function generateR2PlaybackUrl(objectKey, expiresInSeconds = 3600) {
  assertConfigured();

  const command = new GetObjectCommand({
    Bucket: R2_BUCKET_NAME,
    Key: objectKey,
  });

  const url = await getSignedUrl(s3Client, command, { expiresIn: expiresInSeconds });

  return {
    url,
    expiresAt: new Date(Date.now() + expiresInSeconds * 1000),
  };
}

async function generateR2DownloadAuthorization(objectKey, contentType, expiresInSeconds = 3600) {
  assertConfigured();
  const command = new GetObjectCommand({
    Bucket: R2_BUCKET_NAME,
    Key: objectKey,
    ResponseContentType: contentType || undefined,
  });
  const url = await getSignedUrl(s3Client, command, { expiresIn: expiresInSeconds });
  return { url, expiresAt: new Date(Date.now() + expiresInSeconds * 1000) };
}

/**
 * Verify that an object exists in R2 (signed HEAD request).
 * Used during upload completion to confirm the file was actually uploaded.
 */
async function verifyR2ObjectExists(objectKey) {
  assertConfigured();

  try {
    await s3Client.send(new HeadObjectCommand({ Bucket: R2_BUCKET_NAME, Key: objectKey }));
    return true;
  } catch (error) {
    // HeadObject throws (404-equivalent) when the object doesn't exist —
    // that's an expected "not found", not a real error, so don't log it as one.
    if (error.$metadata && error.$metadata.httpStatusCode === 404) {
      return false;
    }
    console.error('Error verifying R2 object:', error);
    return false;
  }
}

async function getR2ObjectMetadata(objectKey) {
  assertConfigured();
  try {
    const response = await s3Client.send(new HeadObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: objectKey,
    }));
    return {
      exists: true,
      contentLength: response.ContentLength || 0,
      contentType: response.ContentType || null,
    };
  } catch (error) {
    if (error.$metadata && error.$metadata.httpStatusCode === 404) {
      return { exists: false, contentLength: 0, contentType: null };
    }
    throw error;
  }
}

async function downloadR2Object(objectKey) {
  assertConfigured();
  const response = await s3Client.send(new GetObjectCommand({
    Bucket: R2_BUCKET_NAME,
    Key: objectKey,
  }));
  return Buffer.from(await response.Body.transformToByteArray());
}

async function getR2ObjectStream(objectKey) {
  assertConfigured();
  const response = await s3Client.send(new GetObjectCommand({
    Bucket: R2_BUCKET_NAME,
    Key: objectKey,
  }));
  return {
    body: response.Body,
    contentType: response.ContentType || 'application/octet-stream',
    contentLength: response.ContentLength,
    cacheControl: response.CacheControl,
  };
}

async function listR2Objects(prefix) {
  assertConfigured();
  const objects = [];
  let continuationToken;
  do {
    const response = await s3Client.send(new ListObjectsV2Command({
      Bucket: R2_BUCKET_NAME,
      Prefix: prefix,
      ContinuationToken: continuationToken,
    }));
    objects.push(...(response.Contents || []).map((object) => ({
      key: object.Key,
      size: object.Size,
      lastModified: object.LastModified,
    })));
    continuationToken = response.IsTruncated ? response.NextContinuationToken : undefined;
  } while (continuationToken);
  return objects;
}

async function uploadR2Object(objectKey, body, contentType) {
  assertConfigured();
  await s3Client.send(new PutObjectCommand({
    Bucket: R2_BUCKET_NAME,
    Key: objectKey,
    Body: body,
    ContentType: contentType,
  }));
  return { objectKey };
}

/**
 * Delete an object from R2 (signed DELETE request).
 * Called when a user deletes a video or cleanup is needed.
 */
async function deleteR2Object(objectKey) {
  assertConfigured();

  try {
    await s3Client.send(new DeleteObjectCommand({ Bucket: R2_BUCKET_NAME, Key: objectKey }));
    return { success: true };
  } catch (error) {
    console.error('Error deleting R2 object:', error);
    throw error;
  }
}

module.exports = {
  generateR2ObjectKey,
  generateChatAttachmentObjectKey,
  generateListingPhotoObjectKey,
  generatePropertyImageObjectKey,
  generatePropertyImageThumbnailObjectKey,
  generateProfilePhotoObjectKey,
  generateUpdateImageObjectKey,
  generateMigratedUpdateImageObjectKey,
  generateR2UploadAuthorization,
  generateR2PlaybackUrl,
  generateR2DownloadAuthorization,
  verifyR2ObjectExists,
  getR2ObjectMetadata,
  downloadR2Object,
  getR2ObjectStream,
  listR2Objects,
  uploadR2Object,
  deleteR2Object,
  // Constants for configuration
  R2_ENDPOINT,
  R2_BUCKET_NAME,
  ENVIRONMENT,
};
