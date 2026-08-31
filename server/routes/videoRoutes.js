/**
 * Video Upload Routes
 *
 * Endpoints for video upload lifecycle:
 * - POST /api/properties/:propertyId/videos/upload-init
 * - POST /api/properties/:propertyId/videos/:mediaId/complete
 * - GET /api/media/:mediaId/playback
 * - DELETE /api/properties/:propertyId/videos/:mediaId
 * - PATCH /api/properties/:propertyId/media/order
 * - GET /api/properties/:propertyId/media
 */

const express = require('express');
const { v4: uuidv4 } = require('uuid');
const supabaseAdmin = require('../lib/supabaseClient');
const mediaStorageService = require('../lib/mediaStorageService');
const videoEntitlement = require('../lib/videoEntitlement');

const router = express.Router();

/**
 * Extract and verify user from Authorization header
 */
async function getAuthenticatedUser(req) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) {
    return { user: null, error: 'Missing access token' };
  }

  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !user) {
    return { user: null, error: 'Invalid or expired session' };
  }

  return { user, error: null };
}

/**
 * Verify that a user owns/can edit a property
 */
async function verifyPropertyOwnership(propertyId, userId) {
  try {
    const { data, error } = await supabaseAdmin
      .from('listings')
      .select('id, host_id')
      .eq('id', propertyId)
      .single();

    if (error || !data) {
      return { authorized: false, error: 'Property not found' };
    }

    if (data.host_id !== userId) {
      return { authorized: false, error: 'Not authorized to edit this property' };
    }

    return { authorized: true, property: data };
  } catch (error) {
    console.error('Error verifying property ownership:', error);
    return { authorized: false, error: 'Error verifying ownership' };
  }
}

/**
 * POST /api/properties/:propertyId/videos/upload-init
 *
 * Initialize a video upload session.
 * Client sends file metadata, server authorizes and returns upload credentials.
 *
 * Request body:
 * {
 *   filename: string,
 *   mimeType: string,
 *   fileSize: number (in bytes)
 * }
 *
 * Response:
 * {
 *   success: true,
 *   mediaId: uuid,
 *   uploadId: uuid,
 *   uploadAuthorization: { ... },
 *   expiresAt: ISO timestamp
 * }
 */
router.post('/properties/:propertyId/videos/upload-init', async (req, res) => {
  try {
    // Step 1: Authenticate user
    const { user, error: authError } = await getAuthenticatedUser(req);
    if (!user) {
      return res.status(401).json({ error: authError });
    }

    const propertyId = req.params.propertyId;
    const { filename, mimeType, fileSize, durationSeconds } = req.body;

    // Step 2: Validate input
    if (!filename || !mimeType || typeof fileSize !== 'number') {
      return res.status(400).json({
        error: 'Missing or invalid request parameters (filename, mimeType, fileSize required)',
      });
    }

    if (durationSeconds !== undefined && (typeof durationSeconds !== 'number' || !Number.isFinite(durationSeconds))) {
      return res.status(400).json({
        error: 'durationSeconds must be a number when provided',
      });
    }

    // Step 3: Verify property exists and user owns it
    const { authorized, error: ownershipError, property } = await verifyPropertyOwnership(
      propertyId,
      user.id
    );
    if (!authorized) {
      return res.status(403).json({ error: ownershipError });
    }

    // Step 4: Check feature flags and entitlements
    const currentVideoCount = await videoEntitlement.getPropertyVideoCount(
      supabaseAdmin,
      propertyId
    );

    const { allowed, reason } = await videoEntitlement.canUploadPropertyVideo(
      supabaseAdmin,
      user,
      property,
      currentVideoCount
    );

    if (!allowed) {
      return res.status(403).json({ error: reason });
    }

    // Step 5: Validate file type and size
    const { valid, error: validationError } = videoEntitlement.validateVideoFile(
      filename,
      mimeType,
      fileSize,
      durationSeconds
    );

    if (!valid) {
      return res.status(400).json({ error: validationError });
    }

    // Step 6: Create media ID and upload ID for idempotency
    const mediaId = uuidv4();
    const uploadId = uuidv4();
    const extension = videoEntitlement.getFileExtension(filename);

    // Step 7: Generate R2 object key server-side
    const objectKey = mediaStorageService.generateR2ObjectKey(
      user.id,
      propertyId,
      mediaId,
      extension
    );

    // Step 8: Create pending media record in database
    const { data: mediaRecord, error: insertError } = await supabaseAdmin
      .from('property_media')
      .insert({
        id: mediaId,
        property_id: propertyId,
        host_id: user.id,
        media_type: 'video',
        storage_provider: 'r2',
        storage_bucket: mediaStorageService.R2_BUCKET_NAME,
        storage_key: objectKey,
        original_filename: filename,
        mime_type: mimeType,
        file_size_bytes: fileSize,
        status: 'pending',
        visibility: 'public',
        upload_id: uploadId,
        sort_order: currentVideoCount,
      })
      .select()
      .single();

    if (insertError) {
      console.error('Error creating media record:', insertError);
      return res.status(500).json({ error: 'Failed to initialize upload' });
    }

    // Step 9: Generate short-lived upload authorization
    const uploadAuthorization = mediaStorageService.generateR2UploadAuthorization(
      objectKey,
      mimeType,
      fileSize
    );

    // Step 10: Return only what the frontend needs (never expose secret keys)
    res.status(200).json({
      success: true,
      mediaId: mediaId,
      uploadId: uploadId,
      uploadAuthorization: {
        endpoint: uploadAuthorization.endpoint,
        bucketName: uploadAuthorization.bucketName,
        objectKey: uploadAuthorization.objectKey,
        contentType: uploadAuthorization.contentType,
        maxFileSize: uploadAuthorization.maxFileSize,
        // accessKeyId and secret are deliberately omitted
      },
      expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(), // 30 min
    });
  } catch (error) {
    console.error('Error in upload-init:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/properties/:propertyId/videos/:mediaId/complete
 *
 * Verify that R2 upload succeeded and finalize the media record.
 *
 * Request body:
 * {
 *   uploadId: string (for idempotency verification)
 * }
 *
 * Response:
 * {
 *   success: true,
 *   status: 'ready'
 * }
 */
router.post('/properties/:propertyId/videos/:mediaId/complete', async (req, res) => {
  try {
    // Step 1: Authenticate user
    const { user, error: authError } = await getAuthenticatedUser(req);
    if (!user) {
      return res.status(401).json({ error: authError });
    }

    const propertyId = req.params.propertyId;
    const mediaId = req.params.mediaId;
    const { uploadId } = req.body;

    // Step 2: Verify property ownership
    const { authorized, error: ownershipError } = await verifyPropertyOwnership(
      propertyId,
      user.id
    );
    if (!authorized) {
      return res.status(403).json({ error: ownershipError });
    }

    // Step 3: Fetch the media record and verify it belongs to this property/user
    const { data: mediaRecord, error: fetchError } = await supabaseAdmin
      .from('property_media')
      .select('*')
      .eq('id', mediaId)
      .eq('property_id', propertyId)
      .eq('host_id', user.id)
      .single();

    if (fetchError || !mediaRecord) {
      return res.status(404).json({ error: 'Media record not found' });
    }

    // Step 4: Verify uploadId matches (idempotency check)
    if (uploadId && mediaRecord.upload_id !== uploadId) {
      return res.status(400).json({ error: 'Upload ID mismatch' });
    }

    // Step 5: Verify the R2 object exists
    const objectExists = await mediaStorageService.verifyR2ObjectExists(mediaRecord.storage_key);
    if (!objectExists) {
      // Object doesn't exist in R2 — this is an orphaned/failed upload
      // Mark as failed so cleanup can handle it
      await supabaseAdmin
        .from('property_media')
        .update({ status: 'failed' })
        .eq('id', mediaId);

      return res.status(400).json({
        error: 'Video file not found in storage. Please try uploading again.',
      });
    }

    // Step 6: Mark media as ready
    const { data: updatedRecord, error: updateError } = await supabaseAdmin
      .from('property_media')
      .update({
        status: 'ready',
        updated_at: new Date().toISOString(),
      })
      .eq('id', mediaId)
      .select()
      .single();

    if (updateError) {
      console.error('Error updating media record:', updateError);
      return res.status(500).json({ error: 'Failed to finalize upload' });
    }

    res.status(200).json({
      success: true,
      status: 'ready',
      media: updatedRecord,
    });
  } catch (error) {
    console.error('Error in upload-complete:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/media/:mediaId/playback
 *
 * Authorize and return controlled playback access for a video.
 * Verifies viewer permission based on property/listing visibility.
 *
 * Response:
 * {
 *   url: signed URL,
 *   expiresAt: ISO timestamp
 * }
 */
router.get('/media/:mediaId/playback', async (req, res) => {
  try {
    const mediaId = req.params.mediaId;

    // Optional: Get authenticated user (for access control if needed)
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    let userId = null;

    if (token) {
      const { data: { user } } = await supabaseAdmin.auth.getUser(token);
      if (user) userId = user.id;
    }

    // Step 1: Fetch media record
    const { data: mediaRecord, error: fetchError } = await supabaseAdmin
      .from('property_media')
      .select('*')
      .eq('id', mediaId)
      .eq('media_type', 'video')
      .eq('status', 'ready')
      .is('deleted_at', null)
      .single();

    if (fetchError || !mediaRecord) {
      return res.status(404).json({ error: 'Video not found' });
    }

    // Step 2: Fetch listing to check visibility
    const { data: listing, error: listingError } = await supabaseAdmin
      .from('listings')
      .select('id, status')
      .eq('id', mediaRecord.property_id)
      .single();

    if (listingError || !listing) {
      return res.status(404).json({ error: 'Property not found' });
    }

    // Step 3: Verify public visibility (basic check for MVP)
    // In production, check listing.status, property visibility, booking access, etc.
    if (listing.status !== 'published' && mediaRecord.host_id !== userId) {
      return res.status(403).json({ error: 'Not authorized to view this video' });
    }

    // Step 4: Generate controlled playback URL
    const playbackUrl = await mediaStorageService.generateR2PlaybackUrl(
      mediaRecord.storage_key,
      3600 // 1 hour expiration
    );

    res.status(200).json({
      url: playbackUrl.url,
      expiresAt: playbackUrl.expiresAt,
    });
  } catch (error) {
    console.error('Error in playback endpoint:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * DELETE /api/properties/:propertyId/videos/:mediaId
 *
 * Delete a video and its R2 object.
 *
 * Response:
 * {
 *   success: true
 * }
 */
router.delete('/properties/:propertyId/videos/:mediaId', async (req, res) => {
  try {
    // Step 1: Authenticate user
    const { user, error: authError } = await getAuthenticatedUser(req);
    if (!user) {
      return res.status(401).json({ error: authError });
    }

    const propertyId = req.params.propertyId;
    const mediaId = req.params.mediaId;

    // Step 2: Verify property ownership
    const { authorized, error: ownershipError } = await verifyPropertyOwnership(
      propertyId,
      user.id
    );
    if (!authorized) {
      return res.status(403).json({ error: ownershipError });
    }

    // Step 3: Fetch media record
    const { data: mediaRecord, error: fetchError } = await supabaseAdmin
      .from('property_media')
      .select('*')
      .eq('id', mediaId)
      .eq('property_id', propertyId)
      .eq('host_id', user.id)
      .single();

    if (fetchError || !mediaRecord) {
      return res.status(404).json({ error: 'Media not found' });
    }

    // Step 4: Mark media as deleted (soft delete)
    const { error: updateError } = await supabaseAdmin
      .from('property_media')
      .update({
        status: 'deleted',
        deleted_at: new Date().toISOString(),
      })
      .eq('id', mediaId);

    if (updateError) {
      console.error('Error marking media as deleted:', updateError);
      return res.status(500).json({ error: 'Failed to delete media record' });
    }

    // Step 5: Queue R2 deletion (fire-and-forget; cleanup handles failures)
    setImmediate(async () => {
      try {
        await mediaStorageService.deleteR2Object(mediaRecord.storage_key);
        console.log(`Deleted R2 object: ${mediaRecord.storage_key}`);
      } catch (error) {
        console.error(`Failed to delete R2 object ${mediaRecord.storage_key}:`, error);
        // Cleanup job will retry this later
      }
    });

    res.status(200).json({ success: true });
  } catch (error) {
    console.error('Error in delete endpoint:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/properties/:propertyId/media
 *
 * Get all media (photos and videos) for a property.
 * Public endpoint (no auth required for published properties).
 *
 * Response:
 * {
 *   media: [ { id, type, storage_url, ... } ]
 * }
 */
router.get('/properties/:propertyId/media', async (req, res) => {
  try {
    const propertyId = req.params.propertyId;

    // Optionally get authenticated user for private listing access
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    let userId = null;

    if (token) {
      const { data: { user } } = await supabaseAdmin.auth.getUser(token);
      if (user) userId = user.id;
    }

    // Step 1: Fetch property/listing
    const { data: listing, error: listingError } = await supabaseAdmin
      .from('listings')
      .select('id, host_id, status')
      .eq('id', propertyId)
      .single();

    if (listingError || !listing) {
      return res.status(404).json({ error: 'Property not found' });
    }

    // Step 2: Check authorization (public only, or owner, or authorized guest)
    // For MVP, just check if published or user is owner
    if (listing.status !== 'published' && listing.host_id !== userId) {
      return res.status(403).json({ error: 'Not authorized to view this property' });
    }

    // Step 3: Fetch media sorted by order
    const { data: media, error: mediaError } = await supabaseAdmin
      .from('property_media')
      .select('*')
      .eq('property_id', propertyId)
      .eq('visibility', 'public')
      .is('deleted_at', null)
      .neq('status', 'failed')
      .neq('status', 'deleted')
      .order('sort_order', { ascending: true });

    if (mediaError) {
      console.error('Error fetching media:', mediaError);
      return res.status(500).json({ error: 'Failed to fetch media' });
    }

    // Step 4: Transform media for response (don't expose internal fields)
    const transformedMedia = media.map((m) => ({
      id: m.id,
      type: m.media_type,
      mimeType: m.mime_type,
      fileName: m.original_filename,
      durationSeconds: m.duration_seconds,
      width: m.width,
      height: m.height,
      createdAt: m.created_at,
    }));

    res.status(200).json({
      media: transformedMedia,
    });
  } catch (error) {
    console.error('Error in media list endpoint:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * PATCH /api/properties/:propertyId/media/order
 *
 * Reorder media within a property.
 * Request body: { order: [{ mediaId, sortOrder }, ...] }
 */
router.patch('/properties/:propertyId/media/order', async (req, res) => {
  try {
    // Step 1: Authenticate user
    const { user, error: authError } = await getAuthenticatedUser(req);
    if (!user) {
      return res.status(401).json({ error: authError });
    }

    const propertyId = req.params.propertyId;
    const { order } = req.body;

    if (!Array.isArray(order) || order.length === 0) {
      return res.status(400).json({ error: 'Invalid order array' });
    }

    // Step 2: Verify property ownership
    const { authorized, error: ownershipError } = await verifyPropertyOwnership(
      propertyId,
      user.id
    );
    if (!authorized) {
      return res.status(403).json({ error: ownershipError });
    }

    // Step 3: Update sort_order for each media item
    const updates = order.map((item) =>
      supabaseAdmin
        .from('property_media')
        .update({ sort_order: item.sortOrder })
        .eq('id', item.mediaId)
        .eq('property_id', propertyId)
        .eq('host_id', user.id)
    );

    const results = await Promise.all(updates);

    // Check for errors
    for (const result of results) {
      if (result.error) {
        console.error('Error updating sort order:', result.error);
        return res.status(500).json({ error: 'Failed to update media order' });
      }
    }

    res.status(200).json({ success: true });
  } catch (error) {
    console.error('Error in media order endpoint:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
