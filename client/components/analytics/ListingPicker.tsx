import { useEffect, useRef, useState } from 'react';
import type { CSSProperties, KeyboardEvent } from 'react';
import type { ListingOption } from '../../lib/analytics/types';

// The listing filter: a dropdown that grows out of its trigger (200ms),
// staggers its rows in by 30ms, and shrinks back into the trigger (150ms).
// Unmounts once the exit animation ends.

type Phase = 'closed' | 'open' | 'closing';
const ROW_STAGGER_MS = 30;
const MAX_STAGGERED_ROWS = 8;

export default function ListingPicker({ options, value, onChange }: {
  options: ListingOption[]; value: string | null; onChange: (id: string | null) => void;
}) {
  const [phase, setPhase] = useState<Phase>('closed');
  const [originX, setOriginX] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const rows = [{ id: '', title: 'All listings' }, ...options];
  const current = rows.find((r) => r.id === (value || '')) || rows[0];

  const open = () => {
    setOriginX((triggerRef.current?.offsetWidth ?? 0) / 2);
    setPhase('open');
  };
  const close = (refocus = true) => {
    setPhase((p) => (p === 'open' ? 'closing' : p));
    if (refocus) triggerRef.current?.focus();
  };
  const choose = (id: string) => {
    onChange(id || null);
    close();
  };

  // Focus the selected row on open; close on an outside click.
  useEffect(() => {
    if (phase !== 'open') return undefined;
    listRef.current?.querySelector<HTMLElement>('[aria-selected="true"]')?.focus();
    const onDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) close(false);
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [phase]);

  const onListKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const items = Array.from(listRef.current?.querySelectorAll<HTMLElement>('[role="option"]') || []);
    const i = items.indexOf(document.activeElement as HTMLElement);
    const move = { ArrowDown: i + 1, ArrowUp: i - 1, Home: 0, End: items.length - 1 }[e.key];
    if (move !== undefined) {
      e.preventDefault();
      items[Math.max(0, Math.min(items.length - 1, move))]?.focus();
    } else if (e.key === 'Escape' || e.key === 'Tab') {
      if (e.key === 'Escape') e.preventDefault();
      close(e.key === 'Escape');
    }
  };

  return (
    <div className="va-picker" ref={rootRef}>
      <button
        ref={triggerRef} type="button" className="va-select" aria-haspopup="listbox" aria-expanded={phase === 'open'}
        aria-label={`Listing: ${current.title}`}
        onClick={() => (phase === 'open' ? close() : open())}
        onKeyDown={(e) => { if (e.key === 'ArrowDown' && phase !== 'open') { e.preventDefault(); open(); } }}
      >
        {current.title}
      </button>
      {phase !== 'closed' && (
        <div
          ref={listRef} role="listbox" aria-label="Listing" className="va-menu" data-state={phase}
          style={{ '--origin-x': `${originX}px` } as CSSProperties}
          onKeyDown={onListKey}
          onAnimationEnd={(e) => { if (e.target === e.currentTarget && phase === 'closing') setPhase('closed'); }}
        >
          {rows.map((row, i) => (
            <button
              key={row.id || 'all'} type="button" role="option" aria-selected={row.id === current.id} tabIndex={-1}
              style={{ animationDelay: `${Math.min(i, MAX_STAGGERED_ROWS) * ROW_STAGGER_MS}ms` }}
              onClick={() => choose(row.id)}
            >
              {row.title}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
