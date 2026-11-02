import type { Booking } from './format';
import type { BookingReview } from './clientBookings';

// In-memory snapshot of the client's loaded bookings, kept for the session so
// returning to Bookings, or opening a booking's detail page, renders at once
// and refreshes in the background. Keyed by user id and cleared on sign-out
// or account change (lib/auth/clearUserData.ts). Never written to storage.

export const BOOKINGS_STALE_MS = 60 * 1000;

export interface ClientBookingsSnapshot {
  userId: string;
  bookings: Booking[];
  reviewedIds: string[];
  /** Rows loaded so far (the next page starts here). */
  offset: number;
  hasMore: boolean;
  fetchedAt: number;
}

let snapshot: ClientBookingsSnapshot | null = null;
const reviews = new Map<string, BookingReview | null>();

export function getClientBookings(userId: string): ClientBookingsSnapshot | null {
  return snapshot && snapshot.userId === userId ? snapshot : null;
}

export function setClientBookings(next: ClientBookingsSnapshot): void {
  if (snapshot && snapshot.userId !== next.userId) reviews.clear();
  snapshot = next;
}

/** Apply a change to one cached booking (cancel, review) without a refetch. */
export function updateCachedBooking(userId: string, bookingId: string, change: Partial<Booking>): void {
  if (!snapshot || snapshot.userId !== userId) return;
  snapshot = { ...snapshot, bookings: snapshot.bookings.map((b) => (b.id === bookingId ? { ...b, ...change } : b)) };
}

export function markCachedReviewed(userId: string, bookingId: string, review: BookingReview | null): void {
  reviews.set(bookingId, review);
  if (!snapshot || snapshot.userId !== userId || snapshot.reviewedIds.includes(bookingId)) return;
  snapshot = { ...snapshot, reviewedIds: [...snapshot.reviewedIds, bookingId] };
}

export function findCachedBooking(userId: string, bookingId: string): Booking | null {
  const cached = getClientBookings(userId);
  return (cached && cached.bookings.find((b) => b.id === bookingId)) || null;
}

/** A loaded review (null = known to have none); undefined when not loaded. */
export function getCachedReview(bookingId: string): BookingReview | null | undefined {
  return reviews.has(bookingId) ? reviews.get(bookingId) : undefined;
}

export function setCachedReview(bookingId: string, review: BookingReview | null): void {
  reviews.set(bookingId, review);
}

export function clearBookingsCache(): void {
  snapshot = null;
  reviews.clear();
}
