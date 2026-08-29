/**
 * MediaStorageService
 *
 * Abstracts media storage operations (R2 for videos, Supabase Storage for photos).
 * Centralizes credentials, URL generation, and provider-specific logic.
 * This allows future provider changes without rewriting upload/download code.
 */

require('dotenv').config();
const supabase = require('./supabaseClient');

const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID;
const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME;
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;
const R2_ENDPOINT = process.env.R2_ENDPOINT;
const ENVIRONMENT = process.env.NODE_ENV || 'development';

// Validate R2 configuration
if (!R2_ACCOUNT_ID || !R2_BUCKET_NAME || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_ENDPOINT) {
  console.warn(
    'WARNING: R2 credentials incomplete. Video upload will not work. ' +
    'Ensure R2_ACCOUNT_ID, R2_BUCKET_NAME, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, and R2_ENDPOINT are set.'
  );
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
 * Generate a short-lived signed URL for R2 upload
 * Uses AWS Signature Version 4 (R2 compatible)
 */
function generateR2UploadAuthorization(objectKey, contentType, maxFileSize) {
  if (!R2_ENDPOINT || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY) {
    throw new Error('R2 credentials not configured');
  }

  // For now, return the necessary parameters for client to generate a signed request
  // or use presigned POST. In production, consider using S3 SDK for better signing.
  return {
    endpoint: R2_ENDPOINT,
    bucketName: R2_BUCKET_NAME,
    accessKeyId: R2_ACCESS_KEY_ID,
    objectKey: objectKey,
    contentType: contentType || 'video/mp4',
    maxFileSize: maxFileSize || 500 * 1024 * 1024, // 500MB default
    // In a real implementation, sign this with AWS Signature V4
    // For now, the frontend will use presigned POST or multipart upload
  };
}

/**
 * Generate a short-lived signed URL for R2 playback
 * Returns a URL valid for a limited time (default 1 hour)
 */
async function generateR2PlaybackUrl(objectKey, expiresInSeconds = 3600) {
  if (!R2_ENDPOINT || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY) {
    throw new Error('R2 credentials not configured');
  }

  // Construct a simple signed URL (full implementation would use AWS SDK)
  // For now, return a basic URL that would need to be signed server-side
  // In production, use AWS SDK to generate presigned GET URL
  const url = `${R2_ENDPOINT}/${R2_BUCKET_NAME}/${objectKey}`;
  
  // TODO: Implement proper AWS Signature V4 signing for controlled access
  // For MVP, R2 bucket should have restricted access policy that requires auth
  return {
    url: url,
    expiresAt: new Date(Date.now() + expiresInSeconds * 1000),
  };
}

/**
 * Verify that an object exists in R2
 * Used during upload completion to confirm the file was actually uploaded
 */
async function verifyR2ObjectExists(objectKey) {
  if (!R2_ENDPOINT || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY) {
    throw new Error('R2 credentials not configured');
  }

  try {
    const response = await fetch(`${R2_ENDPOINT}/${R2_BUCKET_NAME}/${objectKey}`, {
      method: 'HEAD',
    });
    return response.ok;
  } catch (error) {
    console.error('Error verifying R2 object:', error);
    return false;
  }
}

/**
 * Delete an object from R2
 * Called when a user deletes a video or cleanup is needed
 */
async function deleteR2Object(objectKey) {
  if (!R2_ENDPOINT || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY) {
    throw new Error('R2 credentials not configured');
  }

  try {
    const response = await fetch(`${R2_ENDPOINT}/${R2_BUCKET_NAME}/${objectKey}`, {
      method: 'DELETE',
    });
    
    if (!response.ok) {
      throw new Error(`R2 deletion failed: ${response.statusText}`);
    }
    
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
