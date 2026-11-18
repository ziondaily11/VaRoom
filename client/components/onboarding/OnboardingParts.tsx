import React, { forwardRef, useCallback, useEffect, useId, useImperativeHandle, useRef, useState } from 'react';
import { usePresence } from '../../lib/motion/usePresence';
import { DURATION, exitMs } from '../../lib/motion/tokens';
import { constrainCrop, cropDraw, MESSAGES, PHOTO_MAX_BYTES, startCrop, type Crop, type Tile } from '../../lib/onboarding/onboarding';

// Onboarding building blocks: icons, the layout (one centred column with the
// back arrow and progress bar above each step), the picture tiles, and the
// photo picker with its crop.

const svg = (size: number, children: React.ReactNode, stroke = 2) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{children}</svg>
);

export const CheckIcon = ({ size = 13 }: { size?: number }) => svg(size, <path d="m5 12 5 5 9-10" />, 3);
export const ArrowIcon = () => svg(16, <path d="M5 12h14M13 6l6 6-6 6" />, 2.2);
export const CameraIcon = () => svg(22, <><path d="M14 4h-4L8 7H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2-3Z" /><circle cx="12" cy="13" r="3" /></>, 1.8);
export const PersonIcon = ({ size = 30 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#8a847d" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 3.5-7 8-7s8 3 8 7" /></svg>
);
export const LockIcon = () => svg(13, <><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></>);
export const BackIcon = () => svg(20, <path d="M15 5l-7 7 7 7" />, 2.2);

// ---------- Layout ----------

/** How the step got here: forward slides in from the right, back from the left; null on first paint. */
export type StepDirection = 'forward' | 'back' | null;

export function OnboardingLayout({ progress, onBack, backLabel = 'Back', stageKey, direction, wide = false, children }: {
  /** 0–1: the share of onboarding done (the account counts as the first step). */
  progress: number;
  /** The step before this one; no arrow when there is none. */
  onBack?: () => void;
  backLabel?: string;
  /** Changes with the step, so the new step slides in. */
  stageKey: string;
  direction: StepDirection;
  /** Picture-tile steps use a wider column. */
  wide?: boolean;
  children: React.ReactNode;
}) {
  const percent = Math.round(Math.max(0, Math.min(1, progress)) * 100);
  return (
    <div className="onb">
      <main className="onb-main">
        <div className={`onb-flow${wide ? ' is-wide' : ''}`}>
          <div className="onb-topbar">
            {onBack && <button type="button" className="onb-back-arrow" onClick={onBack} aria-label={backLabel}><BackIcon /></button>}
            <div className="onb-progress" role="progressbar" aria-label="Setup progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}>
              <span className="onb-progress-fill" style={{ transform: `scaleX(${percent / 100})` }} />
            </div>
          </div>
          <div key={stageKey} className={`onb-stage${direction ? ` is-${direction}` : ''}`}>{children}</div>
        </div>
      </main>
    </div>
  );
}

// ---------- Picture tiles ----------

/**
 * Photo tiles with the label under each (one pick for hosts, several for
 * clients). A picked tile gets a red ring and a check that pops in.
 */
export function TileGrid<V extends string>({ tiles, picked, multiple, label, onPick }: {
  tiles: Array<Tile<V>>; picked: readonly V[]; multiple: boolean; label: string; onPick: (value: V) => void;
}) {
  return (
    <div className={`onb-tiles is-${tiles.length}`} role={multiple ? 'group' : 'radiogroup'} aria-label={label}>
      {tiles.map((tile, index) => {
        const on = picked.includes(tile.value);
        return (
          <button key={tile.value} type="button" role={multiple ? 'checkbox' : 'radio'} aria-checked={on}
            className={`onb-tile${on ? ' is-selected' : ''}`} style={{ '--onb-i': index } as React.CSSProperties}
            onClick={() => onPick(tile.value)}>
            <span className="onb-tile-media">
              <img src={tile.image} alt="" width={240} height={300} decoding="async" draggable={false} />
              <span className="onb-tile-check" aria-hidden="true"><CheckIcon size={14} /></span>
            </span>
            <span className="onb-tile-label">{tile.title}</span>
          </button>
        );
      })}
    </div>
  );
}

// ---------- Photo ----------

export interface PhotoState { url: string; crop: Crop; naturalWidth: number; naturalHeight: number }

/** The image as placed in a square of `size` px, following the crop. */
export function CroppedImage({ photo, size, className }: { photo: PhotoState; size: number; className?: string }) {
  const scale = size / photo.crop.frameSize;
  const width = photo.crop.baseWidth * photo.crop.zoom * scale;
  const height = photo.crop.baseHeight * photo.crop.zoom * scale;
  return (
    <img
      className={className}
      src={photo.url}
      alt=""
      style={{ width, height, left: size / 2 + photo.crop.offsetX * scale, top: size / 2 + photo.crop.offsetY * scale }}
    />
  );
}

export interface PhotoPickerHandle { blob: () => Promise<Blob | null> }

const MENU_EXIT_MS = exitMs(DURATION.quick);

/**
 * The profile photo: a large circle with a camera button on its edge. With no
 * photo the camera (or the circle) opens the photo library; with one it offers
 * Change or Remove (a popover; a bottom sheet on phones). A new photo is
 * positioned by dragging and zoomed by scrolling or pinching.
 */
export const PhotoPicker = forwardRef<PhotoPickerHandle, {
  existingUrl: string | null; initialPhoto?: PhotoState | null; onChange: (photo: PhotoState | null) => void;
  /** The saved photo was removed (it is cleared when the step is saved). */
  onRemoveExisting: () => void;
}>(
  function PhotoPicker({ existingUrl, initialPhoto = null, onChange, onRemoveExisting }, ref) {
    const inputRef = useRef<HTMLInputElement | null>(null);
    const frameRef = useRef<HTMLDivElement | null>(null);
    const pointers = useRef(new Map<number, { x: number; y: number }>());
    const pinch = useRef<{ distance: number; zoom: number } | null>(null);
    const [photo, setPhoto] = useState<PhotoState | null>(initialPhoto);
    const [hint, setHint] = useState('');
    const [adjusting, setAdjusting] = useState(false);
    const [frameWidth, setFrameWidth] = useState(144);

    // The frame shrinks on small screens; the crop scales with it.
    useEffect(() => {
      const frame = frameRef.current;
      if (!frame || typeof ResizeObserver === 'undefined') return undefined;
      const observer = new ResizeObserver(() => setFrameWidth(frame.getBoundingClientRect().width || 144));
      observer.observe(frame);
      return () => observer.disconnect();
    }, []);

    useEffect(() => { onChange(photo); }, [photo, onChange]);
    // A replaced photo's URL is released; the last one stays valid for the preview.
    const lastUrl = useRef<string | null>(initialPhoto ? initialPhoto.url : null);
    useEffect(() => {
      if (lastUrl.current && lastUrl.current !== (photo && photo.url)) URL.revokeObjectURL(lastUrl.current);
      lastUrl.current = photo ? photo.url : null;
    }, [photo]);

    const update = useCallback((next: (crop: Crop) => Crop) => {
      setPhoto((current) => (current ? { ...current, crop: constrainCrop(next(current.crop)) } : current));
    }, []);

    // Wheel zoom needs a non-passive listener to stop the page scrolling.
    useEffect(() => {
      const frame = frameRef.current;
      if (!frame || !photo) return undefined;
      const onWheel = (event: WheelEvent) => { event.preventDefault(); update((crop) => ({ ...crop, zoom: crop.zoom * (event.deltaY < 0 ? 1.1 : 0.9) })); };
      frame.addEventListener('wheel', onWheel, { passive: false });
      return () => frame.removeEventListener('wheel', onWheel);
    }, [photo, update]);

    useImperativeHandle(ref, () => ({
      blob: () => new Promise<Blob | null>((resolve, reject) => {
        if (!photo) { resolve(null); return; }
        const image = new Image();
        image.onload = () => {
          const canvas = document.createElement('canvas');
          canvas.width = 1024;
          canvas.height = 1024;
          const context = canvas.getContext('2d');
          if (!context) { reject(new Error('Could not prepare your photo. Please try again.')); return; }
          const draw = cropDraw(photo.crop, 1024);
          context.drawImage(image, draw.left, draw.top, draw.width, draw.height);
          canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Could not prepare your photo. Please try again.'))), 'image/jpeg', 0.92);
        };
        image.onerror = () => reject(new Error('Could not prepare your photo. Please select it again.'));
        image.src = photo.url;
      }),
    }), [photo]);

    const choose = () => { if (inputRef.current) { inputRef.current.value = ''; inputRef.current.click(); } };
    const [menuOpen, setMenuOpen] = useState(false);
    const menu = usePresence(menuOpen, MENU_EXIT_MS);
    const menuId = useId();
    const cameraRef = useRef<HTMLButtonElement | null>(null);
    const menuRef = useRef<HTMLDivElement | null>(null);

    // The menu: focus its first choice; Escape or a press outside closes it and returns focus to the camera.
    useEffect(() => {
      if (!menuOpen) return undefined;
      const first = menuRef.current?.querySelector('button');
      first?.focus();
      const close = () => { setMenuOpen(false); cameraRef.current?.focus(); };
      const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') close(); };
      const onDown = (event: PointerEvent) => {
        const target = event.target as Node;
        if (menuRef.current?.contains(target) || cameraRef.current?.contains(target)) return;
        setMenuOpen(false);
      };
      document.addEventListener('keydown', onKey);
      document.addEventListener('pointerdown', onDown);
      return () => { document.removeEventListener('keydown', onKey); document.removeEventListener('pointerdown', onDown); };
    }, [menuOpen]);

    const onFile = (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files && event.target.files[0];
      if (!file) return;
      if (!file.type || !file.type.startsWith('image/')) { setHint(MESSAGES.photoType); return; }
      if (file.size > PHOTO_MAX_BYTES) { setHint(MESSAGES.photoSize); return; }
      setHint('');
      const url = URL.createObjectURL(file);
      const probe = new Image();
      probe.onload = () => {
        setPhoto({ url, crop: startCrop(frameWidth, probe.naturalWidth, probe.naturalHeight), naturalWidth: probe.naturalWidth, naturalHeight: probe.naturalHeight });
      };
      probe.onerror = () => { URL.revokeObjectURL(url); setHint(MESSAGES.photoType); };
      probe.src = url;
    };

    const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
      if (!photo) { choose(); return; }
      pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
      event.currentTarget.setPointerCapture(event.pointerId);
      if (pointers.current.size === 2) {
        const [a, b] = Array.from(pointers.current.values());
        pinch.current = { distance: Math.hypot(a.x - b.x, a.y - b.y), zoom: photo.crop.zoom };
      }
      setAdjusting(true);
      event.preventDefault();
    };
    const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
      const previous = pointers.current.get(event.pointerId);
      if (!photo || !previous) return;
      pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (pointers.current.size >= 2 && pinch.current) {
        const [a, b] = Array.from(pointers.current.values());
        const ratio = Math.hypot(a.x - b.x, a.y - b.y) / pinch.current.distance;
        const start = pinch.current.zoom;
        update((crop) => ({ ...crop, zoom: start * ratio }));
      } else if (pointers.current.size === 1) {
        // Screen pixels to crop units (the frame may have resized since).
        const unit = photo.crop.frameSize / frameWidth;
        update((crop) => ({ ...crop, offsetX: crop.offsetX + (event.clientX - previous.x) * unit, offsetY: crop.offsetY + (event.clientY - previous.y) * unit }));
      }
      event.preventDefault();
    };
    const onPointerEnd = (event: React.PointerEvent<HTMLDivElement>) => {
      pointers.current.delete(event.pointerId);
      pinch.current = null;
      if (!pointers.current.size) setAdjusting(false);
    };

    const showing = photo ? 'new' : existingUrl ? 'existing' : 'none';
    const onCamera = () => { if (showing === 'none') choose(); else setMenuOpen((open) => !open); };
    const change = () => { setMenuOpen(false); choose(); };
    const remove = () => {
      setMenuOpen(false);
      setHint('');
      if (photo) setPhoto(null);
      else onRemoveExisting();
    };
    return (
      <div className={`onb-photo${showing !== 'none' ? ' has-photo' : ''}`}>
        <input ref={inputRef} type="file" accept="image/*" hidden onChange={onFile} aria-label="Choose profile photo" />
        <div className="onb-photo-ring">
          <div
            ref={frameRef}
            className={`onb-photo-frame${photo ? ' is-adjustable' : ''}${adjusting ? ' is-adjusting' : ''}`}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerEnd}
            onPointerCancel={onPointerEnd}
            title={photo ? 'Drag to position, scroll or pinch to zoom' : showing === 'none' ? 'Add a profile photo' : undefined}
          >
            {photo && <CroppedImage photo={photo} size={frameWidth} />}
            {!photo && existingUrl && <img className="is-whole" src={existingUrl} alt="" />}
            {showing === 'none' && <PersonIcon size={56} />}
          </div>
          <button
            ref={cameraRef}
            type="button"
            className="onb-photo-camera"
            onClick={onCamera}
            aria-label={showing === 'none' ? 'Add a profile photo' : 'Change or remove profile photo'}
            aria-haspopup={showing === 'none' ? undefined : 'menu'}
            aria-expanded={showing === 'none' ? undefined : menuOpen}
            aria-controls={menu.mounted ? menuId : undefined}
          >
            <CameraIcon />
          </button>
          {menu.mounted && (
            <>
              <div className={`onb-photo-scrim${menu.closing ? ' is-closing' : ''}`} aria-hidden="true" />
              <div ref={menuRef} id={menuId} role="menu" aria-label="Profile photo" className={`onb-photo-menu${menu.closing ? ' is-closing' : ''}`}>
                <button type="button" role="menuitem" onClick={change}>Change photo</button>
                <button type="button" role="menuitem" className="is-danger" onClick={remove}>Remove photo</button>
                <button type="button" className="onb-photo-menu-cancel" onClick={() => { setMenuOpen(false); cameraRef.current?.focus(); }}>Cancel</button>
              </div>
            </>
          )}
        </div>
        {hint
          ? <p className="onb-help is-error" role="alert">{hint}</p>
          : photo && <p className="onb-help">Drag or pinch to adjust.</p>}
      </div>
    );
  },
);
