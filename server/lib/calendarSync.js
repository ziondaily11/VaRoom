'use strict';

// Calendar sync, import side (docs/host-controls/CALENDAR_PLAN.md, part 5):
// read another site's calendar link (iCal: Airbnb.com, Booking.com, Google
// Calendar…), turn its events into booked days in Nairobi time, and hand them
// to calendar_sync_feed, which replaces that link's days and returns any
// double-booked nights so the host is told.
//
// Links are the host's own input, so a fetch only goes to public https
// addresses (checked again after each redirect), with a timeout and a size
// limit. A link that fails keeps the days it imported before.

const dns = require('dns').promises;
const net = require('net');
const { createNotification } = require('./notifications');

const NAIROBI_OFFSET_MIN = 180; // East Africa Time, no summer time
const MAX_BYTES = 2 * 1024 * 1024;
const MAX_EVENTS = 500;
const TIMEOUT_MS = 15000;
const SYNC_INTERVAL_MS = 30 * 60 * 1000;

/** A problem with the link itself, shown to the host as it is. */
class FeedError extends Error {}

// ---------- Reading an iCal file ----------

const addDays = (day, n) => new Date(Date.parse(`${day}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
const clock = (minutes) => `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
const unescapeText = (text) => text.replace(/\\n/gi, ' ').replace(/\\([,;\\])/g, '$1').trim();

/** Wall-clock time in a time zone, as a UTC instant (an unknown zone counts as Nairobi). */
function zonedTime(y, mo, d, h, mi, s, zone) {
  const guess = Date.UTC(y, mo - 1, d, h, mi, s);
  let offset = NAIROBI_OFFSET_MIN;
  if (zone) {
    try {
      const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
        timeZone: zone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
      }).formatToParts(new Date(guess)).map((part) => [part.type, part.value]));
      offset = (Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second) - guess) / 60000;
    } catch { /* unknown zone: Nairobi */ }
  }
  return new Date(guess - offset * 60000);
}

/** DTSTART / DTEND: { date } for a whole day, or { date, minutes } in Nairobi time. */
function readTime(params, value) {
  const match = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/.exec(String(value).trim());
  if (!match) return null;
  const [, y, mo, d, h, mi, s, utc] = match;
  if (h === undefined) return { date: `${y}-${mo}-${d}` };
  const zone = /TZID=("?)([^;:"]+)\1/i.exec(params);
  const instant = utc ? new Date(Date.UTC(+y, +mo - 1, +d, +h, +mi, +s)) : zonedTime(+y, +mo, +d, +h, +mi, +s, zone ? zone[2] : null);
  const local = new Date(instant.getTime() + NAIROBI_OFFSET_MIN * 60000);
  return { date: local.toISOString().slice(0, 10), minutes: local.getUTCHours() * 60 + local.getUTCMinutes() };
}

/** One VEVENT as booked days (both included), or null (cancelled, unreadable). */
function toEvent(raw) {
  if (!raw.DTSTART || (raw.STATUS && /CANCELLED/i.test(raw.STATUS.value))) return null;
  const start = readTime(raw.DTSTART.params, raw.DTSTART.value);
  if (!start) return null;
  const end = raw.DTEND ? readTime(raw.DTEND.params, raw.DTEND.value) : null;
  const title = raw.SUMMARY ? unescapeText(raw.SUMMARY.value).slice(0, 80) : '';
  const allDay = (last) => ({ start: start.date, end: last < start.date ? start.date : last, start_time: null, end_time: null, title });
  // A whole-day event ends the day after its last day (the check-out day).
  if (start.minutes === undefined) return allDay(end && end.date > start.date ? addDays(end.date, -1) : start.date);
  if (!end || end.minutes === undefined) return allDay(start.date);
  if (end.date === start.date || (end.minutes === 0 && end.date === addDays(start.date, 1))) {
    const to = end.date === start.date ? end.minutes : 1440;
    return to > start.minutes ? { start: start.date, end: start.date, start_time: clock(start.minutes), end_time: clock(to), title } : null;
  }
  // Over several days: ending in the morning is a check-out, not another night.
  return allDay(end.minutes <= 12 * 60 ? addDays(end.date, -1) : end.date);
}

/** Booked days from an iCal file: [{ start, end, start_time, end_time, title }]. */
function parseIcs(text) {
  const events = [];
  let current = null;
  for (const line of String(text).replace(/\r\n?/g, '\n').replace(/\n[ \t]/g, '').split('\n')) {
    if (/^BEGIN:VEVENT\s*$/i.test(line)) { current = {}; continue; }
    if (/^END:VEVENT\s*$/i.test(line)) {
      const event = current && toEvent(current);
      if (event) events.push(event);
      current = null;
      if (events.length >= MAX_EVENTS) break;
      continue;
    }
    const colon = line.indexOf(':');
    if (!current || colon < 0) continue;
    const [name, ...params] = line.slice(0, colon).split(';');
    current[name.toUpperCase()] = { params: params.join(';'), value: line.slice(colon + 1) };
  }
  return events;
}

// ---------- Fetching a link safely ----------

function privateAddress(address) {
  if (net.isIPv4(address)) {
    const [a, b] = address.split('.').map(Number);
    return a === 0 || a === 10 || a === 127 || a >= 224 || (a === 100 && b >= 64 && b <= 127)
      || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
  }
  const v6 = String(address).toLowerCase();
  if (v6.startsWith('::ffff:')) return privateAddress(v6.slice(7));
  return v6 === '::' || v6 === '::1' || v6.startsWith('fc') || v6.startsWith('fd') || v6.startsWith('fe80');
}

/** The link, if it is https on a public address. */
async function checkUrl(raw, lookup = dns.lookup) {
  let url;
  try { url = new URL(raw); } catch { throw new FeedError('That isn’t a valid link.'); }
  if (url.protocol !== 'https:' || (url.port && url.port !== '443') || url.username || url.password) {
    throw new FeedError('Use the https calendar link the other site gives you.');
  }
  const host = url.hostname.replace(/^\[|\]$/g, '');
  let addresses;
  try { addresses = net.isIP(host) ? [{ address: host }] : await lookup(host, { all: true }); } catch { throw new FeedError('That site couldn’t be found.'); }
  if (!addresses.length || addresses.some((entry) => privateAddress(entry.address))) throw new FeedError('That link can’t be reached.');
  return url;
}

async function readLimited(response) {
  if (Number(response.headers.get('content-length')) > MAX_BYTES) throw new FeedError('That calendar is too large.');
  if (!response.body || typeof response.body.getReader !== 'function') {
    const text = await response.text();
    if (text.length > MAX_BYTES) throw new FeedError('That calendar is too large.');
    return text;
  }
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BYTES) { await reader.cancel(); throw new FeedError('That calendar is too large.'); }
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks).toString('utf8');
}

/** The calendar file behind a link (redirects followed and checked, up to 3). */
async function fetchCalendar(raw, { fetchFn = fetch, lookup = dns.lookup } = {}) {
  let url = await checkUrl(raw, lookup);
  for (let hop = 0; hop < 4; hop += 1) {
    const response = await fetchFn(url, {
      redirect: 'manual', signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { Accept: 'text/calendar, text/plain;q=0.8, */*;q=0.1', 'User-Agent': 'VaRoom-Calendar/1.0' },
    });
    const location = response.headers.get('location');
    if (response.status >= 300 && response.status < 400 && location) {
      url = await checkUrl(new URL(location, url).toString(), lookup);
      continue;
    }
    if (!response.ok) throw new FeedError(`The other site answered with an error (${response.status}). Check the link.`);
    const text = await readLimited(response);
    if (!/BEGIN:VCALENDAR/i.test(text)) throw new FeedError('That isn’t a calendar link. Copy the "export calendar" (.ics) link.');
    return text;
  }
  throw new FeedError('That link redirects too many times.');
}

// ---------- Syncing ----------

const FEED_COLUMNS = 'id,host_id,listing_id,name,url,listing:listings(title)';

/** Read one link and replace its days. Never throws for a bad link: the error is saved on the link. */
async function syncFeed(admin, feed, { fetchFn, lookup, notify = createNotification } = {}) {
  let events;
  try {
    events = parseIcs(await fetchCalendar(feed.url, { fetchFn, lookup }));
  } catch (error) {
    const message = error instanceof FeedError ? error.message
      : error && error.name === 'TimeoutError' ? 'The other site took too long to answer.' : 'The link couldn’t be read. Try again later.';
    const { error: saveError } = await admin.rpc('calendar_sync_feed', { p_feed: feed.id, p_events: [], p_error: message });
    if (saveError) throw saveError;
    return { ok: false, error: message, count: 0, clashes: [] };
  }
  const named = events.map((event) => ({ ...event, title: event.title ? `${feed.name} · ${event.title}` : feed.name }));
  const { data, error } = await admin.rpc('calendar_sync_feed', { p_feed: feed.id, p_events: named, p_error: null });
  if (error) throw error;
  const clashes = Array.isArray(data) ? data : [];
  if (clashes.length) {
    const listing = (Array.isArray(feed.listing) ? feed.listing[0] : feed.listing) || {};
    const shown = clashes.slice(0, 3).join(', ') + (clashes.length > 3 ? ` and ${clashes.length - 3} more` : '');
    // Once per set of clashing nights (the event key), however often the link is read.
    await notify({
      supabase: admin, recipientUserId: feed.host_id, type: 'booking_clash', title: 'Possible double booking',
      message: `"${listing.title || 'Your listing'}" has more bookings than it can take on ${shown}. Check your Calendar and the other site.`,
      relatedEntityType: 'listing', relatedEntityId: feed.listing_id, eventKey: `booking-clash:${feed.listing_id}:${clashes.join(',')}`,
    }).catch(() => undefined);
  }
  return { ok: true, count: events.length, clashes };
}

/** Every link, one at a time (the 30-minute job). */
async function syncAllFeeds(admin, options = {}) {
  const { data, error } = await admin.from('calendar_feeds').select(FEED_COLUMNS).order('last_synced_at', { ascending: true, nullsFirst: true });
  if (error) throw error;
  let synced = 0;
  for (const feed of data || []) {
    try {
      if ((await syncFeed(admin, feed, options)).ok) synced += 1;
    } catch (failure) {
      console.error('Calendar sync failed for a link:', feed.id, failure && failure.message);
    }
  }
  return synced;
}

module.exports = { FEED_COLUMNS, SYNC_INTERVAL_MS, FeedError, parseIcs, checkUrl, fetchCalendar, privateAddress, syncFeed, syncAllFeeds };
