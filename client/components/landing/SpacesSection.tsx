import React, { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import type { FeaturedSpace } from '../../lib/landing/featuredSpaces';
import styles from './SpacesSection.module.css';

interface SpacesSectionProps {
  spaces: FeaturedSpace[];
}

/** A card's place relative to the centre card: -2 … 2 for five cards, wrapping around. */
function offsetOf(index: number, active: number, count: number): number {
  const half = Math.floor(count / 2);
  return ((index - active + count + half) % count) - half;
}

const SWIPE_PX = 40;

// Page 2: one card per niche in a fanned row, the centre card largest.
// Side cards come to the centre when pressed; arrows, keys and swipes rotate.
export const SpacesSection: React.FC<SpacesSectionProps> = ({ spaces }) => {
  const count = spaces.length;
  const [active, setActive] = useState(Math.floor(count / 2));
  // A card that wraps from one end to the other jumps instead of sliding across.
  const previousOffsets = useRef<number[]>(spaces.map((_, i) => offsetOf(i, Math.floor(count / 2), count)));
  const swipeStart = useRef<number | null>(null);

  const offsets = spaces.map((_, i) => offsetOf(i, active, count));
  useEffect(() => {
    previousOffsets.current = offsets;
  });

  const step = useCallback((delta: number) => {
    setActive((current) => (current + delta + count) % count);
  }, [count]);

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'ArrowLeft') { event.preventDefault(); step(-1); }
    if (event.key === 'ArrowRight') { event.preventDefault(); step(1); }
  };

  const onPointerDown = (event: React.PointerEvent) => {
    if (event.pointerType !== 'mouse') swipeStart.current = event.clientX;
  };
  const onPointerUp = (event: React.PointerEvent) => {
    if (swipeStart.current == null) return;
    const dx = event.clientX - swipeStart.current;
    swipeStart.current = null;
    if (Math.abs(dx) >= SWIPE_PX) step(dx < 0 ? 1 : -1);
  };

  if (!count) return null;
  const current = spaces[active];

  return (
    <section id="spaces" className={`snap-page ${styles.section}`} aria-labelledby="spaces-heading">
      <div className={styles.header}>
        <p className={styles.eyebrow}>The spaces</p>
        <h2 id="spaces-heading" className={styles.headline}>
          Discover <em>Spaces for</em>
          <br />
          <em>Every</em> Occasion
        </h2>
      </div>

      <div
        className={styles.stage}
        role="region"
        aria-roledescription="carousel"
        aria-label="Spaces on VaRoom"
        tabIndex={0}
        onKeyDown={onKeyDown}
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onPointerCancel={() => { swipeStart.current = null; }}
      >
        {spaces.map((space, i) => {
          const offset = offsets[i];
          const isActive = offset === 0;
          const wrapped = Math.abs(offset - (previousOffsets.current[i] ?? offset)) > 1;
          return (
            <article
              key={space.slot}
              className={`${styles.card}${isActive ? ` ${styles.cardActive}` : ''}${wrapped ? ` ${styles.cardJump}` : ''}`}
              data-offset={offset}
              aria-roledescription="slide"
              aria-label={`${space.label}, ${i + 1} of ${count}`}
              aria-hidden={Math.abs(offset) > 1 ? true : undefined}
              onClickCapture={isActive ? undefined : (event) => { event.preventDefault(); event.stopPropagation(); setActive(i); }}
            >
              <SpaceCard space={space} focusable={isActive} />
            </article>
          );
        })}
      </div>

      <p className={styles.srOnly} aria-live="polite">{current.label}</p>

      <div className={styles.controls}>
        <button type="button" className={styles.arrow} onClick={() => step(-1)} aria-label="Previous space">
          <ArrowLeft size={18} aria-hidden="true" />
        </button>
        <Link href="/marketplace" className={styles.moreLink}>View more spaces</Link>
        <button type="button" className={styles.arrow} onClick={() => step(1)} aria-label="Next space">
          <ArrowRight size={18} aria-hidden="true" />
        </button>
      </div>
    </section>
  );
};

const SpaceCard: React.FC<{ space: FeaturedSpace; focusable: boolean }> = ({ space, focusable }) => {
  const { listing } = space;
  const [photoFailed, setPhotoFailed] = useState(false);
  const photo = listing?.photoUrl && !photoFailed ? listing.photoUrl : null;

  return (
    <>
      {photo
        ? <img className={styles.photo} src={photo} alt="" loading="lazy" decoding="async" draggable={false} onError={() => setPhotoFailed(true)} />
        : <div className={`${styles.photo} ${styles.photoEmpty}`} data-niche={space.niche} aria-hidden="true" />}
      <div className={styles.shade} aria-hidden="true" />

      <div className={styles.body}>
        <h3 className={styles.title}>{listing ? listing.title : space.label}</h3>
        <span className={styles.category}>{space.label}</span>
        <p className={styles.summary}>
          {listing
            ? (listing.summary || 'Details from the host are on the listing.')
            : `${space.label} are coming to VaRoom soon.`}
        </p>
        {listing && (
          <p className={styles.price}>
            {listing.price
              ? <>{listing.price}{listing.priceUnit && <span>{` ${listing.priceUnit}`}</span>}</>
              : <span>Price on request</span>}
          </p>
        )}
        <Link href={space.href} className={styles.explore} tabIndex={focusable ? undefined : -1}>
          Explore
        </Link>
      </div>
    </>
  );
};
