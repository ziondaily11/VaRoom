/**
 * Who may add a video, and how many.
 *
 * Videos come with Airbnb, Hotel and Venue plans: each plan allows video on
 * a number of listings (billing_plans.features.video_listing_limit), with at
 * most VIDEO_MAX_COUNT_PER_PROPERTY videos on each. Property and Shops &
 * Offices (Silver / Gold) are photos only; videos already on their listings
 * stay until the listing goes offline.
 *
 * A listing counts towards the limit while it has a video and is either
 * still a draft or published, set to available and online. Pausing a listing
 * that has a video frees its place.
 */

require('dotenv').config();

const VIDEO_UPLOADS_ENABLED = process.env.VIDEO_UPLOADS_ENABLED === 'true';
const VIDEO_MAX_FILE_SIZE_MB = parseInt(process.env.VIDEO_MAX_FILE_SIZE_MB || '100', 10);
/** Videos on one listing (it shares the 8 photo-and-video places). */
const VIDEO_MAX_COUNT_PER_PROPERTY = 2;
const VIDEO_MAX_DURATION_SECONDS = parseInt(process.env.VIDEO_MAX_DURATION_SECONDS || '60', 10);
const ACTIVE_VIDEO_STATUSES = ['pending', 'uploading', 'processing', 'ready'];
const PHOTO_ONLY_CATEGORIES = new Set(['property', 'shop', 'office']);
const { getHostEntitlements } = require('./billingEntitlement');

/** The host's video allowance: how many listings may have video, and how many (other than `exceptListingId`) do. */
async function videoListingAllowance(supabaseAdmin, hostId, exceptListingId = null, now = new Date()) {
  const entitlements = await getHostEntitlements(supabaseAdmin, hostId);
  const features = (entitlements.subscription && entitlements.subscription.billing_plans && entitlements.subscription.billing_plans.features) || {};
  const limit = entitlements.active ? Math.max(0, Number(features.video_listing_limit) || 0) : 0;
  const { data: listings, error } = await supabaseAdmin.from('listings').select('id,publication_state,availability_status,live_until')
    .eq('host_id', hostId).in('publication_state', ['draft', 'payment_pending', 'failed', 'published']);
  if (error) throw new Error('Unable to count video listings');
  const counted = (listings || []).filter((listing) => listing.id !== exceptListingId && (listing.publication_state !== 'published'
    || (listing.availability_status === 'available' && listing.live_until && Date.parse(listing.live_until) > now.getTime()))).map((listing) => listing.id);
  if (!counted.length) return { limit, used: 0 };
  const { data: videos, error: videoError } = await supabaseAdmin.from('property_media').select('property_id')
    .in('property_id', counted).eq('media_type', 'video').in('status', ACTIVE_VIDEO_STATUSES).is('deleted_at', null);
  if (videoError) throw new Error('Unable to count video listings');
  return { limit, used: new Set((videos || []).map((video) => video.property_id)).size };
}

const listingsWord = (n) => `${n} listing${n === 1 ? '' : 's'}`;

/**
 * Whether this host may add a video to this listing (which has
 * `currentVideoCount` already). Returns { allowed, reason? }.
 * File type, size and ownership are checked by the caller.
 */
async function canUploadPropertyVideo(supabaseAdmin, user, property, currentVideoCount = 0) {
  if (!VIDEO_UPLOADS_ENABLED) return { allowed: false, reason: 'Video uploads are currently disabled.' };
  if (PHOTO_ONLY_CATEGORIES.has(property.category)) {
    return { allowed: false, reason: 'Silver and Gold listings use photos. Video tours come with Airbnb, Hotel and Venue plans.' };
  }
  if (currentVideoCount >= VIDEO_MAX_COUNT_PER_PROPERTY) {
    return { allowed: false, reason: `A listing can have up to ${VIDEO_MAX_COUNT_PER_PROPERTY} videos.` };
  }
  let allowance;
  try { allowance = await videoListingAllowance(supabaseAdmin, user.id, property.id || null); } catch (error) {
    console.error('Video allowance check failed:', error.message || error);
    return { allowed: false, reason: 'Could not verify your plan.' };
  }
  if (!allowance.limit) return { allowed: false, reason: 'Your plan does not include video. Upgrade to add video tours.' };
  // A listing that already has a video keeps its place.
  if (currentVideoCount === 0 && allowance.used >= allowance.limit) {
    return {
      allowed: false,
      reason: `Your plan includes video on ${listingsWord(allowance.limit)}, and all are in use. Upgrade for more, or pause a listing that has a video.`,
    };
  }
  return { allowed: true };
}

/** The videos on one listing (checked against VIDEO_MAX_COUNT_PER_PROPERTY). */
async function getPropertyVideoCount(supabaseAdmin, propertyId) {
  const { error, count } = await supabaseAdmin
    .from('property_media')
    .select('id', { count: 'exact', head: true })
    .eq('property_id', propertyId)
    .eq('media_type', 'video')
    .in('status', ['pending', 'uploading', 'processing', 'ready'])
    .is('deleted_at', null);

  if (error) {
    throw new Error(`Failed to fetch property video count: ${error.message || error}`);
  }

  if (!Number.isSafeInteger(count) || count < 0) {
    throw new Error('Failed to fetch property video count: database returned an invalid count');
  }

  return count;
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
    'video/webm',
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
  return ['mp4', 'mov', 'webm'].includes(extension) ? extension : 'mp4';
}

module.exports = {
  canUploadPropertyVideo,
  videoListingAllowance,
  getPropertyVideoCount,
  validateVideoFile,
  getFileExtension,
  // Configuration constants
  VIDEO_UPLOADS_ENABLED,
  VIDEO_MAX_FILE_SIZE_MB,
  VIDEO_MAX_COUNT_PER_PROPERTY,
  VIDEO_MAX_DURATION_SECONDS,
};
