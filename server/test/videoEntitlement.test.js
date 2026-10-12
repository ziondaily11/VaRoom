'use strict';

process.env.VIDEO_UPLOADS_ENABLED = 'true';
process.env.VIDEO_PREMIUM_REQUIRED = 'true';
process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'test-service-role-key';

const test = require('node:test');
const assert = require('node:assert/strict');
const { canUploadPropertyVideo } = require('../lib/videoEntitlement');

test('new listing-payment niches use publication entitlement rather than legacy premium-video gating', async () => {
  const supabase = { from() { throw new Error('new listing niches must not use legacy subscription video gating'); } };
  for (const category of ['property', 'shop', 'office']) {
    const result = await canUploadPropertyVideo(supabase, { id: 'host-1' }, { category }, 0);
    assert.equal(result.allowed, true, `${category} video uploads should remain subject to publication entitlement`);
  }
});

test('legacy video niches preserve their existing premium-subscription requirement', async () => {
  const supabase = {
    from(table) {
      assert.equal(table, 'host_subscriptions');
      const query = {
        select() { return this; },
        eq() { return this; },
        in() { return this; },
        order() { return this; },
        limit() { return this; },
        maybeSingle: async () => ({ data: null, error: null }),
      };
      return query;
    },
  };
  const result = await canUploadPropertyVideo(supabase, { id: 'host-1' }, { category: 'hotel' }, 0);
  assert.equal(result.allowed, false);
  assert.match(result.reason, /active Growth or Pro subscription/);
});

test('legacy Growth/Pro subscribers retain premium video access', async () => {
  const supabase = {
    from() {
      const query = {
        select() { return this; },
        eq() { return this; },
        in() { return this; },
        order() { return this; },
        limit() { return this; },
        maybeSingle: async () => ({
          data: {
            id: 'sub-1',
            plan_id: 'growth',
            status: 'active',
            current_period_end: '2099-01-01T00:00:00.000Z',
            billing_plans: { features: { video_listings: true } },
          },
          error: null,
        }),
      };
      return query;
    },
  };
  const result = await canUploadPropertyVideo(supabase, { id: 'host-1' }, { category: 'hotel' }, 0);
  assert.equal(result.allowed, true);
});
