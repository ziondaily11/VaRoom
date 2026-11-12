import React from 'react';
import AnimatedMenu, { menuItemStyle } from './AnimatedMenu';
import type { QuickReply } from '../../lib/chat/quickReplies';

// The composer's quick replies: opened by typing "/" at the start of a
// message (filtered by what follows) or by the composer's button; grows out
// of the composer. ↑ ↓ Enter pick, Escape closes (handled by the composer).

export default function QuickReplyPicker({ open, items, hasAny, activeIndex, onPick, onHover, onManage }: {
  open: boolean;
  items: QuickReply[];
  /** The person has saved any quick replies (else the empty state invites them to). */
  hasAny: boolean;
  activeIndex: number;
  onPick: (reply: QuickReply) => void;
  onHover: (index: number) => void;
  onManage: () => void;
}) {
  return (
    <AnimatedMenu open={open} placement="above-start" className="qr-picker" role="listbox" aria-label="Quick replies">
      {items.length ? items.map((reply, index) => (
        <button
          key={reply.id}
          type="button"
          role="option"
          aria-selected={index === activeIndex}
          className="qr-item vr-menu-item"
          style={menuItemStyle(index)}
          // Keep the composer focused, so typing carries on after picking.
          onMouseDown={(event) => event.preventDefault()}
          onMouseEnter={() => onHover(index)}
          onClick={() => onPick(reply)}
        >
          <strong>{reply.title}</strong>
          <small>{reply.body}</small>
        </button>
      )) : (
        <div className="qr-empty vr-menu-item" style={menuItemStyle(0)}>
          <span>{hasAny ? 'No quick replies match.' : 'No quick replies yet.'}</span>
          <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={onManage}>
            {hasAny ? 'Manage quick replies' : 'Add them in Chat Settings'}
          </button>
        </div>
      )}
    </AnimatedMenu>
  );
}
