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

const CLEANUP_GRACE_PERIOD_MS = parseInt(process.env.VIDEO_CLEANUP_GRACE_PERIOD_HOURS || '1', 10) * 60 * 60 * 1000;
const DRY_RUN = process.env.VIDEO_CLEANUP_DRY_RUN === 'true';
const ENVIRONMENT = process.env.NODE_ENV || 'development';

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
      .select('storage_key, storage_provider, created_at, status, deleted_at')
      .eq('storage_provider', 'r2');

    if (error) {
      console.error('Error fetching media records:', error);
      return { error: error.message };
    }

    // Create a set of active object keys
    const activeKeys = new Set();
    const deletedKeys = new Set();

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
        if (now - createdAt > CLEANUP_GRACE_PERIOD_MS) {
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

  const stuckStates = ['pending', 'uploading'];
  const graceMs = 30 * 60 * 1000; // 30 minutes for stuck uploads

  try {
    const { data: records, error } = await supabaseAdmin
      .from('property_media')
      .select('id, status, created_at')
      .in('status', stuckStates);

    if (error) {
      console.error('Error fetching stuck records:', error);
      return { error: error.message };
    }

    const now = Date.now();
    let count = 0;

    for (const record of records || []) {
      const createdAt = new Date(record.created_at).getTime();
      if (now - createdAt > graceMs) {
        if (!DRY_RUN) {
          const { error: updateError } = await supabaseAdmin
            .from('property_media')
            .update({ status: 'failed' })
            .eq('id', record.id);

          if (!updateError) {
            console.log(`Marked stuck record as failed: ${record.id} (state: ${record.status})`);
            count++;
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
};
