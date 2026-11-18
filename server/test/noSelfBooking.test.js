const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const migration = fs.readFileSync(path.join(__dirname, '..', 'migrations', '20261119_000073_no_self_booking.sql'), 'utf8');
const tableRoutes = fs.readFileSync(path.join(__dirname, '..', 'routes', 'hotelReservationRoutes.js'), 'utf8').replace(/\r\n/g, '\n');

test('the database refuses a booking of the booker\'s own listing, reading the owner from the listing', () => {
  assert.match(migration, /create trigger varoom_block_own_listing_booking_trigger\s+before insert on public\.bookings/);
  assert.match(migration, /where l\.id = new\.listing_id\s+and l\.host_id = new\.client_id/, 'not the host_id the browser sends');
  assert.match(migration, /raise exception 'booking_rule: /, 'shown to the guest as it is');
  assert.match(migration, /security definer\s+set search_path = public/);
  assert.match(migration, /-- Rollback/);
});

test('a host cannot reserve a table at their own hotel', () => {
  const route = tableRoutes.slice(tableRoutes.indexOf("router.post('/table-reservations'"));
  const check = route.indexOf('if (listing.host_id === auth.user.id) return res.status(403)');
  assert.ok(check > 0, 'the owner check exists');
  assert.ok(check < route.indexOf("supabaseAdmin.from('profiles').update"), 'before anything is written');
});
