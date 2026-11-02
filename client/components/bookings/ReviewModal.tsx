import React, { useEffect, useRef, useState } from 'react';
import { useAuth } from '../../lib/auth/AuthProvider';
import { REVIEW_FALLBACK_ERROR, submitBookingReview, type BookingReview } from '../../lib/bookings/clientBookings';
import type { Booking } from '../../lib/bookings/format';

// "How was your experience?" for a completed stay (legacy review modal).

const STARS = [1, 2, 3, 4, 5];
const CLOSE_AFTER_MS = 900;

export default function ReviewModal({ booking, onClose, onReviewed }: {
  booking: Booking;
  onClose: () => void;
  onReviewed: (bookingId: string, review: BookingReview | null) => void;
}) {
  const { session } = useAuth();
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [error, setError] = useState('');
  const [phase, setPhase] = useState<'editing' | 'submitting' | 'done'>('editing');
  const textRef = useRef<HTMLTextAreaElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    textRef.current?.focus();
    document.body.classList.add('review-modal-open');
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onCloseRef.current(); };
    document.addEventListener('keydown', onKey);
    return () => {
      document.body.classList.remove('review-modal-open');
      document.removeEventListener('keydown', onKey);
    };
  }, []);

  useEffect(() => {
    if (phase !== 'done') return undefined;
    const timer = window.setTimeout(() => onCloseRef.current(), CLOSE_AFTER_MS);
    return () => window.clearTimeout(timer);
  }, [phase]);

  const submit = async () => {
    setError('');
    const text = comment.trim();
    if (!rating) { setError('Please select a rating.'); return; }
    if (!text) { setError('Please write a review before submitting.'); return; }
    setPhase('submitting');
    try {
      const saved = await submitBookingReview({ bookingId: booking.id, rating, comment: text, token: session?.access_token || null });
      onReviewed(booking.id, saved);
      setPhase('done');
    } catch (submitError) {
      setError((submitError as Error).message || REVIEW_FALLBACK_ERROR);
      setPhase('editing');
    }
  };

  return (
    <div className="review-modal-backdrop show" onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="review-modal" role="dialog" aria-modal="true" aria-labelledby="review-modal-title">
        <div className="review-modal-head">
          <h2 className="review-modal-title" id="review-modal-title">How was your experience?</h2>
          <button type="button" className="review-modal-close" onClick={onClose} aria-label="Close">&times;</button>
        </div>
        <p className="review-modal-subtitle">{`Your verified stay at "${(booking.listing && booking.listing.title) || 'this listing'}"`}</p>
        <div className="review-stars" role="radiogroup" aria-label="Rating from 1 to 5 stars">
          {STARS.map((value) => (
            <button
              key={value}
              type="button"
              className={`review-star${value <= rating ? ' selected' : ''}`}
              role="radio"
              aria-checked={value === rating}
              aria-label={`${value} star${value === 1 ? '' : 's'}`}
              onClick={() => setRating(value)}
            >&#9733;</button>
          ))}
        </div>
        <label className="review-label" htmlFor="review-comment">Tell us about your experience</label>
        <textarea
          ref={textRef}
          className="review-textarea"
          id="review-comment"
          maxLength={10000}
          placeholder="Write your review..."
          required
          value={comment}
          onChange={(event) => setComment(event.target.value)}
        />
        <p className="review-error" role="alert">{error}</p>
        <p className="review-success" role="status">{phase === 'done' ? 'Thank you for sharing your experience.' : ''}</p>
        <button type="button" className="bk-btn bk-btn-solid review-submit" disabled={phase !== 'editing'} onClick={submit}>
          {phase === 'submitting' ? 'Submitting…' : phase === 'done' ? 'Reviewed' : 'Submit review'}
        </button>
      </div>
    </div>
  );
}
