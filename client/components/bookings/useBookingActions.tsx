import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '../../lib/auth/AuthProvider';
import { getSupabaseClient } from '../../lib/supabase/client';
import { getListingFeedCache } from '../../lib/listingFeedCache';
import { cancelClientBooking, openBookingConversation } from '../../lib/bookings/clientBookings';
import { updateCachedBooking } from '../../lib/bookings/bookingsCache';
import type { Booking } from '../../lib/bookings/format';

// Client booking actions shared by the Bookings list, its rail and the phone
// booking details page, plus the page toast that reports their outcome.

const TOAST_MS = 2200;

export function useToast() {
  const [state, setState] = useState({ message: '', shown: false });
  const timer = useRef<number | null>(null);
  useEffect(() => () => { if (timer.current) window.clearTimeout(timer.current); }, []);
  const show = useCallback((message: string) => {
    if (timer.current) window.clearTimeout(timer.current);
    setState({ message, shown: true });
    timer.current = window.setTimeout(() => setState((current) => ({ ...current, shown: false })), TOAST_MS);
  }, []);
  const element = <div className={`toast${state.shown ? ' show' : ''}`} role="status" aria-live="polite">{state.message}</div>;
  return { show, element };
}

const errorText = (error: unknown) => (error instanceof Error ? error.message : (error as { message?: string })?.message) || 'Please try again.';

export function useBookingActions(showToast: (message: string) => void, onCancelled?: (bookingId: string) => void) {
  const router = useRouter();
  const { user, profile } = useAuth();
  const userId = user?.id || null;
  const guestName = profile?.full_name || null;

  const cancel = useCallback(async (booking: Booking) => {
    const client = getSupabaseClient();
    if (!client || !userId) {
      showToast("Couldn't cancel this booking: please sign in again.");
      throw new Error('Not signed in');
    }
    try {
      await cancelClientBooking(client, { booking, userId });
    } catch (error) {
      showToast(`Couldn't cancel this booking: ${errorText(error)}`);
      throw error;
    }
    updateCachedBooking(userId, booking.id, { status: 'cancelled' });
    getListingFeedCache()?.invalidateAll();
    showToast('Booking cancelled.');
    onCancelled?.(booking.id);
  }, [userId, showToast, onCancelled]);

  const messageHost = useCallback(async (booking: Booking) => {
    const listingId = booking.listing?.id;
    const hostId = booking.host?.id;
    if (!userId || !listingId || !hostId) {
      showToast("Couldn't open that chat: booking details are incomplete.");
      return;
    }
    try {
      router.push(await openBookingConversation(listingId));
    } catch (error) {
      showToast(`Couldn't open that chat: ${errorText(error)}`);
    }
  }, [userId, showToast, router]);

  return { cancel, messageHost };
}
