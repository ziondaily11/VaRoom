import React from 'react';
import Link from 'next/link';
import ElieIcon from '../ElieIcon';

// The listing wizard's own icon sidebar and top bar (unchanged from
// legacy-pages/list.html). Links to /host-home go through `onLeave`, which
// asks the host to save or discard the listing first.

type LeaveHandler = (event: React.MouseEvent<HTMLAnchorElement>, href: string) => void;

const ICON = { width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true };

const NAV: Array<{ href: string; label: string; icon: React.ReactNode }> = [
  { href: '/host-home', label: 'Home', icon: <svg {...ICON}><path d="M3 11.5 12 4l9 7.5" /><path d="M5.5 10v9a1 1 0 0 0 1 1H9v-4a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v4h2.5a1 1 0 0 0 1-1v-9" /></svg> },
  { href: '/marketplace', label: 'Marketplace', icon: <svg {...ICON}><circle cx="12" cy="12" r="9" /><path d="m15 9-2 6-6 2 2-6 6-2Z" /></svg> },
  { href: '/host-home', label: 'Saved', icon: <svg {...ICON}><path d="M6 3.5h12a1 1 0 0 1 1 1V21l-7-4-7 4V4.5a1 1 0 0 1 1-1Z" /></svg> },
  { href: '/bookings', label: 'Bookings', icon: <svg {...ICON}><rect x="3.5" y="5" width="17" height="16" rx="2" /><path d="M8 3v4M16 3v4M3.5 10h17" /></svg> },
  { href: '/chats', label: 'Chats', icon: <svg {...ICON}><path d="M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.4 8.4 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5Z" /></svg> },
  { href: '/notifications', label: 'Notifications', icon: <svg {...ICON}><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" /></svg> },
  { href: '/list', label: 'List a space', icon: <svg {...ICON}><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg> },
  { href: '/host-home', label: 'My Listings', icon: <svg {...ICON}><rect x="3.5" y="4" width="17" height="16" rx="2" /><path d="M7.5 9h9M7.5 13h9M7.5 17h5" /></svg> },
  { href: '/analytics', label: 'Analytics', icon: <svg {...ICON}><path d="M4 19V10M11 19V5M18 19v-7" /><path d="M3 19h18" /></svg> },
  { href: '/profile', label: 'Profile', icon: <svg {...ICON}><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 3.5-7 8-7s8 3 8 7" /></svg> },
  { href: '/settings', label: 'Settings', icon: <svg {...ICON}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" /></svg> },
  { href: '/support', label: 'Help and Support', icon: <svg {...ICON}><circle cx="12" cy="12" r="9" /><path d="M9.5 9a2.5 2.5 0 0 1 4.9.8c0 1.6-2.4 1.9-2.4 3.5" /><path d="M12 17.2v.1" /></svg> },
  { href: '/pricing', label: 'Upgrade', icon: <svg {...ICON}><path d="m12 3 1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9L12 3Z" /><path d="m19 16 .7 1.8L21.5 18l-1.8.7L19 20.5l-.7-1.8-1.8-.7L19 16Z" /></svg> },
];

function NavLink({ href, className, label, title, onLeave, children }: { href: string; className: string; label?: string; title?: string; onLeave: LeaveHandler; children: React.ReactNode }) {
  const leaves = href === '/host-home';
  return (
    <Link href={href} className={className} aria-label={label} title={title} onClick={leaves ? (event) => onLeave(event, href) : undefined}>
      {children}
    </Link>
  );
}

export function WizardSidebar({ onLeave }: { onLeave: LeaveHandler }) {
  return (
    <aside className="wizard-sidebar" aria-label="Listing navigation">
      <nav className="sidebar-host-nav" aria-label="VaRoom navigation">
        <NavLink href="/chats?conversation=elie" className="sidebar-nav-icon" label="Elie" title="Elie" onLeave={onLeave}>
          <span className="elie-logo-nav" aria-label="Elie"><ElieIcon size={22} className="elie-icon" aria-label="Elie" /></span>
        </NavLink>
        {NAV.map((item) => (
          <NavLink key={item.label} href={item.href} className="sidebar-nav-icon" label={item.label} title={item.label} onLeave={onLeave}>{item.icon}</NavLink>
        ))}
      </nav>
    </aside>
  );
}

export function WizardTopNav({ onLeave }: { onLeave: LeaveHandler }) {
  return (
    <nav className="wizard-top-nav">
      <NavLink href="/host-home" className="logo" onLeave={onLeave}><span className="va">Va</span><span className="room">Room</span></NavLink>
      <NavLink href="/host-home" className="back-link" onLeave={onLeave}>← Back to VaRoom</NavLink>
    </nav>
  );
}
