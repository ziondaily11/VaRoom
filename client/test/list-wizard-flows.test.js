'use strict';

// The listing wizard's draft session, payment hand-off, requests and publish
// steps as behaviour (lib/listWizard). These replace the source-regex checks
// that server/test/listingDraftPersistence, listingPublication and
// listingPaymentUi used to make against the wizard's client code.

const test = require('node:test');
const assert = require('node:assert/strict');
const { File } = require('node:buffer');
const fs = require('node:fs');
const path = require('node:path');
const { loadWizard, createMemoryIndexedDB, createMemoryStorage, jsonResponse, routedFetch, plain, tick } = require('./helpers/listWizardFakes');

const { createListingDraftCache } = loadWizard('draftCache.ts');
const drafts = loadWizard('drafts.ts');
const { emptyForm } = loadWizard('formState.ts');
const publish = loadWizard('publish.ts');

const noMedia = () => ({ mediaFiles: [], policyFile: null, officeShopFiles: { floorPlan: null, policy: null, documents: [] }, documentRefs: {} });

/** A real WizardSession over in-memory storage, with `fetch` routed and the form editable through `state`. */
function sessionWith(routes = {}, overrides = {}) {
  const network = routedFetch(routes);
  const { WizardSession } = loadWizard('wizardSession.ts', { fetch: network.fetch });
  const storage = createMemoryStorage();
  const cache = createListingDraftCache({ indexedDBRef: createMemoryIndexedDB(), storage });
  const state = { category: 'property', form: emptyForm(), media: noMedia(), paymentVerified: false };
  const draftIds = [];
  const statuses = [];
  const session = new WizardSession({
    hostId: 'host-1', editMode: false, cache, storage,
    capture: (identity) => drafts.captureSnapshot(identity, state.category, state.form, state.media, 'month'),
    token: async () => 'token-1',
    onStatus: (message, saveState) => statuses.push([message, saveState]),
    onDraftId: (id) => draftIds.push(id),
    paymentVerified: () => state.paymentVerified,
    ...overrides,
  });
  return { session, cache, storage, state, draftIds, statuses, calls: network.calls };
}

const savedDraft = (call) => jsonResponse(200, { draft: { revision: Number(call.body.revision) + 1, updated_at: '2026-11-04T00:00:00Z' } });

// ---------- Autosave ----------

test('autosave writes the private draft with PUT and never creates a listing shell', async () => {
  const { session, calls, draftIds, cache } = sessionWith({ 'PUT /api/listing-drafts/draft-1': savedDraft });
  session.draftId = 'draft-1';
  session.queueSave();
  session.queueSave();
  await tick(520);
  await session.settled();
  assert.deepEqual(calls.map((call) => `${call.method} ${call.url}`), ['PUT /api/listing-drafts/draft-1'], 'one debounced PUT, no POST /api/listings');
  assert.equal(calls[0].body.listing_id, null);
  assert.equal(session.listingId, null);
  assert.deepEqual(draftIds, []);
  assert.equal((await cache.load('host-1:draft-1')).serverRevision, 1, 'the device copy keeps the server revision');
});

test('a fresh session names its draft once and the page keeps it in the /list URL', async () => {
  const { WizardSession, draftContinuationUrl } = loadWizard('wizardSession.ts', { fetch: async () => jsonResponse(200, { draft: { revision: 1 } }) });
  const draftIds = [];
  const session = new WizardSession({
    hostId: 'host-1', editMode: false, cache: createListingDraftCache({ indexedDBRef: createMemoryIndexedDB(), storage: createMemoryStorage() }), storage: createMemoryStorage(),
    capture: (identity) => drafts.captureSnapshot(identity, 'airbnb', emptyForm(), noMedia(), 'night'),
    token: async () => 'token-1', onStatus: () => {}, onDraftId: (id) => draftIds.push(id), paymentVerified: () => false,
  });
  await session.save();
  await session.save();
  assert.equal(draftIds.length, 1);
  assert.equal(session.draftId, draftIds[0]);

  const fresh = { edit: null, reference: null };
  assert.equal(draftContinuationUrl(fresh, '/list', '', 'd1'), '/list?draft=d1');
  assert.equal(draftContinuationUrl(fresh, '/list.html', '?x=1', 'd1'), '/list.html?x=1&draft=d1');
  assert.equal(draftContinuationUrl(fresh, '/list', '?draft=d0', 'd1'), null, 'a named draft is kept');
  assert.equal(draftContinuationUrl({ edit: 'l1', reference: null }, '/list', '', 'd1'), null);
  assert.equal(draftContinuationUrl({ edit: null, reference: 'ref' }, '/list', '', 'd1'), null);
  assert.equal(draftContinuationUrl(fresh, '/host-home', '', 'd1'), null);
  assert.equal(draftContinuationUrl(null, '/list', '', 'd1'), null);
});

test('autosave is off while editing, restoring, handing off to checkout or finished', async () => {
  for (const setup of [(s) => { s.restoring = true; }, (s) => { s.checkoutHandoff = true; }, (s) => { s.finished = true; }, null]) {
    const { session, calls } = sessionWith({}, setup ? {} : { editMode: true });
    if (setup) setup(session);
    session.queueSave();
    session.saveBeforeLeaving();
    await tick(500);
    await session.settled();
    assert.equal(calls.length, 0);
  }
});

test('draft writes are serialized so two never send the same revision', async () => {
  const { session, calls } = sessionWith({
    'PUT /api/listing-drafts/draft-1': async (call) => { await tick(10); return savedDraft(call); },
  });
  session.draftId = 'draft-1';
  await Promise.all([session.save(), session.save(), session.save()]);
  assert.deepEqual(calls.map((call) => call.body.revision), [0, 1, 2]);
  assert.equal(session.revision, 3);
});

test('a missing token or an outage keeps the device copy and marks sync unavailable', async () => {
  const signedOut = sessionWith({}, { token: async () => null });
  signedOut.session.draftId = 'draft-1';
  await signedOut.session.save();
  assert.equal(signedOut.calls.length, 0);
  assert.equal(signedOut.session.remoteUnavailable, true);
  assert.ok(await signedOut.cache.load('host-1:draft-1'));

  const offline = sessionWith({ 'PUT /api/listing-drafts/draft-1': () => { throw new Error('offline'); } });
  offline.session.draftId = 'draft-1';
  const originalWarn = console.warn;
  console.warn = () => {};
  try { await offline.session.save(); } finally { console.warn = originalWarn; }
  assert.equal(offline.session.remoteUnavailable, true);
  assert.deepEqual(offline.statuses.pop(), ['Saved on this device; sync will retry when the connection returns.', 'error']);
});

// ---------- Checkout save state (older pay-as-you-list returns) ----------

test('after a verified payment, later saves keep an older checkout copy in step', async () => {
  const { session, cache, state, storage } = sessionWith({ 'PUT /api/listing-drafts/draft-1': savedDraft });
  session.draftId = 'draft-1';
  session.listingId = 'listing-1';
  state.form = { ...emptyForm(), fields: { title: 'Before checkout' } };
  // A checkout copy saved before Silver and Gold replaced Pay to list.
  const before = drafts.captureSnapshot(session.identity('listing-1'), 'property', state.form, { mediaFiles: [], policyFile: null, officeShopFiles: { floorPlan: null, policy: null, documents: [] }, documentRefs: {} }, 'month');
  await cache.save({ ...before, cacheKey: 'host-1:checkout:listing-1', checkoutState: true });
  storage.setItem('varoom_listing_checkout_state:host-1:listing-1', JSON.stringify({ hostId: 'host-1', listingId: 'listing-1', category: 'property', draftId: 'draft-1', cacheKey: 'host-1:checkout:listing-1', createdAt: Date.now() }));

  state.form = { ...emptyForm(), fields: { title: 'Unverified edit' } };
  await session.save();
  assert.equal((await cache.load('host-1:checkout:listing-1')).fields.title, 'Before checkout');

  state.paymentVerified = true;
  state.form = { ...emptyForm(), fields: { title: 'Edited after payment' } };
  await session.save();
  const mirrored = await cache.load('host-1:checkout:listing-1');
  assert.equal(mirrored.fields.title, 'Edited after payment');
  assert.equal(mirrored.checkoutState, true);
  assert.equal(mirrored.cacheKey, 'host-1:checkout:listing-1');
  await session.clearCheckoutState('listing-1');
  assert.equal(session.checkoutPointer('listing-1'), null);
});

test('Pay to list and Go Pro are gone: no checkout save state is written any more', () => {
  const session = loadWizard('wizardSession.ts');
  assert.equal(typeof session.WizardSession.prototype.saveCheckoutState, 'undefined');
  assert.equal(fs.existsSync(path.join(__dirname, '..', 'lib', 'listWizard', 'checkout.ts')), false);
});

// ---------- Requests ----------

test('publishing creates with POST and edits through the authenticated PATCH, booking details included', async () => {
  const network = routedFetch({
    'POST /api/listings': { listing: { id: 'new-1' } },
    'PATCH /api/listings/l%201': { listing: { id: 'l 1' } },
  });
  const api = loadWizard('api.ts', { fetch: network.fetch });
  assert.equal(await api.saveListing('t', null, { title: 'A' }), 'new-1');
  assert.equal(await api.saveListing('t', 'l 1', { title: 'B' }), 'l 1');
  await api.saveBookingDetails('t', 'l 1', { price_amount: 5 }, true);
  assert.deepEqual(network.calls.map((call) => [call.method, call.url, call.options.headers.Authorization]), [
    ['POST', '/api/listings', 'Bearer t'], ['PATCH', '/api/listings/l%201', 'Bearer t'], ['PATCH', '/api/listings/l%201', 'Bearer t'],
  ]);
  assert.deepEqual(network.calls[2].body, { booking_details: { price_amount: 5 } });
});

test('a returned Silver / Gold payment is accepted without a listing; older payments still need theirs', async () => {
  const reply = (payment) => loadWizard('api.ts', { fetch: async () => jsonResponse(200, { payment }) });
  const credit = { status: 'succeeded', payment_kind: 'listing', listing_id: null, listing_tier: 'gold' };
  assert.deepEqual(plain(await reply(credit).verifyReturnedPayment('t', 'ref', 3, false, async () => {})), credit);
  let polls = 0;
  const older = loadWizard('api.ts', { fetch: async () => { polls += 1; return jsonResponse(200, { payment: { status: 'succeeded', payment_kind: 'listing', listing_id: null } }); } });
  await older.verifyReturnedPayment('t', 'ref', 3, false, async () => {});
  assert.equal(polls, 3, 'a listing-bound payment without its listing keeps waiting');
});

test('a forbidden payment check stops at once too', async () => {
  let calls = 0;
  const api = loadWizard('api.ts', { fetch: async () => { calls += 1; return jsonResponse(403, {}); } });
  await assert.rejects(api.verifyReturnedPayment('t', 'ref', 30, false, async () => {}), /Your session expired/);
  assert.equal(calls, 1);
});

test('the allowance check returns a running plan for this niche and the paid Silver / Gold listings', async () => {
  const check = async (status, body, category = 'property') => {
    const api = loadWizard('api.ts', { fetch: async () => jsonResponse(status, body) });
    return plain(await api.fetchListingEntitlement('t', category));
  };
  const plan = (subscription, allowed = true, listingCredits) => ({ entitlements: { active: Boolean(subscription), subscription, canCreateAnotherListing: { allowed }, listingCredits } });
  assert.equal((await check(200, plan({ status: 'active', niche: 'property' }))).planActive, true);
  assert.equal((await check(200, plan({ status: 'active', niche: 'shops_offices' }), 'shop')).planActive, true);
  assert.equal((await check(200, plan({ status: 'active', niche: 'shops_offices' }))).planActive, false, 'another niche');
  // The server's own answer: a late payment still counts while the paid month lasts; an ended plan does not.
  assert.equal((await check(200, plan({ status: 'past_due', niche: 'property' }))).planActive, true);
  assert.equal((await check(200, { entitlements: { active: false, subscription: { status: 'active', niche: 'property' }, canCreateAnotherListing: { allowed: true } } })).planActive, false, 'period over');
  // Airbnb, Hotel, Venue: their own plan, or an older (legacy) plan.
  assert.equal((await check(200, plan({ status: 'active', niche: 'hotel' }), 'hotel')).planActive, true);
  assert.equal((await check(200, plan({ status: 'active', niche: 'legacy' }), 'venue')).planActive, true);
  assert.equal((await check(200, plan({ status: 'active', niche: 'airbnb' }), 'hotel')).planActive, false, 'another niche');
  assert.equal((await check(200, plan({ status: 'active', niche: 'property' }, false))).planActive, false, 'allowance used up');
  assert.deepEqual(await check(200, plan(null, false, { silver: 1, gold: 2 })), { planActive: false, limitReached: null, credits: { silver: 1, gold: 2 }, videoListings: { limit: 0, used: 0 } });
  // Airbnb, Venue: every listing the plan includes is online, so the plan choice offers an upgrade from it.
  const atLimit = (allowance) => ({ entitlements: { active: true, subscription: { status: 'active', niche: 'airbnb' }, canCreateAnotherListing: allowance } });
  const full = await check(200, atLimit({ allowed: false, limit: 2, activeCount: 2, planId: 'airbnb_starter' }), 'airbnb');
  assert.equal(full.planActive, false);
  assert.deepEqual(full.limitReached, { planId: 'airbnb_starter', limit: 2 });
  assert.equal((await check(200, atLimit({ allowed: true, limit: 2, activeCount: 1, planId: 'airbnb_starter' }), 'airbnb')).limitReached, null, 'a free place');
  assert.equal((await check(200, plan({ status: 'active', niche: 'property' }, false))).limitReached, null, 'no plan to upgrade from: Silver / Gold');
  assert.equal((await check(200, plan({ status: 'active', niche: 'hotel' }, false), 'airbnb')).limitReached, null, 'another niche plan');
  // The plan's video allowance comes through for the photo step.
  const withVideo = { entitlements: { active: true, subscription: { status: 'active', niche: 'airbnb' }, canCreateAnotherListing: { allowed: true }, videoListings: { limit: 2, used: 1 } } };
  assert.deepEqual((await check(200, withVideo, 'airbnb')).videoListings, { limit: 2, used: 1 });
  assert.deepEqual((await check(200, plan(null, false, { silver: -1, gold: 'x' }))).credits, { silver: 0, gold: 0 }, 'nonsense counts are zero');
  assert.deepEqual((await check(200, plan(null, false))).credits, { silver: 0, gold: 0 });
  await assert.rejects(check(500, {}), /Unable to confirm your listing allowance/);
  await assert.rejects(check(200, { entitlements: { active: true } }), /Unable to confirm your listing allowance/);
});

test('edit mode reads the listing documents back into references', async () => {
  const documents = [
    { id: 'd1', documentType: 'floor_plan', filename: 'plan.pdf', fileSize: 10, mimeType: 'application/pdf' },
    { id: 'd2', documentType: 'ownership_management', filename: 'a.pdf', fileSize: 1, mimeType: 'application/pdf' },
    { id: 'd3', documentType: 'ownership_management', filename: 'b.pdf', fileSize: 2, mimeType: 'application/pdf' },
  ];
  const network = routedFetch({ 'GET /api/listings/l1/documents': { documents } });
  const api = loadWizard('api.ts', { fetch: network.fetch });
  const refs = api.refsFromDocuments(await api.fetchListingDocuments('t', 'l1'));
  assert.deepEqual(Object.keys(refs), ['floor_plan', 'ownership_management']);
  assert.deepEqual(refs.ownership_management.map((ref) => ref.id), ['d2', 'd3']);
  assert.deepEqual(plain(refs.floor_plan[0]), { id: 'd1', documentType: 'floor_plan', filename: 'plan.pdf', fileSize: 10, lastModified: 0, mimeType: 'application/pdf' });

  const failing = loadWizard('api.ts', { fetch: async () => jsonResponse(500, {}) });
  await assert.rejects(failing.fetchListingDocuments('t', 'l1'), /Unable to restore listing documents\. Please try again before saving\./);

  const officeDocuments = publish.editOfficeShopDocuments({ office_shop_details: { documents: { floor_plan_path: 'old' } } }, {
    floor_plan: [{ id: 'f-old' }, { id: 'f-new' }], commercial_policy: [{ id: 'p1' }], ownership_management: [{ id: 'm1' }, { id: 'm2' }],
  });
  assert.deepEqual(plain(officeDocuments), { floor_plan_path: 'old', floor_plan_document_id: 'f-new', policy_document_id: 'p1', management_document_ids: ['m1', 'm2'] });
  const form = publish.editForm(emptyForm(), 'office', { id: 'l1', title: 'Suite' }, { office_shop_details: { subtype: 'serviced_office', role: 'agent' } }, officeDocuments);
  assert.equal(form.fields['os-subtype'], 'serviced_office');
  assert.equal(form.fields['os-role'], 'agent');
});

test('a video over 60 seconds is refused before any upload; others finish through the proxied route', async () => {
  const fakeVideo = (duration) => ({
    document: { createElement: () => { const video = {}; Object.defineProperty(video, 'src', { set() { video.duration = duration; queueMicrotask(() => video.onloadedmetadata()); } }); return video; } },
    URL: { createObjectURL: () => 'blob:x', revokeObjectURL: () => {} },
  });
  const network = routedFetch({
    'POST /api/properties/l1/videos/upload-init': { mediaId: 'm 1', uploadId: 'u1', uploadAuthorization: { uploadUrl: 'https://r2.test/put', contentType: 'video/mp4' } },
    'PUT https://r2.test/put': {},
    'POST /api/properties/l1/videos/m%201/complete': {},
  });
  const file = new File(['v'], 'clip.mp4', { type: 'video/mp4' });
  const long = loadWizard('api.ts', { fetch: network.fetch, ...fakeVideo(61) });
  await assert.rejects(long.uploadListingVideo('t', file, 'l1'), /Videos must be 60 seconds or less\./);
  assert.equal(network.calls.length, 0);

  const short = loadWizard('api.ts', { fetch: network.fetch, ...fakeVideo(30) });
  assert.equal(await short.uploadListingVideo('t', file, 'l1'), 'm 1');
  assert.deepEqual(network.calls.map((call) => `${call.method} ${call.url}`), [
    'POST /api/properties/l1/videos/upload-init', 'PUT https://r2.test/put', 'POST /api/properties/l1/videos/m%201/complete',
  ]);
  assert.equal(network.calls[0].body.durationSeconds, 30);
  assert.deepEqual(network.calls[2].body, { uploadId: 'u1' });
});

// ---------- Publishing ----------

test('the Silver / Gold choice shows only after the allowance check, and a note when it failed', () => {
  assert.deepEqual(plain(publish.reviewActions(false, false)), { showTierChoice: false, submitHidden: false, entitlementNote: false });
  assert.deepEqual(plain(publish.reviewActions(false, true)), { showTierChoice: false, submitHidden: false, entitlementNote: false });
  assert.deepEqual(plain(publish.reviewActions(true, true)), { showTierChoice: true, submitHidden: true, entitlementNote: false });
  assert.deepEqual(plain(publish.reviewActions(true, false)), { showTierChoice: false, submitHidden: true, entitlementNote: true }, 'neither Publish nor the choice');
});

test('media uploads resume after a failure, and a failed new listing is not activated', async () => {
  const [a, b, c] = ['a.jpg', 'b.mp4', 'c.jpg'].map((name) => new File(['x'], name));
  const uploaded = new Set([a]);
  const attempts = [];
  const progress = [];
  const originalWarn = console.warn;
  console.warn = () => {};
  let result;
  try {
    result = await publish.uploadPendingMedia([a, b, c], uploaded, async (file, index) => {
      attempts.push([file.name, index]);
      if (file === b) throw new Error('R2 down');
    }, (index, total) => progress.push(`${index + 1}/${total}`));
  } finally { console.warn = originalWarn; }
  assert.deepEqual(plain(result), { uploadedCount: 2, failedCount: 1 });
  assert.deepEqual(attempts, [['b.mp4', 1], ['c.jpg', 2]], 'an earlier upload is skipped; the rest still go');
  assert.deepEqual(progress, ['1/3', '2/3', '3/3']);
  assert.deepEqual([...uploaded].map((file) => file.name), ['a.jpg', 'c.jpg']);

  assert.equal(publish.mediaUploadBlocksPublish(false, 3, 1), true);
  assert.equal(publish.mediaUploadBlocksPublish(true, 3, 1), false, 'edits keep their saved media');
  assert.equal(publish.mediaUploadBlocksPublish(false, 3, 0), false);
  assert.equal(publish.mediaUploadBlocksPublish(false, 0, 0), false);
});

test('the shell and the listing row carry the canonical category', () => {
  const form = { ...emptyForm(), fields: { title: 'Shop 4', 'location-text': 'Westlands, Nairobi' } };
  assert.equal(publish.shellPayload('shop', form).category, 'shop');
  assert.equal(publish.listingPayload('shop', form, true).category, 'shop');
  assert.equal('category' in publish.listingPayload('shop', form, false), false, 'an edit never changes it');
});
