import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import { getSupabaseClient } from '../../lib/supabase/client';
import type { ChatListingSummary } from '../../lib/chatCache';
import { attachmentUrl, cachedImageUrl, listingVideo, type ChatApi, type ListingVideo } from '../../lib/chat/chatMedia';
import { listingPriceText, listingSubtitle } from '../../lib/chat/listingEnquiry';

// Media message parts, ported from public/js/chat-data.js messageRow: same
// classes as legacy so chats.css styles them unchanged.

/** The attachment's displayable URL (null while loading). */
export function useAttachmentUrl(attachmentId: string | null | undefined, api: ChatApi): { url: string | null; failed: boolean } {
  const [state, setState] = useState<{ url: string | null; failed: boolean }>({ url: null, failed: false });
  useEffect(() => {
    if (!attachmentId) return undefined;
    let cancelled = false;
    setState({ url: null, failed: false });
    attachmentUrl(attachmentId, api)
      .then((url) => { if (!cancelled) setState({ url, failed: false }); })
      .catch((error) => {
        console.error('Chat media unavailable:', error);
        if (!cancelled) setState({ url: null, failed: true });
      });
    return () => { cancelled = true; };
    // `api` is stable for the page's lifetime.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attachmentId]);
  return state;
}

function MediaLoader() {
  return <span className="chat-media-loader" aria-label="Loading media" />;
}

/**
 * A photo message bubble. The image shows a loader until it loads, then the
 * bubble narrows to the rendered width (330 px desktop, 340 px phone).
 * Without a caption the time and ticks sit over the image in a thin frame.
 */
export function PhotoBubble({ attachmentId, localUrl, alt, api, onOpen, children, footer, overlay }: {
  attachmentId: string | null;
  localUrl?: string;
  alt: string;
  api: ChatApi;
  onOpen: (url: string, alt: string) => void;
  /** Rendered above the image (reply quote). */
  children?: React.ReactNode;
  /** Rendered below the image (caption, send state, meta). */
  footer?: React.ReactNode;
  /** Rendered over the image's corner (time and ticks of a photo without a caption). */
  overlay?: React.ReactNode;
}) {
  const remote = useAttachmentUrl(localUrl ? null : attachmentId, api);
  const src = localUrl || remote.url;
  const [loaded, setLoaded] = useState(false);
  const [width, setWidth] = useState<number | null>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);

  useEffect(() => { setLoaded(false); setWidth(null); }, [src]);

  const onLoad = () => {
    setLoaded(true);
    const image = imageRef.current;
    if (!image || !image.naturalWidth) return;
    const maxAllowed = window.matchMedia('(max-width: 760px)').matches ? 340 : 330;
    const rendered = Math.min(image.offsetWidth || image.naturalWidth, maxAllowed);
    if (rendered > 0) setWidth(rendered);
  };

  return (
    <div className="bubble bubble-media" style={width ? { maxWidth: width + 6 } : undefined}>
      {children}
      <div className="chat-media-wrap" style={width ? { width } : undefined}>
        {!loaded && !remote.failed && <MediaLoader />}
        {src && (
          <img
            ref={imageRef}
            className="chat-message-image"
            src={src}
            alt={alt}
            onLoad={onLoad}
            onError={() => setLoaded(true)}
            onClick={() => onOpen(src, alt)}
          />
        )}
        {overlay}
      </div>
      {footer}
    </div>
  );
}

/** A photo in an album collage. */
export interface AlbumPhoto {
  id: string;
  /** null while the photo is still uploading (its local image shows). */
  attachmentId: string | null;
  localUrl?: string;
  alt: string;
  state: 'sending' | 'failed' | null;
}

function AlbumTile({ photo, index, api, onUrl, onOpen, onDismiss, tileProps }: {
  photo: AlbumPhoto;
  index: number;
  api: ChatApi;
  onUrl: (index: number, url: string) => void;
  onOpen: (index: number) => void;
  onDismiss: (id: string) => void;
  tileProps?: (id: string) => React.HTMLAttributes<HTMLElement>;
}) {
  const remote = useAttachmentUrl(photo.localUrl ? null : photo.attachmentId, api);
  const src = photo.localUrl || remote.url;
  const [loaded, setLoaded] = useState(false);
  useEffect(() => { setLoaded(false); }, [src]);
  useEffect(() => { if (src) onUrl(index, src); }, [src, index, onUrl]);
  return (
    <div
      className="chat-album-tile"
      data-message-id={photo.id}
      role="button"
      tabIndex={0}
      aria-label={photo.alt}
      onClick={() => { if (photo.state === 'failed') onDismiss(photo.id); else if (src) onOpen(index); }}
      onKeyDown={(event) => { if ((event.key === 'Enter' || event.key === ' ') && src) { event.preventDefault(); onOpen(index); } }}
      {...(tileProps ? tileProps(photo.id) : {})}
    >
      {src && <img src={src} alt={photo.alt} onLoad={() => setLoaded(true)} onError={() => setLoaded(true)} />}
      {((!loaded && !remote.failed) || photo.state === 'sending') && <MediaLoader />}
      {photo.state === 'failed' && <span className="chat-album-failed">Failed · Dismiss</span>}
    </div>
  );
}

/**
 * Photos sent together (up to 4) as one collage: 2 side by side, 3 as one
 * large and two stacked, 4 in a grid. Tiles fill their cell (cropped only
 * here); tapping one opens the viewer, which shows them whole and pages
 * through the album.
 */
export function PhotoAlbum({ photos, api, onOpen, onDismiss, tileProps, overlay, footer }: {
  photos: AlbumPhoto[];
  api: ChatApi;
  onOpen: (items: ViewerImage[], index: number) => void;
  /** Removes a photo whose upload failed. */
  onDismiss: (id: string) => void;
  /** Handlers on each tile (right-click, long-press: that photo's actions). */
  tileProps?: (id: string) => React.HTMLAttributes<HTMLElement>;
  /** Over the collage's corner (time and ticks without a caption). */
  overlay?: React.ReactNode;
  /** Below the collage (caption, failed state). */
  footer?: React.ReactNode;
}) {
  const [urls, setUrls] = useState<(string | null)[]>(() => photos.map(() => null));
  const onUrl = useCallback((index: number, url: string) => {
    setUrls((current) => {
      if (current[index] === url) return current;
      const next = [...current];
      next[index] = url;
      return next;
    });
  }, []);
  const open = (index: number) => {
    const items: ViewerImage[] = [];
    let start = 0;
    photos.forEach((photo, i) => {
      const url = urls[i];
      if (!url) return;
      if (i === index) start = items.length;
      items.push({ url, alt: photo.alt });
    });
    if (items.length) onOpen(items, start);
  };
  const count = Math.min(photos.length, 4);
  return (
    <div className="bubble bubble-media bubble-album">
      <div className={`chat-album chat-album-${count}`}>
        {photos.slice(0, 4).map((photo, index) => (
          <AlbumTile key={photo.id} photo={photo} index={index} api={api} onUrl={onUrl} onOpen={open} onDismiss={onDismiss} tileProps={tileProps} />
        ))}
        {overlay}
      </div>
      {footer}
    </div>
  );
}

/** A replied-to photo, small, beside the quote's text (nothing until it loads). */
export function ReplyThumb({ attachmentId, api }: { attachmentId: string; api: ChatApi }) {
  const { url } = useAttachmentUrl(attachmentId, api);
  return url ? <img className="reply-thumb" src={url} alt="" /> : null;
}

/** Image thumbnail for the info panel's shared media grid. */
export function AttachmentThumb({ attachmentId, alt, api, onOpen, className, style }: {
  attachmentId: string;
  alt: string;
  api: ChatApi;
  onOpen: (url: string, alt: string) => void;
  className?: string;
  style?: React.CSSProperties;
}) {
  const { url, failed } = useAttachmentUrl(attachmentId, api);
  if (failed) return null;
  if (!url) return <MediaLoader />;
  return <img src={url} alt={alt} className={className} style={style} onClick={() => onOpen(url, alt)} />;
}

function listingPhotoUrl(storagePath: string): string {
  const client = getSupabaseClient();
  return client ? client.storage.from('listing-photos').getPublicUrl(storagePath).data.publicUrl : '';
}

/**
 * The listing a message asks about ("Chat" on a listing), Marketplace style:
 * the photo with the title, place and kind over it, and the price. Above the
 * message in the thread (the message reads as a reply to it); compact above
 * the composer before sending. Opens the listing.
 */
export function ListingEnquiryCard({ listing, compact = false }: { listing: ChatListingSummary; compact?: boolean }) {
  const router = useRouter();
  const photo = listing.listing_photos && listing.listing_photos[0];
  const fallbackUrl = photo ? listingPhotoUrl(photo.storage_path) : '';
  const [photoUrl, setPhotoUrl] = useState(fallbackUrl);
  useEffect(() => {
    let cancelled = false;
    if (photo && fallbackUrl) cachedImageUrl(`listing-photo:${photo.storage_path}`, fallbackUrl).then((url) => { if (!cancelled) setPhotoUrl(url); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listing.id, photo && photo.storage_path]);
  const title = listing.title || 'VaRoom listing';
  const open = () => { void router.push(`/booking?id=${encodeURIComponent(listing.id)}`); };
  return (
    <div
      className={`chat-enquiry-card${compact ? ' is-compact' : ''}`}
      role="link"
      tabIndex={0}
      aria-label={`Listing: ${title}`}
      onClick={(event) => { event.stopPropagation(); open(); }}
      onKeyDown={(event) => { if (event.key === 'Enter') open(); }}
    >
      <span className="chat-enquiry-media">
        {photoUrl ? <img src={photoUrl} alt="" loading="lazy" /> : <span className="chat-enquiry-empty" aria-hidden="true" />}
        {!compact && (
          <span className="chat-enquiry-overlay">
            <strong>{title}</strong>
            <small>{listingSubtitle(listing)}</small>
          </span>
        )}
      </span>
      {compact ? (
        <span className="chat-enquiry-text">
          <em>Asking about this listing</em>
          <strong>{title}</strong>
          <small>{listingSubtitle(listing)} · {listingPriceText(listing)}</small>
        </span>
      ) : (
        <span className="chat-enquiry-price">{listingPriceText(listing)}</span>
      )}
    </div>
  );
}

/** A shared listing: photo (or its video), title, "location · category"; opens the booking page. */
export function ListingCard({ listing, api, meta }: { listing: ChatListingSummary; api: ChatApi; meta: React.ReactNode }) {
  const router = useRouter();
  const photo = listing.listing_photos && listing.listing_photos[0];
  const fallbackUrl = photo ? listingPhotoUrl(photo.storage_path) : '';
  const [photoUrl, setPhotoUrl] = useState(fallbackUrl);
  const [video, setVideo] = useState<ListingVideo | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (photo && fallbackUrl) {
      cachedImageUrl(`listing-photo:${photo.storage_path}`, fallbackUrl).then((url) => { if (!cancelled) setPhotoUrl(url); });
    }
    listingVideo(listing.id, api)
      .then((found) => { if (!cancelled) setVideo(found); })
      .catch((error) => console.error('Shared listing video unavailable:', error));
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listing.id, photo && photo.storage_path]);

  return (
    <div
      className="chat-listing-card"
      role="link"
      tabIndex={0}
      onClick={() => { void router.push(`/booking?id=${encodeURIComponent(listing.id)}`); }}
      onKeyDown={(event) => {
        if (event.key !== 'Enter') return;
        void router.push(`/booking?id=${encodeURIComponent(listing.id)}`);
      }}
    >
      {video ? (
        <video
          src={video.url}
          poster={video.thumbnailUrl || undefined}
          muted
          playsInline
          controls
          style={{ width: 180, height: 90, objectFit: 'cover', borderRadius: 8 }}
          // Playing the video must not open the listing.
          onClick={(event) => event.stopPropagation()}
        />
      ) : photo && photoUrl ? (
        <img src={photoUrl} alt={listing.title || 'Listing image'} />
      ) : null}
      <div className="chat-listing-card-body">
        <div className="chat-listing-card-title">{listing.title || ''}</div>
        <div className="chat-listing-card-sub">{[listing.location_text, listing.category].filter(Boolean).join(' · ')}</div>
      </div>
      {meta}
    </div>
  );
}

/** A voice note: play/pause control over the signed audio URL. */
export function VoiceCard({ attachmentId, api, meta }: { attachmentId: string; api: ChatApi; meta: React.ReactNode }) {
  const { url } = useAttachmentUrl(attachmentId, api);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  return (
    <div className="voice-card">
      <button
        className="play"
        type="button"
        aria-label={playing ? 'Pause voice message' : 'Play voice message'}
        onClick={() => {
          const audio = audioRef.current;
          if (!audio) return;
          if (audio.paused) void audio.play(); else audio.pause();
        }}
      >
        <svg className="icon-fill" aria-hidden="true"><use href="#i-play" /></svg>
      </button>
      <div className="voice-wave" />
      <div className="voice-dur">Voice</div>
      <audio
        ref={audioRef}
        preload="metadata"
        src={url || undefined}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
      />
      {meta}
    </div>
  );
}

/** Full-screen image viewer (legacy `.chat-image-preview`): closes on the backdrop or Escape. */
export interface ViewerImage {
  url: string;
  alt: string;
}

/** The full-size photo viewer; with an album it pages through it (arrows, arrow keys, swipe). */
export function ImagePreview({ items, index: startIndex = 0, onClose }: { items: ViewerImage[]; index?: number; onClose: () => void }) {
  const [index, setIndex] = useState(startIndex);
  const touchStartRef = useRef<number | null>(null);
  const count = items.length;
  const go = useCallback((step: number) => setIndex((current) => (current + step + count) % count), [count]);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
      else if (count > 1 && event.key === 'ArrowRight') go(1);
      else if (count > 1 && event.key === 'ArrowLeft') go(-1);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose, go, count]);
  const current = items[Math.min(index, count - 1)];
  if (!current) return null;
  return (
    <div
      className="chat-image-preview"
      role="dialog"
      aria-label={count > 1 ? `Image ${index + 1} of ${count}` : 'Image preview'}
      onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}
      onTouchStart={(event) => { touchStartRef.current = event.touches[0]?.clientX ?? null; }}
      onTouchEnd={(event) => {
        const start = touchStartRef.current;
        touchStartRef.current = null;
        const end = event.changedTouches[0]?.clientX;
        if (count < 2 || start === null || end === undefined || Math.abs(end - start) < 40) return;
        go(end < start ? 1 : -1);
      }}
    >
      <img src={current.url} alt={current.alt} />
      {count > 1 && (
        <>
          <button type="button" className="chat-image-preview-nav prev" aria-label="Previous photo" onClick={() => go(-1)}>
            <svg className="icon" aria-hidden="true"><use href="#i-chevron-left" /></svg>
          </button>
          <button type="button" className="chat-image-preview-nav next" aria-label="Next photo" onClick={() => go(1)}>
            <svg className="icon" aria-hidden="true"><use href="#i-chevron-right" /></svg>
          </button>
          <span className="chat-image-preview-count" aria-hidden="true">{index + 1} / {count}</span>
        </>
      )}
    </div>
  );
}
