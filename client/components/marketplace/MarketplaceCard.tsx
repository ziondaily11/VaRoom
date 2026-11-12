import React, { useEffect, useRef, useState } from 'react';
import { getSupabaseClient } from '../../lib/supabase/client';
import { resolveStoredPhotoUrl, PHOTO_WIDTH } from '../resolveStoredPhotoUrl';
import { loadPublicListingVideo, type ListingVideo } from '../../lib/media/listingVideo';
import {
  cardLocation, categoryLabel, categoryTone, formatPrice, normalizeListingTitle, propertyRooms, type MarketplaceListing,
} from '../../lib/marketplace/marketplace';
import {
  ICON_BATH, ICON_BED, ICON_BOOKMARK_FILLED, ICON_BOOKMARK_OUTLINE, ICON_CHEVRON_LEFT, ICON_CHEVRON_RIGHT, ICON_PIN,
} from './marketplaceIcons';

// One Marketplace listing card: a full-bleed photo (or the listing's muted
// looping video once the card is near the viewport), a category tag, and a
// floating panel with the title, location, price and save button.

// One observer for every card on the page.
const nearViewCallbacks = new Map<Element, () => void>();
let nearViewObserver: IntersectionObserver | null = null;

function observeNearView(element: Element, callback: () => void): () => void {
  if (typeof IntersectionObserver === 'undefined') {
    callback();
    return () => {};
  }
  if (!nearViewObserver) {
    nearViewObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        const run = nearViewCallbacks.get(entry.target);
        nearViewCallbacks.delete(entry.target);
        nearViewObserver?.unobserve(entry.target);
        run?.();
      });
    }, { rootMargin: '240px' });
  }
  nearViewCallbacks.set(element, callback);
  nearViewObserver.observe(element);
  return () => {
    nearViewCallbacks.delete(element);
    nearViewObserver?.unobserve(element);
  };
}

const svg = (markup: string) => ({ __html: markup });

interface Props {
  listing: MarketplaceListing;
  saved: boolean;
  token: string | null;
  onOpen: (href: string) => void;
  onSave: (listingId: string) => void;
}

/** One photo slide, with its own loading and failure states. */
function CardPhoto({ url, alt, fallback, eager }: { url: string; alt: string; fallback: string; eager: boolean }) {
  const [state, setState] = useState<'loading' | 'loaded' | 'error'>('loading');
  if (state === 'error') return <div className="card-slide"><span className="image-fallback"><div className="placeholder">{fallback}</div></span></div>;
  return (
    <div className="card-slide">
      {state === 'loading' && <div className="card-media-loading" aria-hidden="true" />}
      <img
        src={url}
        alt={alt}
        loading={eager ? 'eager' : 'lazy'}
        draggable={false}
        style={{ opacity: state === 'loaded' ? 1 : 0, transition: 'opacity .2s ease' }}
        onLoad={() => setState('loaded')}
        onError={() => setState('error')}
      />
    </div>
  );
}

export default function MarketplaceCard({ listing, saved, token, onOpen, onSave }: Props) {
  const mediaRef = useRef<HTMLDivElement>(null);
  const slidesRef = useRef<HTMLDivElement>(null);
  const [slide, setSlide] = useState(0);
  const [video, setVideo] = useState<ListingVideo | null>(null);
  const [videoPending, setVideoPending] = useState(false);
  const [videoFailed, setVideoFailed] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const element = mediaRef.current;
    if (!element) return undefined;
    let cancelled = false;
    const stop = observeNearView(element, () => {
      setVideoPending(true);
      loadPublicListingVideo(listing.id, token).then((result) => {
        if (cancelled) return;
        setVideo(result && result.videoUrl ? result : null);
        if (!result || !result.videoUrl) setVideoPending(false);
      });
    });
    return () => { cancelled = true; stop(); };
    // One lookup per listing; the token only authorises it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listing.id]);

  const title = normalizeListingTitle(listing.title || '');
  const label = categoryLabel(listing.category);
  const href = `/booking?listing=${listing.id}`;
  const client = getSupabaseClient();
  const photoUrls = (listing.listing_photos || [])
    .filter((item) => item && item.storage_path)
    .map((item) => resolveStoredPhotoUrl(item.storage_path, 'listing-photos', client, PHOTO_WIDTH.card))
    .filter((url): url is string => Boolean(url));
  const price = formatPrice(listing.listing_booking_details, listing.category);
  const location = cardLocation(listing);
  const rooms = propertyRooms(listing);
  const showVideo = Boolean(video && video.videoUrl && !videoFailed);
  const slideCount = photoUrls.length + (showVideo ? 1 : 0);

  // Swipe (touch) or the arrows (pointer) move through the slides; the
  // counter follows the scroll position.
  const go = (step: number) => {
    const strip = slidesRef.current;
    if (strip) strip.scrollBy({ left: step * strip.clientWidth, behavior: 'smooth' });
  };
  const onSlidesScroll = () => {
    const strip = slidesRef.current;
    if (strip && strip.clientWidth) setSlide(Math.round(strip.scrollLeft / strip.clientWidth));
  };

  const media: React.ReactNode = slideCount === 0
    ? <div className="card-media-empty" aria-hidden="true" />
    : (
      <div className="card-slides" ref={slidesRef} onScroll={onSlidesScroll}>
        {showVideo && (
          <div className="card-slide">
            <video
              ref={videoRef}
              className="card-video"
              muted
              playsInline
              autoPlay
              loop
              preload="auto"
              poster={video?.thumbnailUrl || undefined}
              src={video?.videoUrl || undefined}
              onLoadedData={() => {
                setVideoPending(false);
                videoRef.current?.play().catch((error: Error) => console.warn('Marketplace video autoplay unavailable:', error.message));
              }}
              onError={() => { setVideoPending(false); setVideoFailed(true); }}
            />
          </div>
        )}
        {photoUrls.map((url, index) => (
          <CardPhoto key={url} url={url} alt={index ? `${title} (photo ${index + 1})` : title} fallback={label} eager={index === 0} />
        ))}
      </div>
    );

  return (
    <div
      className="card"
      data-listing-id={listing.id}
      tabIndex={0}
      role="link"
      aria-label={`Open listing: ${title}`}
      onClick={(event) => {
        if ((event.target as Element).closest('.card-save, .card-nav')) return;
        event.preventDefault();
        onOpen(href);
      }}
      onKeyDown={(event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        if ((event.target as Element).closest('.card-save, .card-nav')) return;
        event.preventDefault();
        onOpen(href);
      }}
    >
      <div className={`card-media${videoPending ? ' is-loading' : ''}`} data-media-listing-id={listing.id} ref={mediaRef}>
        {media}
      </div>
      {slideCount > 1 && (
        <>
          <span className="card-count" aria-hidden="true">{`${Math.min(slide, slideCount - 1) + 1}/${slideCount}`}</span>
          <button type="button" className="card-nav card-nav--prev" aria-label="Previous photo" disabled={slide === 0} onClick={() => go(-1)} dangerouslySetInnerHTML={svg(ICON_CHEVRON_LEFT)} />
          <button type="button" className="card-nav card-nav--next" aria-label="Next photo" disabled={slide >= slideCount - 1} onClick={() => go(1)} dangerouslySetInnerHTML={svg(ICON_CHEVRON_RIGHT)} />
        </>
      )}
      <span className={`card-category card-category--${categoryTone(listing.category)}`}>{label}</span>
      <div className="card-body">
        <div className="card-text">
          <div className="card-title">{title}</div>
          {location && (
            <div className="card-loc">
              <span className="card-loc-pin" aria-hidden="true" dangerouslySetInnerHTML={svg(ICON_PIN)} />
              <span className="card-loc-text">{location}</span>
            </div>
          )}
          {(rooms.beds || rooms.baths != null) && (
            <div className="card-rooms">
              {rooms.beds && (
                <span className="card-room" aria-label={/^\d+$/.test(rooms.beds) ? `${rooms.beds} bedrooms` : rooms.beds}>
                  <span className="card-room-icon" aria-hidden="true" dangerouslySetInnerHTML={svg(ICON_BED)} />{rooms.beds}
                </span>
              )}
              {rooms.baths != null && (
                <span className="card-room" aria-label={`${rooms.baths} bathrooms`}>
                  <span className="card-room-icon" aria-hidden="true" dangerouslySetInnerHTML={svg(ICON_BATH)} />{rooms.baths}
                </span>
              )}
            </div>
          )}
          {price
            ? (price.isSale
              ? <div className="card-price">{`${price.isStarting ? 'From ' : ''}KSh ${price.amount.toLocaleString()}`}</div>
              : <div className="card-price">{`KSh ${price.amount.toLocaleString()}`}<span>{`/${price.unit}`}</span></div>)
            : <div className="card-price"><span>Price on request</span></div>}
        </div>
        <button
          type="button"
          className={`card-save${saved ? ' saved' : ''}`}
          data-listing-id={listing.id}
          aria-label={saved ? 'Remove from saved' : 'Save'}
          aria-pressed={saved}
          onClick={(event) => { event.stopPropagation(); onSave(listing.id); }}
          dangerouslySetInnerHTML={svg(saved ? ICON_BOOKMARK_FILLED : ICON_BOOKMARK_OUTLINE)}
        />
      </div>
    </div>
  );
}
