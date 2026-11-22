import React, { useCallback, useEffect, useRef, useState } from 'react';

// A drawn city map shown under the live map: while it loads, and in its place
// when Google Maps is not configured yet. It shows where the place is (a pin,
// or a circle for the general area) on a drawing, never a real street plan,
// and says plainly that the live map is coming. It can be zoomed (buttons,
// wheel, double-click) and dragged like a map; the pin keeps its size.

const MIN_SCALE = 1;
const MAX_SCALE = 3;
const STEP = 0.5;
/** The drawing is larger than the frame (inset -20%), so it can be dragged. */
const OVERSIZE = 1.4;

interface Pan { scale: number; x: number; y: number }

function clampPan(pan: Pan, width: number, height: number): Pan {
  const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, pan.scale));
  const maxX = ((OVERSIZE * scale) - 1) * width / 2;
  const maxY = ((OVERSIZE * scale) - 1) * height / 2;
  return { scale, x: Math.max(-maxX, Math.min(maxX, pan.x)), y: Math.max(-maxY, Math.min(maxY, pan.y)) };
}

// Fixed shapes (no randomness: the drawing is the same on every render).
const BLOCK_ROWS = [80, 210, 340, 470, 600, 730, 860, 990];
const BLOCK_COLS = [70, 200, 330, 460, 590, 720, 850, 980];

function CityDrawing() {
  return (
    <svg className="vr-loc-art" viewBox="0 0 1200 1200" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">
      <rect width="1200" height="1200" className="il-land" />
      {BLOCK_ROWS.map((y, row) => BLOCK_COLS.map((x, col) => (
        <rect key={`${row}-${col}`} x={x} y={y} width={(row + col) % 3 === 0 ? 112 : 104} height={(row * 2 + col) % 4 === 0 ? 112 : 102} rx="10" className="il-block" />
      )))}
      <path d="M760 180 q90 -40 170 10 q60 50 20 130 q-50 70 -150 40 q-90 -40 -40 -180z" className="il-park" />
      <rect x="200" y="740" width="230" height="150" rx="26" className="il-park" />
      <path d="M-40 980 C 180 900, 300 1060, 520 980 S 860 820, 1240 900 L1240 1240 L-40 1240 Z" className="il-water" />
      <path d="M-20 300 C 300 260, 520 420, 760 380 S 1080 300, 1220 340" className="il-road il-road-major" />
      <path d="M420 -20 C 380 260, 520 520, 470 760 S 560 1060, 520 1220" className="il-road il-road-major" />
      <path d="M-20 640 L1220 600" className="il-road" />
      <path d="M860 -20 L900 1220" className="il-road" />
      <path d="M140 -20 L180 1220" className="il-road" />
      <path d="M-20 140 L1220 120" className="il-road" />
      <circle cx="600" cy="600" r="210" className="il-ring" />
    </svg>
  );
}

const PinMark = () => (
  <svg className="vr-loc-pin" viewBox="0 0 48 60" aria-hidden="true">
    <path d="M24 58s20-19.6 20-34A20 20 0 0 0 4 24c0 14.4 20 34 20 34Z" className="pin-body" />
    <circle cx="24" cy="23" r="7.5" className="pin-dot" />
  </svg>
);

export default function MapIllustration({ exact, showMarker, notice }: {
  /** A pin for an exact location, a circle for the general area. */
  exact: boolean;
  /** False while the location is still loading or can't be shown. */
  showMarker: boolean;
  /** Text over the drawing ("Live map coming soon", "Loading…"); none when the live map covers it. */
  notice: React.ReactNode | null;
}) {
  const frameRef = useRef<HTMLDivElement | null>(null);
  const [pan, setPan] = useState<Pan>({ scale: 1, x: 0, y: 0 });
  const drag = useRef<{ id: number; x: number; y: number; start: Pan } | null>(null);
  const [dragging, setDragging] = useState(false);

  const update = useCallback((next: (current: Pan) => Pan) => {
    const frame = frameRef.current;
    if (!frame) return;
    setPan((current) => clampPan(next(current), frame.clientWidth, frame.clientHeight));
  }, []);

  const zoomBy = useCallback((delta: number) => update((p) => {
    const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, p.scale + delta));
    const ratio = scale / p.scale;
    return { scale, x: p.x * ratio, y: p.y * ratio };
  }), [update]);

  // Wheel zoom needs a non-passive listener so the page behind does not scroll.
  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return undefined;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      zoomBy(event.deltaY < 0 ? 0.25 : -0.25);
    };
    frame.addEventListener('wheel', onWheel, { passive: false });
    return () => frame.removeEventListener('wheel', onWheel);
  }, [zoomBy]);

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || (event.target as HTMLElement).closest('button')) return;
    drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY, start: pan };
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragging(true);
  };
  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const current = drag.current;
    if (!current || current.id !== event.pointerId) return;
    update(() => ({ scale: current.start.scale, x: current.start.x + event.clientX - current.x, y: current.start.y + event.clientY - current.y }));
  };
  const endDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if (drag.current && drag.current.id === event.pointerId) {
      drag.current = null;
      setDragging(false);
    }
  };

  return (
    <div
      className={`vr-loc-illustration${dragging ? ' is-dragging' : ''}`}
      ref={frameRef}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onDoubleClick={() => zoomBy(STEP)}
    >
      <div className="vr-loc-canvas" style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${pan.scale})`, ['--vr-zoom' as string]: pan.scale } as React.CSSProperties}>
        <CityDrawing />
        {showMarker && (exact
          ? <span className="vr-loc-marker is-exact"><PinMark /></span>
          : <span className="vr-loc-marker is-area"><span className="vr-loc-area" /></span>)}
      </div>
      <div className="vr-loc-zoom" role="group" aria-label="Zoom">
        <button type="button" aria-label="Zoom in" onClick={() => zoomBy(STEP)} disabled={pan.scale >= MAX_SCALE}>+</button>
        <button type="button" aria-label="Zoom out" onClick={() => zoomBy(-STEP)} disabled={pan.scale <= MIN_SCALE}>−</button>
      </div>
      {notice && <div className="vr-loc-notice" role="status">{notice}</div>}
    </div>
  );
}
