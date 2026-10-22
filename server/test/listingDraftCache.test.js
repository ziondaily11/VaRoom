'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { File } = require('node:buffer');
const { createListingDraftCache } = require('../../client/public/js/listing-draft-cache');

function createMemoryIndexedDB(){
  const records = new Map();
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
        get: (key) => schedule(() => {
          const value = records.get(key);
          return value && structuredClone(value);
        }),
        delete: (key) => schedule(() => records.delete(key)),
      });
      return transaction;
    },
  };
  return {
    open() {
      const request = {};
      queueMicrotask(() => {
        request.result = database;
        if (!hasStore && request.onupgradeneeded) request.onupgradeneeded();
        if (request.onsuccess) request.onsuccess();
      });
      return request;
    },
  };
}

function createMemoryStorage(){
  const values = new Map();
  return {
    getItem: (key) => values.has(key) ? values.get(key) : null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
}

test('listing drafts persist local image/video files but strip private document bytes', async () => {
  const cache = createListingDraftCache({
    indexedDBRef: createMemoryIndexedDB(),
    storage: createMemoryStorage(),
  });
  const files = [
    new File(['photo bytes'], 'photo.jpg', { type: 'image/jpeg' }),
    new File(['video bytes'], 'video.mp4', { type: 'video/mp4' }),
  ];
  const policyFile = new File(['policy bytes'], 'policy.pdf', { type: 'application/pdf' });
  const floorPlanFile = new File(['floor plan bytes'], 'floor-plan.pdf', { type: 'application/pdf' });
  const ownershipFile = new File(['ownership bytes'], 'ownership.pdf', { type: 'application/pdf' });
  const draft = {
    cacheKey: 'host-1:draft-1',
    hostId: 'host-1',
    listingId: 'listing-1',
    category: 'property',
    createdAt: Date.now(),
    fields: { title: 'Restored listing' },
    mediaFiles: files,
    policyFile,
    officeShopFiles: { floorPlan: floorPlanFile, policy: null, documents: [ownershipFile] },
    uploadedDocumentRefs: { property_policy: [{ id: 'doc-1', filename: 'policy.pdf' }] },
  };

  await cache.save(draft);
  const restored = await cache.load(draft.cacheKey);
  assert.equal(restored.listingId, 'listing-1');
  assert.equal(restored.fields.title, 'Restored listing');
  assert.equal(restored.mediaFiles.length, 2);
  assert.ok(restored.mediaFiles[0] instanceof File);
  assert.equal(restored.mediaFiles[0].name, 'photo.jpg');
  assert.ok(restored.mediaFiles[1] instanceof File);
  assert.equal(restored.mediaFiles[1].name, 'video.mp4');
  assert.equal(restored.policyFile, null);
  assert.deepEqual(restored.officeShopFiles, { floorPlan: null, policy: null, documents: [] });
  assert.deepEqual(restored.uploadedDocumentRefs, { property_policy: [{ id: 'doc-1', filename: 'policy.pdf' }] });
});

test('draft pointers are host-scoped and clearing a host removes its cache entry', async () => {
  const cache = createListingDraftCache({
    indexedDBRef: createMemoryIndexedDB(),
    storage: createMemoryStorage(),
  });
  const pointer = {
    hostId: 'host-1',
    cacheKey: 'host-1:draft-1',
    listingId: 'listing-1',
    category: 'property',
    createdAt: Date.now(),
    returnTo: 'list',
  };
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
