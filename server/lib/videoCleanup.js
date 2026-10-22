/**
 * Video Orphan Cleanup
 *
 * Handles abandoned R2 objects and orphaned database records.
 * Can be run as a scheduled job or manually.
 *
 * Orphan cases:
 * 1. R2 object exists but no database record (user closed browser during upload)
 * 2. Database record marked 'failed' or 'pending' for too long
 * 3. Database record deleted but R2 object cleanup failed
 *
 * Safety:
 * - Only deletes objects older than grace period (default 1 hour)
 * - Logs all deletion activity
 * - Supports dry-run mode
 * - Keeps development cleanup separate from production
 */

require('dotenv').config();
const supabaseAdmin = require('./supabaseClient');
const mediaStorageService = require('./mediaStorageService');
const { isR2PhotoObjectKey } = require('./photoStorageKeys');

const CLEANUP_GRACE_PERIOD_MS = parseInt(process.env.VIDEO_CLEANUP_GRACE_PERIOD_HOURS || '1', 10) * 60 * 60 * 1000;
const DRY_RUN = process.env.VIDEO_CLEANUP_DRY_RUN === 'true';
const ENVIRONMENT = process.env.NODE_ENV || 'development';
const DRAFT_CLEANUP_BATCH_SIZE = 25;
const UPLOAD_SETTLE_GRACE_MS = 2 * 60 * 60 * 1000;

async function cleanupExpiredDraftUploadSessions() {
  const { data: sessions, error } = await supabaseAdmin.from('draft_media_upload_sessions')
    .select('object_key,listing_id').lte(
      'expires_at',
      new Date(Date.now() - UPLOAD_SETTLE_GRACE_MS).toISOString()
    ).limit(250);
  if (error) throw new Error(`Unable to load expired draft upload sessions: ${error.message}`);

  let deleted = 0;
  for (const session of sessions || []) {
    try {
      const [originalReference, thumbnailReference, photoReference] = await Promise.all([
        supabaseAdmin.from('property_media').select('id').eq('property_id', session.listing_id)
          .eq('storage_key', session.object_key).limit(1),
        supabaseAdmin.from('property_media').select('id').eq('property_id', session.listing_id)
          .eq('thumbnail_key', session.object_key).limit(1),
        supabaseAdmin.from('listing_photos').select('storage_path')
          .eq('listing_id', session.listing_id).eq('storage_path', session.object_key).limit(1),
      ]);
      if (originalReference.error || thumbnailReference.error || photoReference.error) {
        throw new Error(originalReference.error?.message || thumbnailReference.error?.message || photoReference.error?.message);
      }
      const referenced = (originalReference.data || []).length
        || (thumbnailReference.data || []).length
        || (photoReference.data || []).length;
      const { data: currentSession, error: currentSessionError } = await supabaseAdmin.from('draft_media_upload_sessions')
        .select('expires_at').eq('object_key', session.object_key).maybeSingle();
      if (currentSessionError) throw new Error(currentSessionError.message);
      if (!currentSession || new Date(currentSession.expires_at).getTime() > Date.now() - UPLOAD_SETTLE_GRACE_MS) continue;
      if (!referenced) {
        await mediaStorageService.deleteR2Object(session.object_key);
        deleted++;
      }
      const { error: removeSessionError } = await supabaseAdmin.from('draft_media_upload_sessions')
        .delete().eq('object_key', session.object_key).eq('expires_at', currentSession.expires_at);
      if (removeSessionError) throw new Error(removeSessionError.message);
    } catch (sessionError) {
      console.error(JSON.stringify({
        event: 'draft_upload_session_reconciliation_failed',
        listing_id: session.listing_id,
        error: sessionError.message,
      }));
    }
  }
  return { examined: (sessions || []).length, deleted };
}

async function cleanupExpiredListingDocuments() {
  const cutoff = new Date(Date.now() - CLEANUP_GRACE_PERIOD_MS).toISOString();
  const { data: pending, error } = await supabaseAdmin.from('listing_documents')
    .select('id,storage_provider,storage_key,upload_expires_at')
    .in('status', ['pending', 'verifying']).lte('upload_expires_at', cutoff).limit(250);
  if (error) throw new Error(`Unable to load expired listing document uploads: ${error.message}`);
  let cleaned = 0;
  for (const document of pending || []) {
    try {
      if (document.storage_provider === 'r2' && document.storage_key) {
        await mediaStorageService.deleteR2Object(document.storage_key);
        const verifiedKey = document.storage_key.replace(/\/incoming\./, '/verified.');
        if (verifiedKey !== document.storage_key) await mediaStorageService.deleteR2Object(verifiedKey);
      }
      const { error: updateError } = await supabaseAdmin.from('listing_documents')
        .update({ status: 'failed', upload_expires_at: null, updated_at: new Date().toISOString() })
        .eq('id', document.id).in('status', ['pending', 'verifying']).eq('upload_expires_at', document.upload_expires_at);
      if (updateError) throw updateError;
      cleaned++;
    } catch (cleanupError) {
      console.error(JSON.stringify({ event: 'listing_document_expiry_cleanup_failed', document_id: document.id, error: cleanupError.message }));
    }
  }
  const { data: staged, error: stagedError } = await supabaseAdmin.from('listing_documents')
    .select('id,storage_key,upload_expires_at')
    .eq('storage_provider', 'r2').eq('status', 'ready').not('upload_expires_at', 'is', null)
    .lte('upload_expires_at', cutoff).limit(250);
  if (stagedError) throw new Error(`Unable to load completed document staging objects: ${stagedError.message}`);
  for (const document of staged || []) {
    try {
      const incomingKey = document.storage_key.replace(/\/verified\./, '/incoming.');
      if (incomingKey !== document.storage_key) await mediaStorageService.deleteR2Object(incomingKey);
      const { error: updateError } = await supabaseAdmin.from('listing_documents')
        .update({ upload_expires_at: null, updated_at: new Date().toISOString() })
        .eq('id', document.id).eq('status', 'ready').eq('upload_expires_at', document.upload_expires_at);
      if (updateError) throw updateError;
      cleaned++;
    } catch (cleanupError) {
      console.error(JSON.stringify({ event: 'listing_document_staging_cleanup_failed', document_id: document.id, error: cleanupError.message }));
    }
  }
  const { data: deleted, error: deletedError } = await supabaseAdmin.from('listing_documents')
    .select('id,storage_provider,storage_bucket,storage_key')
    .eq('status', 'deleted').is('storage_cleaned_at', null).lte('deleted_at', cutoff).limit(250);
  if (deletedError) throw new Error(`Unable to load retired listing documents for cleanup: ${deletedError.message}`);
  for (const document of deleted || []) {
    try {
      if (document.storage_provider === 'r2' && document.storage_key) {
        await mediaStorageService.deleteR2Object(document.storage_key);
      } else if (document.storage_provider === 'supabase' && document.storage_key) {
        const { error: removeError } = await supabaseAdmin.storage.from(document.storage_bucket || 'listing-photos').remove([document.storage_key]);
        if (removeError) throw removeError;
      }
      const { error: markError } = await supabaseAdmin.from('listing_documents')
        .update({ storage_cleaned_at: new Date().toISOString() }).eq('id', document.id).eq('status', 'deleted').is('storage_cleaned_at', null);
      if (markError) throw markError;
      cleaned++;
    } catch (cleanupError) {
      console.error(JSON.stringify({ event: 'listing_document_retired_cleanup_failed', document_id: document.id, error: cleanupError.message }));
    }
  }
  return { examined: (pending || []).length, cleaned };
}

async function cleanupExpiredDraftMedia() {
  const { data: jobs, error } = await supabaseAdmin.rpc('claim_draft_media_cleanup', {
    p_batch_size: DRAFT_CLEANUP_BATCH_SIZE,
  });
  if (error) throw new Error(`Unable to claim expired draft cleanup: ${error.message}`);

  const summary = { claimed: (jobs || []).length, completed: 0, retried: 0 };
  for (const job of jobs || []) {
    try {
      const snapshot = job.objects || {};
      const r2Keys = new Set();
      const supabaseBuckets = new Map();

      for (const media of snapshot.media || []) {
        if (media.storage_provider === 'r2') {
          if (media.storage_key) r2Keys.add(media.storage_key);
          if (media.thumbnail_key) r2Keys.add(media.thumbnail_key);
        } else if (media.storage_key) {
          const bucket = media.storage_bucket || 'property-media';
          const keys = supabaseBuckets.get(bucket) || new Set();
          keys.add(media.storage_key);
          if (media.thumbnail_key) keys.add(media.thumbnail_key);
          supabaseBuckets.set(bucket, keys);
        }
      }
      for (const key of snapshot.photos || []) {
        if (!key) continue;
        if (isR2PhotoObjectKey('listing-photos', key, ENVIRONMENT)) r2Keys.add(key);
        else {
          const keys = supabaseBuckets.get('listing-photos') || new Set();
          keys.add(key);
          supabaseBuckets.set('listing-photos', keys);
        }
      }
      for (const key of snapshot.uploads || []) if (key) r2Keys.add(key);

      // Listing support documents share the draft listing lifecycle. Read
      // their exact server-owned keys while the rows still exist so a retry
      // remains possible if storage cleanup or the final state transition fails.
      const { data: documents, error: documentsError } = await supabaseAdmin.from('listing_documents')
        .select('storage_provider,storage_bucket,storage_key').eq('listing_id', job.listing_id);
      if (documentsError) throw new Error(`Unable to load listing documents for cleanup: ${documentsError.message}`);
      for (const document of documents || []) {
        if (document.storage_provider === 'r2') r2Keys.add(document.storage_key);
        else {
          const bucket = document.storage_bucket || 'listing-photos';
          const keys = supabaseBuckets.get(bucket) || new Set();
          keys.add(document.storage_key);
          supabaseBuckets.set(bucket, keys);
        }
      }

      const videoPrefix = `drafts/videos/${ENVIRONMENT}/${job.host_id}/${job.listing_id}/`;
      const photoPrefix = `drafts/photos/${ENVIRONMENT}/${job.host_id}/${job.listing_id}/`;
      for (const objectKey of await mediaStorageService.listR2Objects(videoPrefix)) r2Keys.add(objectKey);
      for (const objectKey of await mediaStorageService.listR2Objects(photoPrefix)) r2Keys.add(objectKey);
      await mediaStorageService.deleteR2Objects([...r2Keys]);

      for (const [bucket, keys] of supabaseBuckets) {
        const { error: removeError } = await supabaseAdmin.storage.from(bucket).remove([...keys]);
        if (removeError) throw new Error(`Unable to remove ${bucket} objects: ${removeError.message}`);
      }

      const { error: documentRetireError } = await supabaseAdmin.from('listing_documents')
        .update({ status: 'deleted', deleted_at: new Date().toISOString() }).eq('listing_id', job.listing_id);
      if (documentRetireError) throw new Error(`Unable to retire listing document metadata: ${documentRetireError.message}`);

      const { data: finished, error: finishError } = await supabaseAdmin.rpc('finish_draft_media_cleanup', {
        p_listing_id: job.listing_id,
      });
      if (finishError || !finished) throw new Error(finishError?.message || 'Draft cleanup finalization was rejected');
      summary.completed++;
      console.info(JSON.stringify({
        event: 'draft_media_cleanup_completed',
        listing_id: job.listing_id,
        object_count: r2Keys.size,
        attempt: job.attempts + 1,
      }));
    } catch (cleanupError) {
      const { error: retryError } = await supabaseAdmin.rpc('retry_draft_media_cleanup', {
        p_listing_id: job.listing_id,
        p_error: cleanupError.message || 'Draft media cleanup failed',
      });
      if (retryError) {
        console.error(JSON.stringify({
          event: 'draft_media_cleanup_retry_schedule_failed',
          listing_id: job.listing_id,
          error: retryError.message,
        }));
      }
      summary.retried++;
      console.error(JSON.stringify({
        event: 'draft_media_cleanup_failed',
        listing_id: job.listing_id,
        attempt: job.attempts + 1,
        error: cleanupError.message,
      }));
    }
  }
  return summary;
}

/**
 * Find and delete orphaned R2 objects
 * Orphans = objects in R2 with no corresponding active database record
 */
async function cleanupOrphanedR2Objects() {
  console.log(`\n[${new Date().toISOString()}] Starting orphaned R2 cleanup (environment: ${ENVIRONMENT})`);
  console.log(`Grace period: ${CLEANUP_GRACE_PERIOD_MS / 1000 / 60} minutes`);
  console.log(`Dry run: ${DRY_RUN}`);

  const deletedCount = { dryRun: 0, actual: 0 };

  try {
    // Step 1: Fetch all media records from database
    const { data: mediaRecords, error } = await supabaseAdmin
      .from('property_media')
      .select('property_id,storage_key,thumbnail_key,storage_provider,created_at,status,deleted_at')
      .eq('storage_provider', 'r2');

    if (error) {
      console.error('Error fetching media records:', error);
      return { error: error.message };
    }

    // Create a set of active object keys
    const activeKeys = new Set();
    const deletedKeys = new Set();
    const failedPropertyIds = [...new Set((mediaRecords || [])
      .filter((record) => record.status === 'failed' && record.property_id)
      .map((record) => record.property_id))];
    let privateFailedListingIds = new Set();
    if (failedPropertyIds.length) {
      const { data: listings, error: listingsError } = await supabaseAdmin.from('listings')
        .select('id,publication_state,created_at').in('id', failedPropertyIds);
      if (listingsError) {
        console.error('Unable to classify failed media records:', listingsError);
        return { error: listingsError.message };
      }
      privateFailedListingIds = new Set((listings || [])
        .filter((listing) => ['draft', 'payment_pending', 'failed', 'discarded', 'cleanup_pending'].includes(listing.publication_state)
          && new Date(listing.created_at).getTime() + 5 * 24 * 60 * 60 * 1000 > Date.now())
        .map((listing) => listing.id));
    }

    for (const record of mediaRecords || []) {
      if (record.status === 'deleted' && record.deleted_at) {
        // Track deleted objects for cleanup
        const deletedAt = new Date(record.deleted_at).getTime();
        const now = Date.now();
        if (now - deletedAt > CLEANUP_GRACE_PERIOD_MS) {
          deletedKeys.add(record.storage_key);
        }
      } else if (record.status !== 'failed') {
        // Active/non-failed records
        activeKeys.add(record.storage_key);
      } else {
        // Failed records older than grace period
        const createdAt = new Date(record.created_at).getTime();
        const now = Date.now();
        if (privateFailedListingIds.has(record.property_id)) {
          activeKeys.add(record.storage_key);
          if (record.thumbnail_key) activeKeys.add(record.thumbnail_key);
        } else if (now - createdAt > CLEANUP_GRACE_PERIOD_MS) {
          deletedKeys.add(record.storage_key);
        }
      }
    }

    console.log(`Active database records: ${activeKeys.size}`);
    console.log(`Records marked for cleanup: ${deletedKeys.size}`);

    // Step 2: Delete marked objects from R2
    for (const key of deletedKeys) {
      try {
        if (DRY_RUN) {
          console.log(`[DRY RUN] Would delete: ${key}`);
          deletedCount.dryRun++;
        } else {
          await mediaStorageService.deleteR2Object(key);
          const record = (mediaRecords || []).find((item) => item.storage_key === key);
          if (record && record.thumbnail_key) {
            await mediaStorageService.deleteR2Object(record.thumbnail_key);
          }
          console.log(`Deleted R2 object: ${key}`);
          deletedCount.actual++;
        }
      } catch (deleteError) {
        console.error(`Failed to delete ${key}:`, deleteError.message);
      }
    }

    console.log(`\nCleanup complete. Deleted: ${deletedCount.actual} (dry run: ${deletedCount.dryRun})`);
    return { success: true, deletedCount };
  } catch (error) {
    console.error('Fatal cleanup error:', error);
    return { error: error.message };
  }
}

/**
 * Clean up pending/uploading records stuck in intermediate states
 * These should transition to 'ready' or 'failed' but got stuck
 */
async function cleanupStuckMediaRecords() {
  console.log(`\n[${new Date().toISOString()}] Checking for stuck media records`);

  const stuckStates = ['pending', 'uploading', 'processing'];
  // Upload URLs expire after 30 minutes. Leave additional time for a PUT that
  // began just before expiry to finish before releasing its quota reservation.
  const graceMs = 2 * 60 * 60 * 1000;

  try {
    const { data: records, error } = await supabaseAdmin
      .from('property_media')
      .select('id, status, updated_at')
      .in('status', stuckStates);

    if (error) {
      console.error('Error fetching stuck records:', error);
      return { error: error.message };
    }

    const now = Date.now();
    let count = 0;

    for (const record of records || []) {
      const updatedAt = new Date(record.updated_at).getTime();
      if (now - updatedAt > graceMs) {
        if (!DRY_RUN) {
          const { data: failedRecord, error: updateError } = await supabaseAdmin
            .from('property_media')
            .update({ status: 'failed' })
            .eq('id', record.id)
            .eq('status', record.status)
            .lte('updated_at', new Date(now - graceMs).toISOString())
            .select('id')
            .maybeSingle();

          if (!updateError) {
            if (failedRecord) {
              console.log(`Marked stuck record as failed: ${record.id} (state: ${record.status})`);
              count++;
            }
          } else {
            console.error(`Failed to update record ${record.id}:`, updateError);
          }
        } else {
          console.log(`[DRY RUN] Would mark as failed: ${record.id} (state: ${record.status})`);
          count++;
        }
      }
    }

    console.log(`Stuck records processed: ${count}`);
    return { success: true, count };
  } catch (error) {
    console.error('Fatal error checking stuck records:', error);
    return { error: error.message };
  }
}

/**
 * Main cleanup function
 * Can be called via cron, scheduled job, or manual invocation
 */
async function runFullCleanup() {
  console.log('========================================');
  console.log('VaRoom Video Cleanup Job');
  console.log('========================================');

  const results = {
    orphans: null,
    stuck: null,
    startTime: new Date().toISOString(),
  };

  results.orphans = await cleanupOrphanedR2Objects();
  results.stuck = await cleanupStuckMediaRecords();
  results.uploadSessions = await cleanupExpiredDraftUploadSessions();
  results.documents = await cleanupExpiredListingDocuments();
  results.drafts = await cleanupExpiredDraftMedia();

  results.endTime = new Date().toISOString();

  console.log('\n========================================');
  console.log('Cleanup Summary:');
  console.log(JSON.stringify(results, null, 2));
  console.log('========================================\n');

  return results;
}

// If run directly as a script
if (require.main === module) {
  runFullCleanup()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error('Cleanup failed:', error);
      process.exit(1);
    });
}

module.exports = {
  runFullCleanup,
  cleanupOrphanedR2Objects,
  cleanupStuckMediaRecords,
  cleanupExpiredDraftMedia,
  cleanupExpiredDraftUploadSessions,
  cleanupExpiredListingDocuments,
};
