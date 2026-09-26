const supabase = require('./supabaseClient');
const mediaStorage = require('./mediaStorageService');

async function enqueueMediaCleanup(storageProvider, storageBucket, storageKey) {
  if (!['r2', 'supabase'].includes(storageProvider) || !storageBucket || !storageKey) {
    throw new Error('Invalid media cleanup reference');
  }
  const { data, error } = await supabase.from('media_cleanup_queue').upsert({
    storage_provider: storageProvider,
    storage_bucket: storageBucket,
    storage_key: storageKey,
    attempts: 0,
    last_error: null,
  }, {
    onConflict: 'storage_provider,storage_bucket,storage_key',
  }).select('id').single();
  if (error) throw new Error(`Unable to schedule media cleanup: ${error.message}`);
  return data.id;
}

async function objectIsReferenced(storageKey) {
  const results = await Promise.all([
    supabase.from('listing_photos').select('media_id').eq('storage_path', storageKey).limit(1),
    supabase.from('profiles').select('id').eq('avatar_url', storageKey).limit(1),
    supabase.from('property_media').select('id')
      .or(`storage_key.eq.${storageKey},thumbnail_key.eq.${storageKey}`).limit(1),
    supabase.from('message_attachments').select('id')
      .or(`storage_key.eq.${storageKey},source_storage_key.eq.${storageKey},thumbnail_key.eq.${storageKey}`).limit(1),
    supabase.from('varoom_updates').select('id').contains('image_urls', [storageKey]).limit(1),
    supabase.from('varoom_updates').select('id').eq('image_url', storageKey).limit(1),
  ]);
  const failed = results.find((result) => result.error);
  if (failed) throw new Error(`Unable to verify media references before cleanup: ${failed.error.message}`);
  return results.some((result) => (result.data || []).length > 0);
}

async function processMediaCleanup(id) {
  const { data: task, error: lookupError } = await supabase.from('media_cleanup_queue')
    .select('id,storage_provider,storage_bucket,storage_key,attempts')
    .eq('id', id).maybeSingle();
  if (lookupError) throw new Error(`Unable to load media cleanup task: ${lookupError.message}`);
  if (!task) return { deleted: false, missing: true };

  try {
    if (await objectIsReferenced(task.storage_key)) {
      return { deleted: false, referenced: true };
    }
    if (task.storage_provider === 'r2') {
      await mediaStorage.deleteR2Object(task.storage_key);
    } else {
      const { error } = await supabase.storage.from(task.storage_bucket).remove([task.storage_key]);
      if (error) throw new Error(error.message);
    }
    const { error: deleteError } = await supabase.from('media_cleanup_queue').delete().eq('id', id);
    if (deleteError) throw new Error(`Unable to remove completed cleanup task: ${deleteError.message}`);
    return { deleted: true };
  } catch (error) {
    const { error: updateError } = await supabase.from('media_cleanup_queue').update({
      attempts: Number(task.attempts || 0) + 1,
      last_error: String(error.message || error).slice(0, 1000),
      last_attempted_at: new Date().toISOString(),
    }).eq('id', id);
    if (updateError) console.error('Unable to record media cleanup failure:', updateError);
    console.error('Media cleanup task failed:', { taskId: id, error: error.message || error });
    return { deleted: false, error };
  }
}

async function processPendingMediaCleanup(limit = 100) {
  const { data, error } = await supabase.from('media_cleanup_queue')
    .select('id').order('created_at', { ascending: true }).limit(limit);
  if (error) throw new Error(`Unable to list media cleanup tasks: ${error.message}`);
  const summary = { total: (data || []).length, deleted: 0, deferred: 0, failed: 0 };
  for (const task of data || []) {
    const result = await processMediaCleanup(task.id);
    if (result.deleted) summary.deleted += 1;
    else if (result.referenced || result.missing) summary.deferred += 1;
    else summary.failed += 1;
  }
  return summary;
}

module.exports = { enqueueMediaCleanup, processMediaCleanup, processPendingMediaCleanup };
