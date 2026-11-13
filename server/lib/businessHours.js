'use strict';

// Chat Settings → Business hours: a host with them switched on is away (the
// away message, then Elie) outside the hours set for each day, in Nairobi
// time (UTC+3, no daylight saving). Away mode switched on is away at any time.
// Schedule: { enabled, days: [Sunday … Saturday] of { open: 'HH:MM', close: 'HH:MM' } or null (closed) }.
// Hours may pass midnight (close before open). Mirrors client/lib/chat/businessHours.ts.

const NAIROBI_OFFSET_MS = 3 * 60 * 60 * 1000;

const minutesOf = (time) => (typeof time === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(time) ? Number(time.slice(0, 2)) * 60 + Number(time.slice(3)) : null);

/** The day's hours as minutes, or null when closed or unreadable. */
function hours(schedule, day) {
  const entry = schedule.days[day];
  if (!entry) return null;
  const open = minutesOf(entry.open);
  const close = minutesOf(entry.close);
  return open === null || close === null || open === close ? null : { open, close };
}

/** True when business hours are on and `now` falls outside them. */
function outsideBusinessHours(schedule, now = Date.now()) {
  if (!schedule || schedule.enabled !== true || !Array.isArray(schedule.days) || schedule.days.length !== 7) return false;
  const local = new Date(now + NAIROBI_OFFSET_MS);
  const day = local.getUTCDay();
  const minute = local.getUTCHours() * 60 + local.getUTCMinutes();
  const today = hours(schedule, day);
  const yesterday = hours(schedule, (day + 6) % 7);
  const openToday = today && (today.open < today.close ? minute >= today.open && minute < today.close : minute >= today.open);
  const openFromYesterday = yesterday && yesterday.open > yesterday.close && minute < yesterday.close;
  return !(openToday || openFromYesterday);
}

/** The host is away: Away mode on, or outside their business hours. */
function hostAwayNow(profile, now = Date.now()) {
  return Boolean(profile && (profile.away_mode === true || outsideBusinessHours(profile.away_schedule, now)));
}

module.exports = { NAIROBI_OFFSET_MS, outsideBusinessHours, hostAwayNow };
