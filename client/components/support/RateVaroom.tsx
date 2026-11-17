import React, { useEffect, useState } from 'react';
import { getSupabaseClient } from '../../lib/supabase/client';
import { COMMENT_MAX, fetchMyReview, reviewProblem, saveMyReview, type MyReview } from '../../lib/reviews/varoomReviews';

// "Rate VaRoom" on Help & Support. Signed-in people give 1–5 stars and a few
// words; they can change their review later. Every review is read by the
// VaRoom team before it can appear on the sign-in page. Signed-out visitors
// are asked to sign in first.

const LABELS = ['Poor', 'Fair', 'Good', 'Very good', 'Excellent'];

const STATUS_NOTE: Record<MyReview['status'], string> = {
  pending: 'Thanks! Your review is with the VaRoom team.',
  approved: 'Thanks! Your review is published.',
  hidden: 'Thanks for your review.',
};

// The person's own review, kept for this visit so reopening the page does not ask again.
const myReviewCache = new Map<string, MyReview | null>();

export default function RateVaroom({ userId }: { userId: string | null }) {
  const [saved, setSaved] = useState<MyReview | null>(userId ? myReviewCache.get(userId) ?? null : null);
  const [rating, setRating] = useState(saved?.rating || 0);
  const [comment, setComment] = useState(saved?.comment || '');
  const [hover, setHover] = useState(0);
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState<{ text: string; error?: boolean } | null>(saved ? { text: STATUS_NOTE[saved.status] } : null);

  useEffect(() => {
    if (!userId || myReviewCache.has(userId)) return undefined;
    const client = getSupabaseClient();
    if (!client) return undefined;
    let cancelled = false;
    fetchMyReview(client, userId).then((review) => {
      myReviewCache.set(userId, review);
      if (cancelled || !review) return;
      setSaved(review);
      setRating(review.rating);
      setComment(review.comment);
      setNote({ text: STATUS_NOTE[review.status] });
    }, () => {
      // Not knowing an earlier review only means the form starts empty.
    });
    return () => { cancelled = true; };
  }, [userId]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!userId || saving) return;
    const problem = reviewProblem(rating, comment);
    if (problem) {
      setNote({ text: problem, error: true });
      return;
    }
    const client = getSupabaseClient();
    if (!client) {
      setNote({ text: 'Rating is unavailable right now. Please try again.', error: true });
      return;
    }
    setSaving(true);
    setNote(null);
    try {
      const review = await saveMyReview(client, userId, rating, comment);
      myReviewCache.set(userId, review);
      setSaved(review);
      setNote({ text: STATUS_NOTE[review.status] });
    } catch (error) {
      setNote({ text: (error instanceof Error && error.message) || 'Your review could not be saved.', error: true });
    } finally {
      setSaving(false);
    }
  };

  const unchanged = Boolean(saved && saved.rating === rating && saved.comment === comment.trim());
  const shown = hover || rating;

  return (
    <section className="rate-card" aria-labelledby="rate-heading">
      <h2 id="rate-heading">Rate VaRoom</h2>
      <p>How has VaRoom been for you? Your review helps other people decide, and helps us improve.</p>

      {!userId ? (
        <a className="write-button rate-signin" href="/?auth=login&redirect=%2Fsupport">Sign in to rate VaRoom</a>
      ) : (
        <form className="rate-form" onSubmit={submit} noValidate>
          <fieldset className="rate-stars" onMouseLeave={() => setHover(0)}>
            <legend className="field-label">Your rating{shown ? `: ${LABELS[shown - 1]}` : ''}</legend>
            {[1, 2, 3, 4, 5].map((value) => (
              <button
                key={value}
                type="button"
                className={`rate-star${value <= shown ? ' is-on' : ''}`}
                aria-label={`${value} star${value > 1 ? 's' : ''}, ${LABELS[value - 1]}`}
                aria-pressed={rating === value}
                onMouseEnter={() => setHover(value)}
                onFocus={() => setHover(value)}
                onBlur={() => setHover(0)}
                onClick={() => { setRating(value); setNote(null); }}
              >
                ★
              </button>
            ))}
          </fieldset>
          <label className="field-label" htmlFor="rate-comment">Your review (optional)</label>
          <textarea
            id="rate-comment"
            maxLength={COMMENT_MAX}
            placeholder="What do you like about VaRoom? What could be better?"
            value={comment}
            onChange={(event) => { setComment(event.target.value); setNote(null); }}
          />
          <div className="rate-footer">
            <span className={`rate-note${note?.error ? ' is-error' : ''}`} aria-live="polite">
              {note ? note.text : 'The VaRoom team reads every review before it is shown.'}
            </span>
            <button className="write-button" type="submit" disabled={saving || !rating || unchanged}>
              {saving ? 'Sending...' : saved ? 'Update review' : 'Send review'}
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
