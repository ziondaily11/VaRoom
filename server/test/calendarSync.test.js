'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { parseIcs, checkUrl, fetchCalendar, privateAddress, syncFeed } = require('../lib/calendarSync');
const { createCalendarSyncRoutes } = require('../routes/calendarSyncRoutes');

// As Airbnb.com exports a listing (whole days; DTEND is the check-out day).
const AIRBNB = [
  'BEGIN:VCALENDAR', 'PRODID:-//Airbnb Inc//Hosting Calendar 1.0//EN', 'CALSCALE:GREGORIAN', 'VERSION:2.0',
  'BEGIN:VEVENT', 'DTEND;VALUE=DATE:20261205', 'DTSTART;VALUE=DATE:20261201', 'UID:1418fb94e984-a1b2@airbnb.com',
  'DESCRIPTION:Reservation URL: https://www.airbnb.com/hosting/reservations/details/HMABC\\nPhone Number (Last 4 Digits)',
  ' : 1234', 'SUMMARY:Reserved', 'END:VEVENT',
  'BEGIN:VEVENT', 'DTEND;VALUE=DATE:20261211', 'DTSTART;VALUE=DATE:20261210', 'UID:7f3e@airbnb.com', 'SUMMARY:Airbnb (Not available)', 'END:VEVENT',
  'END:VCALENDAR', '',
].join('\r\n');

// As Booking.com exports a room.
const BOOKING = [
  'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Booking.com//NONSGML Booking.com Calendar//EN',
  'BEGIN:VEVENT', 'UID:58ab@booking.com', 'DTSTART;VALUE=DATE:20261220', 'DTEND;VALUE=DATE:20261223', 'SUMMARY:CLOSED - Not available', 'END:VEVENT',
  'BEGIN:VEVENT', 'UID:58ac@booking.com', 'STATUS:CANCELLED', 'DTSTART;VALUE=DATE:20261224', 'DTEND;VALUE=DATE:20261226', 'SUMMARY:Cancelled', 'END:VEVENT',
  'END:VCALENDAR',
].join('\n');

// Timed events (Google Calendar): UTC, a named zone, floating local time, across midnight, overnight stays.
const TIMED = [
  'BEGIN:VCALENDAR',
  'BEGIN:VEVENT', 'DTSTART:20261205T070000Z', 'DTEND:20261205T100000Z', 'SUMMARY:Wedding\\, garden', 'END:VEVENT',
  'BEGIN:VEVENT', 'DTSTART;TZID=Europe/London:20260715T090000', 'DTEND;TZID=Europe/London:20260715T110000', 'SUMMARY:Summer time', 'END:VEVENT',
  'BEGIN:VEVENT', 'DTSTART:20261206T200000', 'DTEND:20261207T000000', 'SUMMARY:Until midnight', 'END:VEVENT',
  'BEGIN:VEVENT', 'DTSTART:20261208T140000', 'DTEND:20261211T100000', 'SUMMARY:Stay', 'END:VEVENT',
  'BEGIN:VEVENT', 'DTSTART:20261212T140000', 'DTEND:20261213T180000', 'SUMMARY:Two days', 'END:VEVENT',
  'BEGIN:VEVENT', 'DTSTART:2026120', 'SUMMARY:Unreadable', 'END:VEVENT',
  'END:VCALENDAR',
].join('\n');

test('Airbnb.com and Booking.com calendars become booked days (check-out not a night; cancelled skipped)', () => {
  assert.deepEqual(parseIcs(AIRBNB), [
    { start: '2026-12-01', end: '2026-12-04', start_time: null, end_time: null, title: 'Reserved' },
    { start: '2026-12-10', end: '2026-12-10', start_time: null, end_time: null, title: 'Airbnb (Not available)' },
  ]);
  assert.deepEqual(parseIcs(BOOKING), [{ start: '2026-12-20', end: '2026-12-22', start_time: null, end_time: null, title: 'CLOSED - Not available' }]);
});

test('timed events are read in Nairobi time', () => {
  assert.deepEqual(parseIcs(TIMED), [
    { start: '2026-12-05', end: '2026-12-05', start_time: '10:00', end_time: '13:00', title: 'Wedding, garden' },
    { start: '2026-07-15', end: '2026-07-15', start_time: '11:00', end_time: '13:00', title: 'Summer time' },
    { start: '2026-12-06', end: '2026-12-06', start_time: '20:00', end_time: '24:00', title: 'Until midnight' },
    { start: '2026-12-08', end: '2026-12-10', start_time: null, end_time: null, title: 'Stay' },
    { start: '2026-12-12', end: '2026-12-13', start_time: null, end_time: null, title: 'Two days' },
  ]);
});

test('links: https on public addresses only, checked again after every redirect', async () => {
  for (const address of ['10.0.0.5', '127.0.0.1', '169.254.169.254', '172.20.1.1', '192.168.1.1', '100.64.0.1', '::1', 'fd00::1', 'fe80::1', '::ffff:127.0.0.1', '0.0.0.0']) {
    assert.equal(privateAddress(address), true, address);
  }
  for (const address of ['8.8.8.8', '104.16.1.1', '2606:4700::1111']) assert.equal(privateAddress(address), false, address);
  const publicDns = async () => [{ address: '104.16.1.1' }];
  await assert.rejects(checkUrl('http://www.airbnb.com/calendar/ical/1.ics', publicDns), /https calendar link/);
  await assert.rejects(checkUrl('https://www.airbnb.com:8443/x.ics', publicDns), /https calendar link/);
  await assert.rejects(checkUrl('https://user:pw@example.com/x.ics', publicDns), /https calendar link/);
  await assert.rejects(checkUrl('not a link', publicDns), /valid link/);
  await assert.rejects(checkUrl('https://internal.example/x.ics', async () => [{ address: '10.1.2.3' }]), /can’t be reached/);
  await assert.rejects(checkUrl('https://[::1]/x.ics', publicDns), /can’t be reached/);

  const reply = (status, body, headers = {}) => ({ status, ok: status >= 200 && status < 300, headers: new Headers(headers), body: null, text: async () => body });
  const seen = [];
  const lookup = async (host) => [{ address: host === 'metadata.internal' ? '169.254.169.254' : '104.16.1.1' }];
  const redirecting = async (url) => { seen.push(String(url)); return reply(302, '', { location: 'https://metadata.internal/latest' }); };
  await assert.rejects(fetchCalendar('https://www.airbnb.com/calendar/ical/1.ics', { fetchFn: redirecting, lookup }), /can’t be reached/);
  assert.equal(seen.length, 1, 'the redirect target is never fetched');
  await assert.rejects(fetchCalendar('https://x.com/a.ics', { fetchFn: async () => reply(200, '<html>login</html>'), lookup }), /isn’t a calendar link/);
  await assert.rejects(fetchCalendar('https://x.com/a.ics', { fetchFn: async () => reply(404, ''), lookup }), /error \(404\)/);
  await assert.rejects(fetchCalendar('https://x.com/a.ics', { fetchFn: async () => reply(200, AIRBNB, { 'content-length': String(3 * 1024 * 1024) }), lookup }), /too large/);
  const hops = [];
  const moved = async (url) => { hops.push(String(url)); return hops.length === 1 ? reply(301, '', { location: '/v2/a.ics' }) : reply(200, AIRBNB); };
  assert.match(await fetchCalendar('https://x.com/a.ics', { fetchFn: moved, lookup }), /BEGIN:VCALENDAR/);
  assert.deepEqual(hops, ['https://x.com/a.ics', 'https://x.com/v2/a.ics']);
});

test('a sync replaces the link\'s days, names them, and alerts the host once about a clash', async () => {
  const calls = [];
  const admin = { rpc: async (name, args) => { calls.push([name, args]); return { data: args.p_error ? [] : ['2026-12-02'], error: null }; } };
  const notes = [];
  const feed = { id: 'f1', host_id: 'h1', listing_id: 'l1', name: 'Airbnb.com', url: 'https://www.airbnb.com/a.ics', listing: { title: 'Palm View' } };
  const ok = await syncFeed(admin, feed, { fetchFn: async () => ({ status: 200, ok: true, headers: new Headers(), body: null, text: async () => AIRBNB }), lookup: async () => [{ address: '104.16.1.1' }], notify: async (n) => notes.push(n) });
  assert.deepEqual(ok, { ok: true, count: 2, clashes: ['2026-12-02'] });
  assert.equal(calls[0][0], 'calendar_sync_feed');
  assert.deepEqual(calls[0][1].p_events.map((e) => e.title), ['Airbnb.com · Reserved', 'Airbnb.com · Airbnb (Not available)']);
  assert.equal(notes[0].type, 'booking_clash');
  assert.equal(notes[0].eventKey, 'booking-clash:l1:2026-12-02', 'the same clash is told once');
  assert.match(notes[0].message, /"Palm View" has more bookings than it can take on 2026-12-02/);
  // A link that fails keeps its days: only the error is saved.
  const failed = await syncFeed(admin, feed, { fetchFn: async () => ({ status: 500, ok: false, headers: new Headers(), text: async () => '' }), lookup: async () => [{ address: '104.16.1.1' }] });
  assert.equal(failed.ok, false);
  assert.deepEqual(calls[1][1], { p_feed: 'f1', p_events: [], p_error: 'The other site answered with an error (500). Check the link.' });
});

test('"Sync now": signed in, the host\'s own link (or as a manager), at most every 30 seconds', async () => {
  const express = require('express');
  const feeds = { f1: { id: '11111111-1111-1111-1111-111111111111', host_id: 'h1' } };
  const query = (filters) => ({ select() { return this; }, eq(col, val) { filters[col] = val; return this; }, maybeSingle: async () => ({ data: Object.values(feeds).find((f) => f.id === filters.id && f.host_id === filters.host_id) || null, error: null }) });
  const admin = {
    auth: { getUser: async (token) => ({ data: { user: token === 'good' ? { id: 'h1' } : token === 'other' ? { id: 'h2' } : null }, error: null }) },
    from: () => query({}),
  };
  const app = express();
  app.use('/api', createCalendarSyncRoutes({ admin, sync: async () => ({ ok: true, count: 3, clashes: [] }) }));
  const server = app.listen(0);
  const url = `http://127.0.0.1:${server.address().port}/api/calendar/feeds/11111111-1111-1111-1111-111111111111/sync`;
  try {
    assert.equal((await fetch(url, { method: 'POST' })).status, 401);
    assert.equal((await fetch(url, { method: 'POST', headers: { Authorization: 'Bearer other' } })).status, 404, 'another host\'s link');
    const first = await fetch(url, { method: 'POST', headers: { Authorization: 'Bearer good' } });
    assert.deepEqual(await first.json(), { ok: true, count: 3, clashes: [] });
    assert.equal((await fetch(url, { method: 'POST', headers: { Authorization: 'Bearer good' } })).status, 429);
  } finally {
    server.close();
  }
  const serverJs = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  assert.match(serverJs, /scheduleJob\('Calendar links', \{ first: 2 \* 60 \* 1000, every: SYNC_INTERVAL_MS \},/);
  assert.match(serverJs, /app\.use\('\/api', createCalendarSyncRoutes\(\)\);/);
});

test('migration 000093: links, export tokens, imports never refused but clashes reported', () => {
  const sql = fs.readFileSync(path.join(__dirname, '..', 'migrations', '20261128_000093_calendar_sync.sql'), 'utf8');
  assert.match(sql, /url text not null check \(url ~ '\^https:\/\/' and char_length\(url\) <= 2000\)/);
  assert.match(sql, /\(select count\(\*\) from public\.calendar_feeds f where f\.listing_id = calendar_feeds\.listing_id\) < 5/);
  assert.match(sql, /or new\.source = 'ical' then\s+return null;/);
  assert.match(sql, /kind = 'event' and source = 'host' and feed_id is null/, 'hosts can\'t add or edit imported days');
  assert.match(sql, /grant execute on function public\.calendar_sync_feed\(uuid, jsonb, text\) to service_role;/);
  assert.match(sql, /revoke all on function public\.calendar_sync_feed\(uuid, jsonb, text\) from public, anon, authenticated;/);
  assert.match(sql, /where x\.token = p_token and char_length\(p_token\) = 64/);
  assert.match(sql, /revoke all on public\.calendar_exports from anon, authenticated;/, 'tokens are only handed out by calendar_export_token');
});
