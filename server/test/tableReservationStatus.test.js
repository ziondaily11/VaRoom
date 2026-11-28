'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

// The route runs against a stand-in database: one host (h1), one reservation of theirs.
const RESERVATION = '11111111-1111-4111-8111-111111111111';
const updates = [];
const admin = {
  auth: { getUser: async (token) => ({ data: { user: token === 'good' ? { id: 'h1' } : token === 'guest' ? { id: 'c1' } : null }, error: null }) },
  from(table) {
    const filters = {};
    let payload = null;
    const chain = {
      select: () => chain,
      update: (value) => { payload = value; return chain; },
      eq: (column, value) => { filters[column] = value; return chain; },
      maybeSingle: async () => {
        if (table === 'profiles') return { data: { id: filters.id, role: filters.id === 'h1' ? 'host' : 'client' }, error: null };
        updates.push({ payload, filters: { ...filters } });
        const mine = filters.id === RESERVATION && filters.host_id === 'h1';
        return { data: mine ? { id: RESERVATION, status: payload.status } : null, error: null };
      },
    };
    return chain;
  },
};
const stub = (relative, exports) => {
  const file = require.resolve(path.join(__dirname, '..', relative));
  require.cache[file] = { id: file, filename: file, loaded: true, exports };
};
stub('lib/supabaseClient', admin);
stub('lib/notifications', { createNotification: async () => null });
stub('lib/accountAccess', { rejectSuspendedActivity: async () => false });
const router = require('../routes/hotelReservationRoutes');

const handler = router.stack.find((layer) => layer.route && layer.route.path === '/host/table-reservations/:id' && layer.route.methods.patch).route.stack[0].handle;
const call = async (token, id, body) => {
  const res = { code: 200, body: null, status(code) { this.code = code; return this; }, json(value) { this.body = value; return this; } };
  await handler({ headers: { authorization: `Bearer ${token}` }, params: { id }, body }, res);
  return res;
};

test('a host marks their own table reservation New, Contacted or Closed from the calendar', async () => {
  const done = await call('good', RESERVATION, { status: 'contacted' });
  assert.equal(done.code, 200);
  assert.deepEqual(done.body, { reservation: { id: RESERVATION, status: 'contacted' } });
  assert.equal(updates.at(-1).payload.status, 'contacted');
  assert.equal(updates.at(-1).filters.host_id, 'h1', 'only the host\'s own reservations');

  assert.equal((await call('good', '22222222-2222-4222-8222-222222222222', { status: 'closed' })).code, 404, 'another host\'s reservation');
  assert.equal((await call('good', RESERVATION, { status: 'approved' })).code, 400, 'only the three statuses');
  assert.equal((await call('good', RESERVATION, { status: 'closed', host_id: 'h2' })).code, 400, 'nothing else can be changed');
  assert.equal((await call('good', 'not-an-id', { status: 'closed' })).code, 400);
  assert.equal((await call('guest', RESERVATION, { status: 'closed' })).code, 403, 'clients cannot');
  assert.equal((await call('expired', RESERVATION, { status: 'closed' })).code, 401);
});
