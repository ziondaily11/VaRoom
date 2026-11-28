// A listing's calendar link (iCal) for other sites to read (Airbnb.com,
// Booking.com, Google Calendar). It lists the days guests can't book on
// VaRoom, as "Not available" and nothing else: closed and full days within the
// booking window, and an hourly venue's taken times. Built from listing_ical
// (migration 000093), which carries dates only.

export interface IcalSource {
  title: string;
  /** The booking window, in days from today. */
  ahead: number;
  calendar: { open?: string[]; booked?: Array<{ night: string; left: number }>; slots?: Array<{ day: string; from: number; to: number }> };
}

const NAIROBI_OFFSET_MS = 3 * 3600 * 1000;
const addDays = (day: string, n: number) => new Date(Date.parse(`${day}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
const compact = (day: string) => day.replace(/-/g, '');
const stamp = (date: Date) => `${date.toISOString().replace(/[-:]/g, '').slice(0, 15)}Z`;

/** Today in Nairobi. */
export const nairobiToday = (now: Date = new Date()) => new Date(now.getTime() + NAIROBI_OFFSET_MS).toISOString().slice(0, 10);

/** Days in the booking window that aren't open, or are full. */
export function unavailableDays(source: IcalSource, today: string): string[] {
  const open = new Set(source.calendar.open || []);
  const last = addDays(today, Math.max(0, Number(source.ahead) || 365));
  const days = new Set<string>();
  for (let day = today; day <= last; day = addDays(day, 1)) if (!open.has(day)) days.add(day);
  (source.calendar.booked || []).forEach((b) => { if (b.left <= 0 && b.night >= today && b.night <= last) days.add(b.night); });
  return Array.from(days).sort();
}

/** Consecutive days as [first, day after the last] (iCal whole-day events end on the next day). */
export function dayRanges(days: string[]): Array<[string, string]> {
  const ranges: Array<[string, string]> = [];
  days.forEach((day) => {
    const lastRange = ranges[ranges.length - 1];
    if (lastRange && lastRange[1] === day) lastRange[1] = addDays(day, 1);
    else ranges.push([day, addDays(day, 1)]);
  });
  return ranges;
}

const escapeText = (text: string) => text.replace(/\\/g, '\\\\').replace(/[,;]/g, (c) => `\\${c}`).replace(/\r?\n/g, '\\n');

/** Lines longer than 75 bytes continue on the next line after a space (RFC 5545). */
function fold(line: string): string {
  const bytes = Buffer.from(line, 'utf8');
  if (bytes.length <= 75) return line;
  const parts: string[] = [];
  let rest = line;
  while (Buffer.byteLength(rest, 'utf8') > 75) {
    let cut = 75;
    while (Buffer.byteLength(rest.slice(0, cut), 'utf8') > 75) cut -= 1;
    parts.push(rest.slice(0, cut));
    rest = rest.slice(cut);
  }
  parts.push(rest);
  return parts.join('\r\n ');
}

export function buildIcs(source: IcalSource, now: Date = new Date()): string {
  const today = nairobiToday(now);
  const days = unavailableDays(source, today);
  const blocked = new Set(days);
  const created = stamp(now);
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//VaRoom//Calendar//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeText(`VaRoom · ${source.title || 'Listing'}`)}`];
  dayRanges(days).forEach(([first, after]) => {
    lines.push('BEGIN:VEVENT', `UID:vr-${compact(first)}-${compact(after)}@varoom.co.ke`, `DTSTAMP:${created}`,
      `DTSTART;VALUE=DATE:${compact(first)}`, `DTEND;VALUE=DATE:${compact(after)}`, 'SUMMARY:Not available (VaRoom)', 'TRANSP:OPAQUE', 'END:VEVENT');
  });
  // An hourly venue's taken times, on days that are otherwise open.
  (source.calendar.slots || []).forEach((slot) => {
    if (blocked.has(slot.day) || slot.day < today) return;
    const at = (minutes: number) => stamp(new Date(Date.parse(`${slot.day}T00:00:00Z`) + minutes * 60000 - NAIROBI_OFFSET_MS));
    lines.push('BEGIN:VEVENT', `UID:vr-${compact(slot.day)}-${slot.from}-${slot.to}@varoom.co.ke`, `DTSTAMP:${created}`,
      `DTSTART:${at(slot.from)}`, `DTEND:${at(slot.to)}`, 'SUMMARY:Not available (VaRoom)', 'TRANSP:OPAQUE', 'END:VEVENT');
  });
  lines.push('END:VCALENDAR');
  return `${lines.map(fold).join('\r\n')}\r\n`;
}
