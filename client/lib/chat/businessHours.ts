// Chat Settings → Business hours: a host with them switched on is away (the
// away message, then Elie) outside the hours set for each day, in Nairobi
// time (UTC+3, no daylight saving). Hours may pass midnight (close before
// open). Mirrors server/lib/businessHours.js, which decides for auto-reply.

export interface DayHours { open: string; close: string }

export interface BusinessHours {
  enabled: boolean;
  /** Sunday … Saturday; null is closed (away all day). */
  days: (DayHours | null)[];
}

const NAIROBI_OFFSET_MS = 3 * 60 * 60 * 1000;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Monday first, as the editor lists them: [label, index in `days`]. */
export const WEEK: [string, number][] = [['Mon', 1], ['Tue', 2], ['Wed', 3], ['Thu', 4], ['Fri', 5], ['Sat', 6], ['Sun', 0]];

/** Switched off; when switched on, Monday to Saturday 8am to 8pm, Sunday closed. */
export const DEFAULT_BUSINESS_HOURS: BusinessHours = {
  enabled: false,
  days: [null, ...Array.from({ length: 6 }, () => ({ open: '08:00', close: '20:00' }))],
};

/** A stored schedule, or the default when missing or unreadable. */
export function readBusinessHours(value: unknown): BusinessHours {
  const v = value as Partial<BusinessHours> | null;
  if (!v || !Array.isArray(v.days) || v.days.length !== 7) return DEFAULT_BUSINESS_HOURS;
  return {
    enabled: v.enabled === true,
    days: v.days.map((d) => (d && TIME.test(d.open) && TIME.test(d.close) ? { open: d.open, close: d.close } : null)),
  };
}

const minutes = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3));
function hours(schedule: BusinessHours, day: number): { open: number; close: number } | null {
  const d = schedule.days[day];
  return d && d.open !== d.close ? { open: minutes(d.open), close: minutes(d.close) } : null;
}

/** True when business hours are on and `now` falls outside them. */
export function outsideBusinessHours(schedule: BusinessHours, now = Date.now()): boolean {
  if (!schedule.enabled) return false;
  const local = new Date(now + NAIROBI_OFFSET_MS);
  const day = local.getUTCDay();
  const minute = local.getUTCHours() * 60 + local.getUTCMinutes();
  const today = hours(schedule, day);
  const yesterday = hours(schedule, (day + 6) % 7);
  const openToday = Boolean(today && (today.open < today.close ? minute >= today.open && minute < today.close : minute >= today.open));
  const openFromYesterday = Boolean(yesterday && yesterday.open > yesterday.close && minute < yesterday.close);
  return !(openToday || openFromYesterday);
}
