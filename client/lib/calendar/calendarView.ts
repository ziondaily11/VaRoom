import type { CalendarBooking, CalendarEvent, CalendarListing, HostCalendarData, LeaseEntry, OutcomeEntry, TableBooking } from './hostCalendar';
import { eventLabel } from '../booking/eventTypes';

// The Calendar's view model (docs/host-controls/CALENDAR_UI_PLAN.md): every
// booking, event, lease, outcome and table reservation as one kind of entry,
// the filters ("My places", "Show"), each place's colour, and the month
// grid's bars: a stay runs from the middle of its check-in day to the middle
// of its check-out day, in lanes, week by week. Pure functions, no React.

/** Place colours, by the listing's position (stable between visits). */
export const PLACE_COLORS = ['#e5484d', '#0090ff', '#30a46c', '#f76b15', '#8e4ec6', '#12a594', '#d6409f', '#e2b203'];
export const placeColor = (index: number) => PLACE_COLORS[((index % PLACE_COLORS.length) + PLACE_COLORS.length) % PLACE_COLORS.length];
/** The host's own event colours (EventForm's six), as on the page. */
export const EVENT_HEX: Record<string, string> = { red: '#e5484d', orange: '#f76b15', yellow: '#e2b203', green: '#30a46c', blue: '#0090ff', purple: '#8e4ec6' };

export type ShowKey = 'bookings' | 'requests' | 'offline' | 'other' | 'viewings' | 'notes' | 'closed';
export const SHOW_OPTIONS: Array<{ key: ShowKey; label: string }> = [
  { key: 'bookings', label: 'Bookings' },
  { key: 'requests', label: 'Requests' },
  { key: 'offline', label: 'Booked offline' },
  { key: 'other', label: 'Other sites' },
  { key: 'viewings', label: 'Viewings' },
  { key: 'notes', label: 'Notes' },
  { key: 'closed', label: 'Closed and cleaning' },
];
export const ALL_SHOWN: ReadonlySet<ShowKey> = new Set(SHOW_OPTIONS.map((o) => o.key));

export type ItemKind = 'booking' | 'request' | 'offline' | 'other' | 'viewing' | 'note' | 'table' | 'move-in' | 'lease-end' | 'outcome';
const SHOWN_BY: Record<ItemKind, ShowKey> = {
  booking: 'bookings', request: 'requests', offline: 'offline', other: 'other', viewing: 'viewings', note: 'notes',
  table: 'bookings', 'move-in': 'bookings', 'lease-end': 'bookings', outcome: 'bookings',
};
export const KIND_LABEL: Record<ItemKind, string> = {
  booking: 'Booked', request: 'Request', offline: 'Booked offline', other: 'Other site', viewing: 'Viewing', note: 'Note',
  table: 'Table', 'move-in': 'Move-in', 'lease-end': 'Lease ends', outcome: 'Marked',
};

export type ItemSource =
  | { type: 'booking'; value: CalendarBooking } | { type: 'event'; value: CalendarEvent } | { type: 'lease'; value: LeaseEntry }
  | { type: 'outcome'; value: OutcomeEntry } | { type: 'table'; value: TableBooking };

export interface CalendarItem {
  key: string;
  kind: ItemKind;
  listingId: string | null;
  /** Days it covers on the calendar, both included (a stay: check-in to check-out day). */
  start: string;
  end: string;
  /** A stay starts after midday on its check-in day and ends before midday on its check-out day. */
  halfStart: boolean;
  halfEnd: boolean;
  /** 'HH:MM–HH:MM' for timed entries. */
  time: string | null;
  /** A venue's day hire: the hire hours it fills in Week and Day ('HH:MM–HH:MM'); Month keeps it a bar. */
  block?: string | null;
  title: string;
  /** The host's own colour for an event, else the place's colour. */
  color: string | null;
  source: ItemSource;
}

const OUTCOME_WORD = { sold: 'Sold', rented: 'Rented', leased: 'Leased' } as const;
const range = (from: string | null | undefined, to: string | null | undefined) => (from && to ? `${from}–${to}` : null);
/** A venue hired for one day, with no time: shown over its hire hours (08:00–22:00 when it has none). */
const dayHire = (listing: CalendarListing | undefined, start: string, end: string, time: string | null) => (
  listing?.category === 'venue' && start === end && !time ? `${listing.hire_start || '08:00'}–${listing.hire_end || '22:00'}` : null);

/**
 * Every entry of the loaded month on the shown places (and events not tied to
 * a place), filtered by "Show", in date order. Table reservations of a hotel's
 * restaurant (not itself a calendar place) show when every place is shown.
 */
export function buildItems(data: HostCalendarData, shown: CalendarListing[], allShown: boolean, show: ReadonlySet<ShowKey>): CalendarItem[] {
  const ids = new Set(shown.map((l) => l.id));
  const byId = new Map(shown.map((l) => [l.id, l]));
  const items: CalendarItem[] = [];
  data.bookings.filter((b) => ids.has(b.listing_id)).forEach((b) => {
    const listing = byId.get(b.listing_id);
    const nightly = Boolean(b.end_date) && listing?.price_unit !== 'day';
    const event = eventLabel(b.event_type);
    const time = range(b.start_time, b.end_time);
    items.push({
      key: `b${b.id}`, kind: b.status === 'pending' ? 'request' : 'booking', listingId: b.listing_id,
      start: b.start_date, end: b.end_date || b.start_date, halfStart: nightly, halfEnd: nightly,
      time, block: dayHire(listing, b.start_date, b.end_date || b.start_date, time),
      // The event first, then who booked it: "Wedding · Divine Venues".
      title: event ? `${event} · ${b.guest || 'Guest'}` : b.guest || 'Guest', color: null, source: { type: 'booking', value: b },
    });
  });
  data.events.filter((e) => !e.listing_id || ids.has(e.listing_id)).forEach((e) => {
    const kind: ItemKind = e.source === 'ical' ? 'other' : e.blocks ? 'offline' : e.viewing ? 'viewing' : 'note';
    const time = range(e.start_time, e.end_time);
    items.push({
      key: `e${e.id}:${e.start_date}`, kind, listingId: e.listing_id, start: e.start_date, end: e.end_date, halfStart: false, halfEnd: false,
      time, block: e.blocks ? dayHire(byId.get(e.listing_id || ''), e.start_date, e.end_date, time) : null, title: e.title, color: e.source === 'ical' ? null : e.color, source: { type: 'event', value: e },
    });
  });
  data.leases.filter((l) => ids.has(l.listing_id)).forEach((l) => {
    items.push({ key: `l${l.id}:in`, kind: l.status === 'pending' ? 'request' : 'move-in', listingId: l.listing_id, start: l.start, end: l.start,
      halfStart: false, halfEnd: false, time: null, title: l.guest || 'Tenant', color: null, source: { type: 'lease', value: l } });
    if (l.status !== 'pending') {
      items.push({ key: `l${l.id}:out`, kind: 'lease-end', listingId: l.listing_id, start: l.end, end: l.end,
        halfStart: false, halfEnd: false, time: null, title: l.guest || 'Tenant', color: null, source: { type: 'lease', value: l } });
    }
  });
  data.outcomes.filter((o) => ids.has(o.listing_id)).forEach((o) => {
    items.push({ key: `o${o.id}`, kind: 'outcome', listingId: o.listing_id, start: o.date, end: o.date, halfStart: false, halfEnd: false,
      time: null, title: OUTCOME_WORD[o.outcome], color: null, source: { type: 'outcome', value: o } });
  });
  data.tables.filter((t) => ids.has(t.listing_id) || allShown).forEach((t) => {
    items.push({ key: `t${t.id}`, kind: 'table', listingId: ids.has(t.listing_id) ? t.listing_id : null, start: t.date, end: t.date,
      halfStart: false, halfEnd: false, time: t.time, title: `${t.client_name || 'Guest'} · ${t.guest_count}`, color: null, source: { type: 'table', value: t } });
  });
  return items
    .filter((item) => show.has(SHOWN_BY[item.kind]))
    .sort((a, b) => a.start.localeCompare(b.start) || (a.time || '').localeCompare(b.time || '') || a.key.localeCompare(b.key));
}

/** Entries on a day (a stay counts on every day it touches, its check-out day included). */
export const itemsOn = (items: CalendarItem[], day: string) => items.filter((i) => i.start <= day && day <= i.end);

/** What's next from today: up to `count` entries starting today or later. */
export const upcoming = (items: CalendarItem[], today: string, count = 5) => items.filter((i) => i.start >= today).slice(0, count);

// ---------- The month grid ----------

/** The month as weeks of 7 cells (null before the 1st and after the last day). */
export function monthWeeks(days: string[], leadingBlanks: number): Array<Array<string | null>> {
  const cells: Array<string | null> = [...Array.from({ length: leadingBlanks }, () => null), ...days];
  while (cells.length % 7) cells.push(null);
  return Array.from({ length: cells.length / 7 }, (_, w) => cells.slice(w * 7, w * 7 + 7));
}

export interface Segment {
  item: CalendarItem;
  /** Columns 0-6, both included. */
  from: number;
  to: number;
  lane: number;
  halfStart: boolean;
  halfEnd: boolean;
  /** It carries on from last week / into next week. */
  cutLeft: boolean;
  cutRight: boolean;
}

/**
 * One week's bars: each entry's part in this week, in the first lane where it
 * fits (a stay ending at midday can share a lane with one starting that day).
 * Lanes past `maxLanes` aren't drawn; `hidden` counts them per column ("+2").
 */
export function layoutWeek(week: Array<string | null>, items: CalendarItem[], maxLanes = 3): { segments: Segment[]; hidden: number[] } {
  const cols = week.map((day, col) => ({ day, col })).filter((c): c is { day: string; col: number } => Boolean(c.day));
  const hidden = Array.from({ length: week.length }, () => 0);
  if (!cols.length) return { segments: [], hidden };
  const first = cols[0];
  const last = cols[cols.length - 1];
  const colOf = new Map(cols.map((c) => [c.day, c.col]));
  const parts = items
    .filter((item) => item.start <= last.day && item.end >= first.day)
    .map((item) => {
      const cutLeft = item.start < first.day;
      const cutRight = item.end > last.day;
      return {
        item, cutLeft, cutRight,
        from: cutLeft ? first.col : colOf.get(item.start) as number,
        to: cutRight ? last.col : colOf.get(item.end) as number,
        halfStart: item.halfStart && !cutLeft,
        halfEnd: item.halfEnd && !cutRight,
      };
    })
    .sort((a, b) => a.from - b.from || (b.to - b.from) - (a.to - a.from));
  const laneEnds: Array<{ to: number; halfEnd: boolean }> = [];
  const segments: Segment[] = [];
  parts.forEach((part) => {
    let lane = laneEnds.findIndex((end) => end.to < part.from || (end.to === part.from && end.halfEnd && part.halfStart));
    if (lane < 0) { lane = laneEnds.length; laneEnds.push({ to: -1, halfEnd: false }); }
    laneEnds[lane] = { to: part.to, halfEnd: part.halfEnd };
    if (lane < maxLanes) segments.push({ ...part, lane });
    else for (let col = part.from; col <= part.to; col += 1) hidden[col] += 1;
  });
  return { segments, hidden };
}

/** A bar's position in its row of `cols` days (a week, or the timeline's month), as CSS percentages (half a column for a stay's ends). */
export function barBox(segment: Pick<Segment, 'from' | 'to' | 'halfStart' | 'halfEnd'>, cols = 7): { left: string; width: string } {
  const start = segment.from + (segment.halfStart ? 0.5 : 0);
  const end = segment.to + 1 - (segment.halfEnd ? 0.5 : 0);
  return { left: `${(start / cols) * 100}%`, width: `${(Math.max(0.35, end - start) / cols) * 100}%` };
}

/**
 * Search: entries whose guest, title, place, client or notes contain the
 * words, coming ones first (soonest first), then past ones (latest first).
 * A weekly note matches once, on its next date.
 */
export function searchItems(items: CalendarItem[], titleOf: (listingId: string | null) => string | undefined, query: string, today: string, limit = 8): CalendarItem[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length || query.trim().length < 2) return [];
  const text = (item: CalendarItem) => {
    const { source } = item;
    const extra = source.type === 'booking' ? [source.value.event_notes]
      : source.type === 'event' ? [source.value.client_name, source.value.notes]
      : source.type === 'table' ? [source.value.client_name, source.value.occasion] : [];
    return [item.title, titleOf(item.listingId), ...extra].filter(Boolean).join(' ').toLowerCase();
  };
  const seen = new Set<string>();
  const matches = items.filter((item) => words.every((w) => text(item).includes(w)));
  const coming = matches.filter((i) => i.end >= today).sort((a, b) => a.start.localeCompare(b.start));
  const past = matches.filter((i) => i.end < today).sort((a, b) => b.start.localeCompare(a.start));
  return [...coming, ...past].filter((item) => {
    const id = item.key.split(':')[0];
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  }).slice(0, limit);
}

// ---------- Week and day (the time grid) ----------

const addDays = (day: string, n: number) => new Date(Date.parse(`${day}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);

/** The Sunday-to-Saturday week around a day (it may cross two months). */
export function weekDays(day: string): string[] {
  const first = addDays(day, -new Date(`${day}T00:00:00Z`).getUTCDay());
  return Array.from({ length: 7 }, (_, i) => addDays(first, i));
}

const minutes = (clock: string) => {
  const match = /^(\d{2}):(\d{2})/.exec(clock.trim());
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
};

/** A timed entry's minutes from midnight; a table reservation (start only) takes an hour. */
export function timeSpan(item: Pick<CalendarItem, 'time' | 'block'>): { from: number; to: number } | null {
  const clock = item.time || item.block;
  if (!clock) return null;
  const [start, end] = clock.split('–');
  const from = minutes(start);
  if (from == null) return null;
  const to = end ? minutes(end) : null;
  return { from, to: to != null && to > from ? to : Math.min(from + 60, 1440) };
}

/** Timed entries (on the grid) and the rest (the all-day row, or the day's top). */
export const splitTimed = (items: CalendarItem[]) => ({
  timed: items.filter((i) => timeSpan(i) && i.start === i.end),
  allDay: items.filter((i) => !timeSpan(i) || i.start !== i.end),
});

export interface Placed { item: CalendarItem; from: number; to: number; col: number; cols: number }

/** A day's timed entries side by side where they overlap (each overlapping group shares the width). */
export function layoutTimes(items: CalendarItem[]): Placed[] {
  const spans = items
    .map((item) => ({ item, span: timeSpan(item) }))
    .filter((x): x is { item: CalendarItem; span: { from: number; to: number } } => Boolean(x.span))
    .sort((a, b) => a.span.from - b.span.from || b.span.to - a.span.to);
  const placed: Placed[] = [];
  let group: Placed[] = [];
  let groupEnd = -1;
  const close = () => { const cols = Math.max(1, ...group.map((p) => p.col + 1)); group.forEach((p) => { p.cols = cols; }); };
  spans.forEach(({ item, span }) => {
    if (span.from >= groupEnd) { close(); group = []; groupEnd = -1; }
    const taken = new Set(group.filter((p) => p.to > span.from).map((p) => p.col));
    let col = 0;
    while (taken.has(col)) col += 1;
    const entry = { item, from: span.from, to: span.to, col, cols: 1 };
    group.push(entry);
    placed.push(entry);
    groupEnd = Math.max(groupEnd, span.to);
  });
  close();
  return placed;
}

/** The hours the grid shows: from 06:00 (earlier when an entry starts earlier) to midnight. */
export function gridHours(items: CalendarItem[]): { start: number; end: number } {
  const earliest = Math.min(...items.map((i) => timeSpan(i)?.from ?? 1440));
  return { start: Math.max(0, Math.min(6, Math.floor(earliest / 60))), end: 24 };
}

/** The first and last day a view shows. */
export function visibleRange(mode: CalendarMode, focus: string): { from: string; to: string } {
  if (mode === 'day') return { from: focus, to: focus };
  if (mode === 'week') { const days = weekDays(focus); return { from: days[0], to: days[6] }; }
  const from = `${focus.slice(0, 7)}-01`;
  const [y, m] = focus.split('-').map(Number);
  return { from, to: `${focus.slice(0, 7)}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}` };
}

/** The months a range touches, as { year, month (0-11) }. */
export function monthsOf(from: string, to: string): Array<{ year: number; month: number }> {
  const months: Array<{ year: number; month: number }> = [];
  for (let y = Number(from.slice(0, 4)), m = Number(from.slice(5, 7)) - 1; `${y}-${String(m + 1).padStart(2, '0')}` <= to.slice(0, 7);) {
    months.push({ year: y, month: m });
    m += 1;
    if (m > 11) { m = 0; y += 1; }
  }
  return months;
}

/** Two or more months' calendars as one (a week across two months); each entry once. */
export function mergeData(parts: HostCalendarData[]): HostCalendarData {
  if (parts.length === 1) return parts[0];
  const once = <T>(lists: T[][], key: (value: T) => string) => {
    const seen = new Map<string, T>();
    lists.flat().forEach((value) => { if (!seen.has(key(value))) seen.set(key(value), value); });
    return Array.from(seen.values());
  };
  return {
    listings: parts[0].listings,
    bookings: once(parts.map((p) => p.bookings), (b) => b.id),
    closed: once(parts.map((p) => p.closed), (c) => `${c.listing_id}:${c.start_date}:${c.end_date}`),
    events: once(parts.map((p) => p.events), (e) => `${e.id}:${e.start_date}`),
    tables: once(parts.map((p) => p.tables), (t) => t.id),
    leases: once(parts.map((p) => p.leases), (l) => l.id),
    outcomes: once(parts.map((p) => p.outcomes), (o) => o.id),
    prices: once(parts.map((p) => p.prices), (p) => `${p.listing_id}:${p.start_date}`),
  };
}

/**
 * The first view, before the host picks one: Day on phones and for property,
 * office and shop hosts (viewings and move-ins), Week for venues (hours),
 * Month for stays and hotels.
 */
export function defaultMode(listings: CalendarListing[], phone: boolean): CalendarMode {
  if (phone || (listings.length > 0 && listings.every((l) => l.planner))) return 'day';
  if (listings.length > 0 && listings.every((l) => l.category === 'venue')) return 'week';
  return 'month';
}

// ---------- Remembered choices ----------

export type CalendarMode = 'day' | 'week' | 'month' | 'timeline';
export const MODES: readonly CalendarMode[] = ['day', 'week', 'month', 'timeline'];
const MODE_KEY = 'varoom:calendar:view:v1:';

/** The host's last view on this device, or null (then defaultMode decides). */
export function savedMode(hostId: string): CalendarMode | null {
  try {
    const value = typeof window === 'undefined' ? null : window.localStorage.getItem(MODE_KEY + hostId);
    return MODES.includes(value as CalendarMode) ? value as CalendarMode : null;
  } catch {
    return null;
  }
}
export function saveMode(hostId: string, mode: CalendarMode): void {
  try { window.localStorage.setItem(MODE_KEY + hostId, mode); } catch { /* private mode: not remembered */ }
}

const WIDE_KEY = 'varoom:calendar:wide:v1';
/** Whether the host hid the right column on this device (the calendar then takes its room). */
export function savedWide(): boolean {
  try { return typeof window !== 'undefined' && window.localStorage.getItem(WIDE_KEY) === '1'; } catch { return false; }
}
export function saveWide(wide: boolean): void {
  try { if (wide) window.localStorage.setItem(WIDE_KEY, '1'); else window.localStorage.removeItem(WIDE_KEY); } catch { /* private mode: not remembered */ }
}
