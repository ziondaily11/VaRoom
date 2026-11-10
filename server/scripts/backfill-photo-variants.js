require('dotenv').config();

// Makes the size copies (lib/photoVariants.js) of photos saved before copies
// were made at upload, so their first viewers do not wait for them.
//
//   node scripts/backfill-photo-variants.js            lists what it would do (no changes)
//   node scripts/backfill-photo-variants.js --apply    makes the missing copies
//   ... --apply --limit 200                            at most 200 photos this run
//
// It writes to R2 (copies only; originals and the database are not changed).
// Copies that already exist are skipped, so it can be stopped and run again.
// One photo at a time, to keep the load on the storage and the CPU low.

const supabase = require('../lib/supabaseClient');
const mediaStorageService = require('../lib/mediaStorageService');
const { isR2PhotoObjectKey } = require('../lib/photoStorageKeys');
const { ensureVariants, uploadWidthsFor } = require('../lib/photoVariants');

const PAGE_SIZE = 500;

function option(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? null : process.argv[index + 1];
}

/** Public R2 photo keys of a category, read page by page. */
async function collect(table, column, category, filter) {
  const keys = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    let query = supabase.from(table).select(column).order(column, { ascending: true }).range(offset, offset + PAGE_SIZE - 1);
    if (filter) query = filter(query);
    const { data, error } = await query;
    if (error) throw error;
    if (!data || data.length === 0) break;
    data.forEach((row) => {
      const key = row[column];
      // Draft photos are private and served whole; they get copies when published.
      if (typeof key === 'string' && !key.startsWith('drafts/') && isR2PhotoObjectKey(category, key, mediaStorageService.ENVIRONMENT)) {
        keys.push({ category, key });
      }
    });
    if (data.length < PAGE_SIZE) break;
  }
  return keys;
}

async function main() {
  const apply = process.argv.includes('--apply');
  const limit = Number(option('--limit')) || Infinity;

  const photos = [
    ...await collect('listing_photos', 'storage_path', 'listing-photos'),
    ...await collect('profiles', 'avatar_url', 'avatars', (query) => query.not('avatar_url', 'is', null)),
  ];
  const listing = photos.filter((photo) => photo.category === 'listing-photos').length;
  console.log(`${photos.length} stored photos have copies to check (${listing} listing photos, ${photos.length - listing} avatars).`);
  if (!apply) {
    console.log('Nothing was changed. Run again with --apply to make the missing copies.');
    return;
  }

  let checked = 0;
  let made = 0;
  let failed = 0;
  for (const { category, key } of photos.slice(0, limit)) {
    try {
      const widths = await ensureVariants(mediaStorageService, key, uploadWidthsFor(category));
      made += widths.length;
    } catch (error) {
      failed += 1;
      console.warn(`Copies for ${key} could not be made (they will be made on first view): ${error.message || error}`);
    }
    checked += 1;
    if (checked % 50 === 0) console.log(`${checked} photos checked, ${made} copies made…`);
  }
  console.log(`Done: ${checked} photos checked, ${made} copies made, ${failed} failed.`);
}

main().catch((error) => {
  console.error(error.message || error);
  process.exitCode = 1;
});
