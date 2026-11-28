const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadTs } = require('./helpers/loadTs');

const root = path.join(__dirname, '..');
const maps = loadTs(path.join(root, 'lib', 'maps', 'maps.ts'));
const page = fs.readFileSync(path.join(root, 'pages', 'map.tsx'), 'utf8');

test('endpoint: a booking map uses the booking location, else the listing', () => {
  assert.equal(maps.locationEndpoint({ booking: 'b1', listing: 'l1' }), '/api/bookings/b1/location');
  assert.equal(maps.locationEndpoint({ listing: 'l 1' }), '/api/listings/l%201/location');
  assert.equal(maps.locationEndpoint({}), null);
});

test('exact location (level 3+): address and pin (legacy renderResult)', () => {
  const view = maps.describeLocation({ level: 3, location: { latitude: -1.29, longitude: 36.8, formatted_address: '12 Rose Ave, Kilimani', neighborhood: 'Kilimani', city: 'Nairobi' } });
  assert.equal(view.title, '12 Rose Ave, Kilimani');
  assert.equal(view.sub, 'Kilimani, Nairobi');
  assert.equal(view.status, 'Exact location unlocked');
  assert.equal(view.statusKind, 'unlocked');
  assert.deepEqual(view.center, { lat: -1.29, lng: 36.8 });
  assert.equal(view.zoom, 16);
  assert.equal(view.areaQuery, null);
  assert.equal('directionsUrl' in view, false, 'no Get Directions: the map card shows only the map');
  assert.equal(maps.describeLocation({ level: 4, location: { latitude: 1, longitude: 2, neighborhood: 'Lavington', city: 'Nairobi' } }).title, 'Lavington, Nairobi');
  assert.equal(maps.describeLocation({ level: 4, location: { latitude: 1, longitude: 2 } }).title, 'Property location');
});

test('general area: area name, no pin; pending bookings say so', () => {
  const area = maps.describeLocation({ level: 1, location: { neighborhood: 'Westlands', city: 'Nairobi' } });
  assert.equal(area.title, 'Westlands, Nairobi');
  assert.equal(area.status, 'General area shown for now');
  assert.equal(area.sub, 'The exact address is shared once a booking with this property is approved.');
  assert.equal(area.exact, false);
  assert.deepEqual(area.center, maps.NAIROBI, 'no coordinates are sent at this level');
  const pending = maps.describeLocation({ level: 1, pendingApproval: true, location: { city: 'Nakuru' } });
  assert.equal(pending.title, 'Nakuru');
  assert.equal(pending.status, 'Awaiting host approval');
  assert.equal(pending.sub, 'The exact location becomes available once your host approves this booking.');
  assert.equal(maps.describeLocation({ level: 1, location: {} }).title, 'General area only');
  // Coordinates at a lower level are never shown as exact.
  assert.equal(maps.describeLocation({ level: 2, location: { latitude: 1, longitude: 2 } }).exact, false);
});

test('fetchLocation: token when signed in; says plainly why a location is missing', async () => {
  const calls = [];
  const response = (status, text) => ({ ok: status < 300, status, text: async () => text });
  assert.deepEqual(await maps.fetchLocation('/x', 'tok', async (url, init) => { calls.push(init); return response(200, '{"level":1}'); }), { kind: 'ok', result: { level: 1 } });
  assert.equal(calls[0].headers.Authorization, 'Bearer tok');
  await maps.fetchLocation('/x', null, async (url, init) => { calls.push(init); return response(200, '{}'); });
  assert.deepEqual(calls[1].headers, {});
  assert.deepEqual(await maps.fetchLocation('/x', null, async () => response(404, '{"error":"Listing not found"}')), { kind: 'missing' });
  assert.deepEqual(await maps.fetchLocation('/x', null, async () => response(403, '{}')), { kind: 'forbidden' });
  assert.deepEqual(await maps.fetchLocation('/x', null, async () => response(401, '{}')), { kind: 'forbidden' });
  assert.deepEqual(await maps.fetchLocation('/x', null, async () => response(500, '{}')), { kind: 'failed' });
  assert.deepEqual(await maps.fetchLocation('/x', null, async () => response(200, '<html>')), { kind: 'failed' });
  assert.deepEqual(await maps.fetchLocation('/x', null, async () => { throw new TypeError('offline'); }), { kind: 'failed' });
});

test('general area: found by its name only (never an address)', () => {
  const area = maps.describeLocation({ level: 1, location: { neighborhood: 'Nyali', city: 'Mombasa' } });
  assert.equal(area.areaQuery, 'Nyali, Mombasa, Kenya');
  assert.equal(maps.describeLocation({ level: 1, location: {} }).areaQuery, null);
  assert.equal(maps.getDirectionsUrl, undefined);
  assert.equal(maps.areaSearchUrl, undefined);
});

test('map card target: ?map=listing:<id> or booking:<id> only; /map for new tabs', () => {
  assert.deepEqual(maps.parseMapTarget('listing:0000-ab_1'), { kind: 'listing', id: '0000-ab_1' });
  assert.deepEqual(maps.parseMapTarget('booking:b1'), { kind: 'booking', id: 'b1' });
  for (const bad of [undefined, ['listing:a'], '', 'listing:', 'user:a', 'listing:a/b', 'listing:a?x=1', `listing:${'a'.repeat(81)}`]) {
    assert.equal(maps.parseMapTarget(bad), null, String(bad));
  }
  assert.equal(maps.mapTargetValue({ kind: 'listing', id: 'l1' }), 'listing:l1');
  assert.equal(maps.mapPageHref({ kind: 'booking', id: 'b 1' }), '/map?booking=b%201');
  assert.equal(maps.targetEndpoint({ kind: 'booking', id: 'b1' }), '/api/bookings/b1/location');
  assert.equal(maps.targetEndpoint({ kind: 'listing', id: 'l1' }), '/api/listings/l1/location');
});

test('location cache: per user, shared in-flight request, fresh for 5 minutes, refusals asked again', async () => {
  maps.clearLocationCache();
  let calls = 0;
  let clock = 1000;
  const now = () => clock;
  const ok = async () => { calls += 1; return { ok: true, status: 200, text: async () => '{"level":1}' }; };
  const alice = { userId: 'alice', accessToken: 't1' };
  const [a, b] = await Promise.all([maps.loadLocation('/x', alice, ok, now), maps.loadLocation('/x', alice, ok, now)]);
  assert.equal(calls, 1, 'two opens at once share one request');
  assert.equal(a.result, b.result);
  assert.equal((await maps.loadLocation('/x', { userId: 'alice', accessToken: 't2' }, ok, now)).result, a.result, 'a refreshed token reuses the answer');
  assert.equal(calls, 1);
  await maps.loadLocation('/x', { userId: 'bob', accessToken: 't3' }, ok, now);
  assert.equal(calls, 2, 'another account never gets the cached answer');
  clock += 5 * 60 * 1000;
  await maps.loadLocation('/x', alice, ok, now);
  assert.equal(calls, 3, 'stale after 5 minutes');
  const refuse = async () => { calls += 1; return { ok: false, status: 403, text: async () => '{}' }; };
  assert.deepEqual(await maps.loadLocation('/y', alice, refuse, now), { kind: 'forbidden' });
  await maps.loadLocation('/y', alice, refuse, now);
  assert.equal(calls, 5, 'a refusal is not cached');
  maps.clearLocationCache();
});

test('the Maps SDK loads once, only with a configured key', async () => {
  let configCalls = 0;
  maps.resetGoogleMapsLoad();
  const noKey = async () => { configCalls += 1; return { ok: true, json: async () => ({ apiKey: null }) }; };
  assert.equal(await maps.loadGoogleMaps(noKey), false);
  assert.equal(await maps.loadGoogleMaps(noKey), false);
  assert.equal(configCalls, 1);
  maps.resetGoogleMapsLoad();
  assert.equal(await maps.loadGoogleMaps(async () => ({ ok: false })), false);
  maps.resetGoogleMapsLoad();
  assert.equal(await maps.loadGoogleMaps(async () => { throw new Error('offline'); }), false);
});

const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');

test('page: only the map (no Get Directions); Back uses history; no bottom bar', () => {
  assert.match(page, /← Back/);
  assert.match(page, /<LocationPanel target=\{mounted && router\.isReady \? target : undefined\}/);
  assert.doesNotMatch(page, /Get Directions|directions|sheet|Map integration in progress|fonts\.googleapis/);
  assert.match(page, /if \(window\.history\.length > 1\) router\.back\(\);/);
  assert.doesNotMatch(page, /appNavigation|MenuButton/, 'a detail screen: Back only');
  assert.doesNotMatch(read('components', 'maps', 'mapStyles.ts'), /has-varoom-mobile-nav/, 'the map reaches the bottom edge');
  assert.match(read('lib', 'maps', 'maps.ts'), /This location is shared only with the guest and host of this booking\./);
});

test('panel: waits for the session; cached load; Try again only after a failure', () => {
  const panel = read('components', 'maps', 'LocationPanel.tsx');
  assert.match(panel, /if \(!endpoint \|\| status === 'loading'\) return undefined;/);
  assert.match(panel, /loadLocation\(endpoint, \{ userId, accessToken \}\)/);
  assert.match(panel, /state\.kind === 'failed' && <button type="button" className="vr-loc-retry" onClick=\{retry\}>Try again<\/button>/);
  assert.doesNotMatch(panel, /Get Directions|Open in Google Maps/);
});

test('map: live pin or area circle over a drawn map; the drawing says the live map is coming', () => {
  const map = read('components', 'maps', 'LocationMap.tsx');
  assert.match(map, /new sdk\.Marker\(/);
  assert.match(map, /radius: 1200/);
  assert.match(map, /new sdk\.Geocoder\(\)\.geocode\(\{ address: view\.areaQuery, region: 'ke' \}/);
  assert.match(map, /zoomControl: true/);
  assert.match(map, /gestureHandling: 'greedy'/);
  assert.match(map, /<MapIllustration /);
  assert.match(map, /The live map is coming soon\./);
  assert.doesNotMatch(map, /PendingMap|Open in Google Maps|Map integration in progress/);
  const art = read('components', 'maps', 'MapIllustration.tsx');
  assert.match(art, /aria-label="Zoom in"/);
  assert.match(art, /aria-label="Zoom out"/);
  assert.match(art, /addEventListener\('wheel', onWheel, \{ passive: false \}\)/);
  assert.match(art, /setPointerCapture/);
  assert.doesNotMatch(art, /Math\.random/);
});

test('map card: opened in place from the three links; Back, Escape and focus; mounted once', () => {
  const card = read('components', 'maps', 'LocationCard.tsx');
  assert.match(card, /router\.push\(href, as, \{ shallow: true, scroll: false \}\)/);
  assert.match(card, /href=\{mapPageHref\(target\)\}/);
  assert.match(card, /event\.metaKey \|\| event\.ctrlKey/);
  assert.match(card, /role="dialog" aria-modal="true"/);
  assert.match(card, /event\.key === 'Escape'/);
  assert.match(card, /router\.back\(\);/);
  assert.match(card, /router\.replace\(href, as, \{ shallow: true, scroll: false \}\)/);
  assert.match(card, /router\.pathname !== '\/map'/);
  assert.match(read('pages', '_app.tsx'), /<LocationCardHost \/>/);
  assert.match(read('pages', 'client-home.tsx'), /<MapLink target=\{\{ kind: 'listing', id: listing\.id \}\}/);
  assert.match(read('components', 'hostHome', 'FeedCard.tsx'), /<MapLink target=\{\{ kind: 'listing', id: listing\.id \}\}/);
  assert.match(read('components', 'bookings', 'BookingDetail.tsx'), /<MapLink className="booking-detail-map" target=\{\{ kind: 'booking', id: booking\.id \}\}>View on map<\/MapLink>/);
  const styles = read('components', 'maps', 'locationStyles.ts');
  assert.match(styles, /@keyframes vr-loc-card-in \{ from \{ opacity:0; transform:scale\(\.95\); \} \}/);
  assert.match(styles, /@keyframes vr-loc-sheet-in/);
  assert.match(styles, /prefers-reduced-motion: reduce/);
  assert.doesNotMatch(styles, /(^|\})\s*(:root|body|html)\b/);
});

test('no map link leaves the page any more', () => {
  for (const file of [['pages', 'client-home.tsx'], ['components', 'hostHome', 'FeedCard.tsx'], ['components', 'bookings', 'BookingDetail.tsx']]) {
    assert.doesNotMatch(read(...file), /href=\{`\/map\?/, file.join('/'));
  }
});

test('legacy map.html and varoom-maps.js are retired; old URLs reach the native page', () => {
  assert.equal(fs.existsSync(path.join(root, 'legacy-pages', 'map.html')), false);
  assert.equal(fs.existsSync(path.join(root, 'public', 'js', 'varoom-maps.js')), false);
  assert.doesNotMatch(fs.readFileSync(path.join(root, 'public', 'js', 'varoom-dark-theme.css'), 'utf8'), /map\.html|\.sheet-status/);
  assert.match(fs.readFileSync(path.join(root, 'next.config.js'), 'utf8'), /source: '\/map\.html',\s*destination: '\/map'/);
  const server = fs.readFileSync(path.join(root, '..', 'server', 'server.js'), 'utf8');
  assert.match(server, /app\.get\(\['\/map', '\/map\.html', '\/legacy-pages\/map\.html'\]/);
  assert.doesNotMatch(server, /'\/map': 'map\.html'/);
});

test('opening the map card does not reload the page behind it', () => {
  // These effects load data; they must not run again when only the address changes (?map=).
  const home = read('pages', 'client-home.tsx');
  assert.match(home, /\}, \[authRetry\]\);/);
  assert.match(home, /persistClientHomeScroll\(window, node, key, Router, \{/);
  assert.doesNotMatch(home, /\[authRetry, router\]|\[key, router\]/);
  const approved = read('pages', 'booking-approved.tsx');
  assert.match(approved, /\}, \[router\.isReady, status, userId, bookingId, phone\]\);/);
  assert.match(approved, /Router\.replace\(loginUrl\(Router\.asPath\)\)/);
  assert.match(read('pages', 'host-home.tsx'), /\}, \[client, userId, notify\]\);/);
});
