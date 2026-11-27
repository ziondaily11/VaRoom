'use strict';

// Migration 088: at most 8 photos and videos per listing, and each picked photo once.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = (name) => fs.readFileSync(path.join(__dirname, '..', 'migrations', name), 'utf8');
const sql = read('20261127_000088_listing_media_cap.sql');

test('photos and videos share one cap of 8, checked before each insert under the per-listing lock', () => {
  assert.match(sql, /create trigger listing_photos_media_cap\s+before insert on public\.listing_photos\s+for each row execute function public\.varoom_guard_listing_media_cap\('listing_id'\);/);
  assert.match(sql, /create trigger property_media_media_cap\s+before insert on public\.property_media\s+for each row execute function public\.varoom_guard_listing_media_cap\('property_id'\);/);
  assert.match(sql, /if v_total >= 8 then/);
  // The same lock as the video reservation (migration 074), so a photo and a video can't both take the last place.
  const lock = 'pg_advisory_xact_lock(hashtextextended(';
  assert.ok(read('20261119_000074_draft_retention_7_days.sql').includes(`${lock}p_property_id::text, 0))`));
  assert.ok(sql.includes(`${lock}v_listing::text, 0))`));
  assert.doesNotMatch(sql.replace(/^--.*$/gm, ''), /new\.media_type|new\.listing_id|new\.property_id/, 'fields read through to_jsonb: each table lacks the other\'s');
});

test('a picked photo is on a listing once; older rows without a fingerprint are untouched', () => {
  assert.match(sql, /create unique index if not exists listing_photos_listing_source_fingerprint_key\s+on public\.listing_photos \(listing_id, source_fingerprint\) where source_fingerprint is not null;/);
  assert.match(sql, /-- Undo:[\s\S]*drop column if exists source_fingerprint;/);
});
