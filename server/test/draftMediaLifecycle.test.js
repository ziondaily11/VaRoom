'use strict';

process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'test-service-role-key';

const test = require('node:test');
const assert = require('node:assert/strict');
const { publishedObjectKey, promoteListingMedia } = require('../lib/listingMediaPromotion');

const listingId = '11111111-1111-4111-8111-111111111111';
const hostId = '22222222-2222-4222-8222-222222222222';
const photoSource = `drafts/photos/production/${hostId}/${listingId}/photo-id/original.jpg`;
const videoSource = `drafts/videos/production/${hostId}/${listingId}/media-id/original.mp4`;

test('maps private draft keys into the published media namespaces', () => {
  assert.equal(
    publishedObjectKey(photoSource),
    `photos/production/listing-photos/${hostId}/photo-id/original.jpg`,
  );
  assert.equal(
    publishedObjectKey(videoSource),
    `videos/production/${hostId}/${listingId}/media-id/original.mp4`,
  );
  assert.equal(publishedObjectKey('videos/production/legacy/key.mp4'), null);
});

test('copies and verifies media before changing its authoritative database reference', async () => {
  const events = [];
  const media = [{
    id: 'media-id',
    host_id: hostId,
    storage_key: videoSource,
    thumbnail_key: videoSource.replace('/original.mp4', '/thumbnail.jpg'),
    status: 'ready',
  }];
  const photos = [{ storage_path: photoSource }];
  const supabaseAdmin = {
    from(table) {
      return {
        select() { return this; },
        eq() { return this; },
        is() { return this; },
        upsert(values) {
          events.push(['retain', table, values.object_key]);
          return Promise.resolve({ error: null });
        },
        update(values) {
          this.values = values;
          events.push(['update', table, values]);
          return this;
        },
        async maybeSingle() {
          events.push(['persisted', table]);
          if (table === 'property_media') {
            media[0] = { ...media[0], ...this.values };
            return { data: { id: media[0].id }, error: null };
          }
          photos[0] = { ...photos[0], ...this.values };
          return { data: { storage_path: photos[0].storage_path }, error: null };
        },
        then(resolve, reject) {
          const data = table === 'draft_media_upload_sessions' ? [] : table === 'listing_photos' ? photos : media;
          return Promise.resolve({ data, error: null }).then(resolve, reject);
        },
      };
    },
  };
  const storage = {
    async copyR2Object(source, destination) {
      events.push(['copy', source, destination]);
      return { exists: true };
    },
  };

  await promoteListingMedia(listingId, { supabaseAdmin, mediaStorageService: storage, hostId });
  for (const event of events.filter((item) => item[0] === 'persisted')) {
    const previousCopy = events.slice(0, events.indexOf(event)).some((item) => item[0] === 'copy');
    assert.equal(previousCopy, true);
  }
  assert.equal(media[0].storage_key.startsWith('videos/'), true);
  assert.equal(media[0].thumbnail_key.startsWith('videos/'), true);
  assert.equal(photos[0].storage_path.startsWith('photos/'), true);
});

test('leaves draft references unchanged if an R2 copy cannot be verified', async () => {
  const media = [{ id: 'media-id', host_id: hostId, storage_key: videoSource, status: 'ready' }];
  const supabaseAdmin = {
    from(table) {
      return {
        select() { return this; },
        eq() { return this; },
        is() { return this; },
        upsert: async () => ({ error: null }),
        update() { throw new Error(`Database reference should not change: ${table}`); },
        then(resolve, reject) {
          const data = table === 'draft_media_upload_sessions' ? [] : table === 'listing_photos' ? [] : media;
          return Promise.resolve({ data, error: null }).then(resolve, reject);
        },
      };
    },
  };
  await assert.rejects(
    promoteListingMedia(listingId, {
      supabaseAdmin,
      hostId,
      mediaStorageService: { copyR2Object: async () => { throw new Error('copy failed'); } },
    }),
    /copy failed/,
  );
  assert.equal(media[0].storage_key, videoSource);
});
