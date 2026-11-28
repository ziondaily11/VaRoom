import type { SupabaseClient } from '@supabase/supabase-js';
import { nextDay } from '../booking/bookingListing';
import { apiFetch } from '../api';
import { bookingDefaultsProblem, normaliseBookingDefaults, type BookingDefaults } from '../settings/bookingDefaults';

// The host's Calendar (docs/host-controls/CALENDAR_PLAN.md, part 2): one
// host_calendar call per month (listings, bookings, closed ranges, read with
// the account's own rights), kept in memory per account and month so going
// back to a month draws at once and refreshes in the background. Cleared on
// sign-out and account switch (lib/auth/clearUserData.ts) and after any change
// to bookings or closed days.

export interface CalendarListing {
  id: string; title: string; category: string; availability_status: string | null; live_until: string | null;
  price_unit: string | null; units: number | null; min_notice_days: number | null; max_advance_days: number | null;
  /** Closed every week: 0 = Sunday … 6 = Saturday. */
  closed_weekdays?: number[];
  /** Venues by the hour: hire hours ('HH:MM', null: any time) and the gap kept between bookings. */
  hire_start?: string | null; hire_end?: string | null; buffer_minutes?: number;
  /** Property, office and shop: nothing is booked by the night, so the calendar only plans. */
  planner?: boolean;
  /** The normal and weekend price, and days kept free after each stay. */
  price?: number | string | null; weekend_price?: number | string | null; turnover_days?: number;
}
export interface CalendarBooking {
  id: string; listing_id: string; status: 'pending' | 'approved' | 'completed'; start_date: string; end_date: string | null;
  /** Hourly bookings: 'HH:MM'. */
  start_time?: string | null; end_time?: string | null;
  hours: number | null; guest_count: number | null; total_price: number | null; created_at: string; guest: string | null;
  /** Venues: the type of event and the guest's note (migration 000097). */
  event_type?: string | null; event_notes?: string | null;
  /** The host's own title, notes and colour (booking_host_notes, 000098): never shown to the guest. */
  host_title?: string | null; host_notes?: string | null; host_color?: EventColor | null;
  /** The guest's profile photo (as stored; resolveAvatarUrl makes it a URL). */
  avatar?: string | null;
}
export interface ClosedRange { listing_id: string; start_date: string; end_date: string | null }

export const EVENT_COLORS = ['red', 'orange', 'yellow', 'green', 'blue', 'purple'] as const;
export type EventColor = typeof EVENT_COLORS[number];

/** What the host writes: an event (blocks: booked outside VaRoom) or a note. Days are inclusive. */
export interface EventFields {
  listing_id: string | null; title: string; notes: string | null; color: EventColor | null;
  start_date: string; end_date: string; start_time: string | null; end_time: string | null; blocks: boolean;
  /** A viewing: a time and the client's details; it never blocks anything. */
  viewing: boolean;
  client_name: string | null; client_phone: string | null; guest_count: number | null; amount: number | null; units: number;
  repeat: 'weekly' | 'monthly' | null; repeat_until: string | null;
}
/** One occurrence in the month (a repeating event has one per week or month); series_* are the event's own dates. */
/** source 'ical': a booking read from another site's calendar link (not editable here). */
export interface CalendarEvent extends EventFields { id: string; series_start: string; series_end: string; source?: 'host' | 'ical' }

/** A hotel restaurant's table reservation (its status is changed in Bookings). */
export interface TableBooking {
  id: string; listing_id: string; restaurant_name: string | null; client_name: string | null; client_phone: string | null;
  guest_count: number; table_count: number; date: string; time: string; occasion: string | null; status: 'requested' | 'contacted' | 'closed';
}

/** A rental or lease request: its move-in day and the day it ends. */
export interface LeaseEntry {
  id: string; listing_id: string; status: 'pending' | 'approved' | 'completed'; start: string; months: number | null; end: string;
  total_price: number | null; guest: string | null; avatar?: string | null;
}
/** A place marked sold, rented or leased. */
export interface OutcomeEntry { id: string; listing_id: string; outcome: 'sold' | 'rented' | 'leased'; units: number; agreed_amount: number | null; date: string }

/** A price for a range of dates ("Christmas"). */
export interface DatePrice { listing_id: string; start_date: string; end_date: string; price: number | string; label: string | null }

export interface HostCalendarData {
  listings: CalendarListing[]; bookings: CalendarBooking[]; closed: ClosedRange[]; events: CalendarEvent[]; tables: TableBooking[];
  leases: LeaseEntry[]; outcomes: OutcomeEntry[]; prices: DatePrice[];
}

export const CALENDAR_STALE_MS = 60 * 1000;

const pad = (n: number) => String(n).padStart(2, '0');
export const monthRange = (year: number, month: number) => ({
  from: `${year}-${pad(month + 1)}-01`,
  to: `${year}-${pad(month + 1)}-${pad(new Date(year, month + 1, 0).getDate())}`,
});

const cache = new Map<string, { data: HostCalendarData; fetchedAt: number }>();
const inflight = new Map<string, Promise<HostCalendarData>>();
const keyOf = (hostId: string, year: number, month: number) => `${hostId}:${year}-${month}`;

export const cachedMonth = (hostId: string, year: number, month: number) => cache.get(keyOf(hostId, year, month)) || null;
/** Every month already loaded for a host (search looks through these, with no new requests). */
export const cachedMonths = (hostId: string) => Array.from(cache.entries()).filter(([key]) => key.startsWith(`${hostId}:`)).map(([, hit]) => hit.data);

/** The month's data: the cached copy while fresh, else one request (shared by callers asking at once). */
export function loadMonth(client: SupabaseClient, hostId: string, year: number, month: number, force = false): Promise<HostCalendarData> {
  const key = keyOf(hostId, year, month);
  const hit = cache.get(key);
  if (!force && hit && Date.now() - hit.fetchedAt < CALENDAR_STALE_MS) return Promise.resolve(hit.data);
  const running = inflight.get(key);
  if (running) return running;
  const { from, to } = monthRange(year, month);
  const request = Promise.resolve(client.rpc('host_calendar', { p_host: hostId, p_from: from, p_to: to }))
    .then(({ data, error }) => {
      if (error) throw error;
      const raw = (data || {}) as Partial<HostCalendarData>;
      const result: HostCalendarData = { listings: raw.listings || [], bookings: raw.bookings || [], closed: raw.closed || [], events: raw.events || [], tables: raw.tables || [],
        leases: raw.leases || [], outcomes: raw.outcomes || [], prices: raw.prices || [] };
      cache.set(key, { data: result, fetchedAt: Date.now() });
      return result;
    })
    .finally(() => inflight.delete(key));
  inflight.set(key, request);
  return request;
}

/** Forget cached months: one account's, or every account's. */
export function clearCalendarCache(hostId?: string): void {
  if (!hostId) { cache.clear(); return; }
  Array.from(cache.keys()).forEach((key) => { if (key.startsWith(`${hostId}:`)) cache.delete(key); });
}

/** Close or reopen a listing's days from `from` to `to` (null: onwards). The database merges and splits ranges. */
export async function setClosed(client: SupabaseClient, listingId: string, from: string, to: string | null, closed: boolean): Promise<void> {
  const { error } = await client.rpc('calendar_set_closed', { p_listing: listingId, p_from: from, p_to: to, p_closed: closed });
  if (error) throw error;
}

/** Add or change an event (row-level security: the host's or a manager's own; a clash is refused). */
export async function saveEvent(client: SupabaseClient, hostId: string, fields: EventFields, id?: string): Promise<void> {
  const row = { ...fields, kind: 'event', host_id: hostId };
  const { error } = id
    ? await client.from('calendar_entries').update(row).eq('id', id).eq('kind', 'event')
    : await client.from('calendar_entries').insert(row);
  if (error) throw error;
}

/** The host's own title, notes and colour on a VaRoom booking (all empty: removed). */
export async function saveBookingNote(client: SupabaseClient, hostId: string, bookingId: string, note: { title: string; notes: string; color: EventColor | null }): Promise<void> {
  const title = note.title.trim().slice(0, 120) || null;
  const notes = note.notes.trim().slice(0, 2000) || null;
  const { error } = !title && !notes && !note.color
    ? await client.from('booking_host_notes').delete().eq('booking_id', bookingId)
    : await client.from('booking_host_notes').upsert({ booking_id: bookingId, host_id: hostId, title, notes, color: note.color, updated_at: new Date().toISOString() }, { onConflict: 'booking_id' });
  if (error) throw error;
}

export async function deleteEvent(client: SupabaseClient, id: string): Promise<void> {
  const { error } = await client.from('calendar_entries').delete().eq('id', id).eq('kind', 'event');
  if (error) throw error;
}

/** The days of the week a listing is always closed. */
export async function setWeekdays(client: SupabaseClient, listingId: string, days: number[]): Promise<void> {
  const { error } = await client.rpc('calendar_set_weekdays', { p_listing: listingId, p_days: days });
  if (error) throw error;
}

/** A venue's hire hours ('HH:MM' both, or both null: any time) and the minutes kept free between bookings. */
export async function setHours(client: SupabaseClient, listingId: string, start: string | null, end: string | null, buffer: number): Promise<void> {
  const { error } = await client.rpc('calendar_set_hours', { p_listing: listingId, p_start: start, p_end: end, p_buffer: buffer });
  if (error) throw error;
}

/** Minutes after midnight from 'HH:MM' ('24:00' is 1440). */
export const minutesOf = (time: string | null | undefined, fallback: number) => {
  const match = /^(\d{2}):(\d{2})/.exec(time || '');
  return match ? Number(match[1]) * 60 + Number(match[2]) : fallback;
};

// ---------- Sync with other sites (calendar links) ----------

/** Another site's calendar link that VaRoom reads every 30 minutes. */
export interface CalendarFeed {
  id: string; listing_id: string; name: string; url: string;
  last_synced_at: string | null; last_error: string | null; last_count: number | null;
}
export interface SyncResult { ok: boolean; error?: string; count: number; clashes: string[] }

/** The listing's links and its own calendar link (made on first use). */
export async function loadSync(client: SupabaseClient, listingId: string): Promise<{ feeds: CalendarFeed[]; token: string }> {
  const [feeds, token] = await Promise.all([
    client.from('calendar_feeds').select('id,listing_id,name,url,last_synced_at,last_error,last_count').eq('listing_id', listingId).order('created_at'),
    client.rpc('calendar_export_token', { p_listing: listingId, p_reset: false }),
  ]);
  if (feeds.error) throw feeds.error;
  if (token.error) throw token.error;
  return { feeds: (feeds.data || []) as CalendarFeed[], token: String(token.data) };
}

/** A new calendar link for the listing; the old one stops working. */
export async function resetExport(client: SupabaseClient, listingId: string): Promise<string> {
  const { data, error } = await client.rpc('calendar_export_token', { p_listing: listingId, p_reset: true });
  if (error) throw error;
  return String(data);
}

export const exportUrl = (origin: string, token: string) => `${origin}/api/calendar/${token}.ics`;

export async function addFeed(client: SupabaseClient, hostId: string, listingId: string, name: string, url: string): Promise<CalendarFeed> {
  const { data, error } = await client.from('calendar_feeds').insert({ host_id: hostId, listing_id: listingId, name, url })
    .select('id,listing_id,name,url,last_synced_at,last_error,last_count').single();
  if (error) throw error;
  return data as CalendarFeed;
}

export async function removeFeed(client: SupabaseClient, id: string): Promise<void> {
  const { error } = await client.from('calendar_feeds').delete().eq('id', id);
  if (error) throw error;
}

/** Read a link now (the server checks it is the host's own). */
export const syncNow = (id: string, fetchApi: <T>(path: string, options: { method: string }) => Promise<T> = apiFetch) =>
  fetchApi<SyncResult>(`/api/calendar/feeds/${encodeURIComponent(id)}/sync`, { method: 'POST' });

/** Why a link can't be added, in words, or null. */
export function feedProblem(name: string, url: string, existing: CalendarFeed[]): string | null {
  if (!name.trim()) return 'Name the site, e.g. Airbnb.com.';
  if (!/^https:\/\/[^\s]+$/i.test(url.trim())) return 'Paste the https calendar link (.ics) from the other site.';
  if (existing.some((f) => f.url === url.trim())) return 'That link is already added.';
  if (existing.length >= 5) return 'A listing can have up to 5 links.';
  return null;
}

// ---------- Prices and cleaning days ----------

/** Fridays and Saturdays for nights; Saturdays and Sundays for venues by the day or hour (as varoom_day_price). */
const weekendDays = (listing: CalendarListing) => ((listing.price_unit || 'night') === 'night' ? [5, 6] : [0, 6]);

/** A day's price and why: a special date (its label), the weekend, or the normal price. */
export function priceOn(listing: CalendarListing, prices: DatePrice[], day: string): { price: number; label: string | null; special: boolean } {
  const dated = prices.find((p) => p.listing_id === listing.id && p.start_date <= day && day <= p.end_date);
  if (dated) return { price: Number(dated.price), label: dated.label || 'Special price', special: true };
  if (listing.weekend_price != null && weekendDays(listing).includes(new Date(`${day}T00:00:00Z`).getUTCDay())) return { price: Number(listing.weekend_price), label: 'Weekend', special: true };
  return { price: Number(listing.price) || 0, label: null, special: false };
}

export async function setWeekendPrice(client: SupabaseClient, listingId: string, price: number | null): Promise<void> {
  const { error } = await client.rpc('calendar_set_weekend_price', { p_listing: listingId, p_price: price });
  if (error) throw error;
}

/** A price for the days from `from` to `to`; null puts them back to the weekend or normal price. */
export async function setDatePrice(client: SupabaseClient, listingId: string, from: string, to: string, price: number | null, label: string | null = null): Promise<void> {
  const { error } = await client.rpc('calendar_set_price', { p_listing: listingId, p_from: from, p_to: to, p_price: price, p_label: label });
  if (error) throw error;
}

export async function setTurnover(client: SupabaseClient, listingId: string, days: number): Promise<void> {
  const { error } = await client.rpc('calendar_set_turnover', { p_listing: listingId, p_days: days });
  if (error) throw error;
}

/** A price typed by the host: a positive whole number of shillings, or null. */
export const parsePrice = (value: string) => {
  const amount = Number(String(value).replace(/[,\s]/g, ''));
  return Number.isFinite(amount) && amount > 0 ? Math.round(amount) : null;
};

/** A database refusal people can read ("calendar: …", "booking_rule: …"), else the fallback. */
export function calendarErrorText(error: unknown, fallback: string): string {
  const message = String((error as { message?: unknown } | null)?.message || '');
  if (/^(booking_rule|calendar): /.test(message)) return message.replace(/^\w+: /, '');
  if (message.includes('calendar_entries_shape')) return 'Check the dates and times: the end must be after the start, and a repeating event must fit in a week (or a month).';
  return fallback;
}

// ---------- Days ----------

/** Every day from `from` to `to`, both included. */
export function daysBetweenInclusive(from: string, to: string): string[] {
  const days: string[] = [];
  for (let day = from; day <= to && days.length < 400; day = nextDay(day)) days.push(day);
  return days;
}

const byDay = (listing: CalendarListing | undefined) => listing?.price_unit === 'day';

/** The booking takes this day: a night of a stay, a day of a venue hire, or an hourly booking's date. */
export function covers(booking: CalendarBooking, listing: CalendarListing | undefined, day: string): boolean {
  if (!booking.end_date) return booking.start_date === day;
  return booking.start_date <= day && (byDay(listing) ? day <= booking.end_date : day < booking.end_date);
}

export const isClosed = (closed: ClosedRange[], listingId: string, day: string) =>
  closed.some((range) => range.listing_id === listingId && range.start_date <= day && (!range.end_date || range.end_date >= day));

/** The day of the week (0 = Sunday), read as a calendar date. */
export const weekday = (day: string) => new Date(`${day.slice(0, 10)}T00:00:00Z`).getUTCDay();
export const closedWeekly = (listing: CalendarListing | undefined, day: string) => Boolean(listing?.closed_weekdays?.includes(weekday(day)));

export const eventOn = (event: Pick<CalendarEvent, 'start_date' | 'end_date'>, day: string) => event.start_date <= day && day <= event.end_date;

/** Why guests can't book the listing at all right now, or null. */
export function listingOff(listing: CalendarListing, now = Date.now()): string | null {
  const status = listing.availability_status || 'available';
  if (status === 'paused') return 'is paused';
  if (status === 'sold' || status === 'rented' || status === 'leased') return `is marked ${status}`;
  if (status !== 'available') return 'is unavailable';
  if (listing.live_until && Date.parse(listing.live_until) < now) return 'is offline (its plan or term has ended)';
  return null;
}

export interface PlannerSummary { viewings: number; moveIns: number; leaseEnds: number; requests: number }

/** Property, office and shop hosts' month: viewings, move-ins, leases ending, and requests waiting. */
export function plannerSummary(data: HostCalendarData, ids: Set<string>, first: string, last: string): PlannerSummary {
  const inMonth = (day: string) => day >= first && day <= last;
  const leases = data.leases.filter((l) => ids.has(l.listing_id));
  return {
    viewings: data.events.filter((e) => e.viewing && inMonth(e.start_date) && (!e.listing_id || ids.has(e.listing_id))).length,
    moveIns: leases.filter((l) => l.status !== 'pending' && inMonth(l.start)).length,
    leaseEnds: leases.filter((l) => l.status !== 'pending' && inMonth(l.end)).length,
    requests: leases.filter((l) => l.status === 'pending').length,
  };
}

export interface MonthSummary { nightsBooked: number; occupancy: number | null; earned: number; offline: number; requests: number }

/** Booked nights (days), occupancy of the open nights (hotel rooms count), money from approved bookings starting this month, and requests waiting. */
export function monthSummary(data: HostCalendarData, listings: CalendarListing[], days: string[], closedAt: (listingId: string, day: string) => boolean): MonthSummary {
  const ids = new Set(listings.map((l) => l.id));
  const byId = new Map(listings.map((l) => [l.id, l]));
  const bookings = data.bookings.filter((b) => ids.has(b.listing_id));
  const confirmed = bookings.filter((b) => b.status !== 'pending');
  // Bookings the host made outside VaRoom count as booked; their money is shown apart ("entered by you").
  const offlineEvents = (data.events || []).filter((e) => e.blocks && e.listing_id && ids.has(e.listing_id));
  let nightsBooked = 0;
  let open = 0;
  days.forEach((day) => {
    listings.forEach((l) => { if (!closedAt(l.id, day)) open += l.category === 'hotel' ? Math.max(1, l.units || 1) : 1; });
    confirmed.forEach((b) => { if (b.end_date && covers(b, byId.get(b.listing_id), day)) nightsBooked += 1; });
    offlineEvents.forEach((e) => { if (eventOn(e, day)) nightsBooked += e.units || 1; });
  });
  const first = days[0];
  const last = days[days.length - 1];
  return {
    nightsBooked,
    occupancy: open > 0 ? Math.min(1, nightsBooked / open) : null,
    earned: confirmed.filter((b) => b.start_date >= first && b.start_date <= last).reduce((sum, b) => sum + (Number(b.total_price) || 0), 0),
    offline: offlineEvents.filter((e) => e.start_date >= first && e.start_date <= last).reduce((sum, e) => sum + (Number(e.amount) || 0), 0),
    requests: bookings.filter((b) => b.status === 'pending').length,
  };
}

// ---------- A place's booking rules (Place settings → Rules) ----------

/** The listing's own booking rules (Settings → Bookings only pre-fills new listings). */
export type PlaceRules = Omit<BookingDefaults, 'cancellation_policy'>;
const RULE_COLUMNS = 'instant_book,min_notice_days,max_advance_days,min_stay_nights,max_stay_nights,checkin_time,checkout_time';

/** Which rules a place takes: nights for stays (not venues or hourly hires), house times (not venues), instant book (not by the hour). */
export const ruleFields = (listing: Pick<CalendarListing, 'category' | 'price_unit'>) => ({
  instant: listing.price_unit !== 'hour',
  nights: listing.category !== 'venue' && listing.price_unit !== 'hour',
  times: listing.category !== 'venue',
});

export async function loadPlaceRules(client: SupabaseClient, listingId: string): Promise<PlaceRules> {
  const { data, error } = await client.from('listing_booking_details').select(RULE_COLUMNS).eq('listing_id', listingId).maybeSingle();
  if (error) throw error;
  const row = (data || {}) as Record<string, unknown>;
  const clock = (value: unknown) => (typeof value === 'string' ? value.slice(0, 5) : value);
  const { cancellation_policy: _policy, ...rules } = normaliseBookingDefaults({ ...row, checkin_time: clock(row.checkin_time), checkout_time: clock(row.checkout_time) });
  return rules;
}

/** Saves the rules the place takes (others cleared, as the listing wizard does); the database applies them to new bookings. */
export async function savePlaceRules(client: SupabaseClient, listing: CalendarListing, rules: PlaceRules): Promise<void> {
  const fields = ruleFields(listing);
  const { cancellation_policy: _policy, ...clean } = normaliseBookingDefaults(rules);
  if (!fields.instant) clean.instant_book = false;
  if (!fields.nights) { clean.min_stay_nights = null; clean.max_stay_nights = null; }
  if (!fields.times) { clean.checkin_time = null; clean.checkout_time = null; }
  const problem = bookingDefaultsProblem({ ...clean, cancellation_policy: 'moderate' });
  if (problem) throw new Error(`calendar: ${problem}`);
  const { data, error } = await client.from('listing_booking_details').update(clean).eq('listing_id', listing.id).select('listing_id');
  if (error) throw error;
  if (!data?.length) throw new Error('calendar: This listing has no booking details yet. Edit the listing to add them.');
}

// ---------- Hotel dining: table reservations ----------

/** Marks a reservation New ('requested'), Contacted or Closed (the server checks it is the host's own). */
export const setTableStatus = (hostId: string, id: string, status: TableBooking['status'], fetchApi: typeof apiFetch = apiFetch) =>
  fetchApi<{ reservation: { id: string; status: string } }>(`/api/host/table-reservations/${encodeURIComponent(id)}`, { method: 'PATCH', body: { status }, headers: { 'X-VaRoom-Host': hostId } });

const diningTables = new Map<string, number>();
/** Each restaurant's number of tables (public, rarely changes: kept for the session). */
export async function loadDiningTables(client: SupabaseClient, listingIds: string[]): Promise<Map<string, number>> {
  const missing = listingIds.filter((id) => !diningTables.has(id));
  if (missing.length) {
    const { data, error } = await client.from('hotel_dining_configs').select('listing_id,tables_available').in('listing_id', missing);
    if (error) throw error;
    ((data || []) as Array<{ listing_id: string; tables_available: number }>).forEach((row) => diningTables.set(row.listing_id, row.tables_available));
  }
  return new Map(listingIds.filter((id) => diningTables.has(id)).map((id) => [id, diningTables.get(id) as number]));
}

/** Tables reserved at a reservation's restaurant, date and time ("6 of 12 tables"). */
export const tablesAt = (tables: TableBooking[], t: Pick<TableBooking, 'listing_id' | 'date' | 'time'>) => tables
  .filter((r) => r.listing_id === t.listing_id && r.date === t.date && r.time === t.time)
  .reduce((sum, r) => sum + r.table_count, 0);
