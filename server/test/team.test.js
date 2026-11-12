'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { actingHostId } = require('../lib/team');

function admin(row) {
  const filters = [];
  const query = {
    select() { return query; },
    eq(column, value) { filters.push([column, value]); return query; },
    maybeSingle: async () => ({ data: row, error: null }),
  };
  return { from: () => query, filters };
}

test('a request acts for the user, or for a host they work for with the role', async () => {
  const req = (host) => ({ headers: host ? { 'x-varoom-host': host } : {} });
  assert.equal(await actingHostId(req(null), 'u1', 'manager', admin(null)), 'u1');
  assert.equal(await actingHostId(req('u1'), 'u1', 'manager', admin(null)), 'u1');
  const member = admin({ roles: ['manager'] });
  assert.equal(await actingHostId(req('h1'), 'u1', 'manager', member), 'h1');
  assert.deepEqual(member.filters, [['host_id', 'h1'], ['member_id', 'u1'], ['status', 'active']]);
  assert.equal(await actingHostId(req('h1'), 'u1', 'manager', admin({ roles: ['messaging'] })), null, 'wrong role');
  assert.equal(await actingHostId(req('h1'), 'u1', 'manager', admin(null)), null, 'not on the team');
});
