import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '../../lib/auth/AuthProvider';
import { getSupabaseClient } from '../../lib/supabase/client';
import { resolveAvatarUrl, resolveStoredPhotoUrl, PHOTO_WIDTH } from '../resolveStoredPhotoUrl';
import {
  detailRows, firstName, formatAmount, initial, priceToConfirm, isCancellable, stayHasEnded, statusHero, type Booking,
} from '../../lib/bookings/format';
import { fetchBookingReview, REVIEW_FALLBACK_ERROR, submitBookingReview, type BookingReview } from '../../lib/bookings/clientBookings';
import { getCachedReview, setCachedReview } from '../../lib/bookings/bookingsCache';
import { CalendarIcon, CashIcon, CheckIcon, ClockIcon, CloseIcon, GuestsIcon, ShieldIcon } from './BookingIcons';
import PayDialog from './PayDialog';
import ConfirmSheet from './ConfirmSheet';
import { usePresence } from '../../lib/motion/usePresence';
import { DURATION, exitMs } from '../../lib/motion/tokens';
import { MapLink } from '../maps/LocationCard';

// A client's booking, whatever its status: a header that says where it stands
// (approved, waiting for the host, declined, cancelled, expired, complete),
// then the listing, dates, guests and total. Approved bookings add payment
// and its protection note; pending and approved ones can be cancelled; after
// the stay comes the review. One component for the Bookings rail on laptops
// and desktops and the booking details page on phones.

export interface BookingDetailActions {
  /** Cancel after the guest confirms; rejects with the reason it failed. */
  onCancel: (booking: Booking) => Promise<void>;
  onMessageHost: (booking: Booking) => void;
  onReviewed: (bookingId: string, review: BookingReview | null) => void;
}

const STARS = [1, 2, 3, 4, 5];

function ReviewSection({ booking, reviewed, onReviewed }: { booking: Booking; reviewed: boolean; onReviewed: BookingDetailActions['onReviewed'] }) {
  const { session } = useAuth();
  const [review, setReview] = useState<BookingReview | null | undefined>(() => getCachedReview(booking.id));
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [thanked, setThanked] = useState(false);

  // Load the existing review only when the booking has one and it is not cached.
  useEffect(() => {
    if (!reviewed || review !== undefined) return undefined;
    const client = getSupabaseClient();
    if (!client) return undefined;
    let cancelled = false;
    fetchBookingReview(client, booking.id).then((loaded) => {
      setCachedReview(booking.id, loaded);
      if (!cancelled) setReview(loaded);
    }).catch(() => { /* Shown as reviewed without its text. */ });
    return () => { cancelled = true; };
  }, [booking.id, reviewed, review]);

  const done = reviewed || Boolean(review);
  const shownRating = done ? Number(review?.rating || 0) : rating;

  const submit = async () => {
    setError('');
    const text = comment.trim();
    if (!rating) { setError('Please select a rating.'); return; }
    if (!text) { setError('Please write a review before submitting.'); return; }
    setSubmitting(true);
    try {
      const saved = await submitBookingReview({ bookingId: booking.id, rating, comment: text, token: session?.access_token || null });
      setCachedReview(booking.id, saved);
      setReview(saved);
      setThanked(true);
      onReviewed(booking.id, saved);
    } catch (submitError) {
      setError((submitError as Error).message || REVIEW_FALLBACK_ERROR);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="review-section">
      <h3>{done ? 'Your review' : 'How was your experience?'}</h3>
      <p>{done ? 'Thank you for sharing your verified experience.' : 'Your stay is complete. Share your verified experience with future guests.'}</p>
      <div className="detail-review-stars" role="radiogroup" aria-label="Rating from 1 to 5 stars">
        {STARS.map((value) => (
          <button
            key={value}
            type="button"
            className={`detail-review-star${value <= shownRating ? ' selected' : ''}`}
            role="radio"
            aria-checked={value === shownRating}
            aria-label={`${value} star${value === 1 ? '' : 's'}`}
            disabled={done}
            onClick={() => setRating(value)}
          >&#9733;</button>
        ))}
      </div>
      <textarea
        className="detail-review-text"
        maxLength={10000}
        placeholder="Tell us about your experience..."
        aria-label="Tell us about your experience"
        value={done ? (review?.comment || '') : comment}
        disabled={done}
        onChange={(event) => setComment(event.target.value)}
      />
      {done
        ? <p className="detail-reviewed" role="status">{thanked ? 'Thank you for sharing your experience. Reviewed' : 'Reviewed'}</p>
        : (
          <>
            <p className="detail-review-error" role="alert">{error}</p>
            <button type="button" className="bk-btn bk-btn-solid detail-review-submit" disabled={submitting} onClick={submit}>
              {submitting ? 'Submitting…' : 'Submit review'}
            </button>
          </>
        )}
    </div>
  );
}

export default function BookingDetail({ booking, viewerName, reviewed, actions }: {
  booking: Booking | null;
  viewerName: string | null;
  reviewed: boolean;
  actions: BookingDetailActions;
}) {
  const [paying, setPaying] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  // The payment window stays through its exit (animation.md §8.3).
  const { mounted: payMounted, closing: payClosing } = usePresence(paying, exitMs(DURATION.standard));

  if (!booking) {
    return (
      <div className="booking-detail-status">
        <h2>Booking details unavailable</h2>
        <p>We couldn’t find this booking in your bookings list. Return to the summary and try again.</p>
      </div>
    );
  }

  const client = getSupabaseClient();
  const listing = booking.listing || {};
  const host = booking.host || {};
  const photo = (listing.listing_photos || []).find((item) => item && item.storage_path);
  const photoUrl = photo ? resolveStoredPhotoUrl(photo.storage_path, 'listing-photos', client, PHOTO_WIDTH.thumb) : null;
  const avatarUrl = resolveAvatarUrl(host.avatar_url, client);
  const title = listing.title || 'Listing';
  const hostName = host.full_name || 'VaRoom host';
  const total = formatAmount(booking.total_price);
  const hero = statusHero(booking.status);
  const approved = booking.status === 'approved';
  const stayed = approved || booking.status === 'completed';
  // Reviews follow a stay that happened; the map and directions follow an accepted booking.
  const showReview = stayed && (reviewed || booking.status === 'completed' || stayHasEnded(booking));

  const cancel = async () => {
    setCancelling(true);
    try {
      await actions.onCancel(booking);
      setPaying(false);
      setConfirmingCancel(false);
    } catch {
      // The page reports why; the button becomes usable again.
    } finally {
      setCancelling(false);
    }
  };

  return (
    <>
      <section className={`booking-approved-hero tone-${hero.tone}`} aria-label={hero.title}>
        <div className="booking-approved-check">{hero.tone === 'good' ? <CheckIcon /> : hero.tone === 'wait' ? <ClockIcon /> : <CloseIcon />}</div>
        <h2>{hero.title}</h2>
        <p>{hero.text}</p>
      </section>
      <section className="booking-detail-card">
        <h3 className="booking-detail-greeting">{`Hello ${firstName(viewerName)},`}</h3>
        <p className="booking-detail-intro">{hero.intro}</p>
        <div className="booking-detail-property">
          <div className="booking-detail-photo">{photoUrl && <img src={photoUrl} alt={title} />}</div>
          <div className="booking-detail-property-info">
            <h3 className="booking-detail-property-title" title={title}>{title}</h3>
            <div className="booking-detail-location">
              <span>{listing.location_text || 'Location not available'}</span>
              {stayed && <MapLink className="booking-detail-map" target={{ kind: 'booking', id: booking.id }}>View on map</MapLink>}
            </div>
            <div className="booking-detail-host">
              <div className="booking-detail-host-avatar">{avatarUrl ? <img src={avatarUrl} alt="" /> : initial(host.full_name)}</div>
              <div>
                <div className="booking-detail-host-label">Hosted by</div>
                <div className="booking-detail-host-name" title={hostName}>{hostName}</div>
              </div>
            </div>
          </div>
        </div>
        <h3 className="booking-detail-section-title"><CalendarIcon />Booking Details</h3>
        <div className="booking-detail-rows">
          {detailRows(booking).map((row) => (
            <div className="booking-detail-row" key={row.label}>
              <span className="booking-detail-row-label">{row.icon === 'clock' ? <ClockIcon /> : row.icon === 'guests' ? <GuestsIcon /> : <CalendarIcon />}<span>{row.label}</span></span>
              <span className="booking-detail-row-value">{row.value}</span>
            </div>
          ))}
          <div className="booking-detail-row total">
            <span className="booking-detail-row-label"><CashIcon /><span>Total Amount</span></span>
            <span className="booking-detail-row-value">{`KSh ${total}`}</span>
          </div>
        </div>
        {approved && (
          <div className="booking-detail-protection">
            <ShieldIcon />
            <div>
              <div className="booking-detail-protection-title">Your payment is protected by VaRoom.</div>
              <div className="booking-detail-protection-text">The host can only withdraw your payment after you’ve checked in.</div>
            </div>
          </div>
        )}
        {showReview && <ReviewSection key={booking.id} booking={booking} reviewed={reviewed} onReviewed={actions.onReviewed} />}
        {(isCancellable(booking) || approved) && <div className="booking-detail-actions">
          {isCancellable(booking) && (
            <button type="button" className="bk-btn bk-btn-outline" disabled={cancelling} onClick={() => setConfirmingCancel(true)}>
              {cancelling ? 'Cancelling…' : 'Cancel Booking'}
            </button>
          )}
          {/* No total yet (the host confirms the price): nothing to pay here. */}
          {approved && !priceToConfirm(booking.total_price) && <button type="button" className="bk-btn booking-detail-pay" onClick={() => setPaying(true)}>{`Pay  KSh ${total}`}</button>}
        </div>}
        <div className="booking-detail-help">
          <div className="booking-detail-help-icon">?</div>
          <div className="booking-detail-help-text">
            <div className="booking-detail-help-title">Need help?</div>
            <div className="booking-detail-help-sub">Reply in this chat or contact our support team.</div>
          </div>
          <Link className="booking-detail-help-btn" href="/support" target="_blank" rel="noopener noreferrer">Contact Support ›</Link>
        </div>
      </section>
      <ConfirmSheet
        open={confirmingCancel}
        title="Cancel this booking?"
        message="This can’t be undone. The host will be told."
        confirmLabel="Cancel booking"
        busy={cancelling}
        onConfirm={() => { void cancel(); }}
        onClose={() => setConfirmingCancel(false)}
      />
      {payMounted && (
        <PayDialog
          booking={booking}
          closing={payClosing}
          onClose={() => setPaying(false)}
          onMessageHost={() => { setPaying(false); actions.onMessageHost(booking); }}
        />
      )}
    </>
  );
}
