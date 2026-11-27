import { useEffect, useRef, useState, type RefObject } from 'react';
import { exitMs, STAGGER_MAX_ITEMS, STAGGER_MS } from '../../lib/motion/tokens';
import { prefersReducedMotion } from '../../lib/motion/reducedMotion';

// The Chats right column (information panel, Chat Settings) opens out of the
// button that opened it and closes back towards it: 220 ms ease-out in, rows
// 30 ms apart; out 20% shorter, ease-in. The panel stays in place while it
// closes, then the layout changes. Reduced motion: no animation.

export const PANEL_OPEN_MS = 220;
export const PANEL_CLOSE_MS = exitMs(PANEL_OPEN_MS);
export type PanelPhase = 'idle' | 'opening' | 'closing';

export function usePanelMotion(panelRef: RefObject<HTMLElement | null>) {
  const [phase, setPhase] = useState<PanelPhase>('idle');
  const timerRef = useRef<number | null>(null);
  const triggerRef = useRef<Element | null>(null);
  useEffect(() => () => { if (timerRef.current) window.clearTimeout(timerRef.current); }, []);

  // The trigger's centre, from the panel's right edge (fixed while its width changes).
  const aimAt = (trigger: Element | null) => {
    const panel = panelRef.current;
    if (!panel || !trigger) return;
    const t = trigger.getBoundingClientRect();
    const p = panel.getBoundingClientRect();
    panel.style.setProperty('--panel-origin-x', `${Math.round(t.left + t.width / 2 - p.right)}px`);
    panel.style.setProperty('--panel-origin-y', `${Math.round(t.top + t.height / 2 - p.top)}px`);
  };
  const after = (ms: number, then: () => void) => {
    if (timerRef.current) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(then, ms);
  };

  /** Shows the panel (`apply` changes the layout), growing out of `trigger`. */
  const open = (trigger: Element | null, apply: () => void) => {
    apply();
    if (prefersReducedMotion()) return;
    triggerRef.current = trigger || triggerRef.current;
    aimAt(triggerRef.current);
    setPhase('opening');
    after(PANEL_OPEN_MS + (STAGGER_MAX_ITEMS - 1) * STAGGER_MS, () => setPhase('idle'));
  };

  /** Hides the panel towards `trigger` (or the one that opened it), then applies the layout change; `reopen` plays the entrance for what replaces it. */
  const close = (trigger: Element | null, apply: () => void, reopen = false) => {
    if (prefersReducedMotion()) { apply(); return; }
    aimAt(trigger || triggerRef.current);
    setPhase('closing');
    after(PANEL_CLOSE_MS, () => {
      apply();
      setPhase(reopen ? 'opening' : 'idle');
      if (reopen) after(PANEL_OPEN_MS + (STAGGER_MAX_ITEMS - 1) * STAGGER_MS, () => setPhase('idle'));
    });
  };

  return { phase, open, close };
}
