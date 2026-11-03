import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  formatTime, isViewerOpen, readMuted, registerPlayer, setViewerOpen, stopOthers, unregisterPlayer, updatePlayer, viewerEntries, writeMuted,
  type PlayerEntry, type VideoDetails,
} from '../../lib/media/videoPlayback';
import { VIDEO_PLAYER_STYLES } from './videoPlayerStyles';

// The listing video player, replacing public/js/varoom-video-player.js:
// muted by default (the session remembers sound), plays while on screen,
// one video at a time, "Tap play to start" when autoplay is blocked, "Video
// unavailable" with Retry, and on phones a tap opens a full-screen swipeable
// viewer of the page's videos. Where the browser can't go full screen
// (iPhone), the viewer stays open as a full-screen overlay.
//
// Its controls stop the click there, so a player inside a listing link no
// longer opens the listing when its controls are used.

export type { VideoDetails } from '../../lib/media/videoPlayback';

const PATHS: Record<string, React.ReactNode> = {
  play: <path d="m8 5 11 7-11 7V5Z" />,
  pause: <path d="M8 5v14M16 5v14" />,
  volume: <><path d="M4 9v6h4l5 4V5L8 9H4Z" /><path d="M16 9.5a4 4 0 0 1 0 5M18.5 7a7.5 7.5 0 0 1 0 10" /></>,
  muted: <><path d="M4 9v6h4l5 4V5L8 9H4Z" /><path d="m17 9 4 6m0-6-4 6" /></>,
  fullscreen: <path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5" />,
  exitFullscreen: <path d="M9 4H4v5M15 4h5v5M20 15v5h-5M9 20H4v-5" />,
  replay: <><path d="M20 11a8 8 0 1 0 2 5" /><path d="M20 4v7h-7" /></>,
};

const Icon = ({ name }: { name: keyof typeof PATHS }) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{PATHS[name]}</svg>
);

const STYLE_ID = 'varoom-video-player-styles';
function useStyles() {
  useEffect(() => {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = VIDEO_PLAYER_STYLES;
    document.head.appendChild(style);
  }, []);
}

const isMobile = () => typeof window !== 'undefined' && window.matchMedia('(hover: none) and (pointer: coarse)').matches;
const sessionStore = () => { try { return window.sessionStorage; } catch { return null; } };
const stop = (event: React.SyntheticEvent) => { event.preventDefault(); event.stopPropagation(); };

interface ViewerSlideOptions {
  active: boolean;
  preload: 'metadata' | 'none';
  startAt?: number;
  onClose: () => void;
  /** Changes when the viewer track scrolls (shows the active controls). */
  ping: number;
}

export interface VideoPlayerProps {
  src: string;
  poster?: string | null;
  details?: VideoDetails | null;
  listingId?: string;
  className?: string;
  /** A fresh playback URL for Retry (playback URLs expire). */
  refreshSrc?: () => Promise<string | null>;
}

function PlayerCore({ src, poster = null, details = null, listingId, className = '', refreshSrc, viewer, onOpenViewer }: VideoPlayerProps & {
  viewer?: ViewerSlideOptions;
  onOpenViewer?: (startAt: number, entryId: number | null) => void;
}) {
  useStyles();
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const entryRef = useRef<PlayerEntry | null>(null);
  const controlsTimer = useRef<number | null>(null);
  const dragging = useRef(false);
  const startApplied = useRef(false);
  const [currentSrc, setCurrentSrc] = useState(src);
  const [muted, setMuted] = useState(() => (typeof window === 'undefined' ? true : readMuted(sessionStore())));
  const [state, setState] = useState({ buffering: true, ready: false, error: false, blocked: false, playing: false, ended: false });
  const [statusText, setStatusText] = useState('');
  const [progress, setProgress] = useState(0);
  const [time, setTime] = useState('0:00 / 0:00');
  const [controlsVisible, setControlsVisible] = useState(false);
  const inViewer = Boolean(viewer);
  const viewerActive = Boolean(viewer && viewer.active);

  useEffect(() => { setCurrentSrc(src); }, [src]);
  useEffect(() => { if (videoRef.current) videoRef.current.muted = muted; }, [muted]);

  // Listed for one-at-a-time playback and (page players) the viewer.
  useEffect(() => {
    const entry = registerPlayer({ element: wrapperRef.current, video: videoRef.current, src: currentSrc, poster, details, inViewer });
    entryRef.current = entry;
    return () => { unregisterPlayer(entry.id); entryRef.current = null; };
    // Registered once; later changes go through updatePlayer below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (entryRef.current) updatePlayer(entryRef.current.id, { src: currentSrc, poster, details });
  }, [currentSrc, poster, details]);

  const patch = useCallback((next: Partial<typeof state>) => setState((current) => ({ ...current, ...next })), []);

  const play = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    stopOthers(video);
    video.play().catch((error: Error) => {
      if (error && error.name === 'AbortError') return;
      console.warn('Video playback was blocked or failed:', error);
      patch({ buffering: false, error: false, blocked: true });
      setStatusText('Tap play to start');
      video.dispatchEvent(new CustomEvent('varoomautoplayblocked', { bubbles: true }));
    });
  }, [patch]);

  const hideControls = useCallback(() => {
    if (controlsTimer.current) window.clearTimeout(controlsTimer.current);
    setControlsVisible(false);
  }, []);
  const showControls = useCallback(() => {
    setControlsVisible(true);
    if (controlsTimer.current) window.clearTimeout(controlsTimer.current);
    if (viewerActive) {
      controlsTimer.current = window.setTimeout(() => { if (!dragging.current) setControlsVisible(false); }, 2800);
    }
  }, [viewerActive]);
  useEffect(() => () => { if (controlsTimer.current) window.clearTimeout(controlsTimer.current); }, []);

  // Page players: play while on screen (not while the viewer is open).
  useEffect(() => {
    const video = videoRef.current;
    if (inViewer || !video || typeof IntersectionObserver === 'undefined') return undefined;
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (isViewerOpen()) return;
        if (entry.isIntersecting) {
          video.preload = 'metadata';
          play();
        } else if (!video.paused) video.pause();
      });
    }, { rootMargin: '160px 0px', threshold: 0.1 });
    observer.observe(video);
    return () => observer.disconnect();
  }, [inViewer, play]);

  // Viewer slides: the active one plays from where the page video was.
  useEffect(() => {
    const video = videoRef.current;
    if (!viewer || !video) return;
    video.preload = viewer.active ? 'metadata' : viewer.preload;
    if (viewer.active) {
      if (viewer.startAt && !startApplied.current) {
        startApplied.current = true;
        const seek = () => { try { video.currentTime = viewer.startAt || 0; } catch { /* not seekable yet */ } };
        if (video.readyState >= 1) seek(); else video.addEventListener('loadedmetadata', seek, { once: true });
      }
      showControls();
      play();
    } else {
      if (!video.paused) video.pause();
      hideControls();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewer?.active, viewer?.preload]);
  useEffect(() => { if (viewerActive) showControls(); }, [viewer?.ping, viewerActive, showControls]);

  const togglePlay = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused || video.ended) {
      if (video.ended) video.currentTime = 0;
      play();
    } else video.pause();
  };

  const openViewer = () => {
    const video = videoRef.current;
    if (onOpenViewer) onOpenViewer(video ? video.currentTime : 0, entryRef.current ? entryRef.current.id : null);
  };

  const onVideoClick = (event: React.MouseEvent) => {
    stop(event);
    if (!inViewer && isMobile()) { openViewer(); return; }
    togglePlay();
  };

  const toggleMute = (event: React.MouseEvent) => {
    stop(event);
    setMuted((current) => {
      const next = !current;
      writeMuted(sessionStore(), next);
      return next;
    });
  };

  const retry = async (event: React.MouseEvent) => {
    stop(event);
    patch({ error: false, buffering: true });
    setStatusText('Loading…');
    let next = currentSrc;
    if (refreshSrc) {
      try { next = (await refreshSrc()) || currentSrc; } catch { next = currentSrc; }
    }
    if (next !== currentSrc) setCurrentSrc(next);
    window.setTimeout(() => {
      const video = videoRef.current;
      if (!video) return;
      video.load();
      play();
    }, 0);
  };

  const label = (playing: boolean, ended: boolean) => (ended ? 'Replay video' : (playing ? 'Pause video' : 'Play video'));
  const muteLabel = muted ? 'Unmute video' : 'Mute video';
  const classes = [
    'varoom-video-player', className,
    state.buffering && !state.error ? 'is-buffering' : '',
    state.ready ? 'is-ready' : '',
    state.playing ? 'is-playing' : '',
    state.ended ? 'is-ended' : '',
    state.error ? 'is-error' : '',
    state.blocked ? 'is-autoplay-blocked' : '',
    controlsVisible ? 'controls-visible' : '',
    viewerActive ? 'is-fullscreen' : '',
  ].filter(Boolean).join(' ');

  return (
    <div
      ref={wrapperRef}
      className={classes}
      onPointerDown={() => { if (viewerActive) showControls(); }}
      onMouseEnter={() => { if (!isMobile() && viewerActive) showControls(); }}
      onMouseLeave={() => {
        if (!isMobile() && viewerActive) {
          if (controlsTimer.current) window.clearTimeout(controlsTimer.current);
          controlsTimer.current = window.setTimeout(hideControls, 900);
        }
      }}
    >
      <video
        ref={videoRef}
        src={currentSrc}
        poster={poster || undefined}
        playsInline
        muted={muted}
        preload="none"
        data-listing-id={listingId}
        data-video-url={currentSrc}
        onClick={onVideoClick}
        onPlay={() => { stopOthers(videoRef.current); patch({ playing: true, ended: false }); }}
        onPause={() => patch({ playing: false })}
        onTimeUpdate={(event) => {
          const video = event.currentTarget;
          if (Number.isFinite(video.duration) && video.duration > 0) {
            setProgress(Math.max(0, Math.min(100, (video.currentTime / video.duration) * 100)));
            setTime(`${formatTime(video.currentTime)} / ${formatTime(video.duration)}`);
          }
        }}
        onLoadedMetadata={(event) => { setProgress(0); setTime(`0:00 / ${formatTime(event.currentTarget.duration)}`); }}
        onWaiting={() => patch({ buffering: true })}
        onStalled={() => patch({ buffering: true })}
        onCanPlay={() => { patch({ ready: true, buffering: false, error: false }); setStatusText(''); }}
        onLoadedData={() => { patch({ ready: true, buffering: false, error: false }); setStatusText(''); }}
        onEnded={() => { patch({ playing: false, ended: true }); showControls(); }}
        onError={(event) => {
          const video = event.currentTarget;
          console.error('Video failed to load:', video.currentSrc || video.src, video.error);
          patch({ blocked: false, error: true, buffering: false });
          setStatusText('Video unavailable');
        }}
        onPlaying={(event) => {
          patch({ blocked: false, error: false, buffering: false });
          setStatusText('');
          event.currentTarget.dispatchEvent(new CustomEvent('varoomvideoplaying', { bubbles: true }));
        }}
      />
      <div className="varoom-video-status" role="status" aria-label={state.error ? (statusText || 'Video unavailable') : (state.blocked ? 'Tap play to start' : 'Loading video')}>
        <span className="varoom-video-status-text">{statusText}</span>
        <button type="button" className="varoom-video-play-retry" aria-label="Play video" onClick={(event) => { stop(event); play(); }}><Icon name="play" /></button>
        <button type="button" className="varoom-video-error-retry" onClick={(event) => { void retry(event); }}>Retry</button>
      </div>
      <button type="button" className="varoom-video-control varoom-video-mobile-mute" aria-label={muteLabel} onClick={toggleMute}><Icon name={muted ? 'muted' : 'volume'} /></button>
      <div className="varoom-video-controls" aria-label="Video controls" onClick={stop}>
        <button type="button" className="varoom-video-control" aria-label={label(state.playing, state.ended)} onClick={(event) => { stop(event); togglePlay(); showControls(); }}>
          <Icon name={state.ended ? 'replay' : (state.playing ? 'pause' : 'play')} />
        </button>
        <input
          className="varoom-video-progress"
          type="range" min="0" max="100" step="0.1"
          value={progress}
          aria-label="Video progress"
          style={{ ['--video-progress' as string]: `${progress}%` }}
          onPointerDown={(event) => { event.stopPropagation(); dragging.current = true; showControls(); }}
          onPointerUp={() => { dragging.current = false; }}
          onClick={(event) => event.stopPropagation()}
          onChange={(event) => {
            const video = videoRef.current;
            const value = Number(event.target.value);
            if (video && Number.isFinite(video.duration) && video.duration > 0) {
              video.currentTime = (value / 100) * video.duration;
              setProgress(value);
            }
          }}
        />
        <span className="varoom-video-time" aria-live="off">{time}</span>
        <button type="button" className="varoom-video-control" aria-label={muteLabel} onClick={(event) => { toggleMute(event); showControls(); }}><Icon name={muted ? 'muted' : 'volume'} /></button>
        <button
          type="button"
          className="varoom-video-control"
          aria-label={viewerActive ? 'Exit fullscreen' : 'Enter fullscreen'}
          onClick={(event) => { stop(event); if (viewerActive && viewer) viewer.onClose(); else if (!inViewer) openViewer(); }}
        >
          <Icon name={viewerActive ? 'exitFullscreen' : 'fullscreen'} />
        </button>
      </div>
    </div>
  );
}

function ViewerDetails({ details }: { details: VideoDetails | null }) {
  if (!details || !(details.avatarUrl || details.hostName || details.username || details.caption)) return <div className="varoom-video-viewer-details" />;
  return (
    <div className="varoom-video-viewer-details">
      <div className="varoom-video-viewer-identity">
        {details.avatarUrl && <div className="card-avatar"><img src={details.avatarUrl} alt="" /></div>}
        <div className="varoom-video-viewer-identity-text">
          {details.hostName && <span className="varoom-video-viewer-host-name">{details.hostName}</span>}
          {details.username && <span className="varoom-video-viewer-host-username">{details.username}</span>}
        </div>
      </div>
      {details.caption && <p className="varoom-video-viewer-caption">{details.caption}</p>}
    </div>
  );
}

type FullscreenDocument = Document & { webkitFullscreenElement?: Element | null; webkitExitFullscreen?: () => Promise<void> | void };
type FullscreenElement = HTMLElement & { webkitRequestFullscreen?: () => Promise<void> | void };
const fullscreenElement = () => { const doc = document as FullscreenDocument; return doc.fullscreenElement || doc.webkitFullscreenElement || null; };

/** The full-screen vertical viewer of the page's videos. */
function VideoViewer({ entries, startIndex, startAt, onClosed }: { entries: PlayerEntry[]; startIndex: number; startAt: number; onClosed: () => void }) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const [active, setActive] = useState(startIndex);
  const [ping, setPing] = useState(0);
  const entered = useRef(false);
  const closed = useRef(false);
  const saved = useRef({ x: 0, y: 0, overflow: '' });

  const finish = useCallback(() => {
    if (closed.current) return;
    closed.current = true;
    document.body.style.overflow = saved.current.overflow;
    setViewerOpen(false);
    window.scrollTo(saved.current.x, saved.current.y);
    onClosed();
  }, [onClosed]);

  const close = useCallback(() => {
    const doc = document as FullscreenDocument;
    if (entered.current && fullscreenElement() === rootRef.current) {
      const exit = doc.exitFullscreen || doc.webkitExitFullscreen;
      if (exit) { void Promise.resolve(exit.call(doc)).catch(finish); return; }
    }
    finish();
  }, [finish]);

  useEffect(() => {
    saved.current = { x: window.scrollX, y: window.scrollY, overflow: document.body.style.overflow };
    document.body.style.overflow = 'hidden';
    setViewerOpen(true);
    entries.forEach((entry) => { if (entry.video && !entry.video.paused) entry.video.pause(); });
    if (trackRef.current) trackRef.current.scrollTop = Math.max(0, startIndex) * window.innerHeight;
    const root = rootRef.current as FullscreenElement | null;
    const request = root && (root.requestFullscreen || root.webkitRequestFullscreen);
    if (root && request) {
      // Without full screen (blocked, or iPhone) the viewer stays as an overlay.
      Promise.resolve(request.call(root)).then(() => { entered.current = true; }, (error: unknown) => console.warn('Fullscreen request was blocked:', error));
    }
    const onFullscreenChange = () => { if (entered.current && fullscreenElement() !== rootRef.current) finish(); };
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') close(); };
    document.addEventListener('fullscreenchange', onFullscreenChange);
    document.addEventListener('webkitfullscreenchange', onFullscreenChange);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('fullscreenchange', onFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', onFullscreenChange);
      document.removeEventListener('keydown', onKey);
      if (!closed.current) { document.body.style.overflow = saved.current.overflow; setViewerOpen(false); }
    };
    // Opened once per viewer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const track = trackRef.current;
    if (!track || typeof IntersectionObserver === 'undefined') return undefined;
    const observer = new IntersectionObserver((items) => {
      items.forEach((item) => {
        if (item.isIntersecting && item.intersectionRatio >= 0.7) setActive(Number((item.target as HTMLElement).dataset.index));
      });
    }, { root: track, threshold: [0.7] });
    Array.from(track.children).forEach((slide) => observer.observe(slide));
    return () => observer.disconnect();
  }, []);

  return (
    <div className="varoom-video-viewer" aria-label="VaRoom video viewer" ref={rootRef}>
      <button type="button" className="varoom-video-viewer-close" aria-label="Close fullscreen video viewer" onClick={(event) => { event.stopPropagation(); close(); }}>×</button>
      <div className="varoom-video-viewer-track" ref={trackRef} onScroll={() => setPing((value) => value + 1)}>
        {entries.map((entry, index) => (
          <section className="varoom-video-viewer-slide" key={entry.id} data-index={index}>
            <PlayerCore
              src={entry.src}
              poster={entry.poster}
              details={entry.details}
              viewer={{
                active: index === active,
                preload: Math.abs(index - active) <= 1 ? 'metadata' : 'none',
                startAt: index === startIndex ? startAt : undefined,
                onClose: close,
                ping: index === active ? ping : 0,
              }}
            />
            {index === active && <ViewerDetails details={entry.details} />}
          </section>
        ))}
      </div>
    </div>
  );
}

/** A listing video with VaRoom's controls and viewer. */
export default function VideoPlayer(props: VideoPlayerProps) {
  const [viewer, setViewer] = useState<{ entries: PlayerEntry[]; index: number; startAt: number } | null>(null);

  const open = (startAt: number, entryId: number | null) => {
    const entries = viewerEntries();
    if (!entries.length) return;
    const index = Math.max(0, entries.findIndex((entry) => entry.id === entryId));
    setViewer({ entries, index, startAt });
  };

  return (
    <>
      <PlayerCore {...props} onOpenViewer={open} />
      {viewer && typeof document !== 'undefined' && createPortal(
        <VideoViewer entries={viewer.entries} startIndex={viewer.index} startAt={viewer.startAt} onClosed={() => setViewer(null)} />,
        document.body,
      )}
    </>
  );
}
