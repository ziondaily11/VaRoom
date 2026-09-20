'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('the Test Mode migration maps only canonical VaRoom plan IDs to the approved Paystack codes', () => {
  const migration = fs.readFileSync(path.join(__dirname, '..', 'migrations', '20260920_000017_paystack_test_plan_codes.sql'), 'utf8');
  assert.match(migration, /when 'basic' then 'PLN_mf3hll9nlv8neac'/);
  assert.match(migration, /when 'growth' then 'PLN_g6pfynz64r22zxc'/);
  assert.match(migration, /when 'pro' then 'PLN_6prll87cf5e5090'/);
  assert.match(migration, /where id in \('basic', 'growth', 'pro'\)/);
});
