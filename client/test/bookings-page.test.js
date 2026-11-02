const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadTs } = require('./helpers/loadTs');

const root = path.join(__dirname, '..');
const format = loadTs(path.join(root, 'lib', 'bookings', 'format.ts'));
const data = loadTs(path.join(root, 'lib', 'bookings', 'clientBookings.ts'));
const cache = loadTs(path.join(root, 'lib', 'bookings', 'bookingsCache.ts'));
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');

const booking = (over = {}) => ({
  id: 'b1', status: 'approved', start_date: null, end_date: null, hours: null, lease_start_date: null, lease_months: null,
  total_price: 12500, price_unit: null, created_at: '2026-10-01T10:00:00Z',
  listing: { id: 'l1', title: 'Garden Loft', location_text: 'Kilimani', listing_photos: [] },
  host: { id: 'h1', full_name: 'Amina Wanjiru', avatar_url: null },
  ...over,
});

// A recording stand-in for the Supabase query builder: every call is logged
// and awaiting the chain resolves the queued result.
function fakeClient(results) {
  const calls = [];
  const client = {
    calls,
    from(table) {
      const chain = { table, ops: [] };
      calls.push(chain);
      const builder = new Proxy({}, {
        get(_, prop) {
          if (prop === 'then') {
            const result = results.shift() || { data: null, error: null };
            return (resolve) => resolve(result);
          }
          return (...args) => { chain.ops.push([prop, ...args]); return builder; };
        },
      });
      return builder;
    },
  };
  return client;
}

test('dates and rows: stays, hourly and leases (legacy describeDates / detail rows)', () => {
  assert.equal(format.describeDates(booking({ start_date: '2026-11-03', end_date: '2026-11-06' })), '2026-11-03 → 2026-11-06');
  assert.equal(format.describeDates(booking({ start_date: '2026-11-03', hours: 1 })), '2026-11-03 · 1 hour');
  assert.equal(format.describeDates(booking({ lease_start_date: '2026-12-01', lease_months: 6 })), 'From 2026-12-01 · 6 months');
  const stay = format.detailRows(booking({ start_date: '2026-11-03', end_date: '2026-11-06' }));
  assert.deepEqual(stay.map((r) => r.label), ['Check-in', 'Check-out', 'Duration']);
  assert.equal(stay[2].value, '3 nights');
  assert.equal(stay[2].icon, 'clock');
  const lease = format.detailRows(booking({ lease_start_date: '2026-12-01', lease_months: 1 }));
  assert.deepEqual(lease.map((r) => [r.label, r.icon]), [['Move-in date', 'calendar'], ['Lease length', 'clock']]);
  assert.equal(lease[1].value, '1 month');
  assert.equal(format.perUnit(booking({ hours: 2 })), ' / stay');
  assert.equal(format.perUnit(booking({ price_unit: 'month' })), ' / month');
  assert.equal(format.firstName('Zion Daily'), 'Zion');
  assert.equal(format.firstName(null), 'there');
});

test('tabs: pending requests are Upcoming ("Awaiting approval"); declined shows as cancelled', () => {
  const now = new Date('2026-11-02T12:00:00Z');
  assert.equal(format.clientTab(booking({ status: 'pending', end_date: '2026-10-01' }), now), 'upcoming');
  assert.equal(format.clientTab(booking({ end_date: '2026-11-10' }), now), 'upcoming');
  assert.equal(format.clientTab(booking({ end_date: '2026-10-10' }), now), 'past');
  for (const status of ['declined', 'expired', 'cancelled']) assert.equal(format.clientTab(booking({ status }), now), 'cancelled');
  assert.equal(format.statusLabel('pending'), 'Awaiting approval');
  assert.equal(format.statusLabel('declined'), 'cancelled');
  assert.equal(format.isCancellable(booking({ status: 'pending' })), true);
  assert.equal(format.isCancellable(booking({ status: 'expired' })), false);
  assert.deepEqual(format.statusMessage('pending'), ['Still awaiting approval', 'Your host hasn’t responded to this booking request yet.']);
  assert.equal(format.stayHasEnded(booking({ end_date: '2026-11-01' }), now), true);
  assert.equal(format.stayHasEnded(booking({ end_date: '2026-11-02' }), now), false, 'the last day counts until 23:59:59');
});

test('stats count approved bookings only', () => {
  const now = new Date('2026-11-02T12:00:00Z');
  const stats = format.computeStats([
    booking({ id: 'a', end_date: '2026-12-01', total_price: 1000 }),
    booking({ id: 'b', end_date: '2026-10-01', total_price: '2500' }),
    booking({ id: 'c', status: 'pending', total_price: 9999 }),
  ], now);
  assert.deepEqual({ ...stats }, { total: 2, upcoming: 1, invested: 3500 });
});

test('list page: own bookings, newest first, one extra row decides hasMore; reviews looked up once', async () => {
  const rows = Array.from({ length: 9 }, (_, i) => booking({ id: `b${i}` }));
  const client = fakeClient([{ data: rows, error: null }, { data: [{ booking_id: 'b2' }], error: null }]);
  const page = await data.fetchClientBookingPage(client, 'u1', 8);
  assert.equal(page.bookings.length, 8);
  assert.equal(page.hasMore, true);
  assert.deepEqual(page.reviewedIds, ['b2']);
  const [list, reviews] = client.calls;
  assert.deepEqual(list.ops.find((op) => op[0] === 'eq'), ['eq', 'client_id', 'u1']);
  assert.deepEqual(list.ops.find((op) => op[0] === 'range'), ['range', 8, 16]);
  assert.equal(reviews.table, 'reviews');
  assert.deepEqual(reviews.ops.find((op) => op[0] === 'in')[2].length, 8);
});

test('unanswered requests older than 48 hours show as expired', () => {
  const now = Date.parse('2026-11-02T12:00:00Z');
  const [old, fresh, approved] = data.applyExpiry([
    booking({ id: 'o', status: 'pending', created_at: '2026-10-30T11:00:00Z' }),
    booking({ id: 'f', status: 'pending', created_at: '2026-11-01T12:00:00Z' }),
    booking({ id: 'a', created_at: '2026-10-01T00:00:00Z' }),
  ], now);
  assert.equal(old.status, 'expired');
  assert.equal(fresh.status, 'pending');
  assert.equal(approved.status, 'approved');
});

test('cancel: only the guest\'s own pending/approved booking becomes "cancelled"; the host is told by name', async () => {
  const client = fakeClient([{ data: { id: 'b1' }, error: null }]);
  const sent = [];
  const result = await data.cancelClientBooking(client, { booking: booking(), userId: 'u1', guestName: 'Zion Daily', notify: async (p) => { sent.push(p); } });
  assert.equal(result.notifyError, null);
  const ops = client.calls[0].ops;
  assert.deepEqual(ops.find((op) => op[0] === 'update'), ['update', { status: 'cancelled' }]);
  assert.deepEqual(ops.filter((op) => op[0] === 'eq'), [['eq', 'id', 'b1'], ['eq', 'client_id', 'u1']]);
  assert.deepEqual(ops.find((op) => op[0] === 'in'), ['in', 'status', ['pending', 'approved']]);
  assert.equal(sent[0].recipient_user_id, 'h1');
  assert.equal(sent[0].message, '"Zion Daily" cancelled their booking for "Garden Loft".');
  assert.equal(sent[0].event_key, 'booking-cancelled:b1');
  assert.doesNotMatch(JSON.stringify(sent[0]), /@/, 'no email address in the notification');

  const gone = fakeClient([{ data: null, error: null }]);
  await assert.rejects(data.cancelClientBooking(gone, { booking: booking(), userId: 'u1', guestName: null, notify: async () => {} }), /can no longer be cancelled/);

  const failing = fakeClient([{ data: { id: 'b1' }, error: null }]);
  const partial = await data.cancelClientBooking(failing, { booking: booking(), userId: 'u1', guestName: null, notify: async () => { throw new Error('offline'); } });
  assert.equal(partial.notifyError.message, 'offline');
});

test('review: posts rating and comment with the session token; server errors are shown', async () => {
  let request;
  const ok = async (url, init) => { request = { url, init }; return { ok: true, json: async () => ({ review: { id: 'r1', rating: 4, comment: 'Lovely' } }) }; };
  const saved = await data.submitBookingReview({ bookingId: 'b 1', rating: 4, comment: 'Lovely', token: 'tok' }, ok);
  assert.equal(saved.id, 'r1');
  assert.equal(request.url, '/api/bookings/b%201/review');
  assert.equal(request.init.headers.Authorization, 'Bearer tok');
  assert.deepEqual(JSON.parse(request.init.body), { rating: 4, comment: 'Lovely' });
  await assert.rejects(data.submitBookingReview({ bookingId: 'b1', rating: 4, comment: 'x', token: 't' }, async () => ({ ok: false, json: async () => ({ error: 'Already reviewed' }) })), /Already reviewed/);
  await assert.rejects(data.submitBookingReview({ bookingId: 'b1', rating: 4, comment: 'x', token: 't' }, async () => ({ ok: false, json: async () => { throw new Error('html'); } })), /couldn’t submit your review/);
});

test('detail page fetch: another account\'s booking is refused', async () => {
  const theirs = fakeClient([{ data: { ...booking(), client_id: 'someone-else' }, error: null }]);
  assert.equal((await data.fetchOwnBooking(theirs, 'b1', 'u1')).kind, 'not-yours');
  const mine = fakeClient([{ data: { ...booking(), client_id: 'u1' }, error: null }]);
  assert.equal((await data.fetchOwnBooking(mine, 'b1', 'u1')).kind, 'ok');
  assert.equal((await data.fetchOwnBooking(fakeClient([{ data: null, error: null }]), 'b1', 'u1')).kind, 'missing');
});

test('cache: per account, updated in place, cleared on sign-out', () => {
  cache.clearBookingsCache();
  cache.setClientBookings({ userId: 'u1', bookings: [booking()], reviewedIds: [], offset: 1, hasMore: false, fetchedAt: 1 });
  assert.equal(cache.getClientBookings('u2'), null, 'another account never sees it');
  cache.updateCachedBooking('u1', 'b1', { status: 'cancelled' });
  assert.equal(cache.findCachedBooking('u1', 'b1').status, 'cancelled');
  cache.markCachedReviewed('u1', 'b1', { rating: 5, comment: 'Great' });
  assert.deepEqual(cache.getClientBookings('u1').reviewedIds, ['b1']);
  assert.equal(cache.getCachedReview('b1').rating, 5);
  cache.clearBookingsCache();
  assert.equal(cache.getClientBookings('u1'), null);
  assert.equal(cache.getCachedReview('b1'), undefined);
  assert.match(read('lib', 'auth', 'clearUserData.ts'), /clearBookingsCache\(\);/);
});

test('detail: approved layout, Contact Support opens /support, cancel asks first, payment is a preview', () => {
  const detail = read('components', 'bookings', 'BookingDetail.tsx');
  for (const text of ['Booking <span>Approved!</span>', 'Great news! Your booking request has been approved by the host.', 'View map &amp; directions', 'Hosted by', 'Total Amount', 'Your payment is protected by VaRoom.', 'Need help?', 'Contact Support ›', 'Cancel this booking? This can’t be undone.', 'Your stay is complete. Share your verified experience with future guests.']) {
    assert.ok(detail.includes(text), text);
  }
  assert.match(detail, /href="\/support">Contact Support ›/);
  assert.match(detail, /window\.confirm\(/);
  const pay = read('components', 'bookings', 'PayDialog.tsx');
  assert.ok(pay.includes("Online payment isn&apos;t connected yet"));
  assert.match(pay, /clearTimeout/);
});

test('phones open the details page; larger screens hand it to the Bookings rail', () => {
  const layout = read('components', 'bookings', 'usePhoneLayout.ts');
  assert.match(layout, /PHONE_QUERY = '\(max-width: 860px\)'/);
  assert.match(layout, /addEventListener\('change', update\)/);
  assert.match(layout, /removeEventListener\('change', update\)/);
  const page = read('pages', 'booking-approved.tsx');
  assert.match(page, /router\.replace\(bookingId \? `\/bookings\?booking=\$\{encodeURIComponent\(bookingId\)\}` : '\/bookings'\)/);
  for (const text of ['No booking specified', "Couldn't load this booking", "This isn't your booking", 'Loading your booking…', '‹ Back to bookings']) {
    assert.ok(page.includes(text), text);
  }
  assert.match(page, /\.appNavigation = true;/);
  const styles = read('components', 'bookings', 'bookingsStyles.ts');
  assert.match(styles, /@media \(min-width:861px\) and \(max-width:1320px\)\{\s*\.bookings-page \.content-row\{ grid-template-columns:minmax\(0, 1fr\) clamp\(320px, 36vw, 460px\); \}/);
  assert.match(styles, /@container booking-detail \(max-width:400px\)/);
  assert.doesNotMatch(styles, /#sidebar|\.nav-item/, 'the shell renders the sidebar');
  assert.match(read('lib', 'notificationsCache.ts'), /matchMedia\('\(min-width: 861px\)'\)/);
});

test('legacy booking-approved.html is retired; old URLs reach the native page', () => {
  assert.equal(fs.existsSync(path.join(root, 'legacy-pages', 'booking-approved.html')), false);
  const config = read('next.config.js');
  assert.match(config, /source: '\/booking-approved\.html',\s*destination: '\/booking-approved'/);
  assert.match(config, /source: '\/legacy-pages\/booking-approved\.html',\s*destination: '\/booking-approved'/);
  const server = fs.readFileSync(path.join(root, '..', 'server', 'server.js'), 'utf8');
  assert.match(server, /app\.get\(\['\/booking-approved', '\/booking-approved\.html', '\/legacy-pages\/booking-approved\.html'\]/);
  assert.doesNotMatch(server, /'\/booking-approved': 'booking-approved\.html'/);
});

test('client view: legacy tabs and wording; pending shown in Upcoming; review only on Past', () => {
  const view = read('components', 'bookings', 'ClientBookingsView.tsx');
  for (const text of ['My Bookings', 'Manage your verified stays, event venues, and workstations in Kenya.', 'Upcoming Bookings', 'Past Stays', 'Cancelled',
    'No upcoming bookings — your next confirmed stay will show up here.', 'No past stays yet.', 'Nothing cancelled or expired.',
    'Stats Summary', 'Total Bookings', 'Total Invested', 'Active Month', 'Back to summary', '★ Reviewed', 'Leave a review', 'View Details',
    'This booking could not be found in your bookings.', 'Loading more bookings...']) {
    assert.ok(view.includes(text), text);
  }
  assert.match(view, /const canReview = tab === 'past' && endMoment\(booking\) < now;/);
  assert.match(view, /tab === 'upcoming' && isCancellable\(booking\)/);
  assert.match(view, /window\.confirm\('Cancel this booking\? This can’t be undone\.'\)/);
  assert.match(view, /href=\{`\/booking-approved\?id=\$\{encodeURIComponent\(booking\.id\)\}`\}/);
  assert.match(view, /new IntersectionObserver\(/);
  assert.doesNotMatch(view, /addEventListener\('scroll'/, 'no scroll listeners');
  assert.match(view, /router\.push\(`\/booking-approved\?id=\$\{encodeURIComponent\(selectedId\)\}`\)/, 'narrowing moves open details to their page');
  const hook = read('components', 'bookings', 'useClientBookings.ts');
  assert.match(hook, /BOOKINGS_STALE_MS/);
  assert.match(hook, /if \(inFlight\.current\) return inFlight\.current;/, 'no duplicate page requests');
  const modal = read('components', 'bookings', 'ReviewModal.tsx');
  for (const text of ['How was your experience?', 'Please select a rating.', 'Please write a review before submitting.', 'Thank you for sharing your experience.']) assert.ok(modal.includes(text), text);
});

const host = loadTs(path.join(root, 'lib', 'bookings', 'hostBookings.ts'));

test('host: tabs, month filter, dates and request age (legacy rules)', () => {
  assert.equal(host.hostTabFor('approved'), 'confirmed');
  assert.equal(host.hostTabFor('cancelled'), null);
  const b = { ...booking({ start_date: '2026-10-28', end_date: '2026-10-31' }), client_id: 'c1', client: { full_name: 'Mentor Zion' } };
  assert.equal(host.isBookingInMonth(b, new Date(2026, 9, 1)), true);
  assert.equal(host.isBookingInMonth(b, new Date(2026, 10, 1)), false);
  assert.equal(host.hostDateText(b), '28 Oct 2026 → 31 Oct 2026');
  assert.equal(host.hostDurationText(b), '3 nights');
  assert.equal(host.hostDateText({ ...b, start_date: null, end_date: null }), 'Dates to be confirmed');
  const now = Date.parse('2026-11-02T12:00:00Z');
  assert.equal(host.requestedTime('2026-11-02T11:59:50Z', now), 'Requested 1 min ago');
  assert.equal(host.requestedTime('2026-11-02T09:00:00Z', now), 'Requested 3 hours ago');
  assert.equal(host.requestedTime('2026-10-28T12:00:00Z', now), 'Requested 5 days ago');
  assert.equal(host.requestedTime(null, now), 'Request received recently');
  assert.equal(host.telHref('+254 700-123 456'), 'tel:+254700123456');
});

test('host: approve/decline only the host\'s own pending request; the guest is told the listing title', async () => {
  const b = { ...booking(), status: 'pending', client_id: 'c1', client: null };
  const client = fakeClient([{ data: { id: 'b1', client_id: 'c1' }, error: null }]);
  const sent = [];
  assert.deepEqual({ ...(await host.respondToBooking(client, { booking: b, userId: 'h1', decision: 'approve', notify: async (p) => { sent.push(p); } })) }, { status: 'approved' });
  const ops = client.calls[0].ops;
  assert.equal(ops.find((op) => op[0] === 'update')[1].status, 'approved');
  assert.deepEqual(ops.filter((op) => op[0] === 'eq'), [['eq', 'id', 'b1'], ['eq', 'host_id', 'h1'], ['eq', 'status', 'pending']]);
  assert.equal(sent[0].message, 'Your booking for "Garden Loft" has been confirmed.');
  assert.equal(sent[0].metadata.listing_id, 'l1');
  const declined = fakeClient([{ data: { id: 'b1', client_id: 'c1' }, error: null }]);
  const sent2 = [];
  await host.respondToBooking(declined, { booking: b, userId: 'h1', decision: 'decline', notify: async (p) => { sent2.push(p); } });
  assert.equal(sent2[0].message, 'Your booking request for "Garden Loft" was declined.');
  await assert.rejects(host.respondToBooking(fakeClient([{ data: null, error: null }]), { booking: b, userId: 'h1', decision: 'approve', notify: null }), /already been processed/);
});

test('host: listing video loads once per listing; videos are kept for less than their 5-minute URL', async () => {
  const calls = [];
  const fetchFn = async (url) => {
    calls.push(url);
    if (url.endsWith('/media')) return { ok: true, json: async () => ({ media: [{ id: 'm1', type: 'video' }] }) };
    return { ok: true, json: async () => ({ url: 'https://v/1.mp4', thumbnailUrl: 'https://v/1.jpg' }) };
  };
  assert.deepEqual({ ...(await host.fetchListingVideo('l 1', 't', fetchFn)) }, { videoUrl: 'https://v/1.mp4', thumbnailUrl: 'https://v/1.jpg' });
  assert.deepEqual(calls, ['/api/properties/l%201/media', '/api/media/m1/playback']);
  assert.equal(await host.fetchListingVideo('l1', 't', async () => ({ ok: true, json: async () => ({ media: [{ id: 'p', type: 'photo' }] }) })), null);
  cache.setCachedVideo('l1', null, 0);
  assert.equal(cache.getCachedVideo('l1', cache.VIDEO_TTL_MS - 1), null);
  assert.equal(cache.getCachedVideo('l1', cache.VIDEO_TTL_MS), undefined);
  assert.ok(cache.VIDEO_TTL_MS < 5 * 60 * 1000);
  const view = read('components', 'bookings', 'HostBookingsView.tsx');
  assert.match(view, /new Set\(bookings\.map\(\(b\) => b\.listing && b\.listing\.id\)/, 'deduplicated by listing');
  for (const text of ['Booking request', 'Review this guest request before taking action.', 'Approve booking', 'Location unavailable', 'Date to be confirmed', 'No pending requests', 'No table reservations yet.', 'Call Client', 'This month', 'Booking approved!', 'Booking declined.']) {
    assert.ok(view.includes(text) || read('lib', 'bookings', 'hostBookings.ts').includes(text), text);
  }
});

test('/bookings is the native page inside the app shell', () => {
  const page = read('pages', 'bookings.tsx');
  assert.match(page, /<HostBookingsView showToast=\{toast\.show\} \/>/);
  assert.match(page, /<ClientBookingsView showToast=\{toast\.show\} \/>/);
  assert.match(page, /id="topbar-avatar-btn"/, 'opens the shell drawer');
  assert.equal(fs.existsSync(path.join(root, 'legacy-pages', 'bookings.html')), false);
});

test('bookings.html and its notification widget are retired; old URLs reach the native page', () => {
  const config = read('next.config.js');
  assert.match(config, /source: '\/bookings\.html',\s*destination: '\/bookings'/);
  assert.match(config, /source: '\/legacy-pages\/bookings\.html',\s*destination: '\/bookings'/);
  const server = fs.readFileSync(path.join(root, '..', 'server', 'server.js'), 'utf8');
  assert.match(server, /app\.get\(\['\/bookings', '\/bookings\.html', '\/legacy-pages\/bookings\.html'\]/);
  assert.doesNotMatch(server, /'\/bookings': 'bookings\.html'/);
  assert.ok(server.indexOf("app.get(['/bookings'") < server.indexOf('Object.entries(pageTemplates)'), 'registered before the template routes');
  assert.equal(fs.existsSync(path.join(root, 'public', 'js', 'notifications-widget.js')), false);
  const dark = read('public', 'js', 'varoom-dark-theme.css');
  assert.doesNotMatch(dark, /\.rail-card|\.booking-card|booking-approved\.html|bookings\.html/);
  const styles = read('components', 'bookings', 'bookingsStyles.ts');
  assert.match(styles, /html\[data-theme="dark"\] \.bookings-page \.rail-card\{/);
});
