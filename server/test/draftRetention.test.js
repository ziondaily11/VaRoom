'use strict';

// Unpaid drafts follow the Terms of Service: "Unpaid drafts are automatically
// deleted after 7 days together with all their details." These tests keep the
// server, the database and the Terms on the same number, and check that a
// cleaned-up or discarded draft leaves the host's profile.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { DRAFT_RETENTION_DAYS, DRAFT_RETENTION_MS, draftStillKept } = require('../lib/draftRetention');

const root = path.join(__dirname, '..', '..');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');
const migration = read('server', 'migrations', '20261119_000074_draft_retention_7_days.sql');
const route = read('server', 'routes', 'listingRoutes.js');

test('7 days everywhere: Terms, server and every database guard', () => {
  assert.equal(DRAFT_RETENTION_DAYS, 7);
  assert.equal(DRAFT_RETENTION_MS, 7 * 24 * 60 * 60 * 1000);
  assert.match(read('client', 'lib', 'legal', 'termsContent.ts'), /Unpaid drafts are automatically deleted after 7 days together with all their details/);
  for (const fn of ['claim_draft_media_cleanup', 'reserve_property_video_upload', 'claim_property_video_finalization', 'reserve_draft_photo_upload']) {
    const body = migration.slice(migration.indexOf(`function public.${fn}(`));
    const end = body.indexOf('\n$$;');
    assert.match(body.slice(0, end), /interval '7 days'/, fn);
    assert.doesNotMatch(body.slice(0, end), /interval '5 days'/, fn);
  }
  for (const file of ['lib/listingMediaAccess.js', 'lib/videoCleanup.js']) {
    const source = read('server', file);
    assert.match(source, /DRAFT_RETENTION_MS/, file);
    assert.doesNotMatch(source, /5 \* 24 \* 60 \* 60 \* 1000/, file);
  }
});

test('the saved draft goes with its listing: cleanup, discard, and drafts never linked to a listing', () => {
  const finish = migration.slice(migration.indexOf('function public.finish_draft_media_cleanup('));
  assert.match(finish.slice(0, finish.indexOf('\n$$;')), /delete from public\.host_listing_drafts where listing_id = p_listing_id;/);
  const discard = migration.slice(migration.indexOf('function public.varoom_discard_draft_listing('));
  const discardBody = discard.slice(0, discard.indexOf('\n$$;'));
  assert.equal((discardBody.match(/delete from public\.host_listing_drafts where listing_id = p_listing_id and host_id = p_host_id;/g) || []).length, 2, 'new discard and already-discarded');
  const claim = migration.slice(migration.indexOf('function public.claim_draft_media_cleanup('));
  assert.match(claim, /delete from public\.host_listing_drafts\s+where listing_id is null and created_at <= now\(\) - interval '7 days';/);
  assert.match(migration, /grant execute on function public\.finish_draft_media_cleanup\(uuid\) to service_role;/);
});

test('which saved drafts stay on the profile', () => {
  const now = Date.parse('2026-11-19T12:00:00Z');
  const daysAgo = (n) => new Date(now - n * 86400000).toISOString();
  // Never linked to a listing: kept for 7 days.
  assert.equal(draftStillKept({ listing_id: null, created_at: daysAgo(6) }, null, now), true);
  assert.equal(draftStillKept({ listing_id: null, created_at: daysAgo(7) }, null, now), false);
  // An unpaid listing: kept for 7 days from the listing's creation.
  const draft = { listing_id: 'L1', created_at: daysAgo(1) };
  assert.equal(draftStillKept(draft, { publication_state: 'draft', created_at: daysAgo(6) }, now), true);
  assert.equal(draftStillKept(draft, { publication_state: 'failed', created_at: daysAgo(8) }, now), false, 'the cleanup has not run yet: hidden anyway');
  for (const state of ['discarded', 'cleanup_pending', 'expired']) {
    assert.equal(draftStillKept(draft, { publication_state: state, created_at: daysAgo(1) }, now), false, state);
  }
  // A published listing's edit draft never expires.
  assert.equal(draftStillKept(draft, { publication_state: 'published', created_at: daysAgo(90) }, now), true);
});

test('drafts API: hides cleared drafts; Discard draft discards an unpaid listing, never a paying or published one', () => {
  const list = route.slice(route.indexOf("router.get('/listing-drafts',"), route.indexOf("router.get('/listing-drafts/:id'"));
  assert.match(list, /\.select\('id,publication_state,created_at'\)\.in\('id', listingIds\)\.eq\('host_id', user\.id\)/);
  assert.match(list, /drafts\.filter\(\(draft\) => draftStillKept\(/);
  const remove = route.slice(route.indexOf("router.delete('/listing-drafts/:id'"));
  assert.match(remove, /if \(req\.query\.discard === '1'\)/);
  assert.match(remove, /listing\.publication_state === 'payment_pending'[\s\S]*?status\(409\)[\s\S]*?DRAFT_PAYMENT_PENDING/);
  assert.match(remove, /UNPUBLISHED_STATES\.has\(listing\.publication_state\)[\s\S]*?rpc\('varoom_discard_draft_listing'/);
  assert.match(remove, /\.eq\('id', draft\.listing_id\)\.eq\('host_id', user\.id\)/, 'only the host\'s own listing');
  // The wizard's own clean-up (no ?discard) still only removes the draft row.
  assert.match(remove, /from\('host_listing_drafts'\)\.delete\(\)\s+\.eq\('id', id\)\.eq\('host_id', user\.id\)/);
});
