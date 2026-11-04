'use strict';

// The listing wizard's draft session, checkout hand-off, requests and publish
// steps as behaviour (lib/listWizard). These replace the source-regex checks
// that server/test/listingDraftPersistence, listingPublication and
// listingPaymentUi used to make against the wizard's client code.

const test = require('node:test');
const assert = require('node:assert/strict');
const { File } = require('node:buffer');
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

// ---------- Checkout save state ----------

test('a checkout copy that does not read back intact fails and writes no pointer', async () => {
  const { session, storage, cache } = sessionWith();
  const broken = { ...cache, load: async () => ({ fields: {} }) };
  const { WizardSession } = loadWizard('wizardSession.ts');
  const unreliable = new WizardSession({ ...session.options, cache: broken });
  await assert.rejects(unreliable.saveCheckoutState('listing-1'), /could not be verified/);
  assert.equal(storage.getItem('varoom_listing_checkout_state:host-1:listing-1'), null);
});

test('the checkout copy carries the whole form; private document bytes stay out', async () => {
  const { session, cache, state } = sessionWith();
  session.draftId = 'draft-1';
  session.revision = 4;
  state.category = 'hotel';
  state.form = { ...emptyForm(), hotelListingMode: 'both', availableDates: ['2026-12-01'], fields: { title: 'Garden suite' } };
  const photo = new File(['img'], 'a.jpg', { type: 'image/jpeg', lastModified: 1 });
  const floorPlan = new File(['plan'], 'plan.pdf', { type: 'application/pdf', lastModified: 2 });
  const refs = { property_policy: [{ id: 'doc-1', documentType: 'property_policy', filename: 'rules.pdf', fileSize: 3, lastModified: 0, mimeType: 'application/pdf' }] };
  state.media = { mediaFiles: [photo], policyFile: new File(['p'], 'p.pdf', { type: 'application/pdf' }), officeShopFiles: { floorPlan, policy: null, documents: [] }, documentRefs: refs };
  await session.saveCheckoutState('listing-1');
  const saved = await cache.load('host-1:checkout:listing-1');
  assert.equal(saved.checkoutState, true);
  assert.equal(saved.listingId, 'listing-1');
  assert.equal(saved.serverRevision, 4);
  assert.equal(saved.hotelListingMode, 'both');
  assert.deepEqual(saved.availableDates, ['2026-12-01']);
  assert.equal(saved.mediaFiles[0].name, 'a.jpg');
  assert.equal(saved.policyFile, null);
  assert.deepEqual(saved.officeShopFiles, { floorPlan: null, policy: null, documents: [] });
  assert.deepEqual(saved.uploadedDocumentRefs, refs);
  assert.equal(saved.documentSelections.officeShop.floorPlan.filename, 'plan.pdf', 'the chosen document is named, not stored');
});

test('after a verified payment, later saves keep the checkout copy in step', async () => {
  const { session, cache, state } = sessionWith({ 'PUT /api/listing-drafts/draft-1': savedDraft });
  session.draftId = 'draft-1';
  session.listingId = 'listing-1';
  state.form = { ...emptyForm(), fields: { title: 'Before checkout' } };
  await session.saveCheckoutState('listing-1');

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
});

// ---------- Before a checkout (saveForCheckout) ----------

const { saveForCheckout, prepareListingCheckout } = loadWizard('checkout.ts');

function recordingSession(overrides = {}) {
  const log = [];
  const session = {
    checkoutHandoff: false, revisionConflict: false, remoteUnavailable: false,
    cancelTimer: () => log.push('cancelTimer'),
    settled: async () => { log.push(['settled', session.checkoutHandoff]); },
    get documentQueue() { log.push('documentQueue'); return Promise.resolve(); },
    ensureShell: async (token, payload) => { log.push(['ensureShell', token, payload()]); return 'listing-1'; },
    saveCheckoutState: async (id) => { log.push(['saveCheckoutState', id]); },
    save: async (id) => { log.push(['save', id]); },
    ...overrides,
  };
  return { session, log };
}
const steps = (log, statuses = []) => ({
  shellPayload: () => ({ category: 'property' }),
  persistDocuments: async (id) => { log.push(['persistDocuments', id]); },
  onStatus: (message, state) => statuses.push([message, state]),
});

test('checkout waits for the autosave and documents, then shell, documents, verified checkout copy, profile draft', async () => {
  const { session, log } = recordingSession();
  const listingId = await saveForCheckout(session, 'token-1', false, steps(log));
  assert.equal(listingId, 'listing-1');
  assert.deepEqual(log, ['cancelTimer', ['settled', true], 'documentQueue', ['ensureShell', 'token-1', { category: 'property' }],
    ['persistDocuments', 'listing-1'], ['saveCheckoutState', 'listing-1'], ['save', 'listing-1']]);
  assert.equal(session.checkoutHandoff, true, 'Pay to list hands off; autosave stays off while Paystack opens');

  const pro = recordingSession();
  await saveForCheckout(pro.session, 'token-1', true, steps(pro.log));
  assert.deepEqual(pro.log[1], ['settled', false], 'Go Pro saves the profile draft and keeps autosave');
  assert.equal(pro.session.checkoutHandoff, false);
});

test('an unverifiable checkout copy stops before any payment and restores autosave', async () => {
  const { session, log } = recordingSession({ saveCheckoutState: async () => { throw new Error('mismatch'); } });
  const originalError = console.error;
  console.error = () => {};
  try {
    await assert.rejects(saveForCheckout(session, 'token-1', false, steps(log)), /No payment was started/);
  } finally { console.error = originalError; }
  assert.ok(!log.some((entry) => entry[0] === 'save'));
  assert.equal(session.checkoutHandoff, false);
});

test('a stale profile revision or an API outage never blocks checkout', async () => {
  const statuses = [];
  const conflict = recordingSession({ revisionConflict: true });
  assert.equal(await saveForCheckout(conflict.session, 't', false, steps(conflict.log, statuses)), 'listing-1');
  const offline = recordingSession({ remoteUnavailable: true });
  assert.equal(await saveForCheckout(offline.session, 't', false, steps(offline.log, statuses)), 'listing-1');
  assert.deepEqual(statuses, [
    ['Checkout save is ready. The saved profile copy will sync after this listing returns.', 'error'],
    ['Checkout save is ready. Profile sync will resume when connected.', 'error'],
  ]);
});

test('with a real session the checkout creates one payment-draft shell and links the profile draft to it', async () => {
  const { session, storage, calls } = sessionWith({
    'POST /api/listings': async () => { await tick(5); return jsonResponse(201, { listing: { id: 'listing-9' } }); },
    'PUT /api/listing-drafts/draft-1': savedDraft,
  });
  session.draftId = 'draft-1';
  const step = { shellPayload: () => publish.shellPayload('property', { ...emptyForm(), fields: { title: 'Flat' } }), persistDocuments: async () => {}, onStatus: () => {} };
  const ids = await Promise.all([saveForCheckout(session, 't', false, step), saveForCheckout(session, 't', true, step)]);
  assert.deepEqual(ids, ['listing-9', 'listing-9']);
  const shells = calls.filter((call) => call.method === 'POST');
  assert.equal(shells.length, 1);
  assert.deepEqual(shells[0].body, { category: 'property', title: 'Flat', description: '', property_description: '', location_text: '', listing_purpose: 'rent', payment_draft: true });
  assert.ok(storage.getItem('varoom_listing_checkout_state:host-1:listing-9'));
  assert.ok(calls.some((call) => call.method === 'PUT' && call.body.listing_id === 'listing-9'));
});

test('Pay to list saves first and only then asks for the Paystack URL', async () => {
  const log = [];
  const url = await prepareListingCheckout(async () => 'token-1',
    async (token) => { log.push(['persist', token]); return 'listing-1'; },
    async (token, id) => { log.push(['start', token, id]); return 'https://paystack.test/pay'; });
  assert.equal(url, 'https://paystack.test/pay');
  assert.deepEqual(log, [['persist', 'token-1'], ['start', 'token-1', 'listing-1']]);

  const started = [];
  await assert.rejects(prepareListingCheckout(async () => null, async () => { started.push('persist'); return 'x'; }, async () => { started.push('start'); return 'x'; }),
    /Please log in again to continue/);
  await assert.rejects(prepareListingCheckout(async () => 't', async () => { throw new Error('save failed'); }, async () => { started.push('start'); return 'x'; }), /save failed/);
  assert.deepEqual(started, []);
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

test('the Paystack checkout is requested for the listing and needs a URL and reference back', async () => {
  let reply = { authorization_url: 'https://paystack.test/x', reference: 'ref-1' };
  const network = routedFetch({ 'POST /api/billing/listing-checkout': () => reply });
  const api = loadWizard('api.ts', { fetch: network.fetch });
  assert.equal(await api.startListingCheckout('t', 'listing-1'), 'https://paystack.test/x');
  assert.deepEqual(network.calls[0].body, { listing_id: 'listing-1' });
  reply = { authorization_url: 'https://paystack.test/x' };
  await assert.rejects(api.startListingCheckout('t', 'listing-1'), /Unable to start Paystack checkout/);
});

test('a forbidden payment check stops at once too', async () => {
  let calls = 0;
  const api = loadWizard('api.ts', { fetch: async () => { calls += 1; return jsonResponse(403, {}); } });
  await assert.rejects(api.verifyReturnedPayment('t', 'ref', 30, false, async () => {}), /Your session expired/);
  assert.equal(calls, 1);
});

test('the niche plan counts only when active, for this niche, with room for another listing', async () => {
  const check = async (status, body, category = 'property') => {
    const api = loadWizard('api.ts', { fetch: async () => jsonResponse(status, body) });
    return api.fetchNichePlanActive('t', category);
  };
  const plan = (subscription, allowed = true) => ({ entitlements: { active: true, subscription, canCreateAnotherListing: { allowed } } });
  assert.equal(await check(200, plan({ status: 'active', niche: 'property' })), true);
  assert.equal(await check(200, plan({ status: 'active', niche: 'shops_offices' }), 'shop'), true);
  assert.equal(await check(200, plan({ status: 'active', niche: 'shops_offices' })), false, 'another niche');
  assert.equal(await check(200, plan({ status: 'past_due', niche: 'property' })), false);
  assert.equal(await check(200, plan({ status: 'active', niche: 'property' }, false)), false, 'allowance used up');
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

test('the review shows Pay and Go Pro only after the allowance check, and a note when it failed', () => {
  assert.deepEqual(plain(publish.reviewActions(false, false)), { showPay: false, submitHidden: false, entitlementNote: false });
  assert.deepEqual(plain(publish.reviewActions(false, true)), { showPay: false, submitHidden: false, entitlementNote: false });
  assert.deepEqual(plain(publish.reviewActions(true, true)), { showPay: true, submitHidden: true, entitlementNote: false });
  assert.deepEqual(plain(publish.reviewActions(true, false)), { showPay: false, submitHidden: true, entitlementNote: true }, 'neither Publish nor Pay');
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
