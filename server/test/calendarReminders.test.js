'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { nairobiHour, sendCalendarReminders } = require('../lib/calendarReminders');

test('reminders: tomorrow\'s in the evening (Nairobi time), lease ends any time, once each by key', async () => {
  assert.equal(nairobiHour(new Date('2026-11-28T14:00:00Z')), 17);
  assert.equal(nairobiHour(new Date('2026-11-28T22:30:00Z')), 1);
  const asked = [];
  const sent = [];
  const admin = { rpc: async (name, args) => { asked.push([name, args]); return { data: [
    { host_id: 'h1', event_key: 'calendar-reminder:booking:7', title: 'Tomorrow at Palm View', message: 'Wanjiku checks in.', listing_id: 'l1' },
    { host_id: 'h2', event_key: 'calendar-reminder:event:e1:2026-11-29', title: 'Tomorrow', message: 'Pay KPLC.', listing_id: null },
  ], error: null }; } };
  const count = await sendCalendarReminders(admin, new Date('2026-11-28T15:00:00Z'), async (n) => { sent.push(n); return n; });
  assert.deepEqual(asked, [['calendar_reminders_due', { p_tomorrow: true }]], '18:00 in Nairobi: evening');
  assert.equal(count, 2);
  assert.deepEqual(sent.map((n) => [n.type, n.eventKey, n.relatedEntityType, n.relatedEntityId]), [
    ['calendar_reminder', 'calendar-reminder:booking:7', 'listing', 'l1'],
    ['calendar_reminder', 'calendar-reminder:event:e1:2026-11-29', null, null],
  ]);
  await sendCalendarReminders(admin, new Date('2026-11-28T06:00:00Z'), async () => null);
  assert.deepEqual(asked[1], ['calendar_reminders_due', { p_tomorrow: false }], 'morning: lease ends only');
  // One failing reminder doesn't stop the others.
  let calls = 0;
  const partial = await sendCalendarReminders(admin, new Date('2026-11-28T15:00:00Z'), async () => { calls += 1; if (calls === 1) throw new Error('down'); return {}; });
  assert.equal(partial, 1);
  await assert.rejects(sendCalendarReminders({ rpc: async () => ({ data: null, error: new Error('rpc down') }) }), /rpc down/);
  const server = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  assert.match(server, /scheduleJob\('Calendar reminders', \{ first: 3 \* 60 \* 1000, every: REMINDER_INTERVAL_MS \},/);
});

test('migration 000094: viewings, planner data, reminders (server only), reminder setting, occupancy from the calendar', () => {
  const sql = fs.readFileSync(path.join(__dirname, '..', 'migrations', '20261128_000094_calendar_planner_all_niches.sql'), 'utf8').replace(/\r\n/g, '\n');
  assert.match(sql, /and \(not viewing or not blocks\)/);
  assert.match(sql, /'planner', l\.category in \('property', 'office', 'shop'\)/);
  assert.match(sql, /'leases', coalesce\(/);
  assert.match(sql, /where o\.host_id = p_host and o\.voided_at is null/, 'voided outcomes left out');
  assert.match(sql, /grant execute on function public\.calendar_reminders_due\(boolean\) to service_role;/);
  assert.match(sql, /revoke all on function public\.calendar_reminders_due\(boolean\) from public, anon, authenticated;/);
  assert.match(sql, /new\.type in \('booking_expiring', 'calendar_reminder'\) and p\.notify_booking_reminders = false/);
  assert.match(sql, /'capacity_days', \(select coalesce\(sum\(cap\), 0\) from stay_days\)::integer/, 'every open day, every hotel room');
  assert.match(sql, /select coalesce\(sum\(least\(t\.units, s\.cap\)\), 0\)::integer as days/, 'booked days never exceed what the place can take');
  assert.match(sql, /join public\.calendar_entries e on e\.id = o\.entry_id and e\.blocks\n/, 'offline and other sites\' bookings count');
});

test('migration 000095: cleaning days and prices by date, worked out by the database', () => {
  const sql = fs.readFileSync(path.join(__dirname, '..', 'migrations', '20261128_000095_calendar_prices_turnover.sql'), 'utf8');
  assert.match(sql, /case when l\.category = 'hotel' then 0 else coalesce\(d\.turnover_days, 0\) end as turnover/, 'hotels rotate rooms instead');
  assert.match(sql, /least\(b\.end_date - case when listing\.daily then 0 else 1 end \+ listing\.turnover, p_to\)/, 'cleaning days after each stay');
  assert.match(sql, /last_night \+ case when new\.end_date is null then 0 else turnover end/, 'a new stay\'s own cleaning days must be free');
  assert.match(sql, /array\[5, 6\] else array\[0, 6\] end/, 'weekend: Friday and Saturday nights, or Saturday and Sunday');
  assert.match(sql, /sum\(public\.varoom_day_price\(new\.listing_id, g\.day::date\)\)/, 'a stay is priced night by night');
  assert.match(sql, /new\.total_price := public\.varoom_day_price\(new\.listing_id, new\.start_date\) \* new\.hours;/);
  assert.match(sql, /revoke all on function public\.varoom_day_price\(uuid, date\) from public, anon, authenticated;/);
  assert.match(sql, /'prices', coalesce\(/);
  assert.match(sql, /create unique index if not exists listing_prices_one_weekend/);
});

test('migration 000096: guests\' photos on the host calendar, nothing else changed', () => {
  const sql = fs.readFileSync(path.join(__dirname, '..', 'migrations', '20261128_000096_calendar_guest_photos.sql'), 'utf8');
  const before = fs.readFileSync(path.join(__dirname, '..', 'migrations', '20261128_000095_calendar_prices_turnover.sql'), 'utf8');
  assert.equal((sql.match(/'avatar', \(select p\.avatar_url from public\.profiles p where p\.id = (b|x)\.client_id\)/g) || []).length, 2);
  const strip = (raw) => {
    const text = raw.replace(/\r\n/g, '\n');
    return text.slice(text.indexOf('create or replace function public.host_calendar('), text.indexOf('grant execute on function public.host_calendar'))
      .replace(/,\n\s+'avatar', \(select p\.avatar_url from public\.profiles p where p\.id = (b|x)\.client_id\)/g, '');
  };
  assert.equal(strip(sql), strip(before), 'host_calendar is 000095\'s plus the two photo fields');
  assert.match(sql, /security invoker/);
});

test('migration 000097: a venue booking says what the event is; host_calendar is 000096\'s plus two fields', () => {
  const sql = fs.readFileSync(path.join(__dirname, '..', 'migrations', '20261129_000097_booking_event_types.sql'), 'utf8').replace(/\r\n/g, '\n');
  const before = fs.readFileSync(path.join(__dirname, '..', 'migrations', '20261128_000096_calendar_guest_photos.sql'), 'utf8').replace(/\r\n/g, '\n');
  const fn = (text) => text.slice(text.indexOf('create or replace function public.host_calendar('), text.indexOf('grant execute on function public.host_calendar'));
  assert.equal(fn(sql).replace(",\n        'event_type', b.event_type, 'event_notes', b.event_notes)", ')'), fn(before), 'only the two booking fields are new');
  assert.match(sql, /'wedding', 'traditional', 'graduation', 'birthday', 'corporate', 'conference', 'religious',\n  'baby_shower', 'memorial', 'concert', 'shoot', 'party', 'other'/);
  assert.match(sql, /char_length\(event_notes\) <= 500/);
  assert.match(sql, /elsif new\.event_type is null and now\(\) >= timestamptz '2026-12-07 00:00:00\+03' then\n    raise exception 'booking_rule: Choose the type of event\.';/, 'required after the grace week');
  assert.match(sql, /if not coalesce\(venue, false\) then\n    new\.event_type := null;\n    new\.event_notes := null;/, 'only venues keep them');
  assert.match(sql, /before insert on public\.bookings\n  for each row execute function public\.varoom_booking_event\(\);/);
  assert.match(sql, /format\(' \(%s, %s\)', public\.varoom_event_label\(new\.event_type\), to_char\(new\.start_date, 'FMDD Mon'\)\)/, 'the host\'s notification names the event and day');
  assert.match(sql, /security invoker/);
  assert.match(sql, /-- Undo \(in this order\):/);
});

test('migration 000098: the host\'s own notes on a booking, in their own table; host_calendar is 000097\'s plus three fields', () => {
  const sql = fs.readFileSync(path.join(__dirname, '..', 'migrations', '20261129_000098_booking_host_notes.sql'), 'utf8').replace(/\r\n/g, '\n');
  const before = fs.readFileSync(path.join(__dirname, '..', 'migrations', '20261129_000097_booking_event_types.sql'), 'utf8').replace(/\r\n/g, '\n');
  const fn = (text) => text.slice(text.indexOf('create or replace function public.host_calendar('), text.indexOf('grant execute on function public.host_calendar'));
  const added = ",\n        'host_title', n.title, 'host_notes', n.notes, 'host_color', n.color) order by b.start_date, b.start_time nulls first)\n      from public.bookings b\n      left join public.booking_host_notes n on n.booking_id = b.id\n";
  assert.equal(fn(sql).replace(added, ") order by b.start_date, b.start_time nulls first)\n      from public.bookings b\n"), fn(before), 'only the notes are new');
  assert.match(sql, /booking_id uuid primary key references public\.bookings\(id\) on delete cascade/);
  assert.match(sql, /and host_id = \(select b\.host_id from public\.bookings b where b\.id = booking_id\)\);/, 'a note only on the host\'s own booking');
  assert.match(sql, /using \(public\.varoom_can_act_for\(host_id, 'manager'\)\);/, 'the host and their Managers only');
  assert.match(sql, /revoke all on public\.booking_host_notes from anon;/);
  assert.match(sql, /security invoker/);
});
