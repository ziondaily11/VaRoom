/**
 * MediaStorageService
 *
 * Abstracts media storage operations (R2 for videos, Supabase Storage for photos).
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
const supabase = require('./supabaseClient');
const {
  S3Client,
  PutObjectCommand,
  HeadObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID;
const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME;
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;
const R2_ENDPOINT = process.env.R2_ENDPOINT; // e.g. https://<account_id>.r2.cloudflarestorage.com
const ENVIRONMENT = process.env.NODE_ENV || 'development';

const R2_CONFIGURED = Boolean(
  R2_ACCOUNT_ID && R2_BUCKET_NAME && R2_ACCESS_KEY_ID && R2_SECRET_ACCESS_KEY && R2_ENDPOINT
);

if (!R2_CONFIGURED) {
  console.warn(
    'WARNING: R2 credentials incomplete. Video upload will not work. ' +
    'Ensure R2_ACCOUNT_ID, R2_BUCKET_NAME, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, and R2_ENDPOINT are set.'
  );
}

// Single shared S3 client configured for R2's S3-compatible endpoint.
// region is required by the SDK but ignored by R2 — 'auto' is the
// conventional value Cloudflare's own docs use.
const s3Client = R2_CONFIGURED
  ? new S3Client({
      region: 'auto',
      endpoint: R2_ENDPOINT,
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

/**
 * Generate server-side R2 object key
 * Structure: videos/{environment}/{host_id}/{property_id}/{media_id}/original.{extension}
 * Never trust client-provided paths
 */
function generateR2ObjectKey(hostId, propertyId, mediaId, extension) {
  if (!hostId || !propertyId || !mediaId || !extension) {
    throw new Error('Missing required parameters for R2 key generation');
  }
  const cleanExt = (extension || '').replace(/[^a-z0-9]/gi, '').toLowerCase();
  if (!cleanExt) {
    throw new Error('Invalid file extension');
  }
  return `videos/${ENVIRONMENT}/${hostId}/${propertyId}/${mediaId}/original.${cleanExt}`;
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

/**
 * Store a small image as a Supabase Storage object (for thumbnails, future use)
 */
async function uploadSupabaseStorage(bucketName, objectKey, buffer, contentType) {
  try {
    const { data, error } = await supabase.storage
      .from(bucketName)
      .upload(objectKey, buffer, {
        contentType: contentType || 'application/octet-stream',
        upsert: false,
      });

    if (error) {
      throw new Error(`Supabase upload failed: ${error.message}`);
    }

    return data;
  } catch (error) {
    console.error('Error uploading to Supabase Storage:', error);
    throw error;
  }
}

/**
 * Get a public URL for Supabase Storage object
 */
function getSupabasePublicUrl(bucketName, objectKey) {
  try {
    const { data } = supabase.storage
      .from(bucketName)
      .getPublicUrl(objectKey);

    return data?.publicUrl || null;
  } catch (error) {
    console.error('Error getting Supabase public URL:', error);
    return null;
  }
}

/**
 * Delete a Supabase Storage object
 */
async function deleteSupabaseStorage(bucketName, objectKey) {
  try {
    const { error } = await supabase.storage
      .from(bucketName)
      .remove([objectKey]);

    if (error) {
      throw new Error(`Supabase deletion failed: ${error.message}`);
    }

    return { success: true };
  } catch (error) {
    console.error('Error deleting Supabase Storage object:', error);
    throw error;
  }
}

module.exports = {
  generateR2ObjectKey,
  generateR2UploadAuthorization,
  generateR2PlaybackUrl,
  verifyR2ObjectExists,
  deleteR2Object,
  uploadSupabaseStorage,
  getSupabasePublicUrl,
  deleteSupabaseStorage,
  // Constants for configuration
  R2_ENDPOINT,
  R2_BUCKET_NAME,
  ENVIRONMENT,
};
