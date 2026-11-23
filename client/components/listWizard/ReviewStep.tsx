import React, { useRef } from 'react';

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
  if (!media.length) return null;
  const go = (target: number) => {
    const next = (target + media.length) % media.length;
    const element = track.current;
    if (element) element.scrollTo({ left: next * element.clientWidth, behavior: 'smooth' });
    onIndex(next);
  };
  const many = media.length > 1;
  return (
    <div className="review-gallery" role="region" aria-roledescription="carousel" aria-label="Your listing's photos and videos" tabIndex={many ? 0 : undefined}
      onKeyDown={(event) => {
        if (!many) return;
        if (event.key === 'ArrowLeft') { event.preventDefault(); go(index - 1); }
        if (event.key === 'ArrowRight') { event.preventDefault(); go(index + 1); }
      }}>
      <div
        className="review-gallery-track"
        ref={track}
        onScroll={(event) => {
          const element = event.currentTarget;
          const showing = Math.round(element.scrollLeft / Math.max(element.clientWidth, 1));
          if (showing !== index && showing >= 0 && showing < media.length) onIndex(showing);
        }}
      >
        {media.map((item, position) => (
          <div className="review-gallery-slide" key={item.url} aria-roledescription="slide" aria-label={`${position + 1} of ${media.length}`} aria-hidden={position !== index}>
            {item.video ? <video src={item.url} muted playsInline controls />
              : <img src={item.url} alt={position === 0 ? 'Listing cover photo' : `Listing photo ${position + 1}`} />}
          </div>
        ))}
      </div>
      {many && (
        <>
          <span className="review-gallery-count" aria-live="polite">{index + 1} / {media.length}</span>
          <div className="review-gallery-controls">
            <button type="button" className="review-gallery-arrow" aria-label="Previous photo" onClick={() => go(index - 1)}>‹</button>
            <div className="review-gallery-dots" role="group" aria-label="Choose a photo">
              {media.map((item, position) => (
                <button key={item.url} type="button" className={`review-gallery-dot${position === index ? ' active' : ''}`}
                  aria-label={`Show ${position === 0 ? 'the cover' : `photo ${position + 1}`}`} aria-current={position === index || undefined} onClick={() => go(position)} />
              ))}
            </div>
            <button type="button" className="review-gallery-arrow" aria-label="Next photo" onClick={() => go(index + 1)}>›</button>
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
      <ReviewGallery media={media} index={Math.min(index, Math.max(media.length - 1, 0))} onIndex={onIndex} />
    </div>
  );
}
