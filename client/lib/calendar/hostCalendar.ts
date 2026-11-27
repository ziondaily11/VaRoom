import type { SupabaseClient } from '@supabase/supabase-js';
import { nextDay } from '../booking/bookingListing';

// The host's Calendar (docs/host-controls/CALENDAR_PLAN.md, part 2): one
// host_calendar call per month (listings, bookings, closed ranges, read with
// the account's own rights), kept in memory per account and month so going
// back to a month draws at once and refreshes in the background. Cleared on
// sign-out and account switch (lib/auth/clearUserData.ts) and after any change
// to bookings or closed days.

/** Niches whose listings are booked by the night, day or hour. */
export const CALENDAR_CATEGORIES: readonly string[] = ['airbnb', 'hotel', 'venue'];
export const hasCalendar = (category: string | null | undefined) => CALENDAR_CATEGORIES.includes(category || '');

export interface CalendarListing {
  id: string; title: string; category: string; availability_status: string | null; live_until: string | null;
  price_unit: string | null; units: number | null; min_notice_days: number | null; max_advance_days: number | null;
  /** Closed every week: 0 = Sunday … 6 = Saturday. */
  closed_weekdays?: number[];
  /** Venues by the hour: hire hours ('HH:MM', null: any time) and the gap kept between bookings. */
  hire_start?: string | null; hire_end?: string | null; buffer_minutes?: number;
}
export interface CalendarBooking {
  id: string; listing_id: string; status: 'pending' | 'approved' | 'completed'; start_date: string; end_date: string | null;
  /** Hourly bookings: 'HH:MM'. */
  start_time?: string | null; end_time?: string | null;
  hours: number | null; guest_count: number | null; total_price: number | null; created_at: string; guest: string | null;
}
export interface ClosedRange { listing_id: string; start_date: string; end_date: string | null }

export const EVENT_COLORS = ['red', 'orange', 'yellow', 'green', 'blue', 'purple'] as const;
export type EventColor = typeof EVENT_COLORS[number];

/** What the host writes: an event (blocks: booked outside VaRoom) or a note. Days are inclusive. */
export interface EventFields {
  listing_id: string | null; title: string; notes: string | null; color: EventColor | null;
  start_date: string; end_date: string; start_time: string | null; end_time: string | null; blocks: boolean;
  client_name: string | null; client_phone: string | null; guest_count: number | null; amount: number | null; units: number;
  repeat: 'weekly' | 'monthly' | null; repeat_until: string | null;
}
/** One occurrence in the month (a repeating event has one per week or month); series_* are the event's own dates. */
export interface CalendarEvent extends EventFields { id: string; series_start: string; series_end: string }

/** A hotel restaurant's table reservation (its status is changed in Bookings). */
export interface TableBooking {
  id: string; listing_id: string; restaurant_name: string | null; client_name: string | null; client_phone: string | null;
  guest_count: number; table_count: number; date: string; time: string; occasion: string | null; status: 'requested' | 'contacted' | 'closed';
}

export interface HostCalendarData { listings: CalendarListing[]; bookings: CalendarBooking[]; closed: ClosedRange[]; events: CalendarEvent[]; tables: TableBooking[] }

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
      const result: HostCalendarData = { listings: raw.listings || [], bookings: raw.bookings || [], closed: raw.closed || [], events: raw.events || [], tables: raw.tables || [] };
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
