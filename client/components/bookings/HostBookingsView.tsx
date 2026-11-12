import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '../../lib/auth/AuthProvider';
import { getSupabaseClient } from '../../lib/supabase/client';
import { resolveAvatarUrl, resolveStoredPhotoUrl, PHOTO_WIDTH } from '../resolveStoredPhotoUrl';
import { formatAmount } from '../../lib/bookings/format';
import {
  fetchHostBookings, fetchListingVideo, fetchTableReservations, formatHostDate, HOST_TAB_STATUS, hostDateText, hostDurationText,
  hostTabFor, isBookingInMonth, requestedTime, RESPOND_FAILED, respondToBooking, telHref,
  type HostBooking, type HostTab, type ListingVideo, type TableReservation,
} from '../../lib/bookings/hostBookings';
import {
  BOOKINGS_STALE_MS, getCachedVideo, getHostBookings, setCachedVideo, setHostBookings,
} from '../../lib/bookings/bookingsCache';

// The host's Bookings (migrated from legacy-pages/bookings.html): requests by
// status for a month, approve / decline, the request detail in the right rail
// (a full-screen panel on phones) and table reservations.

const TABS: Array<{ key: HostTab; label: string }> = [
  { key: 'pending', label: 'Pending' },
  { key: 'confirmed', label: 'Confirmed' },
  { key: 'declined', label: 'Declined' },
  { key: 'completed', label: 'Completed' },
  { key: 'table-reservations', label: 'Table Reservations' },
];
const EMPTY: Record<string, string> = {
  pending: 'No pending requests', confirmed: 'No confirmed bookings', declined: 'No declined bookings', completed: 'No completed bookings',
};

const stop = (event: React.SyntheticEvent) => event.stopPropagation();
const firstOfMonth = (date: Date) => new Date(date.getFullYear(), date.getMonth(), 1);

const MetaIcon = ({ name }: { name: 'calendar' | 'moon' | 'location' }) => (
  <i className="booking-icon" aria-hidden="true">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      {name === 'calendar' && <><rect x="3.5" y="5" width="17" height="16" rx="2" /><path d="M8 3v4M16 3v4M3.5 10h17" /></>}
      {name === 'moon' && <path d="M12 3a9 9 0 1 0 8.5 12.1A7 7 0 0 1 8.9 3.5 8.8 8.8 0 0 0 12 3Z" />}
      {name === 'location' && <><path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z" /><circle cx="12" cy="10" r="2.5" /></>}
    </svg>
  </i>
);

export function HostBookingSkeleton() {
  return (
    <div className="booking-card host-booking-card host-booking-skeleton" aria-hidden="true">
      <div className="bk-thumb-wrap"><div className="bk-thumb skeleton-block" /></div>
      <div className="bk-main">
        <div className="bk-top-row"><div><div className="bk-title skeleton-block" /><div className="bk-guest"><span className="bk-guest-avatar skeleton-block" /><span className="bk-guest-name skeleton-block" /></div></div></div>
        <div className="bk-meta"><span><span className="skeleton-block" /></span><span><span className="skeleton-block" /></span><span><span className="skeleton-block" /></span></div>
      </div>
      <div className="bk-card-side"><div className="bk-price skeleton-block" /><div className="bk-requested skeleton-block" /><div className="bk-actions"><span className="skeleton-block" /><span className="skeleton-block" /></div></div>
    </div>
  );
}

function ListingVideoElement({ video, className }: { video: ListingVideo; className?: string }) {
  return (
    <video
      className={className}
      controls
      playsInline
      preload={video.thumbnailUrl ? 'none' : 'metadata'}
      poster={video.thumbnailUrl || undefined}
      aria-label="Play listing video"
      onClick={stop}
      onPointerDown={stop}
      onKeyDown={stop}
    >
      <source src={video.videoUrl as string} />
      Your browser cannot play this video.
    </video>
  );
}

function photoOf(booking: HostBooking): string | null {
  const photos = (booking.listing && booking.listing.listing_photos) || [];
  return photos.length && photos[0].storage_path ? resolveStoredPhotoUrl(photos[0].storage_path, 'listing-photos', getSupabaseClient(), PHOTO_WIDTH.thumb) : null;
}

interface CardProps {
  booking: HostBooking;
  tab: HostTab;
  video: ListingVideo | null | undefined;
  selected: boolean;
  busy: boolean;
  now: number;
  onSelect: (booking: HostBooking) => void;
  onRespond: (booking: HostBooking, decision: 'approve' | 'decline') => void;
}

function HostBookingCard({ booking, tab, video, selected, busy, now, onSelect, onRespond }: CardProps) {
  const listing = booking.listing || {};
  const guest = booking.client || {};
  const guestName = guest.full_name || 'Guest';
  const photoUrl = photoOf(booking);
  const avatarUrl = resolveAvatarUrl(guest.avatar_url, getSupabaseClient());
  const duration = hostDurationText(booking);
  let thumb: React.ReactNode = photoUrl ? <img src={photoUrl} alt="" loading="lazy" /> : <span>VaRoom</span>;
  if (video && video.videoUrl) thumb = <ListingVideoElement video={video} />;
  else if (video && video.thumbnailUrl) thumb = <img src={video.thumbnailUrl} alt="" loading="lazy" />;
  return (
    <div
      className={`booking-card host-booking-card${selected ? ' selected' : ''}`}
      data-booking-id={booking.id}
      tabIndex={0}
      role="button"
      aria-label={`Open booking request from ${guestName}`}
      onClick={() => onSelect(booking)}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget) return;
        if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelect(booking); }
      }}
    >
      <div className="bk-thumb-wrap">
        <div className="bk-thumb">{thumb}</div>
        {video && video.videoUrl && (
          <span className="booking-video-badge"><svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="m8 5 11 7-11 7V5Z" /></svg> Video</span>
        )}
      </div>
      <div className="bk-main">
        <div className="bk-top-row">
          <div>
            <div className="bk-title">{listing.title || 'Listing'}</div>
            <div className="bk-guest"><span className="bk-guest-avatar">{avatarUrl ? <img src={avatarUrl} alt="" /> : (guest.full_name || 'G').charAt(0).toUpperCase()}</span><span>{guestName}</span></div>
          </div>
        </div>
        <div className="bk-meta">
          <span><MetaIcon name="calendar" />{hostDateText(booking)}</span>
          {duration && <span><MetaIcon name="moon" />{duration}</span>}
          {listing.location_text && <span><MetaIcon name="location" />{listing.location_text}</span>}
        </div>
      </div>
      <div className="bk-card-side">
        <div className="bk-price">{`KES ${formatAmount(booking.total_price)}`}</div>
        <div className="bk-requested">{requestedTime(booking.created_at, now)}</div>
        {tab === 'pending' && (
          <div className="bk-actions">
            <button type="button" className="bk-btn bk-btn-solid approve-btn" disabled={busy} onClick={(event) => { event.stopPropagation(); onRespond(booking, 'approve'); }}>Approve</button>
            <button type="button" className="bk-btn bk-btn-outline decline-btn" disabled={busy} onClick={(event) => { event.stopPropagation(); onRespond(booking, 'decline'); }}>Decline</button>
          </div>
        )}
      </div>
    </div>
  );
}

function HostDetail({ booking, video, busy, onClose, onRespond }: {
  booking: HostBooking;
  video: ListingVideo | null | undefined;
  busy: boolean;
  onClose: () => void;
  onRespond: (booking: HostBooking, decision: 'approve' | 'decline') => void;
}) {
  const listing = booking.listing || {};
  const photoUrl = photoOf(booking);
  const checkIn = formatHostDate(booking.start_date || booking.lease_start_date);
  const checkOut = formatHostDate(booking.end_date);
  let media: React.ReactNode = <div className="host-detail-image" aria-hidden="true" />;
  if (video && video.videoUrl) media = <ListingVideoElement video={video} className="host-detail-video" />;
  else if (photoUrl) media = <img className="host-detail-image" src={photoUrl} alt="" />;
  return (
    <>
      <div className="host-detail-head">
        <div><h2>Booking request</h2><p>Review this guest request before taking action.</p></div>
        <button className="host-detail-close" type="button" aria-label="Close booking details" onClick={onClose}>&times;</button>
      </div>
      {media}
      <h2>{listing.title || 'Listing'}</h2>
      <p>{listing.location_text || 'Location unavailable'}</p>
      <div className="host-detail-grid">
        <div className="host-detail-item"><div className="host-detail-label">Guest</div><div className="host-detail-value">{(booking.client && booking.client.full_name) || 'Guest'}</div></div>
        <div className="host-detail-item"><div className="host-detail-label">Amount</div><div className="host-detail-value">{`KES ${formatAmount(booking.total_price)}`}</div></div>
      </div>
      <div className="host-detail-stay">
        <div className="host-detail-item"><div className="host-detail-label-row"><MetaIcon name="calendar" />Check-in</div><div className="host-detail-value">{checkIn || 'Date to be confirmed'}</div></div>
        <div className="host-detail-item"><div className="host-detail-label-row"><MetaIcon name="calendar" />Check-out</div><div className="host-detail-value">{checkOut || 'Date to be confirmed'}</div></div>
      </div>
      {booking.status === 'pending' && (
        <div className="host-detail-actions">
          <button className="bk-btn bk-btn-solid detail-approve" type="button" disabled={busy} onClick={() => onRespond(booking, 'approve')}>Approve booking</button>
          <button className="bk-btn bk-btn-outline detail-decline" type="button" disabled={busy} onClick={() => onRespond(booking, 'decline')}>Decline</button>
        </div>
      )}
    </>
  );
}

function TableReservationCard({ reservation }: { reservation: TableReservation }) {
  const tables = Number(reservation.table_count);
  const occasion = reservation.special_occasion ? ` · ${reservation.occasion_details || 'Special occasion'}` : '';
  return (
    <article className="booking-card host-booking-card" style={{ cursor: 'default' }}>
      <div className="bk-thumb-wrap"><div className="bk-thumb" style={{ display: 'grid', placeItems: 'center', background: '#8f1229', color: 'white', fontWeight: 800 }}>TABLE</div></div>
      <div className="bk-main">
        <div className="bk-top-row"><div>
          <div className="bk-title">{`Table Reservation · ${reservation.restaurant_name || reservation.listing_title || ''}`}</div>
          <div className="bk-guest"><span className="bk-guest-avatar">{(reservation.client_name || 'G').charAt(0).toUpperCase()}</span><span>{reservation.client_name}</span></div>
        </div></div>
        <div className="bk-meta">
          <span>{`${reservation.requested_date} at ${String(reservation.requested_time).slice(0, 5)}`}</span>
          <span>{`${Number(reservation.guest_count)} guests · ${tables} table${tables === 1 ? '' : 's'}${occasion}`}</span>
        </div>
      </div>
      <div className="bk-card-side">
        <a className="bk-btn bk-btn-solid" href={telHref(reservation.client_phone)}>Call Client</a>
        <div className="bk-requested">{reservation.client_phone || ''}</div>
      </div>
    </article>
  );
}

function queryValue(value: string | string[] | undefined): string | null {
  return typeof value === 'string' && value ? value : null;
}

/** hostId: the account's own id, or the company a team Manager works as. */
export default function HostBookingsView({ hostId, showToast }: { hostId: string; showToast: (message: string) => void }) {
  const router = useRouter();
  const { user, session } = useAuth();
  const ownId = user?.id || null;
  // Cached per viewer and host, so a company's bookings never show as the account's own.
  const userId = ownId ? (hostId === ownId ? ownId : `${ownId}@${hostId}`) : null;
  const token = session?.access_token || null;
  const cached = userId ? getHostBookings(userId) : null;
  const [bookings, setBookings] = useState<HostBooking[] | null>(cached ? cached.bookings : null);
  const [reservations, setReservations] = useState<TableReservation[] | null>(cached ? cached.reservations : null);
  const [loadError, setLoadError] = useState(false);
  const [entering, setEntering] = useState(false);
  const [tab, setTab] = useState<HostTab>('pending');
  const [month, setMonth] = useState(() => firstOfMonth(new Date()));
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [videos, setVideos] = useState<Record<string, ListingVideo | null>>({});
  const feedRef = useRef<HTMLDivElement>(null);
  const tokenRef = useRef(token);
  tokenRef.current = token;

  const save = useCallback((next: { bookings?: HostBooking[]; reservations?: TableReservation[] | null }) => {
    if (!userId) return;
    const current = getHostBookings(userId);
    setHostBookings({
      userId,
      bookings: next.bookings || (current ? current.bookings : []),
      reservations: next.reservations !== undefined ? next.reservations : (current ? current.reservations : null),
      fetchedAt: next.bookings ? Date.now() : (current ? current.fetchedAt : 0),
    });
  }, [userId]);

  // Requests and table reservations load in parallel; a recent snapshot
  // renders at once and is refreshed in the background.
  useEffect(() => {
    if (!userId) return undefined;
    const client = getSupabaseClient();
    if (!client) return undefined;
    const current = getHostBookings(userId);
    if (current && Date.now() - current.fetchedAt < BOOKINGS_STALE_MS) return undefined;
    let cancelled = false;
    fetchHostBookings(client, hostId).then((rows) => {
      save({ bookings: rows });
      if (cancelled) return;
      setBookings(rows);
      setLoadError(false);
      if (!current) setEntering(true);
    }, (error) => {
      console.error('Failed to load host bookings:', error);
      if (!cancelled && !current) setLoadError(true);
    });
    if (tokenRef.current) {
      fetchTableReservations(tokenRef.current, hostId).then((rows) => {
        save({ reservations: rows });
        if (!cancelled) setReservations(rows);
      }, (error) => console.error('Failed to load table reservations:', error));
    }
    return () => { cancelled = true; };
  }, [userId, hostId, save]);

  // Fade the first results in (as before).
  useEffect(() => {
    if (!entering) return undefined;
    let second = 0;
    const first = window.requestAnimationFrame(() => { second = window.requestAnimationFrame(() => setEntering(false)); });
    return () => { window.cancelAnimationFrame(first); window.cancelAnimationFrame(second); };
  }, [entering]);

  // Listing videos: once per listing, in parallel, after the list is shown.
  useEffect(() => {
    if (!bookings || !token) return undefined;
    const ids = Array.from(new Set(bookings.map((b) => b.listing && b.listing.id).filter(Boolean) as string[]));
    const known: Record<string, ListingVideo | null> = {};
    const missing: string[] = [];
    ids.forEach((id) => {
      const hit = getCachedVideo(id);
      if (hit === undefined) missing.push(id); else known[id] = hit;
    });
    if (Object.keys(known).length) setVideos((current) => ({ ...current, ...known }));
    if (!missing.length) return undefined;
    let cancelled = false;
    Promise.all(missing.map((id) => fetchListingVideo(id, token).then((video) => {
      setCachedVideo(id, video);
      return [id, video] as const;
    }, (error) => {
      console.error('Failed to load listing video media:', error);
      return [id, null] as const;
    }))).then((entries) => {
      if (!cancelled) setVideos((current) => ({ ...current, ...Object.fromEntries(entries) }));
    });
    return () => { cancelled = true; };
  }, [bookings, token]);

  const counts = useMemo(() => {
    const result: Record<string, number> = { pending: 0, confirmed: 0, declined: 0, completed: 0 };
    (bookings || []).forEach((b) => { const key = hostTabFor(b.status); if (key) result[key] += 1; });
    result['table-reservations'] = reservations ? reservations.length : 0;
    return result;
  }, [bookings, reservations]);

  const visible = useMemo(() => {
    if (!bookings || tab === 'table-reservations') return [];
    return bookings.filter((b) => b.status === HOST_TAB_STATUS[tab] && isBookingInMonth(b, month));
  }, [bookings, tab, month]);

  const selected = selectedId && bookings ? bookings.find((b) => b.id === selectedId) || null : null;

  // Deep link (/bookings?booking=…): open that request on its tab.
  const requestedId = queryValue(router.query.booking);
  const handledLink = useRef<string | null>(null);
  useEffect(() => {
    if (!bookings || !requestedId || handledLink.current === requestedId) return;
    handledLink.current = requestedId;
    const booking = bookings.find((b) => b.id === requestedId);
    if (!booking) return;
    const key = hostTabFor(booking.status);
    if (key) setTab(key);
    setSelectedId(booking.id);
    window.requestAnimationFrame(() => {
      feedRef.current?.querySelector(`[data-booking-id="${CSS.escape(booking.id)}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  }, [bookings, requestedId]);

  const switchTab = (key: HostTab) => { setTab(key); setSelectedId(null); };
  const shiftMonth = (delta: number) => setMonth((current) => new Date(current.getFullYear(), current.getMonth() + delta, 1));
  const today = new Date();
  const isCurrentMonth = month.getFullYear() === today.getFullYear() && month.getMonth() === today.getMonth();

  const respond = async (booking: HostBooking, decision: 'approve' | 'decline') => {
    const client = getSupabaseClient();
    if (busy || !client || !userId) return;
    setBusy(true);
    try {
      const { status } = await respondToBooking(client, { booking, userId: hostId, decision });
      const next = (bookings || []).map((b) => (b.id === booking.id ? { ...b, status } : b));
      save({ bookings: next });
      setBookings(next);
      setSelectedId(null);
      showToast(decision === 'approve' ? 'Booking approved!' : 'Booking declined.');
    } catch (error) {
      console.error(`Failed to ${decision} booking:`, error);
      showToast(RESPOND_FAILED[decision]);
    } finally {
      setBusy(false);
    }
  };

  const now = Date.now();
  let panel: React.ReactNode;
  if (tab === 'table-reservations') {
    panel = reservations && reservations.length
      ? reservations.map((r, i) => <TableReservationCard key={r.id || i} reservation={r} />)
      : <p className="state-msg">No table reservations yet.</p>;
  } else if (!bookings) {
    panel = loadError
      ? <p className="state-msg">Couldn&apos;t load bookings. Please try again.</p>
      : <><HostBookingSkeleton /><HostBookingSkeleton /><HostBookingSkeleton /></>;
  } else if (!visible.length) {
    panel = <p className="state-msg">{EMPTY[tab]}</p>;
  } else {
    panel = visible.map((b) => (
      <HostBookingCard
        key={b.id}
        booking={b}
        tab={tab}
        video={b.listing && b.listing.id ? videos[b.listing.id] : undefined}
        selected={b.id === selectedId}
        busy={busy}
        now={now}
        onSelect={(item) => setSelectedId(item.id)}
        onRespond={respond}
      />
    ));
  }

  return (
    <>
      <div className="feed-area" ref={feedRef}>
        <div id="host-bookings-view">
          <div className="host-header-row">
            <div>
              <h1 className="page-title">Bookings</h1>
              <p className="page-subtitle">Review and manage booking requests from your guests.</p>
            </div>
            <div className="host-month-nav" aria-label="Booking period">
              <button type="button" className="host-month-btn" aria-label="Previous month" onClick={() => shiftMonth(-1)}>‹</button>
              <span className="host-month-label">{month.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</span>
              <button type="button" className="host-month-btn" aria-label="Next month" onClick={() => shiftMonth(1)}>›</button>
              <button type="button" className="host-month-current" style={{ visibility: isCurrentMonth ? 'hidden' : 'visible' }} onClick={() => setMonth(firstOfMonth(new Date()))}>This month</button>
            </div>
          </div>
          <div className="tabs host-bookings-tabs" role="tablist">
            {TABS.map((t) => (
              <button key={t.key} type="button" role="tab" aria-selected={tab === t.key} className={`tab${tab === t.key ? ' active' : ''}`} onClick={() => switchTab(t.key)}>
                {t.label}<span className={`tab-count${counts[t.key] > 0 ? ' has-count' : ''}`}>{counts[t.key] > 0 ? counts[t.key] : ''}</span>
              </button>
            ))}
          </div>
          <div className={entering ? 'host-booking-results-enter' : undefined} aria-busy={!bookings && !loadError && tab !== 'table-reservations'}>{panel}</div>
        </div>
      </div>
      <aside className="right-rail host-empty" id="right-rail">
        <div className={`rail-card host-detail${selected ? ' show' : ''}`} id="host-booking-detail" aria-live="polite">
          {selected && (
            <HostDetail
              key={selected.id}
              booking={selected}
              video={selected.listing && selected.listing.id ? videos[selected.listing.id] : undefined}
              busy={busy}
              onClose={() => setSelectedId(null)}
              onRespond={respond}
            />
          )}
        </div>
      </aside>
    </>
  );
}
