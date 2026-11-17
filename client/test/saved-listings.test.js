const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { loadTs } = require('./helpers/loadTs');

const root = path.join(__dirname, '..');
const load = () => loadTs(path.join(root, 'lib', 'bookmarks', 'bookmarks.ts'));

// A client that answers the bookmark ids, the Saved list query and writes.
function fakeClient({ ids = ['a', 'b'], rows = [], error = null } = {}) {
  const calls = { list: 0, saved: 0, writes: [] };
  return {
    calls,
    from(table) {
      assert.equal(table, 'bookmarks');
      return {
        select(columns) {
          const isSavedList = columns.includes('listing:listings');
          return {
            eq() {
              if (!isSavedList) { calls.list += 1; return Promise.resolve({ data: ids.map((listing_id) => ({ listing_id })), error: null }); }
              return { order: async () => { calls.saved += 1; return { data: rows, error }; } };
            },
          };
        },
        delete() { return { eq: () => ({ eq: async () => { calls.writes.push('delete'); return { error: null }; } }) }; },
        insert: async () => { calls.writes.push('insert'); return { error: null }; },
      };
    },
  };
}

const listing = (id) => ({ id, title: `Listing ${id}`, location_text: null, category: 'airbnb', availability_status: 'available', listing_photos: [], listing_booking_details: null });

test('the Saved list is one ordered request, leaves out hidden listings and is reused on return', async () => {
  const bm = load();
  const client = fakeClient({ rows: [{ listing: listing('b') }, { listing: null }, { listing: [listing('a')] }] });
  let now = 1000;
  const rows = await bm.loadSavedListings(client, 'u1', () => now);
  assert.deepEqual(rows.map((row) => row.id), ['b', 'a']);
  assert.equal(client.calls.saved, 1);
  assert.deepEqual(bm.peekSavedListings('u1', now).map((row) => row.id), ['b', 'a'], 'shown at once on return');
  await bm.loadSavedListings(client, 'u1', () => now);
  assert.equal(client.calls.saved, 1, 'no second request while current');
  assert.equal(bm.peekSavedListings('u2', now), null, 'never another account list');
  now += 3 * 60 * 1000;
  assert.equal(bm.peekSavedListings('u1', now), null, 'expires after a couple of minutes');
});

test('concurrent loads share a request; saving or unsaving makes the list out of date', async () => {
  const bm = load();
  const client = fakeClient({ rows: [{ listing: listing('a') }] });
  await Promise.all([bm.loadSavedListings(client, 'u1'), bm.loadSavedListings(client, 'u1')]);
  assert.equal(client.calls.saved, 1);
  await bm.toggleBookmark(client, 'u1', 'c');
  assert.equal(bm.peekSavedListings('u1'), null, 'a new save invalidates the list');
  await bm.loadSavedListings(client, 'u1');
  assert.equal(client.calls.saved, 2);
});

test('sign-out clears the Saved list', async () => {
  const bm = load();
  const client = fakeClient({ rows: [{ listing: listing('a') }] });
  await bm.loadSavedListings(client, 'u1');
  bm.clearBookmarks();
  assert.equal(bm.peekSavedListings('u1'), null);
});

test('a failed load is reported and not cached', async () => {
  const bm = load();
  const client = fakeClient({ error: new Error('offline') });
  await assert.rejects(bm.loadSavedListings(client, 'u1'), /offline/);
  assert.equal(bm.peekSavedListings('u1'), null);
});
