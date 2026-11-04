import React, { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import { getSupabaseClient } from '../../lib/supabase/client';
import type { ChatListingSummary } from '../../lib/chatCache';
import { attachmentUrl, cachedImageUrl, listingVideo, type ChatApi, type ListingVideo } from '../../lib/chat/chatMedia';

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
export function ImagePreview({ url, alt, onClose }: { url: string; alt: string; onClose: () => void }) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);
  return (
    <div
      className="chat-image-preview"
      role="dialog"
      aria-label="Image preview"
      onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}
    >
      <img src={url} alt={alt} />
    </div>
  );
}
