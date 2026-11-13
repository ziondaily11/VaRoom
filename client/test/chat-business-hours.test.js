'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadTs } = require('./helpers/loadTs');

const root = path.join(__dirname, '..');
const bh = loadTs(path.join(root, 'lib', 'chat', 'businessHours.ts'));
const at = (iso) => Date.parse(iso);

test('the app shows "away now" exactly as the server decides (Nairobi time, past midnight)', () => {
  const schedule = { ...bh.DEFAULT_BUSINESS_HOURS, enabled: true };
  assert.equal(bh.outsideBusinessHours(schedule, at('2026-11-13T12:00:00Z')), false, 'Friday 15:00');
  assert.equal(bh.outsideBusinessHours(schedule, at('2026-11-13T17:00:00Z')), true, 'Friday 20:00');
  assert.equal(bh.outsideBusinessHours(schedule, at('2026-11-15T09:00:00Z')), true, 'Sunday closed');
  assert.equal(bh.outsideBusinessHours(bh.DEFAULT_BUSINESS_HOURS, at('2026-11-15T09:00:00Z')), false, 'switched off');
  const late = bh.readBusinessHours({ enabled: true, days: [null, null, null, null, null, { open: '18:00', close: '02:00' }, null] });
  assert.equal(bh.outsideBusinessHours(late, at('2026-11-13T22:30:00Z')), false, 'Saturday 01:30 from Friday');
  const server = fs.readFileSync(path.join(root, '..', 'server', 'lib', 'businessHours.js'), 'utf8');
  assert.match(server, /const NAIROBI_OFFSET_MS = 3 \* 60 \* 60 \* 1000;/, 'same clock as the server');
});

test('stored schedules are read safely; the default is Mon–Sat 08:00–20:00, Sunday closed, switched off', () => {
  assert.equal(bh.readBusinessHours(null), bh.DEFAULT_BUSINESS_HOURS);
  assert.equal(bh.readBusinessHours({ enabled: true, days: [1, 2] }), bh.DEFAULT_BUSINESS_HOURS);
  const read = bh.readBusinessHours({ enabled: true, days: [null, { open: '25:00', close: '20:00' }, { open: '08:00', close: '20:00' }, null, null, null, null] });
  assert.deepEqual(read.days.slice(0, 3), [null, null, { open: '08:00', close: '20:00' }], 'unreadable hours count as closed');
  assert.equal(bh.DEFAULT_BUSINESS_HOURS.enabled, false);
  assert.equal(bh.DEFAULT_BUSINESS_HOURS.days[0], null);
  assert.deepEqual(bh.WEEK.map(([label]) => label), ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']);
});

test('Chat Settings: Business hours under Away mode, saved to the account after a pause', () => {
  const settings = fs.readFileSync(path.join(root, 'components', 'chat', 'ChatSettings.tsx'), 'utf8');
  assert.match(settings, /label="Business hours"/);
  assert.match(settings, /\{settings\.awaySchedule\.enabled && <BusinessHoursEditor value=\{settings\.awaySchedule\} onChange=\{setSchedule\} \/>\}/);
  assert.match(settings, /saveProfileSetting\(getSupabaseClient\(\), userId, 'awaySchedule', awaySchedule, storage\(\)\);\s*\}, 600\);/);
  const cs = loadTs(path.join(root, 'lib', 'chat', 'chatSettings.ts'));
  assert.deepEqual(cs.profileSettingsFromRow({ away_schedule: { enabled: true, days: Array(7).fill(null) } }).awaySchedule.enabled, true);
  const migration = fs.readFileSync(path.join(root, '..', 'server', 'migrations', '20261113_000059_business_hours.sql'), 'utf8');
  assert.match(migration, /add column if not exists away_schedule jsonb;/);
});
