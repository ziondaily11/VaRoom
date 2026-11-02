import { useCallback, useEffect, useRef, useState } from 'react';
import { getSupabaseClient } from '../../lib/supabase/client';
import {
  applyExpiry, BOOKINGS_PAGE_SIZE, expirePendingBookings, fetchClientBookingPage, type BookingReview,
} from '../../lib/bookings/clientBookings';
import {
  BOOKINGS_STALE_MS, getClientBookings, markCachedReviewed, setClientBookings, updateCachedBooking, type ClientBookingsSnapshot,
} from '../../lib/bookings/bookingsCache';
import type { Booking } from '../../lib/bookings/format';

// The signed-in client's bookings, loaded a page at a time. A snapshot from
// this session renders at once and is refreshed in the background when it is
// older than a minute; requests are never duplicated while one is in flight.

export interface ClientBookingsState {
  bookings: Booking[];
  reviewedIds: string[];
  hasMore: boolean;
  /** First load in progress with nothing to show yet. */
  initialLoading: boolean;
  loadingMore: boolean;
  error: string | null;
  loadMoreError: string | null;
}

const message = (error: unknown) => (error as { message?: string })?.message || 'Please try again.';

export function useClientBookings(userId: string | null) {
  const cached = userId ? getClientBookings(userId) : null;
  const [snapshot, setSnapshot] = useState<ClientBookingsSnapshot | null>(cached);
  const [initialLoading, setInitialLoading] = useState(!cached);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadMoreError, setLoadMoreError] = useState<string | null>(null);
  const inFlight = useRef<Promise<ClientBookingsSnapshot | null> | null>(null);
  const snapshotRef = useRef(snapshot);
  snapshotRef.current = snapshot;

  const commit = useCallback((next: ClientBookingsSnapshot) => {
    setClientBookings(next);
    snapshotRef.current = next;
    setSnapshot(next);
  }, []);

  // First load, or a background refresh of everything already shown.
  useEffect(() => {
    if (!userId) return undefined;
    const client = getSupabaseClient();
    if (!client) return undefined;
    let cancelled = false;
    const current = getClientBookings(userId);
    if (current) {
      setSnapshot(current);
      setInitialLoading(false);
    } else {
      setSnapshot(null);
      setInitialLoading(true);
    }
    // The 48-hour sweep runs in the background; the list already shows those
    // requests as expired.
    expirePendingBookings(client, userId).catch(() => { /* Retried on the next visit. */ });
    if (current && Date.now() - current.fetchedAt < BOOKINGS_STALE_MS) return () => { cancelled = true; };

    const limit = Math.max(current ? current.offset : 0, BOOKINGS_PAGE_SIZE);
    const request = fetchClientBookingPage(client, userId, 0, limit).then((page) => {
      const next = { userId, bookings: applyExpiry(page.bookings), reviewedIds: page.reviewedIds, offset: page.bookings.length, hasMore: page.hasMore, fetchedAt: Date.now() };
      if (!cancelled) commit(next);
      else setClientBookings(next);
      return next;
    });
    inFlight.current = request.catch(() => null);
    request.catch((loadError) => {
      // Keep showing the cached list when a background refresh fails.
      if (!cancelled && !current) setError(message(loadError));
    }).finally(() => {
      if (!cancelled) setInitialLoading(false);
      inFlight.current = null;
    });
    return () => { cancelled = true; };
  }, [userId, commit]);

  /** Load the next page; resolves the snapshot after it (null on failure). */
  const loadMore = useCallback(async (): Promise<ClientBookingsSnapshot | null> => {
    if (inFlight.current) return inFlight.current;
    const current = snapshotRef.current;
    const client = getSupabaseClient();
    if (!client || !userId || !current || !current.hasMore) return current;
    setLoadingMore(true);
    setLoadMoreError(null);
    const request = fetchClientBookingPage(client, userId, current.offset).then((page) => {
      const known = new Set(current.bookings.map((b) => b.id));
      const next = {
        ...current,
        bookings: [...current.bookings, ...applyExpiry(page.bookings).filter((b) => !known.has(b.id))],
        reviewedIds: Array.from(new Set([...current.reviewedIds, ...page.reviewedIds])),
        offset: current.offset + page.bookings.length,
        hasMore: page.hasMore,
      };
      commit(next);
      return next;
    }, (loadError) => {
      setLoadMoreError(message(loadError));
      return null;
    }).finally(() => {
      setLoadingMore(false);
      inFlight.current = null;
    });
    inFlight.current = request;
    return request;
  }, [userId, commit]);

  /** Load pages until the booking is found or there are no more (deep links). */
  const ensureLoaded = useCallback(async (bookingId: string): Promise<{ found: boolean; error: string | null }> => {
    if (inFlight.current) await inFlight.current;
    let current = snapshotRef.current;
    while (current && !current.bookings.some((b) => b.id === bookingId) && current.hasMore) {
      const next = await loadMore();
      if (!next) return { found: false, error: 'load' };
      current = next;
    }
    return { found: Boolean(current && current.bookings.some((b) => b.id === bookingId)), error: null };
  }, [loadMore]);

  const updateBooking = useCallback((bookingId: string, change: Partial<Booking>) => {
    if (!userId) return;
    updateCachedBooking(userId, bookingId, change);
    const next = getClientBookings(userId);
    if (next) { snapshotRef.current = next; setSnapshot(next); }
  }, [userId]);

  const markReviewed = useCallback((bookingId: string, review: BookingReview | null) => {
    if (!userId) return;
    markCachedReviewed(userId, bookingId, review);
    const next = getClientBookings(userId);
    if (next) { snapshotRef.current = next; setSnapshot(next); }
  }, [userId]);

  const state: ClientBookingsState = {
    bookings: snapshot ? snapshot.bookings : [],
    reviewedIds: snapshot ? snapshot.reviewedIds : [],
    hasMore: snapshot ? snapshot.hasMore : false,
    initialLoading,
    loadingMore,
    error,
    loadMoreError,
  };
  return { state, loadMore, ensureLoaded, updateBooking, markReviewed };
}
