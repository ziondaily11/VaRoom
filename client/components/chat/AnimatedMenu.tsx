import React, { useEffect, useState } from 'react';

// A small menu that grows out of its trigger and shrinks back into it:
// opens in 200 ms, closes in 150 ms, its rows arriving 30 ms apart. Rows
// carry the class `vr-menu-item` and their position as `--i`. Used by Chat
// Settings (email timing) and the composer (quick replies).

export const MENU_OPEN_MS = 200;
export const MENU_CLOSE_MS = 150;
export const MENU_STAGGER_MS = 30;

/** Mounted while open and through the closing animation. */
export function useMenuPresence(open: boolean): { mounted: boolean; closing: boolean } {
  const [mounted, setMounted] = useState(open);
  useEffect(() => {
    if (open) {
      setMounted(true);
      return undefined;
    }
    const timer = window.setTimeout(() => setMounted(false), MENU_CLOSE_MS);
    return () => window.clearTimeout(timer);
  }, [open]);
  return { mounted: open || mounted, closing: !open && mounted };
}

export const MENU_STYLES = `
.vr-menu { position:absolute; z-index:40; animation:vr-menu-in ${MENU_OPEN_MS}ms cubic-bezier(.2,.9,.3,1) both; }
.vr-menu--below-end { top:calc(100% + 6px); right:0; transform-origin:top right; --vr-from:-6px; }
.vr-menu--above-start { bottom:calc(100% + 8px); left:0; transform-origin:bottom left; --vr-from:6px; }
.vr-menu.is-closing { animation:vr-menu-out ${MENU_CLOSE_MS}ms cubic-bezier(.4,0,1,1) both; pointer-events:none; }
.vr-menu-item { animation:vr-menu-item-in 180ms ease-out both; animation-delay:calc(var(--i, 0) * ${MENU_STAGGER_MS}ms); }
.vr-menu.is-closing .vr-menu-item { animation:none; }
@keyframes vr-menu-in { from { opacity:0; transform:translateY(var(--vr-from)) scale(.9); } to { opacity:1; transform:none; } }
@keyframes vr-menu-out { from { opacity:1; transform:none; } to { opacity:0; transform:translateY(var(--vr-from)) scale(.9); } }
@keyframes vr-menu-item-in { from { opacity:0; transform:translateY(var(--vr-from)); } to { opacity:1; transform:none; } }
@media (prefers-reduced-motion: reduce) { .vr-menu, .vr-menu.is-closing, .vr-menu-item { animation-duration:1ms; animation-delay:0ms; } }
`;

/** The menu panel. `placement` is where it opens from its trigger: below and right-aligned, or above and left-aligned. */
export default function AnimatedMenu({ open, placement, className = '', children, ...rest }: {
  open: boolean;
  placement: 'below-end' | 'above-start';
} & React.HTMLAttributes<HTMLDivElement>) {
  const { mounted, closing } = useMenuPresence(open);
  if (!mounted) return null;
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: MENU_STYLES }} />
      <div className={`vr-menu vr-menu--${placement}${closing ? ' is-closing' : ''} ${className}`} {...rest}>{children}</div>
    </>
  );
}

/** A row's place in the stagger. */
export const menuItemStyle = (index: number): React.CSSProperties => ({ '--i': index } as React.CSSProperties);
