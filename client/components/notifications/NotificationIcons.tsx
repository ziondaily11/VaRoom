import React from 'react';
import type { NotificationDetails } from '../../lib/notificationsCache';

// The Notifications page icons. Each notification kind has its own picture:
// a check for an approved booking, a cross for a declined or cancelled one, a
// calendar for a request, a speech bubble for a message, a star for a review,
// people for a team invitation and a bell for anything else.

function Svg({ children, className = 'icon', viewBox = '0 0 24 24', strokeWidth = 1.8 }: {
  children: React.ReactNode;
  className?: string;
  viewBox?: string;
  strokeWidth?: number;
}) {
  return (
    <svg className={className} viewBox={viewBox} fill="none" stroke="currentColor" strokeWidth={strokeWidth}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  );
}

const KIND_PATHS: Record<NotificationDetails['iconKind'], React.ReactNode> = {
  approved: <path d="m5 12 4 4L19 6" />,
  declined: <path d="m6 6 12 12M18 6 6 18" />,
  request: (<><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></>),
  message: <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20.5l1.4-4.6A8 8 0 1 1 21 12Z" />,
  review: <path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9L12 3Z" />,
  team: (<><circle cx="9" cy="8" r="3.2" /><path d="M3 20a6 6 0 0 1 12 0" /><path d="M16 4.6a3.2 3.2 0 0 1 0 6.3M21 20a6 6 0 0 0-3.6-5.5" /></>),
  update: (<><path d="M6 9a6 6 0 0 1 12 0c0 6 2.5 7.5 2.5 7.5h-17S6 15 6 9Z" /><path d="M10 20a2 2 0 0 0 4 0" /></>),
};

export function NotificationKindIcon({ kind }: { kind: NotificationDetails['iconKind'] }) {
  return <Svg>{KIND_PATHS[kind]}</Svg>;
}

export const MenuIcon = () => <Svg strokeWidth={2}><path d="M4 6h16M4 12h16M4 18h16" /></Svg>;

export const SearchIcon = () => <Svg className="icon-sm" strokeWidth={2}><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></Svg>;

export const ClearIcon = () => <Svg className="icon-sm" strokeWidth={2.2}><path d="m7 7 10 10M17 7 7 17" /></Svg>;

export const ChevronIcon = () => <Svg className="icon-sm notif-chevron" strokeWidth={2}><path d="m9 6 6 6-6 6" /></Svg>;

export const SettingsIcon = () => (
  <Svg>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.6-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.6V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V9a1.7 1.7 0 0 0 1.6 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.6 1Z" />
  </Svg>
);

/**
 * The mark-all button's tick. When everything is read it becomes a double
 * tick, which draws itself in when `animate` is set (right after the click).
 */
export function MarkAllIcon({ done, animate }: { done: boolean; animate: boolean }) {
  if (done) {
    return (
      <Svg key="done" className={`icon${animate ? ' mark-all-done' : ''}`} viewBox="0 0 32 24" strokeWidth={2.2}>
        <path pathLength={1} d="m3 12 4 4 8-9" />
        <path pathLength={1} d="m14 12 4 4 8-9" />
      </Svg>
    );
  }
  return <Svg key="todo" className="icon" viewBox="0 0 28 24" strokeWidth={2.2}><path d="m4 12 4 4 8-9" /></Svg>;
}

export const AlertIcon = () => <Svg><circle cx="12" cy="12" r="9" /><path d="M12 7.5v5M12 16.2v.3" /></Svg>;
