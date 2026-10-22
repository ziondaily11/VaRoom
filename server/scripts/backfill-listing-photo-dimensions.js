require('dotenv').config();

const sharp = require('sharp');
const supabase = require('../lib/supabaseClient');
const mediaStorageService = require('../lib/mediaStorageService');
const { inspectVideoDimensions } = require('../lib/mediaOptimizationService');

const PAGE_SIZE = 100;

async function main(){
  let offset = 0;
  let scanned = 0;
  let updated = 0;
  let unavailable = 0;
  let videosScanned = 0;
  let videosUpdated = 0;

  while (true) {
    const { data: photos, error } = await supabase.from('listing_photos')
      .select('storage_path,width,height')
      .order('storage_path', { ascending:true })
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) throw error;
    if (!photos || photos.length === 0) break;
    offset += photos.length;

    for (const photo of photos) {
      scanned++;
      if (Number.isInteger(photo.width) && photo.width > 0 && Number.isInteger(photo.height) && photo.height > 0) continue;
      const { data: blob, error: downloadError } = await supabase.storage.from('listing-photos').download(photo.storage_path);
      if (downloadError || !blob) {
        unavailable++;
        console.warn(`Could not read listing photo ${photo.storage_path}: ${downloadError?.message || 'empty object'}`);
        continue;
      }
      try {
        const metadata = await sharp(Buffer.from(await blob.arrayBuffer())).metadata();
        const swapsAxes = [5, 6, 7, 8].includes(metadata.orientation);
        const width = swapsAxes ? metadata.height : metadata.width;
        const height = swapsAxes ? metadata.width : metadata.height;
        if (!Number.isInteger(width) || width <= 0 || !Number.isInteger(height) || height <= 0) {
          unavailable++;
          console.warn(`Image dimensions unavailable for ${photo.storage_path}`);
          continue;
        }
        const { error: updateError } = await supabase.from('listing_photos')
          .update({ width, height })
          .eq('storage_path', photo.storage_path);
        if (updateError) throw updateError;
        updated++;
      } catch (metadataError) {
        unavailable++;
        console.warn(`Could not extract dimensions for ${photo.storage_path}: ${metadataError.message}`);
      }
    }
  }

  offset = 0;
  while (true) {
    const { data: videos, error } = await supabase.from('property_media')
      .select('id,storage_provider,storage_key,mime_type,width,height')
      .eq('media_type', 'video')
      .eq('status', 'ready')
      .is('deleted_at', null)
      .order('id', { ascending:true })
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) throw error;
    if (!videos || videos.length === 0) break;
    offset += videos.length;

    for (const video of videos) {
      videosScanned++;
      if (Number.isInteger(video.width) && video.width > 0 && Number.isInteger(video.height) && video.height > 0) continue;
      if (video.storage_provider !== 'r2') {
        unavailable++;
        console.warn(`Unsupported storage provider for video ${video.id}: ${video.storage_provider}`);
        continue;
      }
      try {
        const buffer = await mediaStorageService.downloadR2Object(video.storage_key);
        const dimensions = await inspectVideoDimensions(buffer, video.mime_type);
        if (!dimensions.width || !dimensions.height) {
          unavailable++;
          console.warn(`Video dimensions unavailable for ${video.id}`);
          continue;
        }
        const { error:updateError } = await supabase.from('property_media')
          .update(dimensions).eq('id', video.id).eq('status', 'ready').is('deleted_at', null);
        if (updateError) throw updateError;
        videosUpdated++;
      } catch (metadataError) {
        unavailable++;
        console.warn(`Could not extract dimensions for video ${video.id}: ${metadataError.message}`);
      }
    }
  }

  console.info(JSON.stringify({ photos:{ scanned, updated }, videos:{ scanned:videosScanned, updated:videosUpdated }, unavailable }, null, 2));
  if (unavailable) process.exitCode = 1;
}

main().catch(function(error){
  console.error('Listing photo dimension backfill failed:', error);
  process.exitCode = 1;
});
