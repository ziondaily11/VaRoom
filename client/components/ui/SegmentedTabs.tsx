import React, { useRef } from 'react';
import { useSegmentIndicator } from '../../lib/motion/useSegmentIndicator';

// The profile pages' tab row: an Apple segmented control (a raised pill in a
// soft track) that scrolls sideways when it is wider than the screen. Its
// children are the tab buttons (role="tab", aria-selected); the pill slides
// to the selected one (animation.md §8.1). Shared by /profile and the
// host's public profile.

export const SEGMENTED_TABS_STYLES = `
.vr-seg{
  --seg-fill:rgba(118,118,128,.12); --seg-selected:var(--va-light); --seg-ink:#1d1d1f; --seg-muted:#6e6e73; --seg-accent:#e5384f;
  position:relative; display:flex; align-items:center; gap:2px; min-width:0; max-width:100%; padding:3px; border-radius:999px;
  background:var(--seg-fill); overflow-x:auto; overscroll-behavior-x:contain; scrollbar-width:none; white-space:nowrap; box-sizing:border-box;
}
html[data-theme="dark"] .vr-seg{ --seg-fill:rgba(118,118,128,.24); --seg-selected:#3a3a3c; --seg-ink:#f5f5f7; --seg-muted:#a1a1a6; }
.vr-seg::-webkit-scrollbar{ display:none; }
.vr-seg-pill{
  position:absolute; top:0; left:0; z-index:0; border-radius:999px; background:var(--seg-selected); pointer-events:none;
  box-shadow:0 1px 3px rgba(0,0,0,.12), 0 1px 1px rgba(0,0,0,.04);
}
.vr-seg.is-ready .vr-seg-pill{ transition:transform var(--motion-quick) var(--ease-in-out), width var(--motion-quick) var(--ease-in-out); }
.vr-seg > button{
  position:relative; z-index:1; flex:0 0 auto; display:inline-flex; align-items:center; gap:6px; margin:0; padding:7px 14px; border:0; border-radius:999px;
  background:transparent; color:var(--seg-muted); font:inherit; font-size:.8125rem; font-weight:600; line-height:1.2; cursor:pointer;
  transition:color var(--motion-micro) var(--ease-out), transform var(--motion-press) var(--ease-out);
}
.vr-seg:not(.is-ready) > button[aria-selected="true"]{ background:var(--seg-selected); }
.vr-seg > button[aria-selected="true"]{ color:var(--seg-ink); }
.vr-seg > button:active{ transform:scale(var(--press-scale)); }
.vr-seg > button:focus-visible{ outline:2px solid var(--seg-accent); outline-offset:-2px; }
.vr-seg-count{ font-size:.6875rem; opacity:.65; font-variant-numeric:tabular-nums; }
@media (hover:hover){ .vr-seg > button:hover{ color:var(--seg-ink); } }
@media (prefers-reduced-motion:reduce){
  .vr-seg.is-ready .vr-seg-pill, .vr-seg > button{ transition:none; }
  .vr-seg > button:active{ transform:none; }
}
`;

export default function SegmentedTabs({ label, activeKey, id, children }: {
  /** The tab list's accessible name. */
  label: string;
  /** Changes whenever the selected tab changes (moves the pill). */
  activeKey: string;
  id?: string;
  children: React.ReactNode;
}) {
  const row = useRef<HTMLDivElement>(null);
  const { style, ready } = useSegmentIndicator(row, activeKey);
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: SEGMENTED_TABS_STYLES }} />
      <div className={`vr-seg${ready ? ' is-ready' : ''}`} id={id} role="tablist" aria-label={label} ref={row}>
        <span className="vr-seg-pill" aria-hidden="true" style={style} />
        {children}
      </div>
    </>
  );
}
