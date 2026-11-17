import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import type { FeaturedSpace, SpaceNicheId } from '../../lib/landing/featuredSpaces';
import styles from './SpacesSection.module.css';

interface SpacesSectionProps {
  spaces: FeaturedSpace[];
}

type ShownSpace = FeaturedSpace & { listing: NonNullable<FeaturedSpace['listing']> & { photoUrl: string } };

/** A card's place relative to the centre card: -2 … 2 for five cards, wrapping around. */
function offsetOf(index: number, active: number, count: number): number {
  const half = Math.floor(count / 2);
  return ((index - active + count + half) % count) - half;
}

const SWIPE_PX = 40;

// Page 2: one card per niche in a fanned row, the centre card largest.
// Side cards come to the centre when pressed; arrows, keys and swipes rotate.
// Every card shows a photo: one whose photo fails to load leaves the row.
export const SpacesSection: React.FC<SpacesSectionProps> = ({ spaces }) => {
  const [failed, setFailed] = useState<ReadonlySet<SpaceNicheId>>(() => new Set());
  const shown = useMemo(
    () => spaces.filter((space): space is ShownSpace => Boolean(space.listing?.photoUrl) && !failed.has(space.slot)),
    [spaces, failed],
  );
  const count = shown.length;

  // The centre card is remembered by its slot, so it stays put when another card leaves.
  const [activeSlot, setActiveSlot] = useState<SpaceNicheId | null>(null);
  const foundActive = shown.findIndex((space) => space.slot === activeSlot);
  const active = foundActive >= 0 ? foundActive : Math.floor(count / 2);

  const offsets = shown.map((_, i) => offsetOf(i, active, count));
  // A card that wraps from one end to the other jumps instead of sliding across.
  const previousOffsets = useRef<Map<SpaceNicheId, number>>(new Map());
  useEffect(() => {
    previousOffsets.current = new Map(shown.map((space, i) => [space.slot, offsets[i]]));
  });
  const swipeStart = useRef<number | null>(null);

  const step = useCallback((delta: number) => {
    if (!count) return;
    setActiveSlot(shown[(active + delta + count) % count].slot);
  }, [active, count, shown]);

  const dropCard = useCallback((slot: SpaceNicheId) => {
    setFailed((current) => new Set(current).add(slot));
  }, []);

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

  return (
    <section id="spaces" className={`snap-page ${styles.section}`} aria-labelledby="spaces-heading">
      <div className={styles.header}>
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
        {shown.map((space, i) => {
          const offset = offsets[i];
          const isActive = offset === 0;
          const wrapped = Math.abs(offset - (previousOffsets.current.get(space.slot) ?? offset)) > 1;
          return (
            <article
              key={space.slot}
              className={`${styles.card}${isActive ? ` ${styles.cardActive}` : ''}${wrapped ? ` ${styles.cardJump}` : ''}`}
              data-offset={offset}
              aria-roledescription="slide"
              aria-label={`${space.label}, ${i + 1} of ${count}`}
              aria-hidden={Math.abs(offset) > 1 ? true : undefined}
              onClickCapture={isActive ? undefined : (event) => { event.preventDefault(); event.stopPropagation(); setActiveSlot(space.slot); }}
            >
              <SpaceCard space={space} focusable={isActive} onPhotoError={dropCard} />
            </article>
          );
        })}
      </div>

      <p className={styles.srOnly} aria-live="polite">{shown[active].label}</p>

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

interface SpaceCardProps {
  space: ShownSpace;
  focusable: boolean;
  onPhotoError: (slot: SpaceNicheId) => void;
}

const SpaceCard: React.FC<SpaceCardProps> = ({ space, focusable, onPhotoError }) => {
  const { listing } = space;
  // A photo that failed before hydration fires no error React can see.
  const checkLoaded = useCallback((img: HTMLImageElement | null) => {
    if (img && img.complete && img.naturalWidth === 0) onPhotoError(space.slot);
  }, [onPhotoError, space.slot]);
  return (
    <>
      <img
        ref={checkLoaded}
        className={styles.photo}
        src={listing.photoUrl}
        alt=""
        loading="lazy"
        decoding="async"
        draggable={false}
        onError={() => onPhotoError(space.slot)}
      />
      <div className={styles.shade} aria-hidden="true" />

      <div className={styles.body}>
        <h3 className={styles.title}>{listing.title}</h3>
        <span className={styles.category}>{space.label}</span>
        <p className={styles.summary}>{listing.summary || 'Details from the host are on the listing.'}</p>
        <p className={styles.price}>
          {listing.price
            ? <>{listing.price}{listing.priceUnit && <span>{` ${listing.priceUnit}`}</span>}</>
            : <span>Price on request</span>}
        </p>
        <Link href={space.href} className={styles.explore} tabIndex={focusable ? undefined : -1}>
          Explore
        </Link>
      </div>
    </>
  );
};
