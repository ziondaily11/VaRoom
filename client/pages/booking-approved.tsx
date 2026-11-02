import React, { useCallback, useEffect, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useAuth } from '../lib/auth/AuthProvider';
import { getSupabaseClient } from '../lib/supabase/client';
import { loginUrl } from '../lib/safeRedirect';
import { fetchBookingReview, fetchOwnBooking, type BookingReview } from '../lib/bookings/clientBookings';
import { findCachedBooking, getClientBookings, markCachedReviewed, setCachedReview } from '../lib/bookings/bookingsCache';
import type { Booking } from '../lib/bookings/format';
import BookingDetail from '../components/bookings/BookingDetail';
import { useBookingActions, useToast } from '../components/bookings/useBookingActions';
import { usePhoneLayout, wasOpenedFromList } from '../components/bookings/usePhoneLayout';
import { BOOKINGS_STYLES } from '../components/bookings/bookingsStyles';

// Booking details on phones (migrated from legacy-pages/booking-approved.html):
// /booking-approved?id=…. Larger screens show the same details in the
// Bookings right rail, so this page hands over to /bookings?booking=… there,
// including when the window is widened while it is open.

type PageState =
  | { kind: 'loading' }
  | { kind: 'status'; title: string; text: string }
  | { kind: 'ready'; booking: Booking; reviewed: boolean };

function queryValue(value: string | string[] | undefined): string | null {
  return typeof value === 'string' && value ? value : null;
}

export default function BookingApprovedPage() {
  const router = useRouter();
  const { status, user, profile } = useAuth();
  const phone = usePhoneLayout();
  const toast = useToast();
  const bookingId = queryValue(router.query.id);
  const userId = user?.id || null;

  const [state, setState] = useState<PageState>(() => ({ kind: 'loading' }));

  // Laptops and desktops show booking details in the Bookings rail.
  useEffect(() => {
    if (!router.isReady || phone !== false) return;
    if (bookingId && wasOpenedFromList(bookingId)) router.back();
    else router.replace(bookingId ? `/bookings?booking=${encodeURIComponent(bookingId)}` : '/bookings');
  }, [router, router.isReady, phone, bookingId]);

  useEffect(() => {
    if (!router.isReady || status === 'loading' || phone !== true) return undefined;
    if (status === 'signed-out' || !userId) {
      router.replace(loginUrl(router.asPath));
      return undefined;
    }
    if (!bookingId) {
      setState({ kind: 'status', title: 'No booking specified', text: "We couldn't find which booking you meant to open." });
      return undefined;
    }
    // A booking already loaded by the Bookings list renders at once.
    const cached = findCachedBooking(userId, bookingId);
    const snapshot = getClientBookings(userId);
    if (cached && snapshot) setState({ kind: 'ready', booking: cached, reviewed: snapshot.reviewedIds.includes(bookingId) });

    const client = getSupabaseClient();
    if (!client) return undefined;
    let cancelled = false;
    Promise.all([
      fetchOwnBooking(client, bookingId, userId),
      fetchBookingReview(client, bookingId).catch(() => null),
    ]).then(([result, review]) => {
      if (cancelled) return;
      if (result.kind === 'missing') setState({ kind: 'status', title: "Couldn't load this booking", text: 'It may have been removed.' });
      else if (result.kind === 'not-yours') setState({ kind: 'status', title: "This isn't your booking", text: 'You can only view booking requests you made yourself.' });
      else {
        setCachedReview(bookingId, review);
        setState({ kind: 'ready', booking: result.booking, reviewed: Boolean(review) });
      }
    });
    return () => { cancelled = true; };
  }, [router, router.isReady, status, userId, bookingId, phone]);

  const onCancelled = useCallback(() => {
    setState((current) => (current.kind === 'ready' ? { ...current, booking: { ...current.booking, status: 'cancelled' } } : current));
  }, []);
  const { cancel, messageHost } = useBookingActions(toast.show, onCancelled);
  const onReviewed = useCallback((id: string, review: BookingReview | null) => {
    if (userId) markCachedReviewed(userId, id, review);
    setState((current) => (current.kind === 'ready' ? { ...current, reviewed: true } : current));
  }, [userId]);

  const backToList = (event: React.MouseEvent<HTMLAnchorElement>) => {
    if (bookingId && wasOpenedFromList(bookingId) && !event.metaKey && !event.ctrlKey && !event.shiftKey) {
      event.preventDefault();
      router.back();
    }
  };

  const showBackButton = state.kind === 'status' || (state.kind === 'ready' && state.booking.status !== 'approved');

  return (
    <>
      <Head>
        <title>Booking Approved — VaRoom</title>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,600;0,9..144,700;0,9..144,900&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
      </Head>
      <style dangerouslySetInnerHTML={{ __html: BOOKINGS_STYLES }} />
      <div className="bookings-page booking-approved-page">
        {toast.element}
        <header className="ba-header">
          <div className="ba-logo"><span className="va">Va</span><span className="room">Room</span></div>
          <Link href="/bookings" className="ba-back" onClick={backToList}>‹ Back to bookings</Link>
        </header>
        <main className="ba-main">
          {state.kind === 'loading' && <p className="ba-checking">Loading your booking…</p>}
          {state.kind !== 'loading' && (
            <div className="booking-detail-panel">
              <div className="booking-detail-content">
                {state.kind === 'status'
                  ? <div className="booking-detail-status"><h2>{state.title}</h2><p>{state.text}</p></div>
                  : (
                    <BookingDetail
                      booking={state.booking}
                      viewerName={profile?.full_name || null}
                      reviewed={state.reviewed}
                      actions={{ onCancel: cancel, onMessageHost: messageHost, onReviewed }}
                    />
                  )}
              </div>
              {showBackButton && (
                <div className="ba-state-actions">
                  <Link href="/bookings" className="bk-btn bk-btn-solid" onClick={backToList}>Back to bookings</Link>
                </div>
              )}
            </div>
          )}
        </main>
      </div>
    </>
  );
}

// The app's mobile navigation shows here (MobileNav treats it as Bookings).
(BookingApprovedPage as unknown as { appNavigation: boolean }).appNavigation = true;
