'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { outsideBusinessHours, hostAwayNow } = require('../lib/businessHours');

// Nairobi is UTC+3: 12:00 UTC is 15:00 in Nairobi. 2026-11-13 is a Friday.
const at = (iso) => Date.parse(iso);
const weekdays = (open, close) => ({ enabled: true, days: [null, ...Array.from({ length: 6 }, () => ({ open, close }))] });

test('away outside the day\'s hours in Nairobi time, open inside them; Sunday closed', () => {
  const schedule = weekdays('08:00', '20:00');
  assert.equal(outsideBusinessHours(schedule, at('2026-11-13T12:00:00Z')), false, 'Friday 15:00: open');
  assert.equal(outsideBusinessHours(schedule, at('2026-11-13T04:59:00Z')), true, 'Friday 07:59: before opening');
  assert.equal(outsideBusinessHours(schedule, at('2026-11-13T05:00:00Z')), false, 'Friday 08:00: opens');
  assert.equal(outsideBusinessHours(schedule, at('2026-11-13T17:00:00Z')), true, 'Friday 20:00: closed');
  assert.equal(outsideBusinessHours(schedule, at('2026-11-15T09:00:00Z')), true, 'Sunday: closed all day');
});

test('hours past midnight run into the next morning', () => {
  const schedule = { enabled: true, days: Array.from({ length: 7 }, () => null) };
  schedule.days[5] = { open: '18:00', close: '02:00' }; // Friday evening into Saturday
  assert.equal(outsideBusinessHours(schedule, at('2026-11-13T16:00:00Z')), false, 'Friday 19:00');
  assert.equal(outsideBusinessHours(schedule, at('2026-11-13T22:30:00Z')), false, 'Saturday 01:30, from Friday');
  assert.equal(outsideBusinessHours(schedule, at('2026-11-13T23:30:00Z')), true, 'Saturday 02:30');
});

test('off, missing or unreadable schedules never make a host away; Away mode always does', () => {
  const now = at('2026-11-13T02:00:00Z');
  assert.equal(outsideBusinessHours({ ...weekdays('08:00', '20:00'), enabled: false }, now), false);
  assert.equal(outsideBusinessHours(null, now), false);
  assert.equal(outsideBusinessHours({ enabled: true, days: [] }, now), false);
  assert.equal(hostAwayNow({ away_mode: false, away_schedule: weekdays('08:00', '20:00') }, now), true, 'Friday 05:00: outside hours');
  assert.equal(hostAwayNow({ away_mode: true, away_schedule: null }, now), true);
  assert.equal(hostAwayNow({ away_mode: false, away_schedule: null }, now), false);
  assert.equal(hostAwayNow(null, now), false);
});
