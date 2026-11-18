import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Pause, Play } from 'lucide-react';
import type { FeaturedReview } from '../../lib/reviews/varoomReviews';
import { prefersReducedMotion } from '../../lib/motion/reducedMotion';
import styles from './ReviewCarousel.module.css';

/** How long each review stays before the next one comes in (owner's choice: enough to read it). */
export const REVIEW_ROTATION_MS = 6000;

interface ReviewCarouselProps {
  reviews: FeaturedReview[];
  /** Draws one review; each part to come in on its own gets className={part} and style={order(n)}. */
  renderReview: (review: FeaturedReview, parts: { part: string; order: (n: number) => React.CSSProperties }) => React.ReactNode;
  /** False while the reviews cannot be seen (a closed panel): the turning waits. */
  active?: boolean;
  /** Classes for the whole carousel and for the dots row, from the place that shows it. */
  className?: string;
  controlsClassName?: string;
  /** Centre a shorter review in the space kept for the longest (a centred page); default: top. */
  align?: 'start' | 'center';
}

const order = (n: number) => ({ '--part': n }) as React.CSSProperties;

/**
 * The approved reviews of VaRoom, one at a time (animation.md §8.14, B6, B16,
 * §13). Every REVIEW_ROTATION_MS the review moves on: the old one fades up and
 * away, the new one's stars, words and author come in in turn. All reviews
 * share one grid cell, so the place never changes size. The turning pauses
 * while pointed at, focused, off screen, in a hidden tab, or after the pause
 * button; reduced motion turns it off (the dots still work). One review
 * shows on its own, without controls.
 */
export function ReviewCarousel({ reviews, renderReview, active = true, className = '', controlsClassName = '', align = 'start' }: ReviewCarouselProps) {
  const count = reviews.length;
  const [index, setIndex] = useState(0);
  const [changed, setChanged] = useState(false); // the first review shows without coming in
  const [userPaused, setUserPaused] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [onScreen, setOnScreen] = useState(false);
  const [tabVisible, setTabVisible] = useState(true);
  const [reduced, setReduced] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setReduced(prefersReducedMotion()); }, []);

  useEffect(() => {
    const update = () => setTabVisible(document.visibilityState !== 'hidden');
    update();
    document.addEventListener('visibilitychange', update);
    return () => document.removeEventListener('visibilitychange', update);
  }, []);

  useEffect(() => {
    const el = rootRef.current;
    if (!el || count < 2) return undefined;
    if (typeof IntersectionObserver === 'undefined') { setOnScreen(true); return undefined; }
    const observer = new IntersectionObserver(([entry]) => setOnScreen(entry.isIntersecting), { threshold: 0.4 });
    observer.observe(el);
    return () => observer.disconnect();
  }, [count]);

  const show = useCallback((next: number) => {
    if (count < 2) return;
    setChanged(true);
    setIndex(((next % count) + count) % count);
  }, [count]);

  // One timer per review shown: picking a review starts its full time again.
  const turning = count > 1 && active && onScreen && tabVisible && !reduced && !userPaused && !hovered && !focused;
  useEffect(() => {
    if (!turning) return undefined;
    const timer = window.setTimeout(() => show(index + 1), REVIEW_ROTATION_MS);
    return () => window.clearTimeout(timer);
  }, [turning, index, show]);

  // Fewer reviews after a rebuild: stay in range.
  useEffect(() => { if (index >= count && count > 0) setIndex(0); }, [index, count]);

  if (!count) return null;

  return (
    <div
      ref={rootRef}
      className={`${styles.carousel}${align === 'center' ? ` ${styles.alignCenter}` : ''} ${className}`}
      role="group"
      aria-roledescription={count > 1 ? 'carousel' : undefined}
      aria-label="Reviews of VaRoom"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setFocused(false); }}
    >
      <div className={styles.stack}>
        {reviews.map((review, i) => (
          <div
            key={`${i}-${review.comment.slice(0, 24)}`}
            className={styles.slide}
            data-state={i === index ? (changed ? 'entering' : 'current') : 'hidden'}
            role={count > 1 ? 'group' : undefined}
            aria-roledescription={count > 1 ? 'slide' : undefined}
            aria-label={count > 1 ? `Review ${i + 1} of ${count}` : undefined}
            aria-hidden={i === index ? undefined : true}
          >
            {renderReview(review, { part: styles.part, order })}
          </div>
        ))}
      </div>

      {count > 1 && (
        <div className={`${styles.controls} ${controlsClassName}`}>
          <div className={styles.dots}>
            {reviews.map((_, i) => (
              <button
                key={i}
                type="button"
                className={`${styles.dot}${i === index ? ` ${styles.dotOn}` : ''}`}
                aria-label={`Show review ${i + 1} of ${count}`}
                aria-current={i === index ? 'true' : undefined}
                onClick={() => show(i)}
              />
            ))}
          </div>
          {!reduced && (
            <button
              type="button"
              className={styles.pause}
              aria-label={userPaused ? 'Play reviews' : 'Pause reviews'}
              aria-pressed={userPaused}
              onClick={() => setUserPaused((was) => !was)}
            >
              {userPaused ? <Play size={12} aria-hidden="true" /> : <Pause size={12} aria-hidden="true" />}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
