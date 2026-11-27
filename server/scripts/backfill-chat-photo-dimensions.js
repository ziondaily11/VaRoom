require('dotenv').config();

const sharp = require('sharp');
const supabase = require('../lib/supabaseClient');
const mediaStorageService = require('../lib/mediaStorageService');

// Chat photos sent before message_attachments had width/height: reads each
// one's size (after EXIF rotation, as it shows) so its bubble opens at that size.
// Safe to re-run; only photos still without a size are read.

const PAGE_SIZE = 100;

async function main() {
  let scanned = 0;
  let updated = 0;
  let unavailable = 0;
  let after = '00000000-0000-0000-0000-000000000000';

  while (true) {
    const { data: photos, error } = await supabase.from('message_attachments')
      .select('id,storage_key')
      .eq('kind', 'photo').eq('status', 'ready').eq('storage_provider', 'r2')
      .is('width', null).gt('id', after)
      .order('id', { ascending: true })
      .limit(PAGE_SIZE);
    if (error) throw error;
    if (!photos || photos.length === 0) break;
    after = photos[photos.length - 1].id;

    for (const photo of photos) {
      scanned++;
      try {
        const metadata = await sharp(await mediaStorageService.downloadR2Object(photo.storage_key)).metadata();
        const swapsAxes = [5, 6, 7, 8].includes(metadata.orientation);
        const width = swapsAxes ? metadata.height : metadata.width;
        const height = swapsAxes ? metadata.width : metadata.height;
        if (!(width > 0 && height > 0)) throw new Error('no dimensions');
        const { error: updateError } = await supabase.from('message_attachments').update({ width, height }).eq('id', photo.id);
        if (updateError) throw updateError;
        updated++;
      } catch (photoError) {
        unavailable++;
        console.warn(`Could not read chat photo ${photo.id}: ${photoError.message}`);
      }
    }
  }

  console.info(JSON.stringify({ scanned, updated, unavailable }, null, 2));
  if (unavailable) process.exitCode = 1;
}

main().catch((error) => {
  console.error('Chat photo dimension backfill failed:', error);
  process.exitCode = 1;
});
