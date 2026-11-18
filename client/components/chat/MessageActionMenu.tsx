import React, { useEffect, useLayoutEffect, useRef } from 'react';
import type { MessageAction, MessageActionItem } from '../../lib/chat/messageActions';

// The per-message action menu (ported from public/js/chat-data.js
// openMessageMenu): same `.chat-message-menu` markup and styles, opened at the
// pointer and kept inside the viewport, closed on outside press or Escape.
// The inbox uses it too, with its own actions (archive, delete chat).
// Motion (animation.md §8.2): grows from the pointer at .95 in 200 ms and
// shrinks back in 150 ms (`closing`, kept mounted by usePresentValue).

/** How long the closing animation runs (chats.css .chat-message-menu.is-closing). */
export const MESSAGE_MENU_EXIT_MS = 150;

export { messageActionItems } from '../../lib/chat/messageActions';
export type { MessageAction, MessageActionItem };

export interface MenuItem<A extends string> {
  action: A;
  icon: string;
  label: string;
}

export default function MessageActionMenu<A extends string = MessageAction>({ x, y, items, onSelect, onClose, label = 'Message actions', closing = false }: {
  x: number;
  y: number;
  /** Playing its exit: ignores input. */
  closing?: boolean;
  items: MenuItem<A>[];
  onSelect: (action: A) => void;
  onClose: () => void;
  label?: string;
}) {
  const menuRef = useRef<HTMLDivElement | null>(null);

  // Place at the pointer, clamped 8px inside the viewport, before paint.
  useLayoutEffect(() => {
    const menu = menuRef.current;
    if (!menu) return;
    const bounds = menu.getBoundingClientRect();
    const left = Math.max(8, Math.min(x, window.innerWidth - bounds.width - 8));
    const top = Math.max(8, Math.min(y, window.innerHeight - bounds.height - 8));
    menu.style.left = `${left}px`;
    menu.style.top = `${top}px`;
    // It grows from the corner nearest the pointer.
    menu.style.transformOrigin = `${left < x ? 'right' : 'left'} ${top < y ? 'bottom' : 'top'}`;
    menu.querySelector('button')?.focus();
  }, [x, y]);

  useEffect(() => {
    if (closing) return undefined;
    const onPointerDown = (event: PointerEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) onClose();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [onClose, closing]);

  return (
    <div ref={menuRef} className={`chat-message-menu${closing ? ' is-closing' : ''}`} role="menu" aria-label={label} aria-hidden={closing || undefined} style={{ left: x, top: y }}>
      {items.map((item, index) => (
        <button key={item.action} type="button" role="menuitem" tabIndex={closing ? -1 : undefined} style={{ '--i': index } as React.CSSProperties} onClick={() => onSelect(item.action)}>
          <svg className="icon" aria-hidden="true"><use href={`#${item.icon}`} /></svg>
          <span>{item.label}</span>
        </button>
      ))}
    </div>
  );
}
