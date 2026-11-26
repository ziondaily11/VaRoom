import React, { useEffect, useRef } from 'react';

// Step 5's review card, checklist and photo panel (unchanged from
// renderReviewSummary / renderMobileReviewGallery in legacy-pages/list.html).

export interface ReviewMedia { url: string; video: boolean }

export interface ReviewLine { ok: boolean | 'optional'; text: string }

function Check({ ok }: { ok: ReviewLine['ok'] }) {
  if (ok === true) return <span className="check">✓</span>;
  if (ok === 'optional') return <span className="check" style={{ color: '#C9BDB8' }}>○</span>;
  return <span className="check" style={{ color: 'var(--red)' }}>!</span>;
}

export function ReviewCard({ title, meta, price, cover, location, amenities, policy }: {
  title: string;
  meta: string;
  price: string;
  cover: ReviewMedia | null;
  location: ReviewLine;
  amenities: ReviewLine;
  policy: ReviewLine | null;
}) {
  return (
    <>
      <div className="review-card">
        <div className={`review-thumb${cover ? '' : ' placeholder'}`} id="review-thumb">
          {!cover ? 'No media'
            : cover.video ? <video src={cover.url} autoPlay muted loop playsInline style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 10, display: 'block' }} />
              : <img src={cover.url} alt="Cover photo" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 10 }} />}
        </div>
        <div>
          <h4 id="review-title">{title}</h4>
          <div className="review-meta" id="review-meta">{meta}</div>
          <div className="review-price" id="review-price">{price}</div>
        </div>
      </div>
      <ul className="review-checklist">
        <li><span className="check">✓</span> Details and description added</li>
        <li id="review-location-line"><Check ok={location.ok} /> {location.text}</li>
        <li id="review-amenities-line"><Check ok={amenities.ok} /> {amenities.text}</li>
        {/* .review-checklist li is display:flex, which beat `hidden`: list.html showed "Property policy document attached" on every niche. */}
        <li id="review-policy-line" hidden={!policy} style={policy ? undefined : { display: 'none' }}>{policy && <><Check ok={policy.ok} /> {policy.text}</>}</li>
        <li id="review-pricing-line"><span className="check">✓</span> Pricing and booking terms set</li>
      </ul>
    </>
  );
}

/**
 * Every photo and video the host chose, one at a time: swipe or scroll, the
 * arrows, the dots or the arrow keys. `index` is the one showing (the review
 * card's thumbnail follows it).
 */
function ReviewGallery({ media, index, onIndex }: { media: ReviewMedia[]; index: number; onIndex: (index: number) => void }) {
  const track = useRef<HTMLDivElement>(null);
  // While the carousel slides itself (arrow, dot, key), the positions it passes
  // are not the photo being shown: the count, dots and thumbnail wait for the target.
  const slidingTo = useRef<number | null>(null);
  const slideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const count = media.length;
  const showingOf = (element: HTMLDivElement) => Math.round(element.scrollLeft / Math.max(element.clientWidth, 1));
  const stopSliding = () => { slidingTo.current = null; if (slideTimer.current) clearTimeout(slideTimer.current); slideTimer.current = null; };

  // The host removed photos past the one showing: show the last one. Otherwise the track follows the index.
  useEffect(() => {
    if (!count) return;
    if (index > count - 1) { onIndex(count - 1); return; }
    const element = track.current;
    if (element && slidingTo.current === null && showingOf(element) !== index) element.scrollTo({ left: index * element.clientWidth });
  }, [count, index, onIndex]);
  useEffect(() => stopSliding, []);

  if (!count) return null;
  // The photo on screen: the index, kept in range for the moment before the effect above corrects it.
  const shown = Math.min(index, count - 1);
  const go = (target: number) => {
    const next = (target + count) % count;
    const element = track.current;
    if (element) {
      // Neighbours slide; a wrap-around or a far dot goes straight there instead of racing past every photo.
      const slide = Math.abs(next - shown) === 1;
      stopSliding();
      if (slide) {
        slidingTo.current = next;
        // A slide that never lands (hidden step, interrupted) must not freeze the count.
        slideTimer.current = setTimeout(stopSliding, 1000);
      }
      element.scrollTo({ left: next * element.clientWidth, behavior: slide ? 'smooth' : 'auto' });
    }
    onIndex(next);
  };
  const many = count > 1;
  return (
    <div className="review-gallery" role="region" aria-roledescription="carousel" aria-label="Your listing's photos and videos" tabIndex={many ? 0 : undefined}
      onKeyDown={(event) => {
        if (!many) return;
        if (event.key === 'ArrowLeft') { event.preventDefault(); go(shown - 1); }
        if (event.key === 'ArrowRight') { event.preventDefault(); go(shown + 1); }
      }}>
      <div
        className="review-gallery-track"
        ref={track}
        // The host swiping or scrolling takes over from a slide in progress.
        onPointerDown={stopSliding}
        onWheel={stopSliding}
        onScroll={(event) => {
          const showing = showingOf(event.currentTarget);
          if (slidingTo.current !== null) { if (showing === slidingTo.current) stopSliding(); return; }
          if (showing !== shown && showing >= 0 && showing < count) onIndex(showing);
        }}
      >
        {media.map((item, position) => (
          <div className="review-gallery-slide" key={item.url} aria-roledescription="slide" aria-label={`${position + 1} of ${media.length}`} aria-hidden={position !== shown}>
            {item.video ? <video src={item.url} muted playsInline controls />
              : <img src={item.url} alt={position === 0 ? 'Listing cover photo' : `Listing photo ${position + 1}`} />}
          </div>
        ))}
      </div>
      {many && (
        <>
          <span className="review-gallery-count" aria-live="polite">{shown + 1} / {media.length}</span>
          <div className="review-gallery-controls">
            <button type="button" className="review-gallery-arrow" aria-label="Previous photo" onClick={() => go(shown - 1)}>‹</button>
            <div className="review-gallery-dots" role="group" aria-label="Choose a photo">
              {media.map((item, position) => (
                <button key={item.url} type="button" className={`review-gallery-dot${position === shown ? ' active' : ''}`}
                  aria-label={`Show ${position === 0 ? 'the cover' : `photo ${position + 1}`}`} aria-current={position === shown || undefined} onClick={() => go(position)} />
              ))}
            </div>
            <button type="button" className="review-gallery-arrow" aria-label="Next photo" onClick={() => go(shown + 1)}>›</button>
          </div>
        </>
      )}
    </div>
  );
}

/**
 * The review step's photo panel: a carousel of every chosen photo and video,
 * on every screen size. With none chosen it keeps the step's own picture.
 */
export function ReviewHero({ media, index, onIndex }: { media: ReviewMedia[]; index: number; onIndex: (index: number) => void }) {
  return (
    <div className="step-photo" id="review-hero-photo" style={{ backgroundImage: media.length ? 'none' : "url('/assets/listing-wizard/step-5.jpg')" }}>
      <ReviewGallery media={media} index={index} onIndex={onIndex} />
    </div>
  );
}
