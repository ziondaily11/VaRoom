'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('the Test Mode migration maps only canonical VaRoom plan IDs to the approved Paystack codes', () => {
  const initialMigration = fs.readFileSync(path.join(__dirname, '..', 'migrations', '20260920_000017_paystack_test_plan_codes.sql'), 'utf8');
  const correctionMigration = fs.readFileSync(path.join(__dirname, '..', 'migrations', '20260920_000018_correct_paystack_test_plan_codes.sql'), 'utf8');
  assert.match(initialMigration, /when 'basic' then 'PLN_mf3hll9nlv8neac'/);
  assert.match(correctionMigration, /when 'growth' then 'PLN_g6pfynz64r22zcx'/);
  assert.match(correctionMigration, /when 'pro' then 'PLN_6pr1l87cfne5o90'/);
  assert.match(correctionMigration, /where id in \('growth', 'pro'\)/);
});
