import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useAuth } from '../../lib/auth/AuthProvider';
import { getSupabaseClient } from '../../lib/supabase/client';
import { resolveAvatarUrl, resolveStoredPhotoUrl, PHOTO_WIDTH } from '../resolveStoredPhotoUrl';
import {
  calendarMonth, clientTab, computeStats, describeDates, endMoment, formatAmount, initial, isCancellable, perUnit, statusLabel,
  type Booking, type ClientTab,
} from '../../lib/bookings/format';
import { BackIcon, CardIcon, MessageIcon } from './BookingIcons';
import BookingDetail from './BookingDetail';
import ReviewModal from './ReviewModal';
import { useClientBookings } from './useClientBookings';
import { useBookingActions } from './useBookingActions';
import { markOpenedFromList, usePhoneLayout } from './usePhoneLayout';

// The client's Bookings (migrated from legacy-pages/bookings.html): Upcoming
// (approved stays still to come and requests awaiting approval), Past and
// Cancelled tabs with infinite loading, and the right rail with the stats
// summary and calendar, or a booking's details. Phones open details on
// /booking-approved; every larger screen opens them in the rail.

const TABS: Array<{ key: ClientTab; label: string; empty: string }> = [
  { key: 'upcoming', label: 'Upcoming Bookings', empty: 'No upcoming bookings — your next confirmed stay will show up here.' },
  { key: 'past', label: 'Past Stays', empty: 'No past stays yet.' },
  { key: 'cancelled', label: 'Cancelled', empty: 'Nothing cancelled or expired.' },
];
const DOWS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

function BookingSkeleton() {
  return (
    <div className="booking-card booking-skeleton" aria-hidden="true">
      <div className="bk-thumb skeleton-block" />
      <div className="bk-main">
        <div className="bk-top-row"><div><div className="bk-title skeleton-block" /><div className="bk-loc skeleton-block" /></div><span className="bk-status skeleton-block" /></div>
        <div className="bk-meta"><span className="skeleton-block" /></div>
        <div className="bk-price"><span className="skeleton-block" /></div>
        <div className="bk-bottom-row">
          <div className="bk-host"><div className="bk-host-avatar skeleton-block" /><div className="bk-host-name skeleton-block" /></div>
          <div className="bk-msg-link skeleton-block" />
          <div className="bk-actions"><span className="skeleton-block" /><span className="skeleton-block" /></div>
        </div>
      </div>
    </div>
  );
}

interface CardProps {
  booking: Booking;
  tab: ClientTab;
  reviewed: boolean;
  now: Date;
  onCancel: (booking: Booking) => void;
  onReview: (booking: Booking) => void;
  onMessage: (booking: Booking) => void;
  onDetails: (event: React.MouseEvent<HTMLAnchorElement>, booking: Booking) => void;
}

function BookingCard({ booking, tab, reviewed, now, onCancel, onReview, onMessage, onDetails }: CardProps) {
  const client = getSupabaseClient();
  const listing = booking.listing || {};
  const host = booking.host || {};
  const photo = (listing.listing_photos || [])[0];
  const photoUrl = photo && photo.storage_path ? resolveStoredPhotoUrl(photo.storage_path, 'listing-photos', client, PHOTO_WIDTH.thumb) : null;
  const avatarUrl = resolveAvatarUrl(host.avatar_url, client);
  const canReview = tab === 'past' && endMoment(booking) < now;
  return (
    <div className="booking-card" data-booking-card-id={booking.id}>
      <div className="bk-thumb">{photoUrl ? <img src={photoUrl} alt="" loading="lazy" /> : (listing.title || 'VaRoom')}</div>
      <div className="bk-main">
        <div className="bk-top-row">
          <div>
            <div className="bk-title">{listing.title || 'Listing'}</div>
            <div className="bk-loc"><CardIcon name="location" />{listing.location_text || ''}</div>
          </div>
          <span className={`bk-status ${booking.status}`}>{statusLabel(booking.status)}</span>
        </div>
        <div className="bk-meta"><span><CardIcon name="calendar" />{describeDates(booking)}</span></div>
        <div className="bk-price">{`KES ${formatAmount(booking.total_price)}`}<span>{perUnit(booking)}</span></div>
        <div className="bk-bottom-row">
          <div className="bk-host">
            <div className="bk-host-avatar">{avatarUrl ? <img src={avatarUrl} alt="" /> : initial(host.full_name)}</div>
            <div className="bk-host-name">{host.full_name || 'Host'}</div>
          </div>
          <button type="button" className="bk-msg-link" aria-label="Message host" title="Message host" onClick={() => onMessage(booking)}><MessageIcon /></button>
          <div className="bk-actions">
            {tab === 'upcoming' && isCancellable(booking) && (
              <button type="button" className="bk-btn bk-btn-outline" onClick={() => onCancel(booking)}>Cancel Booking</button>
            )}
            {canReview && (reviewed
              ? <span className="reviewed-badge" aria-label="Reviewed">★ Reviewed</span>
              : <button type="button" className="bk-btn bk-btn-outline" onClick={() => onReview(booking)}>Leave a review</button>)}
            <Link href={`/booking-approved?id=${encodeURIComponent(booking.id)}`} className="bk-btn bk-btn-solid" onClick={(event) => onDetails(event, booking)}>View Details</Link>
          </div>
        </div>
      </div>
    </div>
  );
}

function RailSummary({ bookings }: { bookings: Booking[] }) {
  const stats = computeStats(bookings);
  const month = calendarMonth();
  return (
    <div id="client-rail-summary">
      <div className="rail-card">
        <h2>Stats Summary</h2>
        <div className="stat-row" id="stats-summary">
          <div className="stat-item"><div className="stat-label">Total Bookings</div><div className="stat-value">{`${stats.total} Stay${stats.total === 1 ? '' : 's'}`}</div></div>
          <div className="stat-item"><div className="stat-label">Upcoming</div><div className="stat-value">{`${stats.upcoming} Booked`}</div></div>
          <div className="stat-item"><div className="stat-label">Total Invested</div><div className="stat-value">{`KES ${stats.invested.toLocaleString()}`}</div></div>
        </div>
      </div>
      {/* Illustrative calendar for the current month, not booked dates (as before). */}
      <div className="rail-card">
        <div className="cal-head"><span className="cal-month">{month.label}</span><span className="cal-active-tag">Active Month</span></div>
        <div className="cal-grid">
          {DOWS.map((d, i) => <div className="cal-dow" key={`dow-${i}`}>{d}</div>)}
          {Array.from({ length: month.leading }, (_, i) => <div className="cal-day muted" key={`blank-${i}`} />)}
          {Array.from({ length: month.days }, (_, i) => (
            <div className={`cal-day${i + 1 === month.today ? ' booked' : ''}`} key={`day-${i}`}>{i + 1}</div>
          ))}
        </div>
      </div>
    </div>
  );
}

function queryValue(value: string | string[] | undefined): string | null {
  return typeof value === 'string' && value ? value : null;
}

export default function ClientBookingsView({ showToast }: { showToast: (message: string) => void }) {
  const router = useRouter();
  const { user, profile } = useAuth();
  const userId = user?.id || null;
  const phone = usePhoneLayout();
  const { state, loadMore, ensureLoaded, updateBooking, markReviewed } = useClientBookings(userId);
  const [tab, setTab] = useState<ClientTab>('upcoming');
  const [reviewing, setReviewing] = useState<Booking | null>(null);
  const feedRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const selectedId = queryValue(router.query.booking);
  const now = useMemo(() => new Date(), [state.bookings]);

  const onCancelled = useCallback((bookingId: string) => updateBooking(bookingId, { status: 'cancelled' }), [updateBooking]);
  const { cancel, messageHost } = useBookingActions(showToast, onCancelled);

  const panels = useMemo(() => {
    const grouped: Record<ClientTab, Booking[]> = { upcoming: [], past: [], cancelled: [] };
    state.bookings.forEach((b) => { const key = clientTab(b, now); if (key) grouped[key].push(b); });
    return grouped;
  }, [state.bookings, now]);

  const setSelected = useCallback((bookingId: string | null) => {
    const query = bookingId ? { booking: bookingId } : {};
    router.replace({ pathname: '/bookings', query }, undefined, { shallow: true, scroll: false });
  }, [router]);

  // Deep link (/bookings?booking=…, notifications): load until found, switch
  // to its tab, scroll it into view and show it in the rail.
  const handledLink = useRef<string | null>(null);
  const [resolving, setResolving] = useState<string | null>(null);
  useEffect(() => {
    if (!selectedId || phone !== false || state.initialLoading || handledLink.current === selectedId) return;
    handledLink.current = selectedId;
    let cancelled = false;
    setResolving(selectedId);
    ensureLoaded(selectedId).then(({ found, error }) => {
      setResolving(null);
      if (cancelled) return;
      if (error) { showToast("Couldn't load the requested booking."); return; }
      if (!found) { showToast('This booking could not be found in your bookings.'); setSelected(null); return; }
    });
    return () => { cancelled = true; };
  }, [selectedId, phone, state.initialLoading, ensureLoaded, showToast, setSelected]);

  const selected = selectedId ? state.bookings.find((b) => b.id === selectedId) || null : null;
  useEffect(() => {
    if (!selected || phone !== false) return;
    const key = clientTab(selected, now);
    if (key) setTab(key);
    window.requestAnimationFrame(() => {
      const card = feedRef.current?.querySelector(`[data-booking-card-id="${CSS.escape(selected.id)}"]`);
      card?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    });
    // Only when another booking is selected.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.id, phone]);

  // Narrowing to a phone while details are open moves them to their page; a
  // booking link opened on a phone shows the list (as before).
  const wasPhone = useRef<boolean | null>(null);
  useEffect(() => {
    if (phone === null) return;
    const previous = wasPhone.current;
    wasPhone.current = phone;
    if (!phone || !selectedId) return;
    if (previous === false) {
      markOpenedFromList(selectedId);
      router.push(`/booking-approved?id=${encodeURIComponent(selectedId)}`);
    } else {
      setSelected(null);
    }
  }, [phone, selectedId, router, setSelected]);

  // Infinite loading: one observer on the end of the list.
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || !state.hasMore || state.initialLoading) return undefined;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) loadMore();
    }, { rootMargin: '500px 0px' });
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [state.hasMore, state.initialLoading, loadMore, tab]);

  const switchTab = (key: ClientTab) => {
    setTab(key);
    if (state.hasMore) loadMore();
  };

  const confirmCancel = (booking: Booking) => {
    if (!window.confirm('Cancel this booking? This can’t be undone.')) return;
    cancel(booking).catch(() => { /* Reported by a toast. */ });
  };

  const openDetails = (event: React.MouseEvent<HTMLAnchorElement>, booking: Booking) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
    if (phone) { markOpenedFromList(booking.id); return; }
    event.preventDefault();
    setSelected(booking.id);
  };

  const reviewedIds = useMemo(() => new Set(state.reviewedIds), [state.reviewedIds]);
  const detailOpen = Boolean(selectedId) && phone === false;
  const items = panels[tab];
  const tabInfo = TABS.find((t) => t.key === tab) as typeof TABS[number];

  let loadStatus = '';
  if (state.loadingMore && state.bookings.length) loadStatus = 'Loading more bookings...';
  else if (state.loadMoreError) loadStatus = 'Couldn\'t load more bookings.';

  return (
    <>
      <div className="feed-area" ref={feedRef}>
        <div id="client-bookings-view">
          <h1 className="page-title">My Bookings</h1>
          <p className="page-subtitle">Manage your verified stays, event venues, and workstations in Kenya.</p>
          <div className="tabs" role="tablist">
            {TABS.map((t) => (
              <button key={t.key} type="button" role="tab" aria-selected={tab === t.key} className={`tab${tab === t.key ? ' active' : ''}`} onClick={() => switchTab(t.key)}>{t.label}</button>
            ))}
          </div>
          <div>
            {state.initialLoading && !state.bookings.length && tab === 'upcoming' && <><BookingSkeleton /><BookingSkeleton /><BookingSkeleton /></>}
            {!state.initialLoading && state.error && !state.bookings.length && tab === 'upcoming' && (
              <p className="state-msg">{`Couldn't load bookings: ${state.error}`}</p>
            )}
            {!state.initialLoading && !(state.error && !state.bookings.length && tab === 'upcoming') && (items.length
              ? items.map((b) => (
                <BookingCard
                  key={b.id}
                  booking={b}
                  tab={tab}
                  reviewed={reviewedIds.has(b.id)}
                  now={now}
                  onCancel={confirmCancel}
                  onReview={setReviewing}
                  onMessage={messageHost}
                  onDetails={openDetails}
                />
              ))
              : <p className="state-msg">{tabInfo.empty}</p>)}
          </div>
          <div ref={sentinelRef} aria-hidden="true" />
          <div className="booking-load-status" aria-live="polite">{loadStatus}</div>
        </div>
      </div>

      <aside className={`right-rail${detailOpen ? ' booking-details-open' : ''}`} id="right-rail">
        <div id="client-right-rail">
          {detailOpen
            ? (
              <div className="booking-detail-panel" id="client-booking-details">
                <div className="booking-detail-rail-head">
                  <button type="button" className="booking-detail-back" aria-label="Back to stats summary and calendar" onClick={() => setSelected(null)}>
                    <BackIcon /><span>Back to summary</span>
                  </button>
                </div>
                <div className="booking-detail-content">
                  {!selected && (state.initialLoading || resolving === selectedId)
                    ? null
                    : (
                      <BookingDetail
                        key={selectedId as string}
                        booking={selected}
                        viewerName={profile?.full_name || null}
                        reviewed={Boolean(selected && reviewedIds.has(selected.id))}
                        actions={{
                          onCancel: async (booking) => { await cancel(booking); setSelected(null); },
                          onMessageHost: messageHost,
                          onReviewed: markReviewed,
                        }}
                      />
                    )}
                </div>
              </div>
            )
            : <RailSummary bookings={state.bookings} />}
        </div>
      </aside>

      {reviewing && <ReviewModal booking={reviewing} onClose={() => setReviewing(null)} onReviewed={markReviewed} />}
    </>
  );
}
