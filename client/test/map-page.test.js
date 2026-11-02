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

test('exact location (level 3+): address, pin, directions (legacy renderResult)', () => {
  const view = maps.describeLocation({ level: 3, location: { latitude: -1.29, longitude: 36.8, formatted_address: '12 Rose Ave, Kilimani', neighborhood: 'Kilimani', city: 'Nairobi' } });
  assert.equal(view.title, '12 Rose Ave, Kilimani');
  assert.equal(view.sub, 'Kilimani, Nairobi');
  assert.equal(view.status, 'Exact location unlocked');
  assert.equal(view.statusKind, 'unlocked');
  assert.deepEqual(view.center, { lat: -1.29, lng: 36.8 });
  assert.equal(view.zoom, 16);
  assert.equal(view.directionsUrl, 'https://www.google.com/maps/dir/?api=1&destination=-1.29,36.8');
  assert.equal(maps.describeLocation({ level: 4, location: { latitude: 1, longitude: 2, neighborhood: 'Lavington', city: 'Nairobi' } }).title, 'Lavington, Nairobi');
  assert.equal(maps.describeLocation({ level: 4, location: { latitude: 1, longitude: 2 } }).title, 'Property location');
});

test('general area: area name, no pin and no directions; pending bookings say so', () => {
  const area = maps.describeLocation({ level: 1, location: { neighborhood: 'Westlands', city: 'Nairobi' } });
  assert.equal(area.title, 'Westlands, Nairobi');
  assert.equal(area.status, 'General area shown for now');
  assert.equal(area.sub, 'The exact address is shared once a booking with this property is approved.');
  assert.equal(area.exact, false);
  assert.equal(area.directionsUrl, null);
  assert.deepEqual(area.center, maps.NAIROBI, 'no coordinates are sent at this level');
  const pending = maps.describeLocation({ level: 1, pendingApproval: true, location: { city: 'Nakuru' } });
  assert.equal(pending.title, 'Nakuru');
  assert.equal(pending.status, 'Awaiting host approval');
  assert.equal(pending.sub, 'The exact location becomes available once your host approves this booking.');
  assert.equal(maps.describeLocation({ level: 1, location: {} }).title, 'General area only');
  // Coordinates at a lower level are never shown as exact.
  assert.equal(maps.describeLocation({ level: 2, location: { latitude: 1, longitude: 2 } }).exact, false);
});

test('fetchLocation: token when signed in; any failure is null (the "integration in progress" state)', async () => {
  const calls = [];
  const response = (status, text) => ({ ok: status < 300, status, text: async () => text });
  assert.deepEqual(await maps.fetchLocation('/x', 'tok', async (url, init) => { calls.push(init); return response(200, '{"level":1}'); }), { level: 1 });
  assert.equal(calls[0].headers.Authorization, 'Bearer tok');
  await maps.fetchLocation('/x', null, async (url, init) => { calls.push(init); return response(200, '{}'); });
  assert.deepEqual(calls[1].headers, {});
  assert.equal(await maps.fetchLocation('/x', null, async () => response(404, '{"error":"Listing not found"}')), null);
  assert.equal(await maps.fetchLocation('/x', null, async () => response(200, '<html>')), null);
  assert.equal(await maps.fetchLocation('/x', null, async () => { throw new TypeError('offline'); }), null);
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

test('page: legacy states and wording; waits for the query and the session; mobile navigation', () => {
  for (const text of ['Loading location…', 'No property specified', 'Map integration in progress', "We're still connecting this feature — the map and directions will be available here soon.", 'Get Directions', '← Back']) {
    assert.ok(page.includes(text), text);
  }
  assert.match(page, /if \(!router\.isReady \|\| status === 'loading'\) return undefined;/);
  assert.match(page, /\.appNavigation = true;/);
  const map = fs.readFileSync(path.join(root, 'components', 'maps', 'LocationMap.tsx'), 'utf8');
  assert.match(map, /new sdk\.Marker\(/);
  assert.match(map, /radius: 1200/);
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
