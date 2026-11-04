'use strict';

// The listing wizard's drafts, draft session, requests and publish rules
// (lib/listWizard; migrated from legacy-pages/list.html and
// public/js/listing-draft-cache.js).

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { File } = require('node:buffer');
const { loadTs } = require('./helpers/loadTs');

const dir = path.join(__dirname, '..', 'lib', 'listWizard');
const keyRange = { bound: (lower, upper) => ({ lower, upper }) };
const load = (file, globals = {}) => loadTs(path.join(dir, file), { globals: { IDBKeyRange: keyRange, ...globals } });
const { createListingDraftCache, clearListingDrafts } = load('draftCache.ts');
const drafts = load('drafts.ts');
const { emptyForm } = load('formState.ts');
const publish = load('publish.ts');

function createMemoryIndexedDB(records = new Map()) {
  let hasStore = false;
  const database = {
    objectStoreNames: { contains: () => hasStore },
    createObjectStore() { hasStore = true; },
    close() {},
    transaction() {
      const transaction = {};
      const schedule = (callback) => {
        const request = {};
        queueMicrotask(() => {
          try {
            request.result = callback();
            if (request.onsuccess) request.onsuccess();
            if (transaction.oncomplete) transaction.oncomplete();
          } catch (error) {
            transaction.error = error;
            if (transaction.onerror) transaction.onerror();
          }
        });
        return request;
      };
      transaction.objectStore = () => ({
        put: (value) => schedule(() => records.set(value.cacheKey, structuredClone(value))),
        get: (key) => schedule(() => { const value = records.get(key); return value && structuredClone(value); }),
        delete: (key) => schedule(() => {
          if (key && typeof key === 'object') {
            [...records.keys()].filter((name) => name >= key.lower && name <= key.upper).forEach((name) => records.delete(name));
          } else records.delete(key);
        }),
      });
      return transaction;
    },
  };
  return {
    records,
    open() {
      const request = {};
      queueMicrotask(() => {
        request.result = database;
        if (!hasStore && request.onupgradeneeded) request.onupgradeneeded();
        if (request.onsuccess) request.onsuccess();
      });
      return request;
    },
    deleteDatabase() {
      const request = {};
      queueMicrotask(() => { records.clear(); if (request.onsuccess) request.onsuccess(); });
      return request;
    },
  };
}

function createMemoryStorage() {
  const values = new Map();
  return {
    values,
    get length() { return values.size; },
    key: (index) => [...values.keys()][index] || null,
    getItem: (key) => (values.has(key) ? values.get(key) : null),
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
}

const plain = (value) => JSON.parse(JSON.stringify(value));

// ---------- The device draft store (unchanged keys) ----------

test('listing drafts persist local image/video files but strip private document bytes', async () => {
  const cache = createListingDraftCache({ indexedDBRef: createMemoryIndexedDB(), storage: createMemoryStorage() });
  const files = [new File(['photo bytes'], 'photo.jpg', { type: 'image/jpeg' }), new File(['video bytes'], 'video.mp4', { type: 'video/mp4' })];
  const draft = {
    cacheKey: 'host-1:draft-1', hostId: 'host-1', listingId: 'listing-1', category: 'property', createdAt: Date.now(),
    fields: { title: 'Restored listing' }, mediaFiles: files,
    policyFile: new File(['policy bytes'], 'policy.pdf', { type: 'application/pdf' }),
    officeShopFiles: { floorPlan: new File(['plan'], 'plan.pdf', { type: 'application/pdf' }), policy: null, documents: [new File(['own'], 'own.pdf', { type: 'application/pdf' })] },
    uploadedDocumentRefs: { property_policy: [{ id: 'doc-1', filename: 'policy.pdf' }] },
  };
  await cache.save(draft);
  const restored = await cache.load(draft.cacheKey);
  assert.equal(restored.listingId, 'listing-1');
  assert.equal(restored.fields.title, 'Restored listing');
  assert.equal(restored.mediaFiles.length, 2);
  assert.ok(restored.mediaFiles[0] instanceof File);
  assert.equal(restored.mediaFiles[1].name, 'video.mp4');
  assert.equal(restored.policyFile, null);
  assert.deepEqual(restored.officeShopFiles, { floorPlan: null, policy: null, documents: [] });
  assert.deepEqual(restored.uploadedDocumentRefs, { property_policy: [{ id: 'doc-1', filename: 'policy.pdf' }] });
});

test('draft pointers are host-scoped and clearing a host removes its cache entry', async () => {
  const cache = createListingDraftCache({ indexedDBRef: createMemoryIndexedDB(), storage: createMemoryStorage() });
  const pointer = { hostId: 'host-1', cacheKey: 'host-1:draft-1', listingId: 'listing-1', category: 'property', createdAt: Date.now(), returnTo: 'list' };
  await cache.save({ ...pointer, fields: {}, mediaFiles: [] });
  cache.setPointer('host-1', pointer);
  assert.equal(cache.getPointer('host-1').listingId, 'listing-1');
  assert.equal(cache.getPointer('host-2'), null);
  await cache.clearForHost('host-1');
  assert.equal(cache.getPointer('host-1'), null);
  assert.equal(await cache.load(pointer.cacheKey), null);
});

test('a corrupt saved pointer is discarded without affecting other hosts', () => {
  const storage = createMemoryStorage();
  storage.setItem('varoom_listing_draft_pointer:host-1', '{');
  const cache = createListingDraftCache({ indexedDBRef: createMemoryIndexedDB(), storage });
  const originalWarn = console.warn;
  console.warn = () => {};
  try {
    assert.equal(cache.getPointer('host-1'), null);
    assert.equal(storage.getItem('varoom_listing_draft_pointer:host-1'), null);
  } finally {
    console.warn = originalWarn;
  }
});

test('sign-out clears only that host\'s drafts, checkout copies and pointers', async () => {
  const idb = createMemoryIndexedDB();
  const storage = createMemoryStorage();
  ['host-1:draft-1', 'host-1:checkout:listing-1', 'host-2:draft-9'].forEach((cacheKey) => idb.records.set(cacheKey, { cacheKey }));
  storage.setItem('varoom_listing_draft_pointer:host-1', '{}');
  storage.setItem('varoom_listing_checkout_state:host-1:listing-1', '{}');
  storage.setItem('varoom_listing_draft_pointer:host-2', '{}');
  storage.setItem('varoom_theme', 'dark');
  await clearListingDrafts('host-1', { indexedDBRef: idb, storage });
  assert.deepEqual([...idb.records.keys()], ['host-2:draft-9']);
  assert.deepEqual([...storage.values.keys()].sort(), ['varoom_listing_draft_pointer:host-2', 'varoom_theme']);
  await clearListingDrafts(null, { indexedDBRef: idb, storage });
  assert.equal(idb.records.size, 0);
  assert.deepEqual([...storage.values.keys()], ['varoom_theme']);
});

// ---------- Snapshot shape and restore ----------

const identity = { cacheKey: 'host-1:draft-1', draftId: 'draft-1', hostId: 'host-1', listingId: null, serverRevision: 2 };
const noMedia = () => ({ mediaFiles: [], policyFile: null, officeShopFiles: { floorPlan: null, policy: null, documents: [] }, documentRefs: {} });

test('a snapshot keeps the legacy form_data keys and round-trips through restore', () => {
  const form = emptyForm();
  form.fields = { title: 'Garden suite', 'location-text': 'Karen, Nairobi', 'price-amount': '4500' };
  form.hotelListingMode = 'both';
  form.availableDates = ['2026-12-01', 'not-a-date'];
  form.currentStep = 4;
  form.furthestStep = 4;
  form.amenities = [{ key: 'hotel_high_speed_wifi', checked: true }];
  const policy = new File(['pdf'], 'rules.pdf', { type: 'application/pdf', lastModified: 5 });
  const snapshot = drafts.captureSnapshot(identity, 'hotel', form, { ...noMedia(), policyFile: policy }, 'night');
  assert.deepEqual(Object.keys(drafts.draftFormData(snapshot)), ['fields', 'controls', 'propertyPurpose', 'propertySalePriceMode', 'hotelListingMode', 'availableDates',
    'currentStep', 'furthestStep', 'amenities', 'officeShopAmenitySelections', 'officeShopPermittedUses', 'officeShopCharges', 'uploadedDocumentRefs', 'documentSelections']);
  assert.equal(snapshot.fields['price-unit'], 'night');
  assert.equal(snapshot.policyFile, null);
  assert.deepEqual(plain(snapshot.documentSelections.propertyPolicy), { filename: 'rules.pdf', mimeType: 'application/pdf', fileSize: 3, lastModified: 5 });
  assert.deepEqual(plain(drafts.draftMediaMetadata(snapshot)), [{ name: 'rules.pdf', type: 'application/pdf', kind: 'property_policy', size: 3, lastModified: 5 }]);

  const restored = drafts.restoreSnapshot(plain(snapshot), 'hotel');
  assert.equal(restored.form.fields.title, 'Garden suite');
  assert.equal(restored.form.hotelListingMode, 'both');
  assert.deepEqual(restored.form.availableDates, ['2026-12-01']);
  assert.equal(restored.form.currentStep, 4);
  assert.ok(restored.form.amenities.some((item) => item.key === 'hotel_high_speed_wifi' && item.checked));
});

test('older property drafts restore the type from size-or-type', () => {
  const restored = drafts.restoreSnapshot({ fields: { 'size-or-type': '2 bedrooms' }, propertyPurpose: 'both', propertySalePriceMode: 'starting' }, 'property');
  assert.equal(restored.form.fields['property-bedroom-type'], '2 bedrooms');
  assert.equal(restored.form.propertyPurpose, 'both');
  assert.equal(restored.form.propertySalePriceMode, 'starting');
});

test('a checkout copy verifies only when every field and media file reads back intact', () => {
  const photo = new File(['img'], 'a.jpg', { type: 'image/jpeg', lastModified: 1 });
  const source = drafts.captureSnapshot(identity, 'property', emptyForm(), { ...noMedia(), mediaFiles: [photo] }, 'month');
  const copy = { ...structuredClone({ ...source, mediaFiles: [] }), mediaFiles: [photo] };
  assert.equal(drafts.checkoutSnapshotMatches(copy, source), true);
  assert.equal(drafts.checkoutSnapshotMatches({ ...copy, mediaFiles: [] }, source), false);
  assert.equal(drafts.checkoutSnapshotMatches({ ...copy, availableDates: ['2026-01-01'] }, source), false);
});

// ---------- The draft session ----------

function sessionWith(fetchImpl, overrides = {}) {
  const { WizardSession } = load('wizardSession.ts', { fetch: fetchImpl });
  const storage = createMemoryStorage();
  const cache = createListingDraftCache({ indexedDBRef: createMemoryIndexedDB(), storage });
  const statuses = [];
  const session = new WizardSession({
    hostId: 'host-1', editMode: false, cache, storage,
    capture: (id) => drafts.captureSnapshot(id, 'airbnb', emptyForm(), noMedia(), 'night'),
    token: async () => 'token-1',
    onStatus: (message, state) => statuses.push([message, state]),
    onDraftId: () => {},
    paymentVerified: () => false,
    ...overrides,
  });
  return { session, cache, storage, statuses };
}

const jsonResponse = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });

test('a save sends the revision and keeps the server\'s next one; a conflict stops syncing', async () => {
  const calls = [];
  let reply = jsonResponse(200, { draft: { revision: 3, updated_at: '2026-11-04T00:00:00Z' } });
  const { session, statuses } = sessionWith(async (url, options) => { calls.push([url, options]); return reply; });
  session.draftId = 'draft-1';
  session.revision = 2;
  await session.save();
  assert.equal(calls[0][0], '/api/listing-drafts/draft-1');
  assert.equal(JSON.parse(calls[0][1].body).revision, 2);
  assert.equal(session.revision, 3);
  assert.deepEqual(statuses.pop(), ['Saved', 'saved']);

  reply = jsonResponse(409, { code: 'LISTING_DRAFT_REVISION_CONFLICT' });
  await session.save();
  assert.equal(session.revisionConflict, true);
  await session.save();
  assert.equal(calls.length, 2, 'no request after a conflict');
  assert.match(statuses.pop()[0], /A newer draft exists on another session/);
});

test('the checkout shell is created once however many callers ask', async () => {
  let posts = 0;
  const { session } = sessionWith(async (url, options) => {
    if (options && options.method === 'POST') posts += 1;
    await new Promise((resolve) => setTimeout(resolve, 5));
    return jsonResponse(201, { listing: { id: 'listing-7' } });
  });
  const ids = await Promise.all([session.ensureShell('t', () => ({})), session.ensureShell('t', () => ({}))]);
  assert.deepEqual(ids, ['listing-7', 'listing-7']);
  assert.equal(posts, 1);
  assert.equal(await session.ensureShell('t', () => ({})), 'listing-7');
  assert.equal(posts, 1);
});

test('the checkout save state is written, read back and pointed to', async () => {
  const { session, storage } = sessionWith(async () => jsonResponse(200, {}));
  session.draftId = 'draft-1';
  const snapshot = await session.saveCheckoutState('listing-1');
  assert.equal(snapshot.cacheKey, 'host-1:checkout:listing-1');
  const pointer = JSON.parse(storage.getItem('varoom_listing_checkout_state:host-1:listing-1'));
  assert.equal(pointer.cacheKey, 'host-1:checkout:listing-1');
  assert.equal(session.checkoutPointer('listing-1').draftId, 'draft-1');
  await session.clearCheckoutState('listing-1');
  assert.equal(session.checkoutPointer('listing-1'), null);
});

// ---------- Requests ----------

test('a signed-out payment check stops at once instead of polling', async () => {
  let calls = 0;
  const api = load('api.ts', { fetch: async () => { calls += 1; return jsonResponse(401, {}); } });
  await assert.rejects(api.verifyReturnedPayment('t', 'ref', 30, false, async () => {}), /Your session expired/);
  assert.equal(calls, 1);
});

test('a returned payment is polled until it succeeds', async () => {
  const replies = [{ status: 'pending' }, { status: 'succeeded', listing_id: 'listing-1', payment_kind: 'listing' }];
  const api = load('api.ts', { fetch: async () => jsonResponse(200, { payment: replies.shift() }) });
  const payment = await api.verifyReturnedPayment('t', 'ref', 30, false, async () => {});
  assert.equal(payment.status, 'succeeded');
});

test('media choices follow the type, size, count and duplicate rules (WEBM included)', () => {
  const api = load('api.ts');
  const file = (name, type, size = 10) => ({ name, type, size });
  let result = api.addMediaFiles([], [file('a.webm', 'video/webm'), file('b.gif', 'image/gif'), file('c.jpg', 'image/jpeg', 6 * 1024 * 1024), file('d.mov', 'video/quicktime', 90 * 1024 * 1024)]);
  assert.deepEqual(result.files.map((item) => item.name), ['a.webm', 'd.mov']);
  assert.equal(result.error, '"c.jpg" is over 5MB.');
  result = api.addMediaFiles(result.files, [file('a.webm', 'video/webm')]);
  assert.equal(result.files.length, 2, 'a duplicate is skipped');
  result = api.addMediaFiles([], Array.from({ length: 7 }, (_, index) => file(`${index}.png`, 'image/png')));
  assert.equal(result.files.length, 6);
  assert.equal(result.error, 'You can add up to 6 photos or videos.');
});

// ---------- Publishing ----------

const state = (overrides) => ({ category: 'airbnb', editMode: false, paymentVerified: false, hasActiveNichePlan: false, hasCurrentListingFee: false, listingIsPaused: false, listingNeedsPublication: false, ...overrides });

test('paid niches need a fee or plan; activation follows the unchanged rule', () => {
  assert.equal(publish.needsListingPayment(state({ category: 'property' })), true);
  assert.equal(publish.needsListingPayment(state({ category: 'property', hasActiveNichePlan: true })), false);
  assert.equal(publish.needsListingPayment(state({ category: 'shop', editMode: true, hasCurrentListingFee: true })), false);
  assert.equal(publish.needsListingPayment(state({ category: 'hotel' })), false);

  assert.equal(publish.shouldActivate(state({ category: 'airbnb' })), true);
  assert.equal(publish.shouldActivate(state({ category: 'airbnb', editMode: true })), false);
  assert.equal(publish.shouldActivate(state({ category: 'airbnb', editMode: true, listingNeedsPublication: true })), true);
  assert.equal(publish.shouldActivate(state({ category: 'property' })), false);
  assert.equal(publish.shouldActivate(state({ category: 'property', paymentVerified: true })), true);
  assert.equal(publish.shouldActivate(state({ category: 'office', hasActiveNichePlan: true })), true);
  assert.equal(publish.shouldActivate(state({ category: 'office', editMode: true, listingIsPaused: true, hasCurrentListingFee: true })), true);
  assert.equal(publish.shouldActivate(state({ category: 'office', editMode: true, hasCurrentListingFee: true })), false);
});

test('booking details per niche match what list.html sent', () => {
  const sale = emptyForm();
  sale.propertyPurpose = 'sale';
  sale.propertySalePriceMode = 'starting';
  sale.fields = { 'property-sale-price': '12500000', 'property-bedroom-type': '3 bedrooms', 'property-bathrooms': '2', 'property-units-available': '' };
  assert.deepEqual(plain(publish.bookingDetailsFor('property', sale, true, null)), {
    price_amount: 12500000, price_unit: 'month', size_or_type: '3 bedrooms', amenities: [], bathrooms: 2, units_available: null, available_from: null,
    sale_price_amount: 12500000, sale_price_mode: 'starting', min_lease_months: null, deposit_amount: null, utilities_included: false,
  });

  const stay = emptyForm();
  stay.fields = { 'price-amount': '3500', 'price-unit': 'hour', 'max-guests': '4', 'checkin-time': '14:00' };
  const details = plain(publish.bookingDetailsFor('airbnb', stay, false, null));
  assert.equal(details.price_unit, 'hour');
  assert.equal(details.max_guests, 4);
  assert.equal(details.cancellation_policy, 'moderate');
  assert.equal(details.cleaning_fee, null);

  const table = emptyForm();
  table.hotelListingMode = 'table';
  table.fields = { title: 'The Garden', 'dining-opening-hours': '9-5', 'dining-tables-available': '12' };
  assert.equal(publish.savesBookingDetails('hotel', table), false);
  assert.deepEqual(plain(publish.diningBody('hotel', table)), { restaurant_name: 'The Garden', caption: '', location_text: '', opening_hours: '9-5', tables_available: 12 });
  assert.deepEqual(plain(publish.listingPayload('hotel', table, true)), {
    title: 'The Garden', description: '', property_description: '', location_text: '', country: 'Kenya', category: 'hotel', supports_stay: false, supports_table_reservation: true,
  });
});

test('editing a listing fills the form from its rows', () => {
  const form = publish.editForm(emptyForm(), 'property', { id: 'l1', title: 'Amani', listing_purpose: null },
    { price_amount: 50000, sale_price_amount: 9000000, size_or_type: 'Maisonette', utilities_included: true, amenities: ['parking'] }, null);
  assert.equal(form.fields.title, 'Amani');
  assert.equal(form.propertyPurpose, 'both');
  assert.equal(form.fields['property-bedroom-type'], 'Maisonette');
  assert.equal(form.fields['utilities-included'], true);
  assert.ok(form.amenities.some((item) => item.key === 'parking' && item.checked));
});
