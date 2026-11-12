'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { PENDING_EXPIRY_MS, expireStaleRequests } = require('../lib/bookingExpiry');

const read = (...parts) => fs.readFileSync(path.join(__dirname, '..', ...parts), 'utf8');

test('unanswered requests expire after 48 hours, on the server', async () => {
  const calls = [];
  const query = {
    update(values) { calls.push(['update', values]); return query; },
    eq(column, value) { calls.push(['eq', column, value]); return query; },
    lt(column, value) { calls.push(['lt', column, value]); return query; },
    select: async () => ({ data: [{ id: 'B1' }, { id: 'B2' }], error: null }),
  };
  const now = Date.parse('2026-11-10T12:00:00Z');
  const ids = await expireStaleRequests({ from: (table) => { calls.push(['from', table]); return query; } }, now);
  assert.deepEqual(ids, ['B1', 'B2']);
  assert.equal(PENDING_EXPIRY_MS, 48 * 60 * 60 * 1000);
  assert.deepEqual(calls, [
    ['from', 'bookings'],
    ['update', { status: 'expired', responded_at: '2026-11-10T12:00:00.000Z' }],
    ['eq', 'status', 'pending'],
    ['lt', 'created_at', '2026-11-08T12:00:00.000Z'],
  ]);
  const failing = { update: () => failing, eq: () => failing, lt: () => failing, select: async () => ({ data: null, error: new Error('down') }) };
  await assert.rejects(expireStaleRequests({ from: () => failing }), /down/);

  const server = read('server.js');
  assert.match(server, /setInterval\(expireStaleBookingRequestsNow, BOOKING_EXPIRY_INTERVAL_MS\)\.unref\(\);/);
});

test('listing booking rules: instant book, notice, booking window and maximum stay are validated', () => {
  const routes = read('routes', 'listingRoutes.js');
  assert.match(routes, /'instant_book', 'min_notice_days', 'max_advance_days', 'max_stay_nights',/);
  assert.match(routes, /key === 'min_notice_days'\) \{\s+detailUpdate\[key\] = value === null \? null : number\(value, key, \{ integer: true, min: 0, max: 365 \}\);/);
  assert.match(routes, /key === 'max_advance_days'\) \{\s+detailUpdate\[key\] = value === null \? null : number\(value, key, \{ integer: true, min: 1, max: 1095 \}\);/);
  assert.match(routes, /if \(typeof value !== 'boolean'\) throw new ValidationError\('instant_book is invalid'\);/);
  assert.match(routes, /The maximum stay must be at least the minimum stay/);
});

test('the database decides booking status and enforces the rules', () => {
  const sql = read('migrations', '20261110_000063_booking_rules.sql');
  assert.match(sql, /new\.status := 'approved';/);
  assert.match(sql, /new\.status := 'pending';/);
  assert.match(sql, /rules\.instant_book and new\.start_date is not null and new\.end_date is not null/, 'instant only for nightly stays');
  assert.match(sql, /pg_advisory_xact_lock/, 'overlap check is serialised per listing');
  assert.match(sql, /check \(status in \('pending', 'approved', 'declined', 'expired', 'cancelled', 'completed'\)\)/);
  assert.match(sql, /with check \(auth\.uid\(\) = client_id and status = 'cancelled'\)/, 'guests may only cancel');
  assert.match(sql, /\(to_jsonb\(new\) - 'status'\) is distinct from \(to_jsonb\(old\) - 'status'\)/, 'and change nothing else');
  assert.match(sql, /before insert or update on public\.bookings\s+for each row execute function public\.varoom_snapshot_booking_location\(\)/, 'instant bookings get the location snapshot');
});

test('hosts are reminded once, about 6 hours before a request expires', async () => {
  const { remindExpiringRequests } = require('../lib/bookingExpiry');
  const calls = [];
  const query = {
    select(columns) { calls.push(['select', columns]); return query; },
    eq(column, value) { calls.push(['eq', column, value]); return query; },
    lt(column, value) { calls.push(['lt', column, value]); return query; },
    gte: async (column, value) => { calls.push(['gte', column, value]); return { data: [{ id: 'B1', host_id: 'H1', listing: { title: 'Palm View' } }], error: null }; },
  };
  const sent = [];
  const now = Date.parse('2026-11-10T12:00:00Z');
  assert.equal(await remindExpiringRequests({ from: () => query }, now, async (n) => { sent.push(n); }), 1);
  assert.deepEqual(calls.slice(1), [['eq', 'status', 'pending'], ['lt', 'created_at', '2026-11-08T18:00:00.000Z'], ['gte', 'created_at', '2026-11-08T12:00:00.000Z']]);
  assert.equal(sent[0].recipientUserId, 'H1');
  assert.equal(sent[0].type, 'booking_expiring');
  assert.equal(sent[0].eventKey, 'booking-expiring:B1', 'one reminder per request');
  assert.match(sent[0].message, /"Palm View" expires in about 6 hours/);
});

test('a notification the recipient turned off is skipped, not an error', () => {
  assert.match(read('lib', 'notifications.js'), /if \(error && error\.code === 'PGRST116'\) return null;/);
  const sql = read('migrations', '20261112_000064_notification_preferences.sql');
  assert.match(sql, /drop constraint if exists notifications_type_check/, 'every notification type can be stored');
  assert.match(sql, /new\.type = 'new_message' and p\.message_notifications = false/);
  assert.match(sql, /return null; -- turned off: not stored/);
});
