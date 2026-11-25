import React, { useEffect, useId, useRef } from 'react';
import { usePresence } from '../../lib/motion/usePresence';
import { DURATION, exitMs } from '../../lib/motion/tokens';

// "Are you sure?" for a step that can't be undone on Bookings: a host
// declining a request, a guest cancelling a booking (the list, the rail and
// the phone details page). Replaces window.confirm with the app's own dialog.
//
// Motion (animation.md §8.3): the scrim fades; the card grows from .95 on
// wider screens and rises as a bottom sheet on phones; exits are about 20%
// shorter. Focus starts on the safe choice and returns to the button that
// opened it. Reduced motion: near-instant.

const EXIT_MS = exitMs(DURATION.standard);

export const CONFIRM_SHEET_STYLES = `
.cfs{
  --cfs-bg:var(--va-light); --cfs-ink:#1d1d1f; --cfs-muted:#6e6e73; --cfs-fill:rgba(118,118,128,.12); --cfs-danger:#c41e3a;
  position:fixed; inset:0; z-index:1300; display:flex; align-items:center; justify-content:center; padding:20px;
  background:rgba(0,0,0,.4); backdrop-filter:blur(12px) saturate(140%); -webkit-backdrop-filter:blur(12px) saturate(140%);
  font-family:-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  animation:cfs-fade-in var(--motion-quick,200ms) var(--ease-out,ease) both;
}
html[data-theme="dark"] .cfs{ --cfs-bg:#1c1c1e; --cfs-ink:#f5f5f7; --cfs-muted:#a1a1a6; --cfs-fill:rgba(118,118,128,.24); --cfs-danger:#ff7186; }
.cfs.is-closing{ animation:cfs-fade-out var(--motion-micro,150ms) var(--ease-in,ease) both; pointer-events:none; }
.cfs-card{
  width:min(380px,100%); padding:22px 20px 18px; border-radius:22px; background:var(--cfs-bg); color:var(--cfs-ink);
  box-shadow:0 24px 60px rgba(0,0,0,.25); text-align:center;
  animation:cfs-pop-in var(--motion-standard,250ms) var(--ease-out,ease) both;
}
.cfs.is-closing .cfs-card{ animation:cfs-pop-out var(--motion-quick,200ms) var(--ease-in,ease) both; }
.cfs-card h2{ margin:0; font-size:1.06rem; font-weight:700; letter-spacing:-.01em; line-height:1.3; }
.cfs-card p{ margin:8px 0 0; color:var(--cfs-muted); font-size:.875rem; line-height:1.45; }
.cfs-actions{ display:flex; gap:10px; margin-top:20px; }
.cfs-actions button{
  flex:1; height:44px; padding:0 16px; border:0; border-radius:999px; font:inherit; font-size:.9rem; font-weight:600; cursor:pointer;
  transition:background-color var(--motion-micro,150ms) var(--ease-out,ease), transform var(--motion-press,120ms) var(--ease-out,ease), opacity var(--motion-micro,150ms) var(--ease-out,ease);
}
.cfs-keep{ background:var(--cfs-fill); color:var(--cfs-ink); }
.cfs-confirm{ background:var(--cfs-ink); color:var(--cfs-bg); }
.cfs-confirm.is-destructive{ background:var(--cfs-danger); color:#fff; }
.cfs-actions button:disabled{ opacity:.55; cursor:default; }
.cfs-actions button:not(:disabled):active{ transform:scale(var(--press-scale,.97)); }
.cfs-actions button:focus-visible{ outline:2px solid var(--cfs-danger); outline-offset:2px; }
@keyframes cfs-fade-in{ from{ opacity:0; } to{ opacity:1; } }
@keyframes cfs-fade-out{ from{ opacity:1; } to{ opacity:0; } }
@keyframes cfs-pop-in{ from{ opacity:0; transform:scale(.95); } to{ opacity:1; transform:none; } }
@keyframes cfs-pop-out{ from{ opacity:1; transform:none; } to{ opacity:0; transform:scale(.95); } }
@keyframes cfs-sheet-in{ from{ transform:translateY(100%); } to{ transform:none; } }
@keyframes cfs-sheet-out{ from{ transform:none; } to{ transform:translateY(100%); } }
@media (max-width:640px){
  .cfs{ align-items:flex-end; padding:0; }
  .cfs-card{ width:100%; border-radius:22px 22px 0 0; padding-bottom:calc(18px + env(safe-area-inset-bottom)); animation-name:cfs-sheet-in; }
  .cfs.is-closing .cfs-card{ animation-name:cfs-sheet-out; }
}
@media (prefers-reduced-motion:reduce){
  .cfs, .cfs.is-closing, .cfs-card, .cfs.is-closing .cfs-card{ animation-duration:1ms; }
  .cfs-actions button{ transition:none; }
  .cfs-actions button:not(:disabled):active{ transform:none; }
}
`;

export default function ConfirmSheet({ open, title, message, confirmLabel, cancelLabel = 'Keep', destructive = true, busy = false, onConfirm, onClose }: {
  open: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel?: string;
  destructive?: boolean;
  /** The confirmed step is running: both buttons wait. */
  busy?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const { mounted, closing } = usePresence(open, EXIT_MS);
  const titleId = useId();
  const keepRef = useRef<HTMLButtonElement | null>(null);
  const back = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return undefined;
    back.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const timer = window.setTimeout(() => keepRef.current?.focus(), 0);
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape' && !busy) onClose(); };
    document.addEventListener('keydown', onKey);
    return () => { window.clearTimeout(timer); document.removeEventListener('keydown', onKey); back.current?.focus(); };
  }, [open, busy, onClose]);

  if (!mounted) return null;
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: CONFIRM_SHEET_STYLES }} />
      <div className={`cfs${closing ? ' is-closing' : ''}`} onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}>
        <div className="cfs-card" role="alertdialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={`${titleId}-text`}>
          <h2 id={titleId}>{title}</h2>
          <p id={`${titleId}-text`}>{message}</p>
          <div className="cfs-actions">
            <button type="button" className="cfs-keep" ref={keepRef} disabled={busy} onClick={onClose}>{cancelLabel}</button>
            <button type="button" className={`cfs-confirm${destructive ? ' is-destructive' : ''}`} disabled={busy} aria-busy={busy} onClick={onConfirm}>
              {busy ? 'Please wait…' : confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
