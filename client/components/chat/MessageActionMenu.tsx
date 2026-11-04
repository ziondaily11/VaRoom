import React, { useEffect, useLayoutEffect, useRef } from 'react';
import type { MessageAction, MessageActionItem } from '../../lib/chat/messageActions';

// The per-message action menu (ported from public/js/chat-data.js
// openMessageMenu): same `.chat-message-menu` markup and styles, opened at the
// pointer and kept inside the viewport, closed on outside press or Escape.
// The inbox uses it too, with its own actions (archive, delete chat).

export { messageActionItems } from '../../lib/chat/messageActions';
export type { MessageAction, MessageActionItem };

export interface MenuItem<A extends string> {
  action: A;
  icon: string;
  label: string;
}

export default function MessageActionMenu<A extends string = MessageAction>({ x, y, items, onSelect, onClose, label = 'Message actions' }: {
  x: number;
  y: number;
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
    menu.style.left = `${Math.max(8, Math.min(x, window.innerWidth - bounds.width - 8))}px`;
    menu.style.top = `${Math.max(8, Math.min(y, window.innerHeight - bounds.height - 8))}px`;
    menu.querySelector('button')?.focus();
  }, [x, y]);

  useEffect(() => {
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
  }, [onClose]);

  return (
    <div ref={menuRef} className="chat-message-menu" role="menu" aria-label={label} style={{ left: x, top: y }}>
      {items.map((item) => (
        <button key={item.action} type="button" role="menuitem" onClick={() => onSelect(item.action)}>
          <svg className="icon" aria-hidden="true"><use href={`#${item.icon}`} /></svg>
          <span>{item.label}</span>
        </button>
      ))}
    </div>
  );
}
