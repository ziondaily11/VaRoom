import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { getSupabaseClient } from '../../lib/supabase/client';
import { resolveStoredPhotoUrl } from '../resolveStoredPhotoUrl';
import { loadListingVideo, type ListingVideo } from '../../lib/media/listingVideo';
import {
  cardAmenities, cardLocation, categoryLabel, formatPrice, normalizeListingTitle, type MarketplaceListing,
} from '../../lib/marketplace/marketplace';
import { AMENITY_ICONS, ICON_BOOKMARK_FILLED, ICON_BOOKMARK_OUTLINE } from './marketplaceIcons';

// One Marketplace listing card (legacy createListingCard): photo, or the
// listing's muted looping video once the card is near the viewport.

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

export default function MarketplaceCard({ listing, saved, token, onOpen, onSave }: Props) {
  const mediaRef = useRef<HTMLDivElement>(null);
  const [imageState, setImageState] = useState<'loading' | 'loaded' | 'error'>('loading');
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
      loadListingVideo(listing.id, token).then((result) => {
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
  const photo = (listing.listing_photos || []).find((item) => item && item.storage_path);
  const photoUrl = photo ? resolveStoredPhotoUrl(photo.storage_path, 'listing-photos', getSupabaseClient()) : null;
  const price = formatPrice(listing.listing_booking_details, listing.category);
  const location = cardLocation(listing);
  const amenities = cardAmenities(listing, (key) => Boolean(AMENITY_ICONS[key]));
  const showVideo = Boolean(video && video.videoUrl && !videoFailed);

  let media: React.ReactNode;
  if (showVideo) {
    media = (
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
    );
  } else if (!photoUrl) {
    media = <div className="card-media-empty" aria-hidden="true" />;
  } else {
    media = (
      <>
        {imageState === 'loading' && <div className="card-media-loading" aria-hidden="true" />}
        {imageState !== 'error' && (
          <img
            src={photoUrl}
            alt={title}
            loading="lazy"
            style={{ opacity: imageState === 'loaded' ? 1 : 0, transition: 'opacity .2s ease' }}
            onLoad={() => setImageState('loaded')}
            onError={() => setImageState('error')}
          />
        )}
        {imageState === 'error' && <span className="image-fallback"><div className="placeholder">{label}</div></span>}
      </>
    );
  }

  return (
    <div
      className="card"
      data-listing-id={listing.id}
      tabIndex={0}
      role="link"
      aria-label={`Open listing: ${title}`}
      onClick={(event) => {
        if ((event.target as Element).closest('.card-save')) return;
        event.preventDefault();
        onOpen(href);
      }}
      onKeyDown={(event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        if ((event.target as Element).closest('.card-save')) return;
        event.preventDefault();
        onOpen(href);
      }}
    >
      <div className={`card-media${videoPending ? ' is-loading' : ''}`} data-media-listing-id={listing.id} ref={mediaRef}>
        {media}
        <span className="card-verified">{label}</span>
        <button
          type="button"
          className={`card-save ${saved ? 'saved' : ''}`}
          data-listing-id={listing.id}
          aria-label="Save"
          onClick={(event) => { event.stopPropagation(); onSave(listing.id); }}
          dangerouslySetInnerHTML={svg(saved ? ICON_BOOKMARK_FILLED : ICON_BOOKMARK_OUTLINE)}
        />
      </div>
      <div className="card-body">
        <div className="card-title">{title}</div>
        {location && <div className="card-loc">{location}</div>}
        <div className="card-amenities" aria-label="Property amenities">
          {amenities.map((key) => {
            const name = key.replace(/_/g, ' ');
            return <span key={key} className="card-amenity" title={name} aria-label={name} dangerouslySetInnerHTML={svg(AMENITY_ICONS[key])} />;
          })}
        </div>
        <div className="card-foot">
          {price
            ? (price.isSale
              ? <div className="card-price">{`${price.isStarting ? 'From ' : ''}KSh ${price.amount.toLocaleString()}`}</div>
              : <div className="card-price">{`KSh ${price.amount.toLocaleString()} `}<span>{`/ ${price.unit}`}</span></div>)
            : <div className="card-price"><span>Price on request</span></div>}
          <Link
            href={href}
            className="card-book"
            aria-label="View listing"
            onClick={(event) => {
              // A modified click opens a new tab; a plain click is the card's.
              if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) event.stopPropagation();
              else event.preventDefault();
            }}
          >View property →</Link>
        </div>
      </div>
    </div>
  );
}
