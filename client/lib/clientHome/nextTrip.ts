import type { ProfileBooking } from '../profile/profilePage';
import type { SavedListing } from '../bookmarks/bookmarks';

// Client Home's "Your next trip" card (replaces "Popular destinations" in
// the desktop rail): the next booked or requested stay; without one, the
// latest saved listings; without those, a way into the Marketplace.

export type NextTripView =
  | { kind: 'loading' }
  | { kind: 'trip'; booking: ProfileBooking }
  | { kind: 'saved'; listings: SavedListing[] }
  | { kind: 'explore' };

/** Saved listings shown when there is no trip. */
export const SAVED_PREVIEW = 4;

/** Only approved and still-pending stays count as a next trip. */
export function nextTrip(upcoming: ProfileBooking[]): ProfileBooking | null {
  return upcoming.find((booking) => booking.status === 'approved' || booking.status === 'pending') || null;
}

/**
 * `upcoming` is null until loaded; `saved` is null until loaded (it is read
 * only when there is no trip).
 */
export function nextTripView(upcoming: ProfileBooking[] | null, saved: SavedListing[] | null): NextTripView {
  if (upcoming === null) return { kind: 'loading' };
  const trip = nextTrip(upcoming);
  if (trip) return { kind: 'trip', booking: trip };
  if (saved === null) return { kind: 'loading' };
  return saved.length ? { kind: 'saved', listings: saved.slice(0, SAVED_PREVIEW) } : { kind: 'explore' };
}

/** "In 3 days", "Tomorrow", "Today", or "" when the date is unknown or past. */
export function startsIn(startDate: string | null, now: Date = new Date()): string {
  if (!startDate) return '';
  const start = new Date(`${startDate.slice(0, 10)}T00:00:00`);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const days = Math.round((start.getTime() - today.getTime()) / 86400000);
  if (!Number.isFinite(days) || days < 0) return '';
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  return `In ${days} days`;
}
