import React, { useRef } from 'react';
import { useSegmentIndicator } from '../../lib/motion/useSegmentIndicator';

// The calendar's segmented controls (the view switch, the settings tabs): one
// dark pill slides to the selected option (animation.md §8.1, B9) instead of
// two backgrounds swapping. Options are role="tab" buttons with aria-selected.

export default function ToggleRow({ label, activeKey, className = '', children }: { label: string; activeKey: string; className?: string; children: React.ReactNode }) {
  const row = useRef<HTMLDivElement>(null);
  const { style, ready } = useSegmentIndicator(row, activeKey);
  return (
    <div ref={row} className={`vc-toggle${ready ? ' is-ready' : ''}${className ? ` ${className}` : ''}`} role="tablist" aria-label={label}>
      <span className="vc-toggle-pill" aria-hidden="true" style={style} />
      {children}
    </div>
  );
}
