import React, { useCallback, useEffect, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import Router, { useRouter } from 'next/router';
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
import { BackIcon } from '../components/bookings/BookingIcons';
import { ownBookingHref } from '../lib/bookings/links';

// Booking details on phones (migrated from legacy-pages/booking-approved.html):
// /booking-approved?id=…. Every status shows the full details (BookingDetail);
// a top bar leads back to Bookings. Larger screens show the same details in the
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
      Router.replace(loginUrl(Router.asPath));
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
    // Not this render's router: opening the map card (?map=) must not load the booking again.
  }, [router.isReady, status, userId, bookingId, phone]);

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

  // A booking that can't be shown (missing, not yours) offers the way back as a button too.
  const showBackButton = state.kind === 'status';
  // Hosts keep their own stays under Bookings → My trips.
  const listHref = ownBookingHref(null, profile?.role === 'host');

  return (
    <>
      <Head>
        <title>Booking details · VaRoom</title>
      </Head>
      <style dangerouslySetInnerHTML={{ __html: BOOKINGS_STYLES }} />
      <div className="bookings-page booking-approved-page">
        {toast.element}
        <header className="ba-header">
          <Link href={listHref} className="ba-back" aria-label="Back to bookings" onClick={backToList}><BackIcon /></Link>
          <h1 className="ba-title">Booking details</h1>
          <span aria-hidden="true" />
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
                  <Link href={listHref} className="bk-btn bk-btn-solid" onClick={backToList}>Back to bookings</Link>
                </div>
              )}
            </div>
          )}
        </main>
      </div>
    </>
  );
}

