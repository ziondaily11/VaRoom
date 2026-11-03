import React, { useEffect, useRef, useState } from 'react';
import { ICON_CLOSE, ICON_HEART_FILLED, ICON_HEART_OUTLINE, ICON_NEXT, ICON_PREV } from '../../lib/booking/bookingIcons';
import type { LikeView } from '../../lib/listings/listingLikes';
import Svg from './Svg';

// The listing gallery: the video first (when there is one), then the photos.
// Arrows, dots and the 1/N pill; drag or swipe; trackpad sideways scroll.
// Close goes back, or to Marketplace. Unchanged from legacy-pages/booking.html.

interface Props {
  title: string;
  photoUrls: string[];
  video: { videoUrl: string; thumbnailUrl: string | null } | null;
  like: LikeView;
  onToggleLike: () => void;
  onClose: () => void;
}

function LikeButton({ like, onToggle }: { like: LikeView; onToggle: () => void }) {
  const label = like.ready ? (like.liked ? 'Unlike listing' : 'Like listing') : 'Like status unavailable';
  return (
    <button
      type="button"
      className="gallery-like-btn"
      id="gallery-like-btn"
      aria-label={label}
      aria-pressed={like.ready ? like.liked : undefined}
      disabled={!like.ready}
      title={!like.ready && !like.loading ? 'Like information is temporarily unavailable' : undefined}
      onClick={(event) => { event.preventDefault(); event.stopPropagation(); onToggle(); }}
    >
      <Svg markup={like.liked ? ICON_HEART_FILLED : ICON_HEART_OUTLINE} />
      <span className="gallery-like-count" aria-hidden="true">{like.ready ? like.count : '—'}</span>
    </button>
  );
}

function CloseButton({ onClose }: { onClose: () => void }) {
  return (
    <button type="button" className="gallery-close-btn" id="gallery-close-btn" aria-label="Close property details" onClick={onClose}>
      <Svg markup={ICON_CLOSE} />
    </button>
  );
}

export default function BookingGallery({ title, photoUrls, video, like, onToggleLike, onClose }: Props) {
  const media = video ? [video.videoUrl, ...photoUrls] : photoUrls;
  const count = media.length;
  const [active, setActive] = useState(0);
  const [drag, setDrag] = useState<number | null>(null);
  const carousel = useRef<HTMLDivElement>(null);
  const dragStart = useRef(0);
  const dragCurrent = useRef(0);
  const dragging = useRef(false);
  const wheelLock = useRef(false);
  const hadVideo = useRef(Boolean(video));

  // A video arriving after the photos goes first; the photo being viewed stays in view.
  useEffect(() => {
    if (video && !hadVideo.current) setActive((index) => (index === 0 ? 0 : index + 1));
    hadVideo.current = Boolean(video);
  }, [video]);

  const goTo = (index: number) => { if (count) setActive(((index % count) + count) % count); };

  // Trackpad / shift-wheel sideways scroll: "scroll right to see the next photo".
  useEffect(() => {
    const element = carousel.current;
    if (!element || count < 2) return undefined;
    const onWheel = (event: WheelEvent) => {
      if (Math.abs(event.deltaX) > Math.abs(event.deltaY) && Math.abs(event.deltaX) > 10) {
        event.preventDefault();
        if (wheelLock.current) return;
        wheelLock.current = true;
        setActive((index) => (((index + (event.deltaX > 0 ? 1 : -1)) % count) + count) % count);
        setTimeout(() => { wheelLock.current = false; }, 350);
      }
    };
    element.addEventListener('wheel', onWheel, { passive: false });
    return () => element.removeEventListener('wheel', onWheel);
  }, [count]);

  if (count === 0) {
    return (
      <div className="gallery-carousel">
        <CloseButton onClose={onClose} />
        <LikeButton like={like} onToggle={onToggleLike} />
      </div>
    );
  }

  const isControl = (target: EventTarget | null) => target instanceof Element && Boolean(target.closest('button, .gallery-nav, .gallery-dot'));
  const stop = (event: React.PointerEvent) => event.stopPropagation();
  const endDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging.current) return;
    dragging.current = false;
    const delta = dragCurrent.current - dragStart.current;
    setDrag(null);
    if (Math.abs(delta) > 40) goTo(active + (delta < 0 ? 1 : -1));
    try { event.currentTarget.releasePointerCapture(event.pointerId); } catch { /* not captured */ }
  };
  const width = carousel.current ? carousel.current.clientWidth : 1;
  const offset = -(active * 100) + (drag === null ? 0 : (drag / width) * 100);

  return (
    <div
      className="gallery-carousel"
      id="gallery-carousel"
      ref={carousel}
      onPointerDown={count > 1 ? (event) => {
        if (isControl(event.target)) return;
        dragging.current = true;
        dragStart.current = event.clientX;
        dragCurrent.current = event.clientX;
        setDrag(0);
        try { event.currentTarget.setPointerCapture(event.pointerId); } catch { /* unsupported */ }
      } : undefined}
      onPointerMove={count > 1 ? (event) => {
        if (!dragging.current) return;
        dragCurrent.current = event.clientX;
        setDrag(event.clientX - dragStart.current);
      } : undefined}
      onPointerUp={count > 1 ? endDrag : undefined}
      onPointerLeave={count > 1 ? () => { if (dragging.current) { dragging.current = false; setDrag(null); } } : undefined}
    >
      {count > 1 && <div className="gallery-index-pill" id="gallery-index-pill">{active + 1}/{count}</div>}
      <div className="gallery-slide-track" id="gallery-slide-track" style={count > 1 ? { transition: drag === null ? 'transform .3s ease' : 'none', transform: `translateX(${offset}%)` } : undefined}>
        {media.map((url, index) => (
          <div className="gallery-slide" key={url}>
            {video && index === 0
              ? <video src={url} poster={video.thumbnailUrl || ''} muted autoPlay loop playsInline controlsList="nodownload" aria-label={`${title} video`} />
              : <><img className="gallery-slide-background" src={url} alt="" aria-hidden="true" /><img src={url} alt={title} /></>}
          </div>
        ))}
      </div>
      <CloseButton onClose={onClose} />
      <LikeButton like={like} onToggle={onToggleLike} />
      {count > 1 && (
        <>
          <button type="button" className="gallery-nav prev" id="gallery-prev" aria-label="Previous photo" onPointerDown={stop} onClick={(event) => { event.preventDefault(); event.stopPropagation(); goTo(active - 1); }}>
            <Svg markup={ICON_PREV} />
          </button>
          <button type="button" className="gallery-nav next" id="gallery-next" aria-label="Next photo" onPointerDown={stop} onClick={(event) => { event.preventDefault(); event.stopPropagation(); goTo(active + 1); }}>
            <Svg markup={ICON_NEXT} />
          </button>
          <div className="gallery-dots" id="gallery-dots">
            {media.map((url, index) => (
              <span key={url} className={`gallery-dot${index === active ? ' active' : ''}`} data-index={index} onPointerDown={stop} onClick={(event) => { event.preventDefault(); event.stopPropagation(); goTo(index); }} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
