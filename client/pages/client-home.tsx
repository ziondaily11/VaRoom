import Head from 'next/head';
import { useRouter } from 'next/router';
import type { CSSProperties, ReactElement, PointerEvent as ReactPointerEvent } from 'react';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { getSupabaseClient } from '../lib/supabase/client';
import { profileStore } from '../lib/auth/session';
import { completedClientProfile } from '../lib/types/profile';
import { Music2, X } from 'lucide-react';
import ClientLayout from '../components/ClientLayout';
import styles from './ClientHome.module.css';
import { loadListingFeedCache, type ListingFeedCache } from '../lib/listingFeedCache';
import { getCachedNewsPreview, setCachedNewsPreview } from '../lib/propertyNewsCache';
import type { PropertyNewsItem } from '../lib/propertyNewsCache';

const { resolveClientHomeProfile } = require('../lib/clientHomeAccount');
const { captureScrollPosition, isClientHomePageExit, preserveAnchorPosition, restoreScrollPosition } = require('../lib/clientHomeScroll');
import { fetchClientHomeWidget, readClientHomeWidgetCache, writeClientHomeWidgetCache } from '../lib/clientHomeWidgetCache';
import { fetchClientHomeVideoMetadata, resolveClientHomePlayback } from '../lib/clientHomeVideoMetadataCache';
const useIsomorphicLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

const select = 'id,title,description,location_text,category,verified,availability_status,created_at,host_id,host:profiles!listings_host_id_fkey(full_name,verified,avatar_url,username),listing_photos(storage_path,width,height)';
const categories = [
  ['all', 'All'],
  ['airbnb', 'Airbnbs'],
  ['hotel', 'Hotels'],
  ['venue', 'Event Venues'],
  ['office', 'Offices'],
  ['shop', 'Shops'],
  ['property', 'Property'],
] as const;
const destinations = [
  { city: 'Nairobi', image: '/assets/destinations/nairobi.jpg' },
  { city: 'Mombasa', image: '/assets/destinations/mombasa.jpg' },
  { city: 'Diani', image: '/assets/destinations/diani.jpg' },
  { city: 'Kisumu', image: '/assets/destinations/kisumu.jpg' },
  { city: 'Nakuru', image: '/assets/destinations/nakuru.jpg' },
];

type View = 'home' | 'marketplace' | 'saved';
type Photo = { storage_path: string; width?: number; height?: number };
type Host = { full_name?: string; verified?: boolean; avatar_url?: string | null; username?: string };
type Listing = {
  id: string;
  title?: string;
  description?: string;
  location_text?: string;
  category?: string;
  verified?: boolean;
  availability_status?: string;
  created_at?: string;
  host_id: string;
  host?: Host | null;
  listing_photos?: Photo[];
};
type Like = { liked: boolean; count: number; loading?: boolean; unavailable?: boolean; version?: number };
type Video = { url: string; thumbnailUrl?: string | null; width?: number; height?: number };
type MediaFrame = { width: number; height: number };
type Update = { id: string; body: string; image_url?: string | null; image_urls?: string[] | null };
type News = Pick<PropertyNewsItem, 'id' | 'title' | 'source' | 'published_at'>;
type RecommendedListing = {
  id: string;
  title?: string;
  location_text?: string;
  listing_photos?: Photo[];
};

function getSessionStorageSafe(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

function photoUrl(bucket: string, path: string) {
  return `/api/photos/${encodeURIComponent(bucket)}/${path.split('/').map(encodeURIComponent).join('/')}`;
}

function listingPhoto(path?: string) {
  return path ? photoUrl('listing-photos', path) : '';
}

function avatarPhoto(path?: string | null) {
  if (!path) return '';
  return /^https?:\/\//i.test(path) ? path : photoUrl('avatars', path);
}

function safeCssUrl(value: string) {
  return `url("${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}")`;
}

function calculateMediaFrames(
  media: Array<{ url?: string; width: number; height: number }>,
  naturalSizes: Record<string, MediaFrame>,
  availableWidth: number,
  mobile: boolean,
) {
  const available = Math.max(1, availableWidth);
  const fallbackWidth = Math.min(available, 414);
  const maxHeight = mobile ? Math.min(560, available * 1.6) : 460;
  const fallbackHeight = Math.min(maxHeight, fallbackWidth / (4 / 3));
  const fallbackFrame = {
    width: Math.min(fallbackWidth, fallbackHeight * (4 / 3)),
    height: fallbackHeight,
  };
  const frames = media.map((item, index) => {
    const natural = naturalSizes[item.url || ''];
    const width = item.width > 0 ? item.width : natural?.width || 0;
    const height = item.height > 0 ? item.height : natural?.height || 0;
    if (!width || !height) return fallbackFrame;
    const ratio = width / height;
    const fittedHeight = Math.min(maxHeight, available / ratio);
    return {
      width: Math.min(available, fittedHeight * ratio),
      height: fittedHeight,
    };
  });
  if (frames.length === 0) frames.push(fallbackFrame);

  return {
    frames: frames.map((frame) => ({
      width: Math.round(frame.width),
      height: Math.round(frame.height),
    })),
    width: Math.round(Math.max(...frames.map((frame) => frame.width))),
    height: Math.round(Math.max(...frames.map((frame) => frame.height))),
  };
}

function timeAgo(value?: string) {
  const diff = value ? Date.now() - new Date(value).getTime() : 0;
  const minutes = Math.floor(diff / 60000);
  if (!value || !Number.isFinite(minutes) || minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function CalendarIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="5" width="17" height="16" rx="2" /><path d="M8 3v4M16 3v4M3.5 10h17" /></svg>;
}

function ChatIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.4 8.4 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5Z" /></svg>;
}

function HeartIcon({ filled }: { filled: boolean }) {
  return <svg viewBox="0 0 24 24" aria-hidden="true" fill={filled ? 'currentColor' : 'none'}><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" /></svg>;
}

function BookmarkIcon({ filled }: { filled: boolean }) {
  return <svg viewBox="0 0 24 24" aria-hidden="true" fill={filled ? 'currentColor' : 'none'}><path d="M6 3.5h12a1 1 0 0 1 1 1V21l-7-4-7 4V4.5a1 1 0 0 1 1-1Z" /></svg>;
}

function Gallery({
  listing,
  video,
  videoLoading,
  videoUnavailable,
  open,
}: {
  listing: Listing;
  video?: Video;
  videoLoading: boolean;
  videoUnavailable: boolean;
  open: (urls: string[], index: number) => void;
}) {
  const media = useMemo(
    () => (listing.listing_photos || []).map((photo) => ({
      url: listingPhoto(photo.storage_path),
      width: Number(photo.width) || 0,
      height: Number(photo.height) || 0,
    })).filter((photo) => photo.url),
    [listing.listing_photos],
  );
  const [activeIndex, setActiveIndex] = useState(0);
  const [availableWidth, setAvailableWidth] = useState(406);
  const [mobile, setMobile] = useState(false);
  const [loaded, setLoaded] = useState<Record<string, boolean>>({});
  const [failed, setFailed] = useState<Record<string, boolean>>({});
  const [naturalSizes, setNaturalSizes] = useState<Record<string, MediaFrame>>({});
  const [videoReady, setVideoReady] = useState(false);
  const [videoFailed, setVideoFailed] = useState(false);
  const [videoNaturalSize, setVideoNaturalSize] = useState<{
    url: string;
    width: number;
    height: number;
  } | null>(null);
  const stage = useRef<HTMLDivElement>(null);
  const pointerStart = useRef<number | null>(null);
  const videoLoadTimeout = useRef<number | null>(null);

  useEffect(() => {
    setActiveIndex(0);
  }, [listing.id]);

  useEffect(() => {
    setVideoReady(false);
    setVideoFailed(false);
    if (videoLoadTimeout.current !== null) {
      window.clearTimeout(videoLoadTimeout.current);
      videoLoadTimeout.current = null;
    }
    if (!video) return;

    videoLoadTimeout.current = window.setTimeout(() => {
      videoLoadTimeout.current = null;
      setVideoFailed(true);
    }, 20000);
    return () => {
      if (videoLoadTimeout.current !== null) {
        window.clearTimeout(videoLoadTimeout.current);
        videoLoadTimeout.current = null;
      }
    };
  }, [listing.id, video?.url]);

  useEffect(() => {
    const photoUrls = new Set(media.map((photo) => photo.url));
    const images = Array.from(
      stage.current?.querySelectorAll<HTMLImageElement>('img[data-photo-url]') || [],
    );
    const successfulImages = images.filter((image) => image.complete && image.naturalWidth > 0);

    setLoaded((current) => {
      const next = Object.fromEntries(
        Object.entries(current).filter(([url]) => photoUrls.has(url)),
      ) as Record<string, boolean>;
      let changed = Object.keys(next).length !== Object.keys(current).length;
      successfulImages.forEach((image) => {
        const url = image.dataset.photoUrl;
        if (url && !next[url]) {
          next[url] = true;
          changed = true;
        }
      });
      return changed ? next : current;
    });

    setFailed((current) => {
      const next = Object.fromEntries(
        Object.entries(current).filter(([url]) => photoUrls.has(url)),
      ) as Record<string, boolean>;
      return Object.keys(next).length === Object.keys(current).length ? current : next;
    });

    setNaturalSizes((current) => {
      const next = Object.fromEntries(
        Object.entries(current).filter(([url]) => photoUrls.has(url)),
      ) as Record<string, MediaFrame>;
      let changed = Object.keys(next).length !== Object.keys(current).length;
      successfulImages.forEach((image) => {
        const url = image.dataset.photoUrl;
        const photo = media.find((item) => item.url === url);
        if (!url || !photo || (photo.width && photo.height) || !image.naturalHeight) return;
        const existing = next[url];
        if (existing?.width === image.naturalWidth && existing.height === image.naturalHeight) return;
        next[url] = { width: image.naturalWidth, height: image.naturalHeight };
        changed = true;
      });
      return changed ? next : current;
    });
  }, [listing.id, media, video]);

  useEffect(() => {
    const parent = stage.current?.parentElement;
    if (!parent) return;
    const updateSize = () => {
      setAvailableWidth(Math.max(1, parent.clientWidth - 8));
      setMobile(window.matchMedia('(max-width: 860px)').matches);
    };
    updateSize();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(updateSize);
    observer?.observe(parent);
    window.addEventListener('resize', updateSize, { passive: true });
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', updateSize);
    };
  }, []);

  const sizing = useMemo(
    () => calculateMediaFrames(media, naturalSizes, availableWidth, mobile),
    [availableWidth, media, mobile, naturalSizes],
  );
  const urls = media.map((photo) => photo.url);
  const changeIndex = (next: number) => setActiveIndex(Math.max(0, Math.min(media.length - 1, next)));
  const onPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (pointerStart.current === null) return;
    const delta = event.clientX - pointerStart.current;
    if (Math.abs(delta) > 40) changeIndex(activeIndex + (delta < 0 ? 1 : -1));
    pointerStart.current = null;
  };

  if (video) {
    if (videoFailed) return <div className={`${styles.mediaStage} ${styles.mediaUnavailable}`} role="status">Video unavailable</div>;
    const naturalSize = videoNaturalSize?.url === video.url
      ? videoNaturalSize
      : null;
    const videoWidth = naturalSize?.width || video.width || 0;
    const videoHeight = naturalSize?.height || video.height || 0;
    const hasVideoDimensions = videoWidth > 0 && videoHeight > 0;
    const markVideoReady = () => {
      if (videoLoadTimeout.current !== null) {
        window.clearTimeout(videoLoadTimeout.current);
        videoLoadTimeout.current = null;
      }
      setVideoReady(true);
    };
    const markVideoFailed = () => {
      if (videoLoadTimeout.current !== null) {
        window.clearTimeout(videoLoadTimeout.current);
        videoLoadTimeout.current = null;
      }
      setVideoFailed(true);
    };
    const frame = calculateMediaFrames(
      [{ width: videoWidth, height: videoHeight }],
      {},
      availableWidth,
      mobile,
    );
    const maxVideoHeight = mobile ? Math.min(560, availableWidth * 1.6) : 460;
    return (
      <div
        className={`${styles.mediaStage} ${styles.videoStage}`}
        style={{
          width: frame.width,
          height: hasVideoDimensions ? frame.height : undefined,
          '--ambient-image': safeCssUrl(video.thumbnailUrl || ''),
        } as CSSProperties & { '--ambient-image': string }}
      >
        {video.thumbnailUrl && <span className={styles.mediaAmbient} aria-hidden="true" style={{ backgroundImage: safeCssUrl(video.thumbnailUrl) }} />}
        {!videoReady && <span className={styles.videoLoadingOverlay} role="status" aria-label="Loading video" />}
        <video
          className={styles.video}
          controls
          muted
          playsInline
          preload="auto"
          poster={video.thumbnailUrl || undefined}
          src={video.url}
          style={{ maxHeight: maxVideoHeight }}
          onLoadedMetadata={(event) => {
            const element = event.currentTarget;
            if (element.videoWidth > 0 && element.videoHeight > 0) {
              setVideoNaturalSize({
                url: video.url,
                width: element.videoWidth,
                height: element.videoHeight,
              });
            }
          }}
          onLoadedData={markVideoReady}
          onCanPlay={markVideoReady}
          onPlaying={markVideoReady}
          onError={markVideoFailed}
        />
      </div>
    );
  }

  if (media.length === 0) {
    if (videoLoading) return <div className={`${styles.mediaStage} ${styles.mediaLoading}`} role="status" aria-label="Loading listing media" />;
    if (videoUnavailable) return <div className={`${styles.mediaStage} ${styles.mediaUnavailable}`} role="status">Video unavailable</div>;
    return <div className={`${styles.mediaStage} ${styles.mediaEmpty}`} role="img" aria-label="No media available for this listing" />;
  }

  return (
    <div
      ref={stage}
      className={`${styles.mediaStage} ${styles.carousel} ${media.length === 1 ? styles.singleMedia : ''}`}
      style={{ width: sizing.width, height: sizing.height }}
      onPointerDown={(event) => {
        if ((event.target as HTMLElement).closest('button')) return;
        pointerStart.current = event.clientX;
      }}
      onPointerUp={onPointerUp}
      onPointerCancel={() => { pointerStart.current = null; }}
    >
      <div
        className={styles.slideTrack}
        style={{ transform: `translateX(-${activeIndex * 100}%)` }}
      >
        {media.map((photo, index) => {
          const frame = sizing.frames[index];
          return (
            <div className={styles.slide} key={photo.url}>
              <span
                className={styles.mediaAmbient}
                aria-hidden="true"
                style={{ backgroundImage: safeCssUrl(photo.url) }}
              />
              {failed[photo.url] ? (
                <div className={styles.photoUnavailable} role="status">Photo unavailable</div>
              ) : (
                <>
                  {!loaded[photo.url] && <span className={styles.imageSkeleton} aria-label="Loading photo" />}
                  <img
                    className={styles.listingImage}
                    data-photo-url={photo.url}
                    src={photo.url}
                    alt={listing.title || 'Listing'}
                    loading="lazy"
                    style={{ width: frame.width, height: frame.height, opacity: loaded[photo.url] ? 1 : 0 }}
                    onLoad={(event) => {
                      const image = event.currentTarget;
                      setLoaded((current) => current[photo.url]
                        ? current
                        : { ...current, [photo.url]: true });
                      if (image.naturalWidth && image.naturalHeight && (!photo.width || !photo.height)) {
                        setNaturalSizes((current) => {
                          const existing = current[photo.url];
                          if (existing?.width === image.naturalWidth && existing.height === image.naturalHeight) return current;
                          return {
                            ...current,
                            [photo.url]: { width: image.naturalWidth, height: image.naturalHeight },
                          };
                        });
                      }
                    }}
                    onError={() => setFailed((current) => current[photo.url]
                      ? current
                      : { ...current, [photo.url]: true })}
                    onClick={() => open(urls, index)}
                  />
                </>
              )}
            </div>
          );
        })}
      </div>
      {media.length > 1 && (
        <>
          <span className={styles.mediaIndex}>{activeIndex + 1}/{media.length}</span>
          <button type="button" className={`${styles.carouselArrow} ${styles.previous}`} aria-label="Previous photo" onClick={() => changeIndex(activeIndex - 1)}>‹</button>
          <button type="button" className={`${styles.carouselArrow} ${styles.next}`} aria-label="Next photo" onClick={() => changeIndex(activeIndex + 1)}>›</button>
          <div className={styles.mediaDots} aria-label="Choose photo">
            {media.map((photo, index) => (
              <button
                key={photo.url}
                type="button"
                className={index === activeIndex ? styles.activeDot : ''}
                aria-label={`Show photo ${index + 1}`}
                aria-current={index === activeIndex ? 'true' : undefined}
                onClick={() => changeIndex(index)}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function ListingCard({
  listing,
  firstCard,
  userId,
  like,
  saved,
  video,
  videoLoading,
  videoUnavailable,
  onSave,
  onLike,
  onChat,
  onReport,
  onOpenLightbox,
}: {
  listing: Listing;
  firstCard: boolean;
  userId: string;
  like: Like;
  saved: boolean;
  video?: Video;
  videoLoading: boolean;
  videoUnavailable: boolean;
  onSave: () => void;
  onLike: () => void;
  onChat: () => void;
  onReport: () => void;
  onOpenLightbox: (urls: string[], index: number) => void;
}) {
  const host = listing.host || {};
  const hostName = host.full_name || 'Host';
  const hostAvatar = avatarPhoto(host.avatar_url);
  const ownListing = listing.host_id === userId;
  const unavailable = listing.availability_status && listing.availability_status !== 'available';
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <article className={`${styles.card} ${firstCard ? styles.firstCard : ''}`} data-listing-id={listing.id}>
      <a className={styles.avatar} href={`/host/${encodeURIComponent(listing.host_id)}`} aria-label={`View ${hostName}'s profile`}>
        {hostAvatar
          ? <img src={hostAvatar} alt="" />
          : (hostName.charAt(0).toUpperCase() || '?')}
      </a>
      <div className={styles.cardBody}>
        <div className={styles.cardHead}>
          <div className={styles.hostDetails}>
            <a className={styles.hostName} href={`/host/${encodeURIComponent(listing.host_id)}`}>
              {hostName}{host.verified && <span className={styles.verified} aria-label="Verified host">✔</span>}
            </a>
            <div className={styles.location}>
              {host.username ? `@${host.username} · ` : ''}{listing.location_text || ''}
              {' · '}
              <a href={`/map?listing=${encodeURIComponent(listing.id)}`} className={styles.mapLink}>View on Map</a>
            </div>
          </div>
          <time className={styles.time}>{timeAgo(listing.created_at)}</time>
          {!ownListing && (
            <div className={styles.menuWrap}>
              <button
                type="button"
                className={styles.menuButton}
                aria-label="More options"
                aria-expanded={menuOpen}
                onClick={() => setMenuOpen((open) => !open)}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="12" cy="5" r="1.8" /><circle cx="12" cy="12" r="1.8" /><circle cx="12" cy="19" r="1.8" /></svg>
              </button>
              {menuOpen && <div className={styles.menuDropdown}><button type="button" onClick={() => { setMenuOpen(false); onReport(); }}>Report</button></div>}
            </div>
          )}
        </div>
        <p className={styles.caption}>{listing.description || listing.title || ''}</p>
        {unavailable && <div className={styles.statusBanner}>Status: {listing.availability_status}</div>}
        <Gallery
          listing={listing}
          video={video}
          videoLoading={videoLoading}
          videoUnavailable={videoUnavailable}
          open={onOpenLightbox}
        />
        <div className={styles.actions}>
          {ownListing || unavailable
            ? <span className={`${styles.action} ${styles.disabledAction}`} title={ownListing ? 'This is your listing' : 'This listing is not available'}><CalendarIcon />Book</span>
            : <a className={styles.action} href={`/booking?listing=${encodeURIComponent(listing.id)}`}><CalendarIcon />Book</a>}
          {ownListing
            ? <span className={`${styles.action} ${styles.disabledAction}`} title="This is your listing"><ChatIcon />Chat</span>
            : <button type="button" className={styles.action} onClick={onChat}><ChatIcon />Chat</button>}
          <button
            type="button"
            className={`${styles.action} ${styles.likeAction}`}
            data-listing-id={listing.id}
            aria-label={like.unavailable ? 'Like status unavailable' : like.liked ? 'Unlike listing' : 'Like listing'}
            aria-pressed={like.unavailable ? undefined : like.liked}
            title={like.unavailable ? 'Like information is temporarily unavailable' : undefined}
            disabled={like.loading || like.unavailable}
            onClick={onLike}
          >
            <HeartIcon filled={like.liked} />{like.unavailable ? '—' : like.count}
          </button>
          <button
            type="button"
            className={`${styles.action} ${styles.saveAction} ${saved ? styles.saved : ''}`}
            aria-pressed={saved}
            onClick={onSave}
          >
            <BookmarkIcon filled={saved} />{saved ? 'Saved' : 'Save'}
          </button>
        </div>
      </div>
    </article>
  );
}

function FeedSkeleton() {
  return (
    <div className={styles.skeletonCard} aria-hidden="true">
      <span className={`${styles.skeleton} ${styles.skeletonAvatar}`} />
      <div className={styles.skeletonBody}>
        <div className={styles.skeletonHeader}>
          <div className={styles.skeletonProfile}>
            <span className={`${styles.skeleton} ${styles.skeletonName}`} />
            <span className={`${styles.skeleton} ${styles.skeletonLocation}`} />
          </div>
          <span className={`${styles.skeleton} ${styles.skeletonTime}`} />
          <span className={`${styles.skeleton} ${styles.skeletonMenu}`} />
        </div>
        <span className={`${styles.skeleton} ${styles.skeletonLine}`} />
        <span className={`${styles.skeleton} ${styles.skeletonLine} ${styles.shortLine}`} />
        <span className={`${styles.skeleton} ${styles.skeletonMedia}`} />
        <div className={styles.skeletonActions}>
          {[0, 1, 2, 3].map((item) => <span className={`${styles.skeleton} ${styles.skeletonPill}`} key={item} />)}
        </div>
      </div>
    </div>
  );
}

function Lightbox({ value, close }: { value: { urls: string[]; index: number }; close: () => void }) {
  const [index, setIndex] = useState(value.index);
  const startX = useRef<number | null>(null);
  const go = (delta: number) => setIndex((current) => (current + delta + value.urls.length) % value.urls.length);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
      if (event.key === 'ArrowLeft') go(-1);
      if (event.key === 'ArrowRight') go(1);
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [close]);

  return (
    <div
      className={styles.lightbox}
      onClick={close}
      onTouchStart={(event) => { startX.current = event.changedTouches[0].clientX; }}
      onTouchEnd={(event) => {
        if (startX.current === null) return;
        const delta = event.changedTouches[0].clientX - startX.current;
        if (Math.abs(delta) > 40) go(delta < 0 ? 1 : -1);
        startX.current = null;
      }}
    >
      <div className={styles.lightboxStage} onClick={(event) => event.stopPropagation()}>
        <button type="button" className={styles.lightboxClose} aria-label="Close" onClick={close}>×</button>
        <img className={styles.lightboxImage} src={value.urls[index]} alt="Listing media" />
        {value.urls.length > 1 && (
          <>
            <button type="button" className={`${styles.lightboxNav} ${styles.previous}`} aria-label="Previous photo" onClick={() => go(-1)}>‹</button>
            <button type="button" className={`${styles.lightboxNav} ${styles.next}`} aria-label="Next photo" onClick={() => go(1)}>›</button>
            <span className={styles.lightboxCounter}>{index + 1} / {value.urls.length}</span>
          </>
        )}
      </div>
    </div>
  );
}

function DestinationCard({
  city,
  image,
  count,
  mobile = false,
  onSelect,
}: {
  city: string;
  image: string;
  count: number | null;
  mobile?: boolean;
  onSelect: (city: string) => void;
}) {
  const cardClass = mobile ? styles.mobileDestination : styles.destination;
  return (
    <button type="button" className={cardClass} onClick={() => onSelect(city)}>
      <img src={image} alt="" loading="lazy" />
      <span className={styles.destinationOverlay}>
        <span className={styles.destinationName}>{city}</span>
        <span className={styles.destinationCount}>
          {count === null ? '—' : count > 0 ? `${count} ${count === 1 ? 'place' : 'places'}` : 'New'}
        </span>
      </span>
    </button>
  );
}

function PropertyNewsList({ items, loading, failed }: { items: News[]; loading: boolean; failed: boolean }) {
  if (loading) return <div className={styles.widgetLoader} role="status" aria-label="Loading Property News"><span className={styles.spinner} /></div>;
  if (items.length === 0) return <p className={styles.widgetMessage}>{failed ? 'Property News could not be loaded.' : 'No Property News is available right now.'}</p>;
  return (
    <>
      {failed && <p className={styles.widgetMessage} role="status">Property News could not be refreshed.</p>}
      <div className={styles.newsList} aria-live="polite">
        {items.slice(0, 5).map((news) => {
          const dateValue = news.published_at || news.source?.published_at;
          const date = dateValue && !Number.isNaN(new Date(dateValue).getTime())
            ? new Date(dateValue).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' })
            : 'Recently';
          return (
            <article className={styles.newsItem} key={news.id}>
              <a href={`/property-news?id=${encodeURIComponent(news.id)}`} className={styles.newsTitle}>{news.title || 'Property update'}</a>
              <div className={styles.newsMeta}><span>{news.source?.name || 'VaRoom'}</span><span>•</span><span>{date}</span></div>
            </article>
          );
        })}
      </div>
    </>
  );
}

function WidgetLoader({ label }: { label: string }) {
  return <div className={styles.widgetLoader} role="status" aria-label={label}><span className={styles.spinner} /></div>;
}

function MobileFeedWidgets({
  recommended,
  recommendedLoading,
  recommendedFailed,
  updates,
  updatesLoading,
  updatesFailed,
}: {
  recommended: RecommendedListing[];
  recommendedLoading: boolean;
  recommendedFailed: boolean;
  updates: Update[];
  updatesLoading: boolean;
  updatesFailed: boolean;
}) {
  return (
    <div className={styles.mobileWidgets}>
      <section className={styles.mobileWidgetCard}>
        <div className={styles.mobileWidgetHeading}><h2>Recommended for you</h2></div>
        {recommendedLoading
          ? <div className={styles.recommendedGrid}><span className={`${styles.skeleton} ${styles.recommendationSkeleton}`} /><span className={`${styles.skeleton} ${styles.recommendationSkeleton}`} /></div>
          : recommended.length > 0 && (
            <div className={styles.recommendedGrid}>
              {recommended.slice(0, 6).map((item) => (
                <a className={styles.recommendedCard} href={`/booking?listing=${encodeURIComponent(item.id)}`} key={item.id}>
                  {item.listing_photos?.[0]?.storage_path && <img src={listingPhoto(item.listing_photos[0].storage_path)} alt="" loading="lazy" />}
                  <span><strong>{item.title || 'Listing'}</strong><small>{item.location_text || ''}</small></span>
                </a>
              ))}
            </div>
          )}
        {recommendedFailed && <p className={styles.widgetMessage} role="status">Recommended listings could not be refreshed.</p>}
      </section>
      <section className={`${styles.mobileWidgetCard} ${styles.updatesWidget}`}>
        <div className={styles.mobileWidgetHeading}><h2>VaRoom Updates</h2></div>
        <UpdateList items={updates} loading={updatesLoading} failed={updatesFailed} />
      </section>
    </div>
  );
}

function ReportModal({
  reason,
  details,
  message,
  submitting,
  onReason,
  onDetails,
  onCancel,
  onSubmit,
}: {
  reason: string;
  details: string;
  message: string;
  submitting: boolean;
  onReason: (value: string) => void;
  onDetails: (value: string) => void;
  onCancel: () => void;
  onSubmit: () => void;
}) {
  return (
    <div className={styles.modalOverlay} onClick={onCancel}>
      <div className={styles.reportModal} role="dialog" aria-modal="true" aria-labelledby="report-title" onClick={(event) => event.stopPropagation()}>
        <h2 id="report-title">Report this listing</h2>
        <p>Help us keep VaRoom trustworthy. Reports are reviewed by our team — false reports don&apos;t automatically penalize a host.</p>
        <label>
          Reason
          <select value={reason} onChange={(event) => onReason(event.target.value)}>
            <option value="fraudulent">Fraudulent — this host is scamming or misrepresenting</option>
            <option value="misleading_info">Misleading information — details don&apos;t match reality</option>
            <option value="other">Other</option>
          </select>
        </label>
        <label>
          Details (optional)
          <textarea value={details} onChange={(event) => onDetails(event.target.value)} placeholder="Anything else we should know" />
        </label>
        {message && <p className={`${styles.reportMessage} ${message.startsWith('Report submitted') ? styles.reportSuccess : styles.reportError}`} role="status">{message}</p>}
        <div className={styles.modalActions}>
          <button type="button" onClick={onCancel} disabled={submitting}>Cancel</button>
          <button type="button" className={styles.submitButton} onClick={onSubmit} disabled={submitting}>{submitting ? 'Submitting...' : 'Submit report'}</button>
        </div>
      </div>
    </div>
  );
}

export default function ClientHome() {
  const router = useRouter();
  const feed = useRef<HTMLElement>(null);
  const end = useRef<HTMLDivElement>(null);
  const cache = useRef<ListingFeedCache | null>(null);
  const loadVersion = useRef(0);
  const authEpoch = useRef(0);
  const resolvedSessionUserId = useRef<string | null>(null);
  const feedContextKey = useRef('');
  const feedContextVersion = useRef(0);
  const restoredScrollKey = useRef('');
  const scrollInteractionVersion = useRef(0);
  const anchorObserverCleanup = useRef<(() => void) | null>(null);
  const leavingClientHome = useRef(false);
  const pendingVideoIds = useRef(new Set<string>());
  const videoTimer = useRef<number | null>(null);
  const toastTimer = useRef<number | null>(null);
  const newsRequestVersion = useRef(0);
  const newsAbortController = useRef<AbortController | null>(null);
  const [user, setUser] = useState<any>(null);
  const [ready, setReady] = useState(false);
  const [feedReady, setFeedReady] = useState(false);
  const [interests, setInterests] = useState<string[]>([]);
  const [view, setView] = useState<View>('home');
  const [category, setCategory] = useState('all');
  const [search, setSearch] = useState('');
  const [term, setTerm] = useState('');
  const [items, setItems] = useState<Listing[]>([]);
  const [loadedFeedKey, setLoadedFeedKey] = useState('');
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const loadingMoreRef = useRef(false);
  const [error, setError] = useState('');
  const [authRetry, setAuthRetry] = useState(0);
  const [saved, setSaved] = useState(new Set<string>());
  const [likes, setLikes] = useState<Record<string, Like>>({});
  const [videos, setVideos] = useState<Record<string, Video>>({});
  const [videoStates, setVideoStates] = useState<Record<string, 'loading' | 'none' | 'unavailable'>>({});
  const [suspended, setSuspended] = useState(false);
  const [destCounts, setDestCounts] = useState<Record<string, number | null>>({});
  const [destinationsLoading, setDestinationsLoading] = useState(true);
  const [destinationsFailed, setDestinationsFailed] = useState(false);
  const [updates, setUpdates] = useState<Update[]>([]);
  const [updatesLoading, setUpdatesLoading] = useState(true);
  const [updatesFailed, setUpdatesFailed] = useState(false);
  const [news, setNews] = useState<News[]>([]);
  const [newsLoading, setNewsLoading] = useState(true);
  const [newsFailed, setNewsFailed] = useState(false);
  const [recommended, setRecommended] = useState<RecommendedListing[]>([]);
  const [recommendedLoading, setRecommendedLoading] = useState(true);
  const [recommendedFailed, setRecommendedFailed] = useState(false);
  const [report, setReport] = useState<string | null>(null);
  const [reportReason, setReportReason] = useState('fraudulent');
  const [reportDetails, setReportDetails] = useState('');
  const [reportMessage, setReportMessage] = useState('');
  const [submittingReport, setSubmittingReport] = useState(false);
  const [lightbox, setLightbox] = useState<{ urls: string[]; index: number } | null>(null);
  const [toastMessage, setToastMessage] = useState('');

  const showToast = (message: string) => {
    setToastMessage(message);
    if (toastTimer.current !== null) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => {
      setToastMessage('');
      toastTimer.current = null;
    }, 2200);
  };

  useIsomorphicLayoutEffect(() => {
    const cachedDestinations = readClientHomeWidgetCache<Record<string, number | null>>('destinations');
    const cachedUpdates = readClientHomeWidgetCache<Update[]>('updates');
    const cachedRecommended = readClientHomeWidgetCache<RecommendedListing[]>('recommended');
    const cachedNews = getCachedNewsPreview();
    if (cachedDestinations) {
      setDestCounts(cachedDestinations.value);
      setDestinationsLoading(false);
    }
    if (cachedUpdates) {
      setUpdates(cachedUpdates.value);
      setUpdatesLoading(false);
    }
    if (cachedRecommended) {
      setRecommended(cachedRecommended.value);
      setRecommendedLoading(false);
    }
    if (cachedNews) {
      setNews(cachedNews.items);
      setNewsLoading(false);
    }
  }, []);

  useEffect(() => {
    const timeout = window.setTimeout(() => setTerm(search.trim()), 350);
    return () => window.clearTimeout(timeout);
  }, [search]);

  useEffect(() => {
    const nextView = router.query.view === 'saved'
      ? 'saved'
      : router.query.view === 'marketplace' ? 'marketplace' : 'home';
    setView(nextView);
    if (nextView === 'home') {
      setCategory('all');
      setSearch('');
      setTerm('');
    }
  }, [router.query.view]);

  useEffect(() => {
    let active = true;
    const client = getSupabaseClient();
    if (!client) return;

    const resolveSession = async (session: any) => {
      const sessionUser = session?.user;
      const epoch = ++authEpoch.current;
      loadVersion.current += 1;
      newsRequestVersion.current += 1;
      newsAbortController.current?.abort();
      newsAbortController.current = null;
      feedContextVersion.current += 1;
      resolvedSessionUserId.current = sessionUser?.id || null;
      restoredScrollKey.current = '';
      pendingVideoIds.current.clear();
      if (videoTimer.current !== null) {
        window.clearTimeout(videoTimer.current);
        videoTimer.current = null;
      }
      setReady(false);
      setFeedReady(false);
      setLoading(true);
      setError('');
      setItems([]);
      setLoadedFeedKey('');
      setLikes({});
      setVideos({});
      setVideoStates({});
      setSaved(new Set());
      setInterests([]);
      setSuspended(false);
      if (!sessionUser) {
        setUser(null);
        if (active && epoch === authEpoch.current) {
          router.replace({
            pathname: '/',
            query: { auth: 'login', redirect: '/client-home' },
          });
        }
        return;
      }

      setUser(sessionUser);
      // Provisional first paint from the shared profile cache (A2) while the
      // authoritative read below completes.
      const cachedProfile = completedClientProfile(profileStore().peek(sessionUser.id));
      if (cachedProfile) {
        setUser(sessionUser);
        setInterests(cachedProfile.looking_timeline === 'soon'
          ? cachedProfile.interested_categories.map((value: string) => value.trim().toLowerCase()).filter(Boolean)
          : []);
        setFeedReady(true);
      }

      // Shared, deduplicated profile read (AuthProvider and the sidebar use it too).
      const profileRequest = profileStore().get(sessionUser.id);
      const profileResult = await profileRequest;
      if (!active || epoch !== authEpoch.current) return;
      const account = resolveClientHomeProfile(session, profileResult);
      if (account.kind === 'profile-error') {
        setUser(account.user);
        setFeedReady(false);
        setItems([]);
        setLoadedFeedKey('');
        setLoading(false);
        setError('Your account information could not be loaded. Please retry.');
        return;
      }
      if (account.kind === 'host') {
        router.replace('/host-home');
        return;
      }
      if (account.kind === 'onboarding') {
        router.replace('/onboarding');
        return;
      }
      if (account.kind !== 'ready') return;

      setUser(account.user);
      const nextInterests = account.profile.looking_timeline === 'soon'
        ? (account.profile.interested_categories || []).map((value: string) => value.trim().toLowerCase()).filter(Boolean)
        : [];
      setInterests(nextInterests);

      setFeedReady(true);
      const bookmarkResult = await client.from('bookmarks').select('listing_id').eq('client_id', account.user.id);
      if (!active || epoch !== authEpoch.current) return;
      if (bookmarkResult.error) setError('Saved listings could not be loaded.');
      else setSaved(new Set((bookmarkResult.data || []).map((bookmark: { listing_id: string }) => bookmark.listing_id)));
      setReady(true);

      fetch('/api/account-status', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      }).then(async (response) => {
        if (!response.ok) throw new Error('Account status could not be loaded.');
        return response.json();
      }).then((status) => {
        if (active && epoch === authEpoch.current) setSuspended(status.suspended === true);
      }).catch((statusError) => {
        console.warn('Account status could not be loaded:', statusError);
      });
    };

    let initialSessionResolved = false;
    let hasPendingInitialSession = false;
    let pendingInitialSession: any = null;
    const { data: { subscription } } = client.auth.onAuthStateChange((event, session) => {
      if (!initialSessionResolved) {
        hasPendingInitialSession = true;
        pendingInitialSession = session;
        return;
      }
      if (event === 'TOKEN_REFRESHED' && session?.user?.id === resolvedSessionUserId.current) return;
      void resolveSession(session);
    });
    Promise.all([loadListingFeedCache(), client.auth.getSession()])
      .then(([listingCache, result]) => {
        if (!active) return;
        cache.current = listingCache;
        initialSessionResolved = true;
        return resolveSession(hasPendingInitialSession ? pendingInitialSession : result.data.session);
      })
      .catch((loadError: Error) => {
        if (active) {
          setLoading(false);
          setError(loadError.message || 'Unable to start Home.');
        }
      });

    return () => {
      active = false;
      subscription.unsubscribe();
      if (videoTimer.current !== null) window.clearTimeout(videoTimer.current);
      if (toastTimer.current !== null) window.clearTimeout(toastTimer.current);
    };
  }, [authRetry, router]);

  const key = useMemo(
    () => user
      ? ['client', user.id, view, category, interests.slice().sort().join(','), term.toLowerCase()].join(':')
      : '',
    [category, interests, term, user, view],
  );
  if (feedContextKey.current !== key) {
    feedContextKey.current = key;
    feedContextVersion.current += 1;
  }

  const fetcher = useCallback(async (offset: number, limit: number) => {
    const client = getSupabaseClient();
    if (!client) throw new Error('Supabase is unavailable.');
    const listingQuery = () => {
      let query = client.from('listings').select(select)
        .eq('moderation_status', 'active').eq('availability_status', 'available');
      if (category !== 'all') query = query.eq('category', category);
      else if (view === 'home' && interests.length > 0) query = query.in('category', interests);
      return query;
    };

    if (!term) {
      return listingQuery().order('created_at', { ascending: false }).order('id', { ascending: false })
        .range(offset, offset + limit - 1)
        .overrideTypes<Listing[], { merge: false }>();
    }
    if (offset > 0) return { data: [], hasMore: false };

    const [locationResult, hostsResult] = await Promise.all([
      listingQuery().ilike('location_text', `%${term}%`)
        .order('created_at', { ascending: false }).order('id', { ascending: false }).limit(limit),
      client.from('profiles').select('id').ilike('username', `%${term}%`).limit(100),
    ]);
    if (locationResult.error) return { error: locationResult.error };
    if (hostsResult.error) return { error: hostsResult.error };
    const hostIds = ((hostsResult.data || []) as Array<{ id: string }>).map((profile) => profile.id);
    const hostResult = hostIds.length > 0
      ? await listingQuery().in('host_id', hostIds).order('created_at', { ascending: false })
        .order('id', { ascending: false }).limit(limit)
      : { data: [], error: null };
    if (hostResult.error) return { error: hostResult.error };

    const seen = new Set<string>();
    const matches = [...((locationResult.data || []) as Listing[]), ...((hostResult.data || []) as Listing[])].filter((listing: Listing) => {
      if (seen.has(listing.id)) return false;
      seen.add(listing.id);
      return true;
    });
    return { data: matches.slice(0, limit), hasMore: false };
  }, [category, interests, term, view]);

  const feedContextReady = view === 'saved' ? ready : feedReady;
  const currentFeedLoading = loadedFeedKey === key
    ? loading
    : loading || feedContextReady;
  const visibleItems = loadedFeedKey === key ? items : [];

  const loadFeed = useCallback(async (nextPage = false) => {
    if (!feedReady || !user || !cache.current || !key || view === 'saved' || (nextPage && loadingMoreRef.current)) return;
    if (!nextPage) {
      loadingMoreRef.current = false;
      setLoadingMore(false);
    }
    const currentVersion = ++loadVersion.current;
    const snapshot = cache.current.snapshot<Listing>(key) as any;
    if (!nextPage && snapshot.hasCachedPage) {
      setItems(snapshot.items as Listing[]);
      setLoadedFeedKey(key);
      setHasMore(Boolean(snapshot.hasMore));
      setLoading(false);
      setError('');
      if (snapshot.isStale) {
        const contextVersion = feedContextVersion.current;
        void cache.current.revalidate(key, fetcher).then((result: any) => {
          if (contextVersion !== feedContextVersion.current || feedContextKey.current !== key) return;
          setItems((result.items || []) as Listing[]);
          setHasMore(Boolean(result.hasMore));
        }).catch((loadError: Error) => {
          console.warn('Client Home feed refresh failed:', loadError);
        });
      }
      return;
    }

    if (nextPage) {
      loadingMoreRef.current = true;
      setLoadingMore(true);
    }
    else {
      setLoading(true);
      setItems([]);
      setLoadedFeedKey('');
      setHasMore(false);
    }
    setError('');
    try {
      const result = nextPage
        ? await cache.current.prefetchNext(key, fetcher)
        : await cache.current.fetchPage(key, 0, fetcher);
      const payload = result as any;
      if (currentVersion !== loadVersion.current) return;
      setItems((payload.items || []) as Listing[]);
      setLoadedFeedKey(key);
      setHasMore(Boolean(payload.hasMore));
    } catch (loadError) {
      if (currentVersion === loadVersion.current) {
        setError(loadError instanceof Error ? loadError.message : 'Could not load listings.');
      }
    } finally {
      if (currentVersion === loadVersion.current) {
        loadingMoreRef.current = false;
        setLoading(false);
        setLoadingMore(false);
      }
    }
  }, [feedReady, fetcher, key, user, view]);

  useIsomorphicLayoutEffect(() => {
    if (view !== 'saved') void loadFeed();
  }, [loadFeed, view]);

  useEffect(() => {
    if (view !== 'saved' || !user || !ready) return;
    let active = true;
    setLoading(true);
    setError('');
    if (saved.size === 0) {
      setItems([]);
      setLoadedFeedKey(key);
      setHasMore(false);
      setLoading(false);
      return () => { active = false; };
    }
    getSupabaseClient()!.from('listings').select(select)
      .in('id', Array.from(saved))
      .eq('moderation_status', 'active')
      .eq('availability_status', 'available')
      .then(({ data, error: savedError }: any) => {
        if (!active) return;
        setItems(data || []);
        setLoadedFeedKey(key);
        setHasMore(false);
        setLoading(false);
        if (savedError) setError(savedError.message || 'Saved listings could not be loaded.');
      });
    return () => { active = false; };
  }, [key, ready, saved, user, view]);

  useEffect(() => {
    if (items.length === 0 || !user || loadedFeedKey !== key) return;
    let active = true;
    const loadLikes = async () => {
      const client = getSupabaseClient();
      if (!client) return;
      for (let offset = 0; offset < items.length; offset += 100) {
        const ids = items.slice(offset, offset + 100).map((listing) => listing.id);
        const result = await client.rpc('get_listing_like_summaries', { p_listing_ids: ids });
        if (!active) return;
        setLikes((current) => {
          const next = { ...current };
          const summaries = Array.isArray(result.data) ? result.data : [];
          const byId = new Map(summaries.map((summary: any) => [summary.listing_id, summary]));
          const complete = !result.error && ids.every((id) => {
            const summary: any = byId.get(id);
            return Number.isSafeInteger(Number(summary?.like_count))
              && Number(summary.like_count) >= 0
              && typeof summary?.liked_by_current_user === 'boolean';
          });
          if (!complete) {
            ids.forEach((id) => {
              next[id] = { ...(next[id] || { liked: false, count: 0 }), unavailable: true };
            });
          } else {
            ids.forEach((id) => {
              const summary: any = byId.get(id);
              if (!next[summary.listing_id]?.loading) {
                next[summary.listing_id] = {
                  liked: summary.liked_by_current_user === true,
                  count: Number(summary.like_count) || 0,
                };
              }
            });
          }
          return next;
        });
      }
    };
    void loadLikes().catch((loadError) => console.error('Listing likes could not be loaded:', loadError));
    return () => { active = false; };
  }, [items, key, loadedFeedKey, user]);

  const requestVideoMedia = useCallback((listingId: string) => {
    if (!listingId || pendingVideoIds.current.has(listingId) || videos[listingId] || videoStates[listingId]) return;
    pendingVideoIds.current.add(listingId);
    setVideoStates((current) => ({ ...current, [listingId]: 'loading' }));
    if (videoTimer.current !== null) return;
    videoTimer.current = window.setTimeout(async () => {
      const ids = Array.from(pendingVideoIds.current);
      pendingVideoIds.current.clear();
      videoTimer.current = null;
      const accountId = resolvedSessionUserId.current;
      const requestEpoch = authEpoch.current;
      const isCurrent = () => Boolean(accountId) && resolvedSessionUserId.current === accountId &&
        authEpoch.current === requestEpoch;
      try {
        const client = getSupabaseClient();
        if (!client) throw new Error('Supabase client is unavailable.');
        const sessionResult = await client.auth.getSession();
        if (!isCurrent()) return;
        if (sessionResult.data.session?.user?.id !== accountId) {
          throw new Error('Video metadata request no longer matches the active account.');
        }
        const headers = sessionResult.data.session
          ? { Authorization: `Bearer ${sessionResult.data.session.access_token}` }
          : {};
        const settle = (listingIds: string[], state: 'none' | 'unavailable') => {
          if (!isCurrent()) return;
          setVideoStates((current) => {
            const next = { ...current };
            listingIds.forEach((id) => { next[id] = state; });
            return next;
          });
        };
        const loadPlayback = async (
          id: string,
          mediaId: string,
          dimensions: { width?: number | null; height?: number | null },
        ) => {
          try {
            const playback = await resolveClientHomePlayback(accountId, mediaId, async () => {
              const playbackResponse = await fetch(`/api/media/${encodeURIComponent(mediaId)}/playback`, { headers });
              if (!playbackResponse.ok) throw new Error(`Video playback lookup returned ${playbackResponse.status}.`);
              return playbackResponse.json();
            });
            if (!playback?.url) throw new Error('Video playback did not include a URL.');
            if (!isCurrent()) return;
            setVideos((current) => ({
              ...current,
              [id]: { url: playback.url, thumbnailUrl: playback.thumbnailUrl || null, width: dimensions.width || undefined, height: dimensions.height || undefined },
            }));
            settle([id], 'none');
          } catch (playbackError) {
            console.error(`Video playback for listing ${id} could not be loaded:`, playbackError);
            settle([id], 'unavailable');
          }
        };
        const loadCompatibility = async (listingIds: string[]) => {
          console.warn('Video discovery endpoint is unavailable; using the compatibility route.');
          const discovered: Record<string, { mediaId: string | null; width?: number | null; height?: number | null }> = {};
          await Promise.all(listingIds.map(async (id) => {
            try {
              const response = await fetch(`/api/properties/${encodeURIComponent(id)}/media`, { headers });
              if (!response.ok) throw new Error(`Video media lookup returned ${response.status}.`);
              const result = await response.json();
              if (!Array.isArray(result?.media)) throw new Error('Video media response was invalid.');
              const videoMedia = result.media.find((mediaItem: any) => mediaItem?.type === 'video' && typeof mediaItem.id === 'string');
              discovered[id] = videoMedia
                ? { mediaId: videoMedia.id, width: videoMedia.width, height: videoMedia.height }
                : { mediaId: null };
            } catch (fallbackError) {
              console.error(`Video media for listing ${id} could not be loaded:`, fallbackError);
              throw fallbackError;
            }
          }));
          return discovered;
        };

        for (let offset = 0; offset < ids.length; offset += 24) {
          const batch = ids.slice(offset, offset + 24);
          try {
            const metadata = await fetchClientHomeVideoMetadata(
              getSessionStorageSafe(),
              accountId,
              batch,
              async (missingIds: string[]) => {
                const discovered: Record<string, { mediaId: string | null; width?: number | null; height?: number | null }> = {};
                for (let missingOffset = 0; missingOffset < missingIds.length; missingOffset += 24) {
                  const missingBatch = missingIds.slice(missingOffset, missingOffset + 24);
                  const response = await fetch(`/api/discover/video-media?listingIds=${encodeURIComponent(missingBatch.join(','))}`, { headers });
                  if (response.status === 404 || response.status === 405) {
                    Object.assign(discovered, await loadCompatibility(missingBatch));
                    continue;
                  }
                  if (!response.ok) throw new Error(`Video media lookup returned ${response.status}.`);
                  const payload = await response.json();
                  if (!payload?.videoMedia || typeof payload.videoMedia !== 'object' || Array.isArray(payload.videoMedia)) {
                    throw new Error('Video media response was invalid.');
                  }
                  missingBatch.forEach((id) => {
                    const mediaId = payload.videoMedia[id];
                    const dimensions = payload.videoDimensions?.[id] || {};
                    discovered[id] = typeof mediaId === 'string' && mediaId
                      ? { mediaId, width: dimensions.width, height: dimensions.height }
                      : { mediaId: null };
                  });
                }
                return discovered;
              },
            );
            if (!isCurrent()) return;
            await Promise.all(batch.map(async (id) => {
              const videoMetadata = metadata[id];
              if (!videoMetadata || !videoMetadata.mediaId) {
                settle([id], 'none');
                return;
              }
              await loadPlayback(id, videoMetadata.mediaId, videoMetadata);
            }));
          } catch (lookupError) {
            console.error('Batched listing video lookup could not be completed:', lookupError);
            settle(batch, 'unavailable');
          }
        }
      } catch (lookupError) {
        console.error('Listing video discovery could not be started:', lookupError);
        if (!isCurrent()) return;
        setVideoStates((current) => {
          const next = { ...current };
          ids.forEach((id) => { next[id] = 'unavailable'; });
          return next;
        });
      }
    }, 60);
  }, [videoStates, videos]);

  useEffect(() => {
    if (items.length === 0 || loadedFeedKey !== key) return;
    const root = feed.current;
    const targets = Array.from(document.querySelectorAll<HTMLElement>('[data-media]'));
    if (!('IntersectionObserver' in window)) {
      targets.forEach((target) => requestVideoMedia(target.dataset.media || ''));
      return;
    }
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        const target = entry.target as HTMLElement;
        observer.unobserve(target);
        requestVideoMedia(target.dataset.media || '');
      });
    }, { root, rootMargin: '350px 0px', threshold: 0.01 });
    targets.forEach((target) => observer.observe(target));
    return () => observer.disconnect();
  }, [items, key, loadedFeedKey, requestVideoMedia]);

  useEffect(() => {
    const markScrollIntent = () => { scrollInteractionVersion.current += 1; };
    const markKeyboardScrollIntent = (event: KeyboardEvent) => {
      if (!['ArrowDown', 'ArrowUp', 'PageDown', 'PageUp', 'Home', 'End', ' '].includes(event.key)) return;
      const target = event.target;
      if (target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test(target.tagName))) return;
      markScrollIntent();
    };
    window.addEventListener('wheel', markScrollIntent, { passive: true });
    window.addEventListener('touchstart', markScrollIntent, { passive: true });
    window.addEventListener('pointerdown', markScrollIntent, { passive: true });
    window.addEventListener('keydown', markKeyboardScrollIntent);
    return () => {
      anchorObserverCleanup.current?.();
      anchorObserverCleanup.current = null;
      window.removeEventListener('wheel', markScrollIntent);
      window.removeEventListener('touchstart', markScrollIntent);
      window.removeEventListener('pointerdown', markScrollIntent);
      window.removeEventListener('keydown', markKeyboardScrollIntent);
    };
  }, []);

  useIsomorphicLayoutEffect(() => {
    if (!feedReady || !key || loadedFeedKey !== key || loading || error || restoredScrollKey.current === key) return;
    const node = feed.current;
    try {
      const rawPosition = sessionStorage.getItem(`varoom:listings:scroll:${key}`);
      restoredScrollKey.current = key;
      if (!rawPosition) return;
      const savedPosition = JSON.parse(rawPosition);
      const interactionVersion = scrollInteractionVersion.current;
      restoreScrollPosition(window, node, savedPosition);
      anchorObserverCleanup.current?.();
      anchorObserverCleanup.current = preserveAnchorPosition(
        window,
        node,
        savedPosition,
        () => interactionVersion !== scrollInteractionVersion.current,
      );
      return () => {
        anchorObserverCleanup.current?.();
        anchorObserverCleanup.current = null;
      };
    } catch (restoreError) {
      console.warn('Client Home scroll position could not be restored:', restoreError);
    }
  }, [error, feedReady, key, loadedFeedKey, loading]);

  useEffect(() => {
    const node = feed.current;
    if (!node || !key) return;
    const saveScroll = () => {
      if (leavingClientHome.current) return;
      try {
        sessionStorage.setItem(`varoom:listings:scroll:${key}`, JSON.stringify({
          ...captureScrollPosition(window, node),
        }));
      } catch (saveError) {
        console.warn('Client Home scroll position could not be saved:', saveError);
      }
    };
    const saveBeforeNavigation = () => {
      anchorObserverCleanup.current?.();
      anchorObserverCleanup.current = null;
      saveScroll();
    };
    const handleRouteStart = (nextUrl: string) => {
      saveBeforeNavigation();
      leavingClientHome.current = isClientHomePageExit(router.asPath, nextUrl);
    };
    const handleRouteError = () => {
      leavingClientHome.current = false;
    };
    node.addEventListener('scroll', saveScroll, { passive: true });
    window.addEventListener('scroll', saveScroll, { passive: true });
    window.addEventListener('pagehide', saveScroll);
    router.events.on('routeChangeStart', handleRouteStart);
    router.events.on('routeChangeError', handleRouteError);
    return () => {
      if (!leavingClientHome.current) saveScroll();
      node.removeEventListener('scroll', saveScroll);
      window.removeEventListener('scroll', saveScroll);
      window.removeEventListener('pagehide', saveScroll);
      router.events.off('routeChangeStart', handleRouteStart);
      router.events.off('routeChangeError', handleRouteError);
    };
  }, [key, router]);

  useEffect(() => {
    let active = true;
    if (!user?.id) return () => { active = false; };
    const cachedDestinations = readClientHomeWidgetCache<Record<string, number | null>>('destinations');
    if (cachedDestinations) {
      setDestCounts(cachedDestinations.value);
      setDestinationsLoading(false);
      setDestinationsFailed(false);
    } else {
      setDestinationsLoading(true);
      setDestinationsFailed(false);
    }
    if (!cachedDestinations?.isFresh) {
      const client = getSupabaseClient();
      if (!client) {
        setDestinationsFailed(true);
        setDestinationsLoading(false);
      } else {
        void fetchClientHomeWidget('destinations', async () => {
          const counts = await Promise.all(destinations.map(async ({ city }) => {
            const result = await client.from('listings').select('id', { count: 'exact', head: true })
              .ilike('location_text', `%${city}%`);
            if (result.error) throw result.error;
            return [city, typeof result.count === 'number' ? result.count : null] as const;
          }));
          return Object.fromEntries(counts);
        }).then((counts: Record<string, number | null>) => {
          writeClientHomeWidgetCache('destinations', counts);
          if (active) {
            setDestCounts(counts);
            setDestinationsFailed(false);
          }
        }).catch((widgetError: Error) => {
          console.error('Popular destination counts could not be loaded:', widgetError);
          if (active) setDestinationsFailed(true);
        }).finally(() => {
          if (active) setDestinationsLoading(false);
        });
      }
    }

    const cachedUpdates = readClientHomeWidgetCache<Update[]>('updates');
    if (cachedUpdates) {
      setUpdates(cachedUpdates.value);
      setUpdatesLoading(false);
      setUpdatesFailed(false);
    } else {
      setUpdatesLoading(true);
      setUpdatesFailed(false);
    }
    if (!cachedUpdates?.isFresh) {
      const client = getSupabaseClient();
      if (!client) {
        setUpdatesFailed(true);
        setUpdatesLoading(false);
      } else {
        void fetchClientHomeWidget('updates', async () => {
          const result = await client.from('varoom_updates').select('id,body,image_url,image_urls,created_at')
            .eq('status', 'published').order('created_at', { ascending: false }).limit(3);
          if (result.error) throw result.error;
          if (!Array.isArray(result.data)) throw new Error('VaRoom Updates returned an invalid response.');
          return result.data;
        }).then((nextUpdates: Update[]) => {
          writeClientHomeWidgetCache('updates', nextUpdates);
          if (active) {
            setUpdates(nextUpdates);
            setUpdatesFailed(false);
          }
        }).catch((widgetError: Error) => {
          console.error('VaRoom Updates could not be loaded:', widgetError);
          if (active) setUpdatesFailed(true);
        }).finally(() => {
          if (active) setUpdatesLoading(false);
        });
      }
    }

    return () => { active = false; };
  }, [user?.id]);

  useEffect(() => {
    let active = true;
    const breakpoint = window.matchMedia('(max-width: 1180px)');
    let requestStarted = false;
    const cached = readClientHomeWidgetCache<RecommendedListing[]>('recommended');
    if (cached) {
      setRecommended(cached.value);
      setRecommendedLoading(false);
      setRecommendedFailed(false);
    } else {
      setRecommendedLoading(true);
      setRecommendedFailed(false);
    }
    const loadRecommended = () => {
      if (!user?.id || !breakpoint.matches || requestStarted) return;
      requestStarted = true;
      if (cached?.isFresh) return;
      const client = getSupabaseClient();
      if (!client) {
        setRecommendedLoading(false);
        setRecommendedFailed(true);
        return;
      }
      void fetchClientHomeWidget('recommended', async () => {
        const result = await client.from('listings')
          .select('id,title,location_text,listing_photos(storage_path)')
          .eq('is_promoted', true).eq('moderation_status', 'active')
          .eq('availability_status', 'available').order('created_at', { ascending: false }).limit(6);
        if (result.error) throw result.error;
        if (!Array.isArray(result.data)) throw new Error('Recommended listings returned an invalid response.');
        return result.data;
      }).then((result: RecommendedListing[]) => {
        writeClientHomeWidgetCache('recommended', result);
        if (active) {
          setRecommended(result);
          setRecommendedFailed(false);
        }
      }).catch((widgetError: Error) => {
        console.error('Recommended listings could not be loaded:', widgetError);
        if (active) setRecommendedFailed(true);
      }).finally(() => {
        if (active) setRecommendedLoading(false);
      });
    };
    loadRecommended();
    breakpoint.addEventListener('change', loadRecommended);
    return () => {
      active = false;
      breakpoint.removeEventListener('change', loadRecommended);
    };
  }, [user?.id]);

  const loadNews = useCallback(async (force = false) => {
    const accountId = user?.id || null;
    const cached = getCachedNewsPreview();
    if (cached) {
      setNews(cached.items);
      setNewsFailed(false);
      setNewsLoading(false);
      if (cached.isFresh && !force) return;
    } else {
      setNewsLoading(true);
    }
    newsAbortController.current?.abort();
    const controller = new AbortController();
    newsAbortController.current = controller;
    const requestVersion = ++newsRequestVersion.current;
    try {
      const response = await fetch('/api/news/latest?limit=5', {
        headers: { Accept: 'application/json' },
        signal: controller.signal,
        cache: force ? 'no-store' : 'default',
      });
      if (!response.ok) throw new Error(`Property News request returned ${response.status}.`);
      const result = await response.json();
      if (!Array.isArray(result) || !result.every((item) =>
        item && (typeof item.id === 'string' || typeof item.id === 'number'))) {
        throw new Error('Property News returned an invalid response.');
      }
      if (requestVersion !== newsRequestVersion.current || resolvedSessionUserId.current !== accountId) return;
      setCachedNewsPreview(result as PropertyNewsItem[]);
      setNews(result);
      setNewsFailed(false);
    } catch (newsError) {
      if (controller.signal.aborted) return;
      if (requestVersion !== newsRequestVersion.current || resolvedSessionUserId.current !== accountId) return;
      console.warn('Property News could not be loaded:', newsError);
      setNewsFailed(true);
    } finally {
      if (requestVersion === newsRequestVersion.current && resolvedSessionUserId.current === accountId) {
        setNewsLoading(false);
      }
    }
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id) return;
    void loadNews();
    const timer = window.setInterval(() => { void loadNews(); }, 5 * 60 * 1000);
    return () => {
      window.clearInterval(timer);
      newsRequestVersion.current += 1;
      newsAbortController.current?.abort();
      newsAbortController.current = null;
    };
  }, [loadNews, user?.id]);

  useEffect(() => {
    if (!hasMore || view === 'saved' || !end.current) return;
    const sentinel = end.current;
    const loadNext = () => { void loadFeed(true); };
    const observer = typeof IntersectionObserver === 'undefined'
      ? null
      : new IntersectionObserver((entries) => {
        if (entries[0]?.isIntersecting) loadNext();
      }, { root: feed.current, rootMargin: '700px 0px' });
    observer?.observe(sentinel);
    const fallback = () => {
      if (sentinel.getBoundingClientRect().top < window.innerHeight + 700) loadNext();
    };
    feed.current?.addEventListener('scroll', fallback, { passive: true });
    return () => {
      observer?.disconnect();
      feed.current?.removeEventListener('scroll', fallback);
    };
  }, [hasMore, loadFeed, view]);

  const onLike = async (listingId: string) => {
    const before = likes[listingId] || { liked: false, count: 0, version: 0 };
    const version = (before.version || 0) + 1;
    const liked = !before.liked;
    setLikes((current) => ({
      ...current,
      [listingId]: { ...before, liked, count: Math.max(0, before.count + (liked ? 1 : -1)), loading: true, version },
    }));
    const client = getSupabaseClient();
    if (!client) return;
    const result = await client.rpc('set_listing_like', { p_listing_id: listingId, p_liked: liked });
    let summary = Array.isArray(result.data) ? result.data[0] : result.data?.summary || result.data;
    if (result.error) {
      console.error('Listing like update failed:', result.error);
      const reconcile = await client.rpc('get_listing_like_summaries', { p_listing_ids: [listingId] });
      summary = reconcile.data?.[0];
      if (reconcile.error) console.error('Listing like state could not be reconciled:', reconcile.error);
      setError('That like could not be updated. Please try again.');
    }
    setLikes((current) => {
      if (current[listingId]?.version !== version) return current;
      if (summary && Number.isSafeInteger(Number(summary.like_count)) && Number(summary.like_count) >= 0) {
        return {
          ...current,
          [listingId]: { liked: summary.liked_by_current_user === true, count: Number(summary.like_count), version },
        };
      }
      return {
        ...current,
        [listingId]: { ...before, loading: false, unavailable: true, version },
      };
    });
  };

  const onSave = async (listingId: string) => {
    if (!user) return;
    const wasSaved = saved.has(listingId);
    setSaved((current) => {
      const next = new Set(current);
      if (wasSaved) next.delete(listingId);
      else next.add(listingId);
      return next;
    });
    const client = getSupabaseClient();
    if (!client) return;
    const result = wasSaved
      ? await client.from('bookmarks').delete().eq('client_id', user.id).eq('listing_id', listingId)
      : await client.from('bookmarks').insert({ client_id: user.id, listing_id: listingId });
    if (result.error) {
      console.error('Listing bookmark could not be updated:', result.error);
      setSaved((current) => {
        const next = new Set(current);
        if (wasSaved) next.add(listingId);
        else next.delete(listingId);
        return next;
      });
      setError('That listing could not be saved. Please try again.');
    }
  };

  const onChat = async (listing: Listing) => {
    if (!user) return;
    const result = await getSupabaseClient()!.from('conversations')
      .upsert({ listing_id: listing.id, host_id: listing.host_id, client_id: user.id }, { onConflict: 'listing_id,client_id' })
      .select().single();
    if (result.error) {
      setError(`Couldn't start that chat: ${result.error.message}`);
      return;
    }
    await router.push(`/chats?c=${encodeURIComponent(result.data.id)}`);
  };

  const submitReport = async () => {
    if (!report || submittingReport) return;
    setSubmittingReport(true);
    setReportMessage('');
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 20000);
    try {
      const sessionResult = await getSupabaseClient()!.auth.getSession();
      const session = sessionResult.data.session;
      if (!session) throw new Error('Please sign in again before submitting a report.');
      const response = await fetch('/api/listing-reports', {
        method: 'POST',
        credentials: 'same-origin',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          listing_id: report,
          reason: reportReason,
          details: reportDetails || null,
        }),
      });
      const contentType = response.headers.get('content-type') || '';
      const body = contentType.includes('application/json')
        ? await response.json()
        : { error: 'The report service returned an unexpected response. Please try again.' };
      if (!response.ok) throw new Error(body.error || 'Unable to submit report.');
      setReportMessage('Report submitted. Thank you for helping keep VaRoom trustworthy.');
      window.setTimeout(() => setReport(null), 1800);
    } catch (submitError: any) {
      setReportMessage(submitError.name === 'AbortError'
        ? 'The report service took too long to respond. Please try again.'
        : submitError.message || 'Unable to submit report.');
    } finally {
      window.clearTimeout(timeout);
      setSubmittingReport(false);
    }
  };

  const selectDestination = (city: string) => {
    setView('marketplace');
    setCategory('all');
    setSearch(city);
    setTerm(city);
    if (feed.current) feed.current.scrollTop = 0;
  };

  const retryAccount = () => {
    setError('');
    setLoading(true);
    setAuthRetry((current) => current + 1);
  };

  const showWidgets = view === 'home' && category === 'all' && !term;
  const emptyMessage = view === 'home' && category === 'all' && !term && interests.length > 0
    ? 'Nothing matching your interests yet — try Marketplace to see everything.'
    : 'No listings match yet — try a different category, location, or @username.';
  const marketplaceQuery = new URLSearchParams();
  if (term) marketplaceQuery.set('q', term);
  if (category !== 'all') marketplaceQuery.set('category', category);
  const marketplaceHref = `/marketplace${marketplaceQuery.toString() ? `?${marketplaceQuery.toString()}` : ''}`;

  return (
    <>
      <Head>
        <title>Home · VaRoom</title>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,600;0,9..144,700;0,9..144,900&display=swap" rel="stylesheet" />
      </Head>
      <section className={styles.home}>
        <header className={styles.topbar}>
          <button type="button" id="topbar-avatar-btn" className={styles.mobileMenu} aria-label="Open menu">
            <span className={styles.mobileAvatar} aria-hidden="true">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <line x1="4" y1="7" x2="20" y2="7" /><line x1="4" y1="12" x2="20" y2="12" /><line x1="4" y1="17" x2="20" y2="17" />
              </svg>
            </span>
          </button>
          <div className={styles.searchWrap}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search by location or @username" aria-label="Search by location or username" />
          </div>
        </header>
        <div className={styles.columnDivider} aria-hidden="true" />
        <main className={styles.feedArea} ref={feed}>
          <div className={styles.headingRow}>
            <h1 className={styles.feedTitle}>
              {view === 'saved' ? 'Saved' : view === 'marketplace' ? 'Marketplace' : interests.length > 0 ? 'For you' : 'Find the perfect space'}
            </h1>
            {(view === 'marketplace' || term) && <a className={styles.marketplaceSwitch} href={marketplaceHref}>Browse as Marketplace →</a>}
          </div>
          <nav className={styles.tabs} aria-label="Listing categories">
            {categories.map(([id, label]) => (
              <button
                type="button"
                key={id}
                className={`${styles.tab} ${category === id ? styles.activeTab : ''}`}
                aria-pressed={category === id}
                onClick={() => setCategory(id)}
              >
                {label}
              </button>
            ))}
          </nav>

          {showWidgets && (
            <section className={styles.mobileDestinations}>
              <div className={styles.mobileWidgetHeading}><h2>Popular destinations</h2><button type="button" onClick={() => showToast('Browsing all destinations is coming soon.')}>View all</button></div>
              <div className={styles.mobileDestinationRow} data-loading={destinationsLoading}>
                {destinationsLoading
                  ? <WidgetLoader label="Loading popular destinations" />
                  : destinations.map(({ city, image }) => (
                    <DestinationCard key={city} city={city} image={image} count={destCounts[city] ?? null} mobile onSelect={selectDestination} />
                  ))}
              </div>
              {destinationsFailed && <p className={styles.widgetMessage} role="status">Destination counts could not be refreshed.</p>}
            </section>
          )}

          {suspended && (
            <section className={styles.suspensionNotice} role="status">
              <h2>Your account has been suspended</h2>
              <p>You can still browse VaRoom and view listings. Posting, booking, messaging, and other account activity are unavailable while your account is suspended. If you think this is a mistake, you can submit an appeal.</p>
              <a href="/support">Go to Support / Submit Appeal →</a>
            </section>
          )}

          {error && !loading && <p className={styles.errorMessage} role="alert">{error} <button type="button" onClick={retryAccount}>Retry</button></p>}
          {currentFeedLoading && !error && visibleItems.length === 0 && (
            <div aria-label="Loading listings">
              {[0, 1, 2].map((item) => (
                <div key={item}>
                  <FeedSkeleton />
                  {showWidgets && item === 0 && (
                    <MobileFeedWidgets
                      recommended={recommended}
                      recommendedLoading={recommendedLoading}
                      recommendedFailed={recommendedFailed}
                      updates={updates}
                      updatesLoading={updatesLoading}
                      updatesFailed={updatesFailed}
                    />
                  )}
                </div>
              ))}
            </div>
          )}
          {feedContextReady && loadedFeedKey === key && !currentFeedLoading && !error && visibleItems.length === 0 && (
            <p className={styles.stateMessage}>{view === 'saved' ? 'Nothing saved yet — tap the bookmark icon on a listing to save it here.' : emptyMessage}</p>
          )}
          {visibleItems.map((listing, index) => (
            <div key={listing.id} data-media={listing.id}>
              <ListingCard
                listing={listing}
                firstCard={index === 0}
                userId={user?.id || ''}
                like={likes[listing.id] || { liked: false, count: 0 }}
                saved={saved.has(listing.id)}
                video={videos[listing.id]}
                videoLoading={!videoStates[listing.id] || videoStates[listing.id] === 'loading'}
                videoUnavailable={videoStates[listing.id] === 'unavailable'}
                onSave={() => { void onSave(listing.id); }}
                onLike={() => { void onLike(listing.id); }}
                onChat={() => { void onChat(listing); }}
                onReport={() => {
                  setReport(listing.id);
                  setReportReason('fraudulent');
                  setReportDetails('');
                  setReportMessage('');
                }}
                onOpenLightbox={(urls, photoIndex) => setLightbox({ urls, index: photoIndex })}
              />
              {showWidgets && index === 0 && (
                <MobileFeedWidgets
                  recommended={recommended}
                  recommendedLoading={recommendedLoading}
                  recommendedFailed={recommendedFailed}
                  updates={updates}
                  updatesLoading={updatesLoading}
                  updatesFailed={updatesFailed}
                />
              )}
            </div>
          ))}
          {loadingMore && <p className={styles.stateMessage} role="status">Loading more listings…</p>}
          <div ref={end} className={styles.feedSentinel} aria-hidden="true" />

          {showWidgets && (
            <section className={`${styles.mobileWidgetCard} ${styles.mobileNews}`}>
              <div className={styles.newsHeading}>
                <h2>Property News</h2>
                <button type="button" onClick={() => { void loadNews(true); }}>Refresh</button>
              </div>
              <PropertyNewsList items={news} loading={newsLoading} failed={newsFailed} />
              <a className={styles.viewAllNews} href="/property-news">View all news →</a>
            </section>
          )}
        </main>

        <aside className={styles.rightRail}>
          <section className={styles.railCard}>
            <div className={styles.railCardHeading}><h2>Popular destinations</h2><button type="button" onClick={() => showToast('Browsing all destinations is coming soon.')}>View all</button></div>
            {destinationsLoading
              ? <WidgetLoader label="Loading popular destinations" />
              : <div className={styles.destinationGrid}>
                {destinations.map(({ city, image }) => (
                  <DestinationCard key={city} city={city} image={image} count={destCounts[city] ?? null} onSelect={selectDestination} />
                ))}
              </div>}
            {destinationsFailed && <p className={styles.widgetMessage} role="status">Destination counts could not be refreshed.</p>}
          </section>
          <section className={styles.railCard}>
            <div className={styles.railCardHeading}><h2>VaRoom Updates</h2></div>
            <UpdateList items={updates} loading={updatesLoading} failed={updatesFailed} />
          </section>
          <section className={styles.railCard}>
            <div className={styles.newsHeading}>
              <h2>Property News</h2>
              <button type="button" onClick={() => { void loadNews(true); }}>Refresh</button>
            </div>
            <PropertyNewsList items={news} loading={newsLoading} failed={newsFailed} />
            <a className={styles.viewAllNews} href="/property-news">View all news →</a>
          </section>
          <footer className={styles.railFooter} aria-label="Sidebar footer">
            <div className={styles.socialLinks} aria-label="Social media">
              <a href="https://www.instagram.com/varoom.co.ke?vrfl=ZmJzbGVkM3AwOWNu" target="_blank" rel="noopener noreferrer" aria-label="Instagram"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="3.5" width="17" height="17" rx="4" /><circle cx="12" cy="12" r="4" /><circle cx="17.4" cy="6.6" r="1.1" /></svg></a>
              <a href="https://www.tiktok.com/@varoom.co.ke?_r=1&_t=ZS-9AeSyJKRgM3" target="_blank" rel="noopener noreferrer" aria-label="TikTok"><Music2 aria-hidden="true" /></a>
              <a href="#" aria-label="X (formerly Twitter)" onClick={(event) => event.preventDefault()}><X aria-hidden="true" /></a>
              <a href="#" aria-label="Facebook" onClick={(event) => event.preventDefault()}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M13.5 21v-8.5h2.8l.4-3.2h-3.2V7.2c0-.9.3-1.6 1.7-1.6H16V2.6c-.3 0-1.3-.1-2.4-.1-2.4 0-4.1 1.5-4.1 4.3v2.4H7v3.2h2.5V21h4Z" /></svg></a>
            </div>
            <div className={styles.legalLinks}>
              <a href="/privacy" target="_blank" rel="noopener noreferrer">Privacy Policy</a>
              <span aria-hidden="true">|</span>
              <a href="/terms" target="_blank" rel="noopener noreferrer">Terms &amp; Conditions</a>
            </div>
          </footer>
        </aside>

        <nav className={styles.bottomBar} aria-label="Mobile navigation">
          <a className={view === 'home' ? styles.bottomActive : ''} href="/client-home">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 11.5 12 4l9 7.5M5.5 10v9a1 1 0 0 0 1 1H9v-4a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v4h2.5a1 1 0 0 0 1-1v-9" /></svg>
            Home
          </a>
          <a href="/marketplace">
            <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="m15 9-2 6-6 2 2-6 6-2Z" /></svg>
            Marketplace
          </a>
          <a href="/list">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.4 8.4 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5Z" /></svg>
            Create
          </a>
          <a href="/chats">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7A8.4 8.4 0 0 1 4 11.5a8.5 8.5 0 0 1 4.7-7.6A8.4 8.4 0 0 1 12.5 3h.5a8.48 8.48 0 0 1 8 8v.5Z" /></svg>
            Inbox
          </a>
          <a className={view === 'saved' ? styles.bottomActive : ''} href="/client-home?view=saved">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3.5h12a1 1 0 0 1 1 1V21l-7-4-7 4V4.5a1 1 0 0 1 1-1Z" /></svg>
            Saved
          </a>
        </nav>
        <div className={`${styles.toast} ${toastMessage ? styles.toastVisible : ''}`} role="status" aria-live="polite">{toastMessage}</div>
      </section>

      {report && (
        <ReportModal
          reason={reportReason}
          details={reportDetails}
          message={reportMessage}
          submitting={submittingReport}
          onReason={setReportReason}
          onDetails={setReportDetails}
          onCancel={() => setReport(null)}
          onSubmit={() => { void submitReport(); }}
        />
      )}
      {lightbox && <Lightbox value={lightbox} close={() => setLightbox(null)} />}
    </>
  );
}

function UpdateList({ items, loading, failed }: { items: Update[]; loading: boolean; failed: boolean }) {
  if (loading) return <WidgetLoader label="Loading VaRoom Updates" />;
  if (items.length === 0) return <p className={styles.widgetMessage}>{failed ? 'VaRoom Updates could not be loaded.' : 'No updates yet.'}</p>;
  return (
    <>
      {failed && <p className={styles.widgetMessage} role="status">VaRoom Updates could not be refreshed.</p>}
      <div className={styles.updateList}>
        {items.map((update) => {
          const photos = update.image_urls?.length ? update.image_urls : update.image_url ? [update.image_url] : [];
          return (
            <article className={styles.updateCard} key={update.id}>
              {photos.length > 0 && <div className={styles.updatePhotos}>{photos.map((url) => <img src={url} alt="" loading="lazy" key={url} />)}</div>}
              <p>{update.body}</p>
            </article>
          );
        })}
      </div>
    </>
  );
}

ClientHome.getLayout = (page: ReactElement) => <ClientLayout className="client-home-layout">{page}</ClientLayout>;
