'use strict';

// Opening the listing wizard (lib/listWizard/startup.ts): which saved state
// a visit restores (none for a fresh visit, ?draft= for Continue Listing, the
// verified checkout copy after Paystack or Go Pro), how a returned payment
// is verified, and edit mode's host scoping.

const test = require('node:test');
const assert = require('node:assert/strict');
const { File } = require('node:buffer');
const { loadWizard, createMemoryIndexedDB, createMemoryStorage, jsonResponse, routedFetch, fakeSupabase } = require('./helpers/listWizardFakes');

const { createListingDraftCache } = loadWizard('draftCache.ts');
const drafts = loadWizard('drafts.ts');
const { emptyForm } = loadWizard('formState.ts');

const noMedia = () => ({ mediaFiles: [], policyFile: null, officeShopFiles: { floorPlan: null, policy: null, documents: [] }, documentRefs: {} });
const params = (overrides = {}) => ({ edit: null, draft: null, payment: null, subscription: null, reference: null, ...overrides });
const notOnAPlan = { entitlements: { active: false, subscription: null, canCreateAnotherListing: { allowed: false } } };

/**
 * One visit: a host with `niche`, the device storage shared across visits
 * (`device`), and the wizard modules loaded with `routes` as the network.
 */
function visit({ niche = 'property', routes = {}, device = { idb: createMemoryIndexedDB(), storage: createMemoryStorage() }, search = '', tables = {} } = {}) {
  const network = routedFetch({ 'GET /api/billing/entitlements': notOnAPlan, ...routes });
  const sessionStorage = createMemoryStorage();
  const globals = { fetch: network.fetch, window: { location: { search }, sessionStorage } };
  const { WizardSession } = loadWizard('wizardSession.ts', globals);
  const { startWizard } = loadWizard('startup.ts', globals);
  const cache = createListingDraftCache({ indexedDBRef: device.idb, storage: device.storage });
  const pointerReads = [];
  const draftCache = { ...cache, getPointer: (hostId) => { pointerReads.push(hostId); return cache.getPointer(hostId); } };
  const state = { form: emptyForm(), media: noMedia() };
  const session = new WizardSession({
    hostId: 'host-1', editMode: false, cache, storage: device.storage,
    capture: (identity) => drafts.captureSnapshot(identity, niche, state.form, state.media, 'month'),
    token: async () => 'token-1', onStatus: () => {}, onDraftId: () => {}, paymentVerified: () => false,
  });
  const client = fakeSupabase({ tables: { profiles: { role: 'host', listing_categories: [niche] }, ...tables } });
  const checking = [];
  const replaced = [];
  const run = (query) => startWizard({ client, session, draftCache, hostId: 'host-1', params: query, onChecking: (text) => checking.push(text), replaceUrl: (url) => replaced.push(url) });
  return { run, session, cache, device, state, client, network, pointerReads, checking, replaced };
}

/** A checkout copy saved by an earlier visit (what Pay to list / Go Pro leave behind). */
async function leaveCheckoutCopy(device, { niche = 'property', listingId = 'listing-1', title = 'Paid listing' } = {}) {
  const earlier = visit({ niche, device });
  earlier.session.draftId = 'draft-1';
  earlier.state.form = { ...emptyForm(), currentStep: 4, furthestStep: 4, fields: { title } };
  earlier.state.media = { ...noMedia(), mediaFiles: [new File(['img'], 'a.jpg', { type: 'image/jpeg', lastModified: 1 })] };
  await earlier.session.saveCheckoutState(listingId);
}

test('a fresh visit neither reads the previous draft pointer nor restores anything', async () => {
  const device = { idb: createMemoryIndexedDB(), storage: createMemoryStorage() };
  const earlier = visit({ device });
  earlier.session.draftId = 'old-draft';
  earlier.state.form = { ...emptyForm(), fields: { title: 'Previous listing' } };
  await earlier.session.save(null, false, true);
  assert.ok(earlier.cache.getPointer('host-1'), 'the earlier visit left a pointer');

  const fresh = visit({ device });
  const outcome = await fresh.run(params());
  assert.equal(outcome.status, 'ready');
  assert.equal(outcome.form, null);
  assert.deepEqual(fresh.pointerReads, []);
  assert.equal(fresh.session.draftId, null);
  assert.deepEqual(outcome.messages, []);
});

test('the plan check gates paid niches and a failed check leaves the allowance unconfirmed', async () => {
  const paid = await visit({ routes: { 'GET /api/billing/entitlements': { entitlements: { active: true, subscription: { status: 'active', niche: 'property' }, canCreateAnotherListing: { allowed: true } } } } }).run(params());
  assert.equal(paid.flags.hasActiveNichePlan, true);
  assert.equal(paid.flags.entitlementChecked, true);
  const failed = await visit({ routes: { 'GET /api/billing/entitlements': jsonResponse(500, {}) } }).run(params());
  assert.equal(failed.flags.entitlementChecked, false);
  const free = visit({ niche: 'airbnb' });
  assert.equal((await free.run(params())).flags.entitlementChecked, false);
  assert.equal(free.network.calls.length, 0, 'unpaid niches never ask');
});

test('Continue Listing restores its profile draft and the listing shell it owns', async () => {
  const remote = { id: 'draft-7', listing_id: 'listing-7', category: 'property', revision: 3, updated_at: '2026-11-01T00:00:00Z', form_data: { fields: { title: 'Server copy' }, currentStep: 3, furthestStep: 3 }, media_metadata: [] };
  const v = visit({ routes: { 'GET /api/listing-drafts/draft-7': { draft: remote } } });
  const outcome = await v.run(params({ draft: 'draft-7' }));
  assert.equal(outcome.form.fields.title, 'Server copy');
  assert.equal(outcome.form.currentStep, 3, 'Continue Listing reopens the step the host left');
  assert.equal(v.session.draftId, 'draft-7');
  assert.equal(v.session.listingId, 'listing-7');
  assert.equal(v.session.revision, 3);
  assert.equal(v.session.restoring, false);
});

test('Continue Listing prefers the device copy (with its media) and ignores a corrupt one', async () => {
  const remote = { id: 'draft-7', listing_id: null, category: 'property', revision: 0, form_data: { fields: { title: 'Server copy' } }, media_metadata: [] };
  const routes = { 'GET /api/listing-drafts/draft-7': { draft: remote } };
  const device = { idb: createMemoryIndexedDB(), storage: createMemoryStorage() };
  const earlier = visit({ device });
  earlier.session.draftId = 'draft-7';
  earlier.state.form = { ...emptyForm(), fields: { title: 'Device copy' } };
  earlier.state.media = { ...noMedia(), mediaFiles: [new File(['img'], 'a.jpg', { type: 'image/jpeg' })] };
  await earlier.session.save(null, false, true);

  const restored = await visit({ device, routes }).run(params({ draft: 'draft-7' }));
  assert.equal(restored.form.fields.title, 'Device copy');
  assert.equal(restored.media.mediaFiles[0].name, 'a.jpg');
  assert.equal(restored.messages[0].text, 'Your saved listing, media, and securely uploaded documents have been restored.');

  const stored = device.idb.records.get('host-1:draft-7');
  device.idb.records.set('host-1:draft-7', { ...stored, createdAt: 'not a time' });
  const fallback = await visit({ device, routes }).run(params({ draft: 'draft-7' }));
  assert.equal(fallback.form.fields.title, 'Server copy');
});

test('a listing payment is verified by the server, then the checkout copy is restored for review', async () => {
  const device = { idb: createMemoryIndexedDB(), storage: createMemoryStorage() };
  await leaveCheckoutCopy(device);
  const v = visit({
    device, search: '?payment=return&reference=ref-1',
    routes: { 'GET /api/billing/payments/ref-1': { payment: { status: 'succeeded', listing_id: 'listing-1', payment_kind: 'listing' } } },
  });
  const outcome = await v.run(params({ payment: 'return', reference: 'ref-1' }));
  assert.deepEqual(v.checking, ['Confirming your payment...']);
  assert.equal(outcome.flags.paymentVerified, true);
  assert.equal(outcome.flags.hasCurrentListingFee, true);
  assert.equal(outcome.flags.publishBlocked, false);
  assert.deepEqual(v.replaced, ['/list?payment=verified&reference=ref-1']);
  assert.equal(v.session.listingId, 'listing-1');
  assert.equal(v.session.draftId, 'draft-1');
  assert.equal(outcome.form.fields.title, 'Paid listing');
  assert.equal(outcome.form.currentStep, 5, 'back on the review step, not edit mode');
  assert.equal(outcome.media.mediaFiles.length, 1);
  assert.equal(outcome.messages.at(-1).text, 'Payment confirmed. Review your listing, then select Publish Listing when you are ready.');
  const rewritten = device.idb.records.get('host-1:checkout:listing-1');
  assert.equal(rewritten.checkoutState, true, 'the restored copy is still the checkout copy');
});

test('a payment for another listing does not restore this device\'s checkout copy; its server draft does', async () => {
  const device = { idb: createMemoryIndexedDB(), storage: createMemoryStorage() };
  await leaveCheckoutCopy(device, { listingId: 'listing-1' });
  const v = visit({
    device,
    routes: {
      'GET /api/billing/payments/ref-2': { payment: { status: 'succeeded', listing_id: 'listing-2', payment_kind: 'listing' } },
      'GET /api/listing-drafts': { drafts: [{ id: 'draft-2', listing_id: 'listing-2', category: 'property', revision: 1, form_data: { fields: { title: 'Second listing' } }, media_metadata: [] }] },
    },
  });
  const outcome = await v.run(params({ payment: 'verified', reference: 'ref-2' }));
  assert.equal(outcome.flags.paymentVerified, true);
  assert.equal(outcome.form.fields.title, 'Second listing');
  assert.equal(v.session.draftId, 'draft-2');
});

test('an unfinished or failed payment never unlocks publishing', async () => {
  const pending = await visit({ routes: { 'GET /api/billing/payments/ref-1': { payment: { status: 'pending', listing_id: 'listing-1', payment_kind: 'listing' } } } })
    .run(params({ payment: 'verified', reference: 'ref-1' }));
  assert.equal(pending.flags.paymentVerified, false);
  assert.match(pending.messages.at(-1).text, /Payment is still being verified/);

  const failed = await visit({ routes: { 'GET /api/billing/payments/ref-1': { payment: { status: 'abandoned', listing_id: 'listing-1', payment_kind: 'listing' } } } })
    .run(params({ payment: 'return', reference: 'ref-1' }));
  assert.equal(failed.flags.paymentVerified, false);
  assert.equal(failed.messages.at(-1).text, 'Payment was not completed. Your listing has not been published; you can retry checkout.');

  const originalWarn = console.warn;
  console.warn = () => {};
  let signedOut;
  try {
    signedOut = await visit({ routes: { 'GET /api/billing/payments/ref-1': jsonResponse(401, {}) } }).run(params({ payment: 'return', reference: 'ref-1' }));
  } finally { console.warn = originalWarn; }
  assert.equal(signedOut.flags.paymentVerified, false);
  assert.deepEqual(signedOut.messages.at(-1), { text: 'Your session expired. Sign in again to check this payment.', error: true });
});

test('a Go Pro return restores the listing only for a plan in this niche', async () => {
  const device = { idb: createMemoryIndexedDB(), storage: createMemoryStorage() };
  await leaveCheckoutCopy(device);
  const plan = (niche) => ({ 'GET /api/billing/payments/sub-1': { payment: { status: 'succeeded', listing_id: 'listing-1', payment_kind: 'subscription', niche } } });

  const matching = visit({ device, routes: plan('property'), search: '?subscription=return&reference=sub-1' });
  const outcome = await matching.run(params({ subscription: 'return', reference: 'sub-1' }));
  assert.equal(outcome.flags.subscriptionVerified, true);
  assert.equal(outcome.flags.paymentVerified, false, 'a plan is not a listing fee');
  assert.deepEqual(matching.replaced, ['/list?subscription=verified&reference=sub-1']);
  assert.equal(outcome.form.fields.title, 'Paid listing');
  assert.equal(outcome.messages.at(-1).text, 'Your plan is active. Your saved listing has been restored for review and publishing.');

  const otherNiche = await visit({ device, routes: plan('shops_offices') }).run(params({ subscription: 'return', reference: 'sub-1' }));
  assert.equal(otherNiche.flags.subscriptionVerified, false);
  assert.equal(otherNiche.flags.returnedPaymentVerified, false);
});

test('a verified payment whose listing cannot be restored keeps review open but blocks publishing', async () => {
  const v = visit({ routes: { 'GET /api/billing/payments/ref-1': { payment: { status: 'succeeded', listing_id: 'listing-1', payment_kind: 'listing' } }, 'GET /api/listing-drafts': { drafts: [] } } });
  const outcome = await v.run(params({ payment: 'verified', reference: 'ref-1' }));
  assert.equal(outcome.flags.paymentVerified, true);
  assert.equal(outcome.flags.publishBlocked, true);
  assert.equal(outcome.form.currentStep, 5);
  assert.match(outcome.messages[0].text, /publishing is paused/);
});

test('edit mode reads only the host\'s own listing', async () => {
  const listing = { id: 'l1', host_id: 'host-1', category: 'airbnb', availability_status: 'paused', publication_state: 'published', title: 'Loft' };
  const v = visit({
    niche: 'airbnb',
    tables: {
      listings: (query) => (query.filters.some(([column, value]) => column === 'host_id' && value === 'host-1') ? listing : null),
      listing_booking_details: { price_amount: 3000, price_unit: 'night' },
      listing_photos: [{ storage_path: 'host-1/l1/a.jpg' }],
      availability: [{ date: '2026-12-01' }],
    },
  });
  const outcome = await v.run(params({ edit: 'l1' }));
  assert.equal(outcome.status, 'ready');
  assert.equal(outcome.form.fields.title, 'Loft');
  assert.equal(outcome.flags.listingIsPaused, true);
  assert.deepEqual(outcome.edit.savedDates, ['2026-12-01']);
  const listingQueries = v.client.queries.filter((query) => query.table === 'listings');
  assert.equal(listingQueries.length, 2);
  for (const query of listingQueries) assert.deepEqual(query.filters, [['id', 'l1'], ['host_id', 'host-1']]);

  const stranger = visit({ niche: 'airbnb', tables: { listings: null } });
  const refused = await stranger.run(params({ edit: 'l1' }));
  assert.deepEqual(refused, { status: 'stopped', text: 'This listing could not be found or is not yours to edit.' });
});
