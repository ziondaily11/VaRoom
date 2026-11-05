import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import Link from 'next/link';
import HostListingMenu from '../listings/HostListingMenu';
import VideoPlayer from '../media/VideoPlayer';
import { timeAgo, type FeedListing } from '../../lib/hostHome/hostHome';
import { MOBILE_QUERY, sizeStage } from '../../lib/hostHome/mediaStage';
import type { FeedLikeState } from '../../lib/listings/listingLikes';
import { ICONS, Svg } from './hostHomeIcons';

// One Discover card on Host home, unchanged from legacy-pages/host-home.html:
// the host (your own listings link to your profile and show the owner menu,
// others show Report), the caption, a status banner, the photos (carousel)
// or the video, and Book · Chat · Like · Save.

export interface CardVideo { url: string; thumbnailUrl: string | null; width?: number | null; height?: number | null }
export type MediaState = 'unknown' | 'loading' | 'ready' | 'no-media' | 'unavailable';

interface Props {
  listing: FeedListing;
  userId: string;
  photoUrl: (storagePath: string) => string | null;
  avatarUrl: (value: string | null | undefined) => string | null;
  like: FeedLikeState;
  saved: boolean;
  video: CardVideo | null;
  mediaState: MediaState;
  /** Changes when the feed's width or breakpoint changes. */
  layoutVersion: number;
  menuOpen: boolean;
  onMenu: (open: boolean) => void;
  onLike: () => void;
  onSave: () => void;
  onChat: () => void;
  onReport: () => void;
  notify: (message: string) => void;
  onStatus: (id: string, status: string) => void;
  onDeleted: (id: string) => void;
  refreshVideo: () => Promise<string | null>;
}

function ActionRow({ listing, own, like, saved, onLike, onSave, onChat, extraClass = '' }: {
  listing: FeedListing; own: boolean; like: FeedLikeState; saved: boolean; onLike: () => void; onSave: () => void; onChat: () => void; extraClass?: string;
}) {
  const unavailableListing = Boolean(listing.availability_status && listing.availability_status !== 'available');
  const cls = (base: string) => `${base}${extraClass}`;
  return (
    <>
      {own || unavailableListing
        ? <span className={cls('action-btn disabled')} title="This is your listing"><Svg markup={ICONS.book} />Book</span>
        : <Link href={`/booking?listing=${listing.id}`} className={cls('action-btn')}><Svg markup={ICONS.book} />Book</Link>}
      {own
        ? <span className={cls('action-btn disabled')} title="This is your listing"><Svg markup={ICONS.chat} />Chat</span>
        : <button type="button" className={cls('action-btn chat-btn')} data-listing-id={listing.id} data-host-id={listing.host_id} onClick={(event) => { event.preventDefault(); event.stopPropagation(); onChat(); }}><Svg markup={ICONS.chat} />Chat</button>}
      <button
        type="button"
        className={cls('action-btn like-btn')}
        data-listing-id={listing.id}
        disabled={like.unavailable}
        aria-label={like.unavailable ? 'Like status unavailable' : (like.liked ? 'Unlike listing' : 'Like listing')}
        aria-pressed={like.unavailable ? undefined : like.liked}
        title={like.unavailable ? 'Like information is temporarily unavailable' : undefined}
        onClick={(event) => { event.preventDefault(); event.stopPropagation(); onLike(); }}
      >
        <Svg markup={!like.unavailable && like.liked ? ICONS.heartFilled : ICONS.heartOutline} /><span className="like-count">{like.unavailable ? '—' : like.count}</span>
      </button>
      {/* The icon stays after a tap (before, the button turned into "★ Saved" text). */}
      <button type="button" className={cls(`action-btn bookmark-btn ${saved ? 'saved' : ''}`)} data-listing-id={listing.id} onClick={(event) => { event.preventDefault(); event.stopPropagation(); onSave(); }}>
        {saved ? <><Svg markup={ICONS.bookmarkFilled} />Saved</> : <><Svg markup={ICONS.bookmarkOutline} />Save</>}
      </button>
    </>
  );
}

function useStageSizing(layoutVersion: number) {
  const stage = useRef<HTMLDivElement>(null);
  const size = useCallback(() => {
    if (stage.current) sizeStage(stage.current, window.matchMedia(MOBILE_QUERY).matches);
  }, []);
  useLayoutEffect(() => { size(); }, [size, layoutVersion]);
  return { stage, size };
}

function PhotoCarousel({ listing, photos, layoutVersion }: { listing: FeedListing; photos: Array<{ url: string; width: number; height: number }>; layoutVersion: number }) {
  const { stage, size } = useStageSizing(layoutVersion);
  const [active, setActive] = useState(0);
  const [loaded, setLoaded] = useState<ReadonlySet<number>>(new Set());
  const [drag, setDrag] = useState<number | null>(null);
  const start = useRef(0);
  const current = useRef(0);
  const dragging = useRef(false);
  const count = photos.length;
  const goTo = (index: number) => setActive(Math.max(0, Math.min(count - 1, index)));
  const markLoaded = (index: number) => { setLoaded((set) => (set.has(index) ? set : new Set(set).add(index))); size(); };
  const single = count === 1;
  const width = stage.current ? stage.current.clientWidth : 1;
  const offset = -(active * 100) + (drag !== null && Math.abs(drag) > 6 ? (drag / width) * 100 : 0);

  const slides = photos.map((photo, index) => (
    <div className="media-slide" key={`${photo.url}-${index}`} {...(photo.width > 0 && photo.height > 0 ? { 'data-media-width': photo.width, 'data-media-height': photo.height } : {})}>
      {!loaded.has(index) && <div className="media-image-skeleton" aria-hidden="true" />}
      <img
        src={photo.url}
        alt={listing.title}
        loading="lazy"
        data-listing-id={listing.id}
        data-photo-index={index}
        ref={(image) => { if (image && image.complete && !loaded.has(index)) setTimeout(() => markLoaded(index), 0); }}
        onLoad={() => markLoaded(index)}
        onError={() => markLoaded(index)}
      />
    </div>
  ));

  if (single) {
    return (
      <div className="media-carousel single-media" data-listing-id={listing.id} data-photo-count="1" ref={stage}>
        <div className="media-slide-track">{slides}</div>
      </div>
    );
  }
  return (
    <div
      className="media-carousel"
      data-listing-id={listing.id}
      data-photo-count={count}
      data-discover-active-index={active}
      ref={stage}
      style={drag !== null ? { cursor: 'grabbing' } : undefined}
      onPointerDown={(event) => {
        if ((event.target as Element).closest('[data-carousel-prev], [data-carousel-next], .media-dot')) return;
        dragging.current = true;
        start.current = event.clientX;
        current.current = event.clientX;
        setDrag(0);
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={(event) => { if (dragging.current) { current.current = event.clientX; setDrag(event.clientX - start.current); } }}
      onPointerUp={(event) => {
        if (!dragging.current) return;
        dragging.current = false;
        const delta = current.current - start.current;
        setDrag(null);
        if (Math.abs(delta) > 40) goTo(active + (delta < 0 ? 1 : -1));
        try { event.currentTarget.releasePointerCapture(event.pointerId); } catch { /* not captured */ }
      }}
      onPointerLeave={() => { if (dragging.current) { dragging.current = false; setDrag(null); } }}
    >
      <div className="media-index-pill">{active + 1}/{count}</div>
      <button type="button" className="media-carousel-arrow prev" data-carousel-prev="" aria-label="Previous photo" onClick={() => goTo(active - 1)}>‹</button>
      <button type="button" className="media-carousel-arrow next" data-carousel-next="" aria-label="Next photo" onClick={() => goTo(active + 1)}>›</button>
      <div className="media-slide-track" style={{ transform: `translateX(${offset}%)`, ...(drag !== null ? { transition: 'none' } : {}) }}>{slides}</div>
      <div className="media-dots">
        {photos.map((photo, index) => <span key={index} className={`media-dot ${index === active ? 'active' : ''}`} data-index={index} onClick={() => goTo(index)} />)}
      </div>
    </div>
  );
}

function CardVideoStage({ listing, video, hostName, username, avatarUrl, actions, layoutVersion, refreshVideo }: {
  listing: FeedListing; video: CardVideo; hostName: string; username: string; avatarUrl: string | null; actions: React.ReactNode; layoutVersion: number; refreshVideo: () => Promise<string | null>;
}) {
  const { stage, size } = useStageSizing(layoutVersion);
  const [state, setState] = useState<'loading' | 'loaded' | 'failed' | 'blocked'>('loading');

  // The player's own <video>: its first frame, failure and autoplay events, and its size once known.
  useEffect(() => {
    const element = stage.current && stage.current.querySelector('video');
    if (!element) return undefined;
    const loaded = () => setState((current) => (current === 'failed' ? current : 'loaded'));
    const failed = () => setState('failed');
    const blocked = () => setState('blocked');
    const playing = () => setState((current) => (current === 'blocked' ? 'loaded' : current));
    element.addEventListener('loadeddata', loaded);
    element.addEventListener('error', failed);
    element.addEventListener('varoomautoplayblocked', blocked);
    element.addEventListener('varoomvideoplaying', playing);
    // Always re-fit once the video's own size is known (it can differ from the stored one).
    element.addEventListener('loadedmetadata', size);
    if (element.readyState >= 1) size();
    if (element.readyState >= 2) loaded();
    return () => {
      element.removeEventListener('loadeddata', loaded);
      element.removeEventListener('error', failed);
      element.removeEventListener('varoomautoplayblocked', blocked);
      element.removeEventListener('varoomvideoplaying', playing);
      element.removeEventListener('loadedmetadata', size);
    };
  }, [stage, size, video.url, video.width, video.height]);

  const classes = ['card-video', 'single', state === 'loaded' ? 'is-loaded' : '', state === 'failed' ? 'is-failed' : '', state === 'blocked' ? 'is-autoplay-blocked' : ''].filter(Boolean).join(' ');
  return (
    <div className={classes} ref={stage} {...(video.width && video.height ? { 'data-media-width': video.width, 'data-media-height': video.height } : {})}>
      <div className="media-loading-indicator" aria-hidden="true" />
      <VideoPlayer
        src={video.url}
        poster={video.thumbnailUrl}
        listingId={listing.id}
        details={{ hostName, username, avatarUrl, caption: listing.description || listing.title, actions }}
        refreshSrc={refreshVideo}
      />
    </div>
  );
}

export default function FeedCard(props: Props) {
  const { listing, userId, photoUrl, avatarUrl, like, saved, video, mediaState, layoutVersion, menuOpen, onMenu, onLike, onSave, onChat, onReport, notify, onStatus, onDeleted, refreshVideo } = props;
  const host = listing.host || { full_name: null, verified: null, avatar_url: null, username: null };
  const own = listing.host_id === userId;
  const hostName = host.full_name || 'Host';
  const hostAvatar = avatarUrl(host.avatar_url);
  const profileHref = own ? '/profile' : `/host/${encodeURIComponent(host.username || listing.host_id)}`;
  const photos = (listing.listing_photos || []).map((photo) => ({ url: photoUrl(photo.storage_path) || '', width: Number(photo.width) || 0, height: Number(photo.height) || 0 }));
  const unavailableListing = Boolean(listing.availability_status && listing.availability_status !== 'available');

  const actionProps = { listing, own, like, saved, onLike, onSave, onChat };
  let media: React.ReactNode;
  if (video) {
    media = <CardVideoStage listing={listing} video={video} hostName={hostName} username={host.username ? `@${host.username}` : ''} avatarUrl={hostAvatar} actions={<ActionRow {...actionProps} extraClass=" varoom-video-viewer-action" />} layoutVersion={layoutVersion} refreshVideo={refreshVideo} />;
  } else if (photos.length === 0 && (mediaState === 'unknown' || mediaState === 'loading')) {
    media = <div className="card-media-loading" role="status" aria-label="Preparing listing media" />;
  } else if (photos.length === 0 && mediaState === 'unavailable') {
    media = <div className="card-media-unavailable" role="status">Video unavailable</div>;
  } else if (photos.length === 0) {
    media = <div className="card-photos card-media-empty" role="img" aria-label="No media available for this listing" />;
  } else {
    media = <PhotoCarousel listing={listing} photos={photos} layoutVersion={layoutVersion} />;
  }

  return (
    <div className="card" data-listing-card={listing.id} data-listing-id={listing.id}>
      <div className="card-head">
        <Link className="card-avatar" href={profileHref} aria-label={own ? 'Edit your profile' : `View ${hostName}'s profile`}>
          {hostAvatar ? <img src={hostAvatar} alt="" /> : (host.full_name || '?').charAt(0).toUpperCase()}
        </Link>
        <div>
          <Link className="card-host-name" href={profileHref} aria-label={own ? 'Edit your profile' : undefined}>
            {hostName}{host.verified && <span className="verified-tick">✔</span>}
          </Link>
          <div className="card-location">
            {host.username ? `@${host.username} · ` : ''}{listing.location_text || ''}
            {' · '}<Link href={`/map?listing=${listing.id}`} className="card-map-link">View on Map</Link>
          </div>
        </div>
        <div className="card-time">{timeAgo(listing.created_at)}</div>
        {own ? (
          <HostListingMenu listing={{ id: listing.id, title: listing.title, availability_status: listing.availability_status }} notify={notify} onStatus={onStatus} onDeleted={onDeleted} />
        ) : (
          <div className="card-menu-wrap">
            <button type="button" className="card-menu-btn" data-menu-toggle={listing.id} aria-label="More options" onClick={(event) => { event.stopPropagation(); onMenu(!menuOpen); }}>
              <Svg markup={ICONS.dots} />
            </button>
            <div className={`card-menu-dropdown${menuOpen ? ' open' : ''}`} id={`menu-${listing.id}`}>
              <button type="button" className="card-menu-item report-trigger" data-listing-id={listing.id} data-host-id={listing.host_id} onClick={(event) => { event.stopPropagation(); onMenu(false); onReport(); }}>Report</button>
            </div>
          </div>
        )}
      </div>
      <p className="card-caption" data-listing-caption="">{listing.description || listing.title}</p>
      {unavailableListing && <div className="listing-status-banner" data-listing-status=""> Status: {listing.availability_status}</div>}
      {media}
      <div className="action-row"><ActionRow {...actionProps} /></div>
    </div>
  );
}
