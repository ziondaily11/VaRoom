import React, { useRef, useState } from 'react';

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

function MobileGallery({ media }: { media: ReviewMedia[] }) {
  const track = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  if (!media.length) return null;
  const move = (direction: number) => { if (track.current) track.current.scrollBy({ left: direction * track.current.clientWidth, behavior: 'smooth' }); };
  return (
    <div className="review-mobile-gallery">
      <div
        className="review-mobile-gallery-track"
        ref={track}
        onScroll={(event) => { const element = event.currentTarget; setActive(Math.round(element.scrollLeft / Math.max(element.clientWidth, 1))); }}
      >
        {media.map((item, index) => (
          <div className="review-mobile-gallery-slide" key={item.url}>
            {item.video ? <video src={item.url} muted playsInline controls />
              : <img src={item.url} alt={index === 0 ? 'Listing cover photo' : `Listing photo ${index + 1}`} />}
          </div>
        ))}
      </div>
      {media.length > 1 && (
        <div className="review-mobile-gallery-controls">
          <button type="button" className="review-gallery-arrow" aria-label="Previous photo" onClick={() => move(-1)}>‹</button>
          <div className="review-gallery-dots" aria-label="Photo position">
            {media.map((item, index) => <span key={item.url} className={`review-gallery-dot${index === active ? ' active' : ''}`} />)}
          </div>
          <button type="button" className="review-gallery-arrow" aria-label="Next photo" onClick={() => move(1)}>›</button>
        </div>
      )}
    </div>
  );
}

/**
 * The review step's photo panel. list.html replaced this panel's contents
 * with the cover each time the review rendered, so the badge and caption
 * never showed on step 5; that look is kept.
 */
export function ReviewHero({ media }: { media: ReviewMedia[] }) {
  const cover = media[0] || null;
  const background = cover && !cover.video ? `url('${cover.url}')` : cover ? 'none' : "url('/assets/listing-wizard/step-5.jpg')";
  return (
    <div className="step-photo" id="review-hero-photo" style={{ backgroundImage: background }}>
      {cover && cover.video && <video src={cover.url} autoPlay muted loop playsInline style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 'inherit', display: 'block' }} />}
      <MobileGallery media={media} />
    </div>
  );
}
