/**
 * Video Entitlement Logic
 *
 * Centralized authorization for video uploads.
 * During development, VIDEO_PREMIUM_REQUIRED=false allows all authenticated users to upload.
 * Later, VIDEO_PREMIUM_REQUIRED=true enforces premium subscription checks.
 * This ensures the architecture doesn't change when premium enforcement is activated.
 */

require('dotenv').config();

const VIDEO_UPLOADS_ENABLED = process.env.VIDEO_UPLOADS_ENABLED === 'true';
const VIDEO_PREMIUM_REQUIRED = process.env.VIDEO_PREMIUM_REQUIRED === 'true';
const VIDEO_MAX_FILE_SIZE_MB = parseInt(process.env.VIDEO_MAX_FILE_SIZE_MB || '500', 10);
const VIDEO_MAX_COUNT_PER_PROPERTY = parseInt(process.env.VIDEO_MAX_COUNT_PER_PROPERTY || '10', 10);
const VIDEO_MAX_DURATION_SECONDS = parseInt(process.env.VIDEO_MAX_DURATION_SECONDS || '90', 10);

/**
 * Check if a user can upload a video for a property
 *
 * Returns: { allowed: boolean, reason?: string }
 *
 * Authorization checks in order:
 * 1. Video feature must be enabled globally
 * 2. User must be authenticated (required by caller)
 * 3. User must own/edit the property (required by caller)
 * 4. Premium requirement check (if enabled)
 * 5. Video count limit check
 * 6. User has not exceeded storage quota (future)
 *
 * This function does NOT check:
 * - File type/size (done in upload-init endpoint)
 * - Authentication (caller responsibility)
 * - Property ownership (caller responsibility)
 */
async function canUploadPropertyVideo(supabaseAdmin, user, property, currentVideoCount = 0) {
  // Step 1: Check feature flag
  if (!VIDEO_UPLOADS_ENABLED) {
    return {
      allowed: false,
      reason: 'Video uploads are currently disabled.',
    };
  }

  // Step 2: Check premium requirement
  if (VIDEO_PREMIUM_REQUIRED) {
    // In production, fetch user's subscription status
    // For now, this is a placeholder showing the intended pattern
    const userProfile = await getUserProfile(supabaseAdmin, user.id);

    if (!userProfile) {
      return {
        allowed: false,
        reason: 'Could not verify subscription status.',
      };
    }

    // Check subscription/plan field (exact name depends on Supabase schema)
    const isPremium = userProfile.subscription_tier === 'premium' || userProfile.is_premium === true;

    if (!isPremium) {
      return {
        allowed: false,
        reason: 'Video uploads require a premium subscription.',
      };
    }
  }

  // Step 3: Check video count limit
  if (currentVideoCount >= VIDEO_MAX_COUNT_PER_PROPERTY) {
    return {
      allowed: false,
      reason: `Property has reached maximum video limit (${VIDEO_MAX_COUNT_PER_PROPERTY}).`,
    };
  }

  // Step 4: All checks passed
  return {
    allowed: true,
  };
}

/**
 * Fetch user profile for subscription/premium check
 * Currently fetches from profiles table
 * Can be extended to check actual subscription records
 */
async function getUserProfile(supabaseAdmin, userId) {
  try {
    const { data, error } = await supabaseAdmin
      .from('profiles')
      .select('id, subscription_tier, is_premium')
      .eq('id', userId)
      .single();

    if (error) {
      console.error('Error fetching user profile:', error);
      return null;
    }

    return data;
  } catch (error) {
    console.error('Error in getUserProfile:', error);
    return null;
  }
}

/**
 * Get current video count for a property
 * Used to check against VIDEO_MAX_COUNT_PER_PROPERTY
 */
async function getPropertyVideoCount(supabaseAdmin, propertyId) {
  try {
    const { data, error, count } = await supabaseAdmin
      .from('property_media')
      .select('id', { count: 'exact', head: true })
      .eq('property_id', propertyId)
      .eq('media_type', 'video')
      .neq('status', 'deleted')
      .is('deleted_at', null);

    if (error) {
      console.error('Error fetching video count:', error);
      return 0;
    }

    return count || 0;
  } catch (error) {
    console.error('Error in getPropertyVideoCount:', error);
    return 0;
  }
}

/**
 * Validate video file before upload.
 * Enforces duration-based limit instead of file-size-based restriction.
 */
function validateVideoFile(fileName, mimeType, fileSizeBytes, durationSeconds = null) {
  // Allowed MIME types (conservative baseline per spec)
  const ALLOWED_MIME_TYPES = [
    'video/mp4',
    'video/quicktime',
  ];

  if (typeof fileName !== 'string' || fileName.length < 1 || fileName.length > 255 ||
      fileName.includes('/') || fileName.includes('\\') || fileName.includes('\0') ||
      fileName === '.' || fileName === '..') {
    return { valid: false, error: 'Invalid filename.' };
  }

  // Validate MIME type and size independently of browser metadata.
  if (!ALLOWED_MIME_TYPES.includes(mimeType)) {
    return {
      valid: false,
      error: `Video format not supported. Allowed: ${ALLOWED_MIME_TYPES.join(', ')}`,
    };
  }
  if (!Number.isSafeInteger(fileSizeBytes) || fileSizeBytes <= 0 ||
      fileSizeBytes > VIDEO_MAX_FILE_SIZE_MB * 1024 * 1024) {
    return { valid: false, error: `Video must be smaller than ${VIDEO_MAX_FILE_SIZE_MB} MB.` };
  }

  if (typeof durationSeconds === 'number' && Number.isFinite(durationSeconds)) {
    if (durationSeconds > VIDEO_MAX_DURATION_SECONDS) {
      return {
        valid: false,
        error: `Video must be ${VIDEO_MAX_DURATION_SECONDS} seconds or less.`,
      };
    }
  }

  return {
    valid: true,
  };
}

/**
 * Extract file extension from filename
 * Used for generating R2 object keys
 */
function getFileExtension(fileName) {
  if (!fileName || typeof fileName !== 'string') return 'mp4';
  const parts = fileName.split('.');
  const extension = parts.length > 1 ? parts[parts.length - 1].toLowerCase() : 'mp4';
  return ['mp4', 'mov'].includes(extension) ? extension : 'mp4';
}

module.exports = {
  canUploadPropertyVideo,
  getUserProfile,
  getPropertyVideoCount,
  validateVideoFile,
  getFileExtension,
  // Configuration constants
  VIDEO_UPLOADS_ENABLED,
  VIDEO_PREMIUM_REQUIRED,
  VIDEO_MAX_FILE_SIZE_MB,
  VIDEO_MAX_COUNT_PER_PROPERTY,
  VIDEO_MAX_DURATION_SECONDS,
};
