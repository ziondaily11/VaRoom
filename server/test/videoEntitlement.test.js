'use strict';

process.env.VIDEO_UPLOADS_ENABLED = 'true';
process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'test-service-role-key';

const test = require('node:test');
const assert = require('node:assert/strict');
const { canUploadPropertyVideo, videoListingAllowance, VIDEO_MAX_COUNT_PER_PROPERTY } = require('../lib/videoEntitlement');

// Videos come with Airbnb, Hotel and Venue plans: each plan allows a video on
// a number of listings, at most 2 videos on each. Silver / Gold are photos only.

const NOW = new Date('2026-11-27T12:00:00Z');
const LATER = '2026-12-27T12:00:00Z';
const EARLIER = '2026-11-01T12:00:00Z';

/** A fake database: the host's plan, their listings, and which of those have a video. */
function database({ limit = 2, plan = true, listings = [], withVideo = [] } = {}) {
  const calls = [];
  return {
    calls,
    from(table) {
      const query = {
        filters: {},
        select() { return query; }, order() { return query; }, limit() { return query; },
        eq(column, value) { query.filters[column] = value; return query; },
        in(column, values) { query.filters[column] = values; return query; },
        is(column, value) { query.filters[column] = value; return query; },
        maybeSingle: async () => ({ data: plan ? {
          id: 'sub-1', plan_id: 'airbnb_pro', status: 'active', niche: 'airbnb', current_period_end: '2099-01-01T00:00:00Z',
          billing_plans: { features: { video_listings: limit > 0, video_listing_limit: limit } },
        } : null, error: null }),
        then(resolve) {
          calls.push([table, query.filters]);
          if (table === 'listings') return resolve({ data: listings, error: null });
          const asked = query.filters.property_id || [];
          return resolve({ data: withVideo.filter((id) => asked.includes(id)).map((id) => ({ property_id: id })), error: null });
        },
      };
      return query;
    },
  };
}
const listing = (id, publication_state = 'published', availability_status = 'available', live_until = LATER) => ({ id, publication_state, availability_status, live_until });
const host = { id: 'host-1' };

test('Silver / Gold listings are photos only', async () => {
  for (const category of ['property', 'shop', 'office']) {
    const result = await canUploadPropertyVideo(database(), host, { id: 'l1', category }, 0);
    assert.equal(result.allowed, false, category);
    assert.match(result.reason, /Silver and Gold listings use photos/);
  }
});

test('a plan without video, or no plan, cannot add video', async () => {
  for (const db of [database({ limit: 0 }), database({ plan: false })]) {
    const result = await canUploadPropertyVideo(db, host, { id: 'l1', category: 'hotel' }, 0);
    assert.equal(result.allowed, false);
    assert.match(result.reason, /does not include video/);
  }
});

test('video on up to the plan\'s number of listings; a listing that has one keeps its place', async () => {
  const full = database({ limit: 2, listings: [listing('a'), listing('b'), listing('l1')], withVideo: ['a', 'b'] });
  const refused = await canUploadPropertyVideo(full, host, { id: 'l1', category: 'airbnb' }, 0);
  assert.equal(refused.allowed, false);
  assert.match(refused.reason, /video on 2 listings, and all are in use\. Upgrade for more, or pause a listing that has a video\./);
  assert.equal((await canUploadPropertyVideo(full, host, { id: 'l1', category: 'airbnb' }, 1)).allowed, true, 'its second video');
  const room = database({ limit: 2, listings: [listing('a'), listing('l1')], withVideo: ['a'] });
  assert.equal((await canUploadPropertyVideo(room, host, { id: 'l1', category: 'airbnb' }, 0)).allowed, true);
});

test(`at most ${VIDEO_MAX_COUNT_PER_PROPERTY} videos on one listing`, async () => {
  assert.equal(VIDEO_MAX_COUNT_PER_PROPERTY, 2);
  const result = await canUploadPropertyVideo(database({ limit: 5 }), host, { id: 'l1', category: 'venue' }, 2);
  assert.equal(result.allowed, false);
  assert.match(result.reason, /up to 2 videos/);
});

test('what counts: drafts and online listings with a video; paused, offline and the listing itself do not', async () => {
  const db = database({
    limit: 5,
    listings: [
      listing('draft', 'draft', 'draft', null),
      listing('online'),
      listing('paused', 'published', 'paused'),
      listing('offline', 'published', 'available', EARLIER),
      listing('self'),
    ],
    withVideo: ['draft', 'online', 'paused', 'offline', 'self'],
  });
  assert.deepEqual(await videoListingAllowance(db, 'host-1', 'self', NOW), { limit: 5, used: 2 });
  const [, mediaQuery] = db.calls.find(([table]) => table === 'property_media');
  assert.deepEqual(mediaQuery.property_id, ['draft', 'online']);
  assert.deepEqual(mediaQuery.status, ['pending', 'uploading', 'processing', 'ready']);
  assert.equal(mediaQuery.deleted_at, null);
});

test('the migration gives each plan its video number, matching the plan cards', () => {
  const sql = require('node:fs').readFileSync(require('node:path').join(__dirname, '..', 'migrations', '20261127_000083_plan_video_listing_limits.sql'), 'utf8');
  const limits = Object.fromEntries([...sql.matchAll(/\('(\w+)', (\d+)\)/g)].map(([, id, n]) => [id, Number(n)]));
  assert.deepEqual(limits, {
    airbnb_starter: 0, airbnb_pro: 2, airbnb_business: 5,
    hotel_dining: 0, hotel_boutique: 1, hotel_standard: 2, hotel_plus: 4,
    venue_basic: 0, venue_pro: 2, venue_premium: 5,
    basic: 0, growth: 1, pro: 3,
    property_basic: 0, property_pro: 0, property_premium: 0, shops_basic: 0, shops_pro: 0, shops_premium: 0,
  });
  assert.match(sql, /jsonb_build_object\('video_listing_limit', v\.listings, 'video_listings', v\.listings > 0\)/, 'the yes / no stays in step');
});
