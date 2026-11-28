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
  assert.deepEqual(ids.map((row) => row.id), ['B1', 'B2']);
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
  assert.match(server, /scheduleJob\('Booking request expiry', \{ first: 90 \* 1000, every: 60 \* 60 \* 1000 \}/);
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

test('calendar rules: changeover day, hotel rooms, open days, the 48-hour hold, and a calendar without names', () => {
  const sql = read('migrations', '20261127_000089_booking_calendar_rules.sql');
  assert.match(sql, /least\(b\.end_date - case when listing\.daily then 0 else 1 end, p_to\)/, 'a check-out day is not a night of the stay');
  assert.match(sql, /case when l\.category = 'hotel' then greatest\(coalesce\(d\.units_available, 1\), 1\) else 1 end as capacity/);
  assert.match(sql, /b\.status = 'pending' and b\.created_at > now\(\) - interval '48 hours'/);
  assert.match(sql, /where booked >= capacity/);
  assert.match(sql, /not exists \(select 1 from public\.availability a where a\.listing_id = new\.listing_id and a\.date::date = g\.day::date\)/);
  assert.match(sql, /old\.status = 'pending' and new\.status = 'approved' and old\.created_at < now\(\) - interval '48 hours'/);
  assert.match(sql, /jsonb_build_object\('night', n\.night, 'left', greatest\(n\.capacity - n\.booked, 0\)\)/, 'dates and rooms left only');
  assert.match(sql, /revoke all on function public\.varoom_booked_nights\(uuid, date, date\) from public, anon, authenticated;/);
  assert.match(sql, /grant execute on function public\.listing_calendar\(uuid\) to anon, authenticated;/);
  assert.match(sql, /pg_advisory_xact_lock/, 'still serialised per listing');
});

test('calendar part 2: open by default, closed ranges, conversion, and the host calendar with the caller\'s rights', () => {
  const sql = read('migrations', '20261127_000090_host_calendar.sql');
  assert.match(sql, /create policy "Hosts and managers read calendar entries" on public\.calendar_entries\s+for select to authenticated using \(public\.varoom_can_act_for\(host_id, 'manager'\)\);/);
  assert.match(sql, /if owner is null or not public\.varoom_can_act_for\(owner, 'manager'\) then/, 'only the host or a manager changes a calendar');
  assert.match(sql, /first_day date := greatest\(p_from, today\);/, 'the past is left as it was');
  assert.match(sql, /and not exists \(select 1 from public\.calendar_entries c where c\.listing_id = l\.id\)/, 'the conversion runs once per listing');
  assert.match(sql, /select t\.id, \(select day from today\), null from targets t where not exists \(select 1 from open_days o where o\.listing_id = t\.id\)/, 'no open day ahead: closed from today');
  assert.match(sql, /coalesce\(\(select d\.max_advance_days from public\.listing_booking_details d where d\.listing_id = p_listing\), 365\)/);
  assert.match(sql, /if ahead is null and new\.start_date is not null then\s+ahead := 365;/, 'leases keep no default limit');
  assert.match(sql, /raise exception 'booking_rule: Some of those dates are closed\. Please choose other dates\.';/);
  assert.doesNotMatch(sql.split('-- ---- 2. Rules')[1], /public\.availability/, 'bookings no longer read opened days');
  assert.match(sql, /returns jsonb\s+language sql\s+stable\s+security invoker/, 'host_calendar reads with the caller\'s own rights');
  assert.match(sql, /revoke all on function public\.host_calendar\(uuid, date, date\) from public, anon;/);
  assert.match(sql, /'bookings', 'calendar', 'chats'/, 'calendar is a reserved username');
});

test('calendar part 3: events, offline bookings counted like bookings, weekly closed days', () => {
  const sql = read('migrations', '20261127_000091_calendar_planner.sql');
  assert.match(sql, /join public\.calendar_entries e on e\.id = o\.entry_id and e\.blocks/, 'only "booked offline" events take days');
  assert.match(sql, /select n\.night::date, e\.units/, 'on a hotel, the rooms entered');
  assert.match(sql, /for insert to authenticated with check \(\s+kind = 'event' and public\.varoom_can_act_for\(host_id, 'manager'\)/);
  assert.match(sql, /l\.host_id = calendar_entries\.host_id/, 'an event only on the host\'s own listing');
  assert.match(sql, /raise exception 'calendar: Those days are already booked\./, 'an offline booking never overbooks');
  assert.match(sql, /after insert or update on public\.calendar_entries/);
  assert.match(sql, /extract\(dow from g\.day\)::smallint = any \(rules\.closed_weekdays\)/, 'bookings refuse weekly closed nights');
  assert.match(sql, /and not \(extract\(dow from g\.day\)::smallint = any \(rules\.weekdays\)\)/, 'and guests don\'t see them as open');
  assert.match(sql, /create or replace function public\.varoom_event_occurrences[\s\S]+?language sql\s+stable\s+set search_path = public/, 'security invoker: a host reads only their own events');
  assert.match(sql, /'events', coalesce\(/);
  assert.doesNotMatch(sql.split("'booked', coalesce")[1].split('$$')[0], /title|client_name/, 'guests never see event details');
});

test('calendar part 4: hourly times and overlaps, hire hours, buffer, and the price set by the database', () => {
  const sql = read('migrations', '20261128_000092_calendar_hours_prices.sql');
  const rules = sql.split('create or replace function public.varoom_apply_booking_rules()')[1];
  assert.match(rules, /raise exception 'booking_rule: Choose a start time and how many hours\.';/);
  assert.match(rules, /if to_min > 1440 then\s+raise exception 'booking_rule: A booking must end by midnight\.';/);
  assert.match(rules, /This place can be hired from % to %/);
  assert.match(rules, /where t\.start_min < to_min \+ coalesce\(rules\.buffer_minutes, 0\) and from_min < t\.end_min \+ coalesce\(rules\.buffer_minutes, 0\)/, 'overlaps include the buffer');
  assert.match(rules, /new\.total_price := rate \* \(nights \+ case when daily then 1 else 0 end\) \+/, 'nights or days × price + cleaning fee');
  assert.match(rules, /new\.total_price := rate \* new\.hours;/);
  assert.match(rules, /new\.total_price := coalesce\(round\(monthly \* new\.lease_months\), 0\);/, 'a rental, or 0 when the host confirms');
  assert.match(sql, /where not \(listing\.hourly and e\.start_time is not null\)/, 'on an hourly venue a timed event takes its hours, not the day');
  assert.match(sql, /'slots', coalesce\(/);
  assert.doesNotMatch(sql.split("'slots', coalesce(")[1].split('$$')[0], /title|client|guest/, 'taken times carry no names');
  assert.match(sql, /create policy "Hosts and managers read their table reservations" on public\.table_reservations\s+for select to authenticated using \(public\.varoom_can_act_for\(host_id, 'manager'\)\);/);
  assert.match(sql, /revoke all on function public\.varoom_busy_times\(uuid, date, date\) from public, anon, authenticated;/);
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
