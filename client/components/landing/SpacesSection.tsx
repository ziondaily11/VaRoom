import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import type { FeaturedSpace, SpaceNicheId, SpaceSlide } from '../../lib/landing/featuredSpaces';
import styles from './SpacesSection.module.css';

interface SpacesSectionProps {
  spaces: FeaturedSpace[];
}

/** A card as rendered: its niche, and the listings it rotates through (at least one). */
interface ShownSpace {
  slot: SpaceNicheId;
  label: string;
  slides: SpaceSlide[];
}

/** A card's place relative to the centre card: -2 … 2 for five cards, wrapping around. */
function offsetOf(index: number, active: number, count: number): number {
  const half = Math.floor(count / 2);
  return ((index - active + count + half) % count) - half;
}

/** The card's first listing, then its alternates; only those with a photo. */
function slidesOf(space: FeaturedSpace): SpaceSlide[] {
  const first = space.listing?.photoUrl
    ? [{ listing: { ...space.listing, photoUrl: space.listing.photoUrl }, href: space.href }]
    : [];
  return [...first, ...(space.alternates || []).filter((slide) => slide.listing.photoUrl)];
}

const SWIPE_PX = 40;
/** One card changes listing per tick, in turn, so each card changes every few ticks. */
const ROTATE_MS = 3500;

const prefersReducedMotion = (): boolean => (
  typeof window !== 'undefined' && Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches));

/** Resolves true once the photo is downloaded and decoded, false if it cannot load. */
function preloadPhoto(url: string): Promise<boolean> {
  return new Promise((resolve) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => { img.decode().then(() => resolve(true), () => resolve(true)); };
    img.onerror = () => resolve(false);
    img.src = url;
  });
}

// Page 2: one card per niche in a fanned row, the centre card largest.
// Side cards come to the centre when pressed; arrows, keys and swipes rotate.
// Each card also cycles through a few listings of its niche, one card at a
// time, while the row is on screen and nobody is pointing at or focused in it.
// Every card shows a photo: a listing whose photo fails is skipped, and a card
// with none left leaves the row.
export const SpacesSection: React.FC<SpacesSectionProps> = ({ spaces }) => {
  const [failed, setFailed] = useState<ReadonlySet<string>>(() => new Set());
  const shown = useMemo<ShownSpace[]>(() => spaces
    .map((space) => ({
      slot: space.slot,
      label: space.label,
      slides: slidesOf(space).filter((slide) => !failed.has(slide.listing.id)),
    }))
    .filter((space) => space.slides.length > 0), [spaces, failed]);
  const count = shown.length;

  // The centre card is remembered by its slot, so it stays put when another card leaves.
  const [activeSlot, setActiveSlot] = useState<SpaceNicheId | null>(null);
  const foundActive = shown.findIndex((space) => space.slot === activeSlot);
  const active = foundActive >= 0 ? foundActive : Math.floor(count / 2);

  // Which listing each card shows, as a count of how often it has moved on.
  const [turns, setTurns] = useState<Partial<Record<SpaceNicheId, number>>>({});
  const slideOf = (space: ShownSpace): SpaceSlide => space.slides[(turns[space.slot] || 0) % space.slides.length];

  const offsets = shown.map((_, i) => offsetOf(i, active, count));
  // A card that wraps from one end to the other jumps instead of sliding across.
  const previousOffsets = useRef<Map<SpaceNicheId, number>>(new Map());
  useEffect(() => {
    previousOffsets.current = new Map(shown.map((space, i) => [space.slot, offsets[i]]));
  });
  const swipeStart = useRef<number | null>(null);

  const stageRef = useRef<HTMLDivElement | null>(null);
  const [entrance, setEntrance] = useState<'none' | 'waiting' | 'playing'>('none');
  const onScreen = useRef(false);
  const hasCards = count > 0;

  // The cards deal out from the centre the first time the row scrolls into
  // view. Rendered visible on the server, hidden only once script knows the
  // row is still off screen, so the cards never stay hidden without
  // JavaScript. The same observer tells the rotation whether the row is seen.
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage || typeof IntersectionObserver === 'undefined') return undefined;
    let waiting = !prefersReducedMotion() && stage.getBoundingClientRect().top >= window.innerHeight * 0.85;
    if (waiting) setEntrance('waiting');
    const observer = new IntersectionObserver((entries) => {
      onScreen.current = entries.some((entry) => entry.isIntersecting);
      if (waiting && onScreen.current) {
        waiting = false;
        setEntrance('playing');
      }
    }, { threshold: 0.25 });
    observer.observe(stage);
    return () => observer.disconnect();
  }, [hasCards]);

  // Rotation. Paused while the row is off screen, the tab is hidden, or the
  // visitor points at or focuses inside the row (so nothing changes under
  // them), and off entirely for reduced motion. The next photo is downloaded
  // before the card changes, so a card never turns blank.
  const hovered = useRef(false);
  const focused = useRef(false);
  const latest = useRef({ shown, turns });
  latest.current = { shown, turns };
  const rotates = shown.some((space) => space.slides.length > 1);
  useEffect(() => {
    if (!rotates || prefersReducedMotion()) return undefined;
    let next = 0;
    let busy = false;
    const timer = window.setInterval(() => {
      if (busy || !onScreen.current || hovered.current || focused.current || document.hidden) return;
      const { shown: cards, turns: current } = latest.current;
      const rotating = cards.filter((space) => space.slides.length > 1);
      if (!rotating.length) return;
      const card = rotating[next % rotating.length];
      next += 1;
      const turn = (current[card.slot] || 0) + 1;
      const slide = card.slides[turn % card.slides.length];
      busy = true;
      void preloadPhoto(slide.listing.photoUrl).then((loads) => {
        busy = false;
        if (!loads) {
          setFailed((was) => new Set(was).add(slide.listing.id));
          return;
        }
        setTurns((was) => ({ ...was, [card.slot]: turn }));
      });
    }, ROTATE_MS);
    return () => window.clearInterval(timer);
  }, [rotates]);

  const step = useCallback((delta: number) => {
    if (!count) return;
    setActiveSlot(shown[(active + delta + count) % count].slot);
  }, [active, count, shown]);

  const dropSlide = useCallback((listingId: string) => {
    setFailed((current) => new Set(current).add(listingId));
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
    <section
      id="spaces"
      className={`snap-page ${styles.section}${entrance === 'waiting' ? ` ${styles.entranceWaiting}` : ''}${entrance === 'playing' ? ` ${styles.entrancePlaying}` : ''}`}
      aria-labelledby="spaces-heading"
    >
      <div className={styles.header}>
        <h2 id="spaces-heading" className={styles.headline}>
          Discover <em>Spaces for</em>
          <br />
          <em>Every</em> Occasion
        </h2>
      </div>

      <div
        ref={stageRef}
        className={styles.stage}
        role="region"
        aria-roledescription="carousel"
        aria-label="Spaces on VaRoom"
        tabIndex={0}
        onKeyDown={onKeyDown}
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onPointerCancel={() => { swipeStart.current = null; }}
        onPointerEnter={(event) => { if (event.pointerType === 'mouse') hovered.current = true; }}
        onPointerLeave={() => { hovered.current = false; }}
        onFocus={() => { focused.current = true; }}
        onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) focused.current = false; }}
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
              style={{ '--enter-order': Math.abs(offset) } as React.CSSProperties}
              aria-roledescription="slide"
              aria-label={`${space.label}, ${i + 1} of ${count}`}
              aria-hidden={Math.abs(offset) > 1 ? true : undefined}
              onClickCapture={isActive ? undefined : (event) => { event.preventDefault(); event.stopPropagation(); setActiveSlot(space.slot); }}
            >
              <SpaceCard label={space.label} slide={slideOf(space)} focusable={isActive} onPhotoError={dropSlide} />
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
  label: string;
  slide: SpaceSlide;
  focusable: boolean;
  onPhotoError: (listingId: string) => void;
}

/**
 * One card. When its listing changes, the new one fades in over the old,
 * which stays underneath (its text fading out) until the fade ends.
 */
const SpaceCard: React.FC<SpaceCardProps> = ({ label, slide, focusable, onPhotoError }) => {
  const [current, setCurrent] = useState(slide);
  const [leaving, setLeaving] = useState<SpaceSlide | null>(null);
  if (current.listing.id !== slide.listing.id) {
    setLeaving(current);
    setCurrent(slide);
  }
  return (
    <>
      {leaving && <SlideLayer key={leaving.listing.id} label={label} slide={leaving} state="out" focusable={false} onPhotoError={onPhotoError} />}
      <SlideLayer
        key={current.listing.id}
        label={label}
        slide={current}
        state={leaving ? 'in' : 'still'}
        focusable={focusable}
        onPhotoError={onPhotoError}
        onEntered={() => setLeaving(null)}
      />
    </>
  );
};

interface SlideLayerProps {
  label: string;
  slide: SpaceSlide;
  state: 'still' | 'in' | 'out';
  focusable: boolean;
  onPhotoError: (listingId: string) => void;
  onEntered?: () => void;
}

const SlideLayer: React.FC<SlideLayerProps> = ({ label, slide, state, focusable, onPhotoError, onEntered }) => {
  const { listing } = slide;
  // A photo that failed before hydration fires no error React can see.
  const checkLoaded = useCallback((img: HTMLImageElement | null) => {
    if (img && img.complete && img.naturalWidth === 0) onPhotoError(listing.id);
  }, [onPhotoError, listing.id]);
  const stateClass = state === 'in' ? ` ${styles.layerIn}` : state === 'out' ? ` ${styles.layerOut}` : '';
  return (
    <div
      className={`${styles.layer}${stateClass}`}
      aria-hidden={state === 'out' ? true : undefined}
      onAnimationEnd={state === 'in' ? (event) => { if (event.target === event.currentTarget) onEntered?.(); } : undefined}
    >
      <img
        ref={checkLoaded}
        className={styles.photo}
        src={listing.photoUrl}
        alt=""
        loading="lazy"
        decoding="async"
        draggable={false}
        onError={() => onPhotoError(listing.id)}
      />
      <div className={styles.shade} aria-hidden="true" />

      <div className={styles.body}>
        <h3 className={styles.title}>{listing.title}</h3>
        <span className={styles.category}>{label}</span>
        <p className={styles.summary}>{listing.summary || 'Details from the host are on the listing.'}</p>
        <p className={styles.price}>
          {listing.price
            ? <>{listing.price}{listing.priceUnit && <span>{` ${listing.priceUnit}`}</span>}</>
            : <span>Price on request</span>}
        </p>
        <Link href={slide.href} className={styles.explore} tabIndex={focusable && state !== 'out' ? undefined : -1}>
          <span>Explore</span>
          <ArrowRight size={16} className={styles.exploreArrow} aria-hidden="true" />
        </Link>
      </div>
    </div>
  );
};
