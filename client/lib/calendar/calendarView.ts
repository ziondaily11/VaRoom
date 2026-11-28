import type { CalendarBooking, CalendarEvent, CalendarListing, HostCalendarData, LeaseEntry, OutcomeEntry, TableBooking } from './hostCalendar';

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
  title: string;
  /** The host's own colour for an event, else the place's colour. */
  color: string | null;
  source: ItemSource;
}

const OUTCOME_WORD = { sold: 'Sold', rented: 'Rented', leased: 'Leased' } as const;
const range = (from: string | null | undefined, to: string | null | undefined) => (from && to ? `${from}–${to}` : null);

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
    items.push({
      key: `b${b.id}`, kind: b.status === 'pending' ? 'request' : 'booking', listingId: b.listing_id,
      start: b.start_date, end: b.end_date || b.start_date, halfStart: nightly, halfEnd: nightly,
      time: range(b.start_time, b.end_time), title: b.guest || 'Guest', color: null, source: { type: 'booking', value: b },
    });
  });
  data.events.filter((e) => !e.listing_id || ids.has(e.listing_id)).forEach((e) => {
    const kind: ItemKind = e.source === 'ical' ? 'other' : e.blocks ? 'offline' : e.viewing ? 'viewing' : 'note';
    items.push({
      key: `e${e.id}:${e.start_date}`, kind, listingId: e.listing_id, start: e.start_date, end: e.end_date, halfStart: false, halfEnd: false,
      time: range(e.start_time, e.end_time), title: e.title, color: e.source === 'ical' ? null : e.color, source: { type: 'event', value: e },
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
  const hidden = Array.from({ length: 7 }, () => 0);
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

/** A bar's position in its week row, as CSS percentages (half a column for a stay's ends). */
export function barBox(segment: Pick<Segment, 'from' | 'to' | 'halfStart' | 'halfEnd'>): { left: string; width: string } {
  const start = segment.from + (segment.halfStart ? 0.5 : 0);
  const end = segment.to + 1 - (segment.halfEnd ? 0.5 : 0);
  return { left: `${(start / 7) * 100}%`, width: `${(Math.max(0.35, end - start) / 7) * 100}%` };
}

// ---------- Remembered choices ----------

export type CalendarMode = 'month' | 'timeline';
const MODE_KEY = 'varoom:calendar:view:v1:';

/** The host's last view on this device, else Month. */
export function savedMode(hostId: string): CalendarMode {
  try {
    const value = typeof window === 'undefined' ? null : window.localStorage.getItem(MODE_KEY + hostId);
    return value === 'timeline' ? 'timeline' : 'month';
  } catch {
    return 'month';
  }
}
export function saveMode(hostId: string, mode: CalendarMode): void {
  try { window.localStorage.setItem(MODE_KEY + hostId, mode); } catch { /* private mode: not remembered */ }
}
