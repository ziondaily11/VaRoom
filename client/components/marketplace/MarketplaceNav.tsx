import React from 'react';
import Link from 'next/link';

// Marketplace's own icon sidebar (laptops and desktops) and bottom bar
// (phones, when the app's mobile navigation is not shown), unchanged from
// legacy-pages/marketplace.html, with client-side links.

export function RoleSidebarLinks({ role }: { role: 'client' | 'host' }) {
  if (role === 'host') {
    return (
      <div className="role-sidebar" data-role-sidebar="host">
      <nav>
        <Link href="/host-home" className="sidebar-icon-link" data-tooltip="Home" aria-label="Home">
          <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 11.5 12 4l9 7.5" /><path d="M5.5 10v9a1 1 0 0 1 1 1H9v-4a1 1 0 0 1 1-1h2a2 2 0 0 1 1 1v4h2.5a1 1 0 0 1 1-1v-9" /></svg>
        </Link>
        <Link href="/marketplace" className="sidebar-icon-link active" data-tooltip="Marketplace" aria-label="Marketplace">
          <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="m15 9-2 6-6 2 2-6 6-2Z" /></svg>
        </Link>
        <Link href="/host-home?view=saved" className="sidebar-icon-link" data-tooltip="Saved" aria-label="Saved">
          <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 3.5h12a1 1 0 0 1 1 1V21l-7-4-7 4V4.5a1 1 0 0 1 1-1Z" /></svg>
        </Link>
      </nav>
      <div className="sidebar-icon-divider"></div>
      <nav>
        <Link href="/bookings" className="sidebar-icon-link" data-tooltip="Bookings" aria-label="Bookings">
          <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3.5" y="5" width="17" height="16" rx="2" /><path d="M8 3v4M16 3v4M3.5 10h17" /></svg>
        </Link>
        <Link href="/chats" className="sidebar-icon-link" data-tooltip="Chats" aria-label="Chats">
          <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7A8.4 8.4 0 0 1 4 11.5a8.5 8.5 0 0 1 4.7-7.6A8.4 8.4 0 0 1 12.5 3h.5a8.48 8.48 0 0 1 8 8v.5Z" /></svg>
        </Link>
        <Link href="/notifications" className="sidebar-icon-link" data-tooltip="Notifications" aria-label="Notifications">
          <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" /></svg>
        </Link>
      </nav>
      <div className="sidebar-icon-divider"></div>
      <nav>
        <Link href="/list" className="sidebar-icon-link" data-tooltip="List a Space" aria-label="List a Space">
          <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
        </Link>
        <Link href="/host-home?view=my-listings" className="sidebar-icon-link" data-tooltip="My Listings" aria-label="My Listings">
          <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3.5" y="4" width="17" height="16" rx="2" /><path d="M7.5 9h9M7.5 13h9M7.5 17h5" /></svg>
        </Link>
        <Link href="/analytics" className="sidebar-icon-link" data-tooltip="Analytics" aria-label="Analytics">
          <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19V10M11 19V5M18 19v-7" /><path d="M3 19h18" /></svg>
        </Link>
      </nav>
      <div className="sidebar-icon-divider"></div>
      <nav>
        <Link href="/profile" className="sidebar-icon-link" data-tooltip="Profile" aria-label="Profile">
          <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 3.5-7 8-7s8 3 8 7" /></svg>
        </Link>
        <Link href="/settings" className="sidebar-icon-link" data-tooltip="Settings" aria-label="Settings">
          <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 1 .9-.3H9a1.7 1.7 0 0 1 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 1 1 1.5 1.7 1.7 0 0 1 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 1-.3 1.9V9a1.7 1.7 0 0 1 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 1-1.5 1Z" /></svg>
        </Link>
        <Link href="/support" className="sidebar-icon-link" data-tooltip="Help & Support" aria-label="Help & Support">
          <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M9.5 9a2.5 2.5 0 0 1 4.9.8c0 1.6-2.4 1.9-2.4 3.5" /><path d="M12 17.2v.1" /></svg>
        </Link>
        <Link href="/pricing" className="sidebar-icon-link" data-tooltip="Upgrade" aria-label="Upgrade">
          <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m12 3 1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9L12 3Z" /><path d="m19 16 .7 1.8L21.5 18l-1.8.7L19 20.5l-.7-1.8-1.8-.7L19 16Z" /></svg>
        </Link>
      </nav>
    </div>
    );
  }
  return (
    <div className="role-sidebar" data-role-sidebar="client">
      <nav>
        <Link href="/client-home" className="sidebar-icon-link" data-tooltip="Home" aria-label="Home">
          <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 11.5 12 4l9 7.5" /><path d="M5.5 10v9a1 1 0 0 1 1 1H9v-4a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v4h2.5a1 1 0 0 1 1-1v-9" /></svg>
        </Link>
        <Link href="/marketplace" className="sidebar-icon-link active" data-tooltip="Marketplace" aria-label="Marketplace">
          <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="m15 9-2 6-6 2 2-6 6-2Z" /></svg>
        </Link>
        <Link href="/client-home?view=saved" className="sidebar-icon-link" data-tooltip="Saved" aria-label="Saved">
          <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 3.5h12a1 1 0 0 1 1 1V21l-7-4-7 4V4.5a1 1 0 0 1 1-1Z" /></svg>
        </Link>
      </nav>
      <div className="sidebar-icon-divider"></div>
      <nav>
        <Link href="/bookings" className="sidebar-icon-link" data-tooltip="Bookings" aria-label="Bookings">
          <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3.5" y="5" width="17" height="16" rx="2" /><path d="M8 3v4M16 3v4M3.5 10h17" /></svg>
        </Link>
        <Link href="/chats" className="sidebar-icon-link" data-tooltip="Chats" aria-label="Chats">
          <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7A8.4 8.4 0 0 1 4 11.5a8.5 8.5 0 0 1 4.7-7.6A8.4 8.4 0 0 1 12.5 3h.5a8.48 8.48 0 0 1 8 8v.5Z" /></svg>
        </Link>
        <Link href="/notifications" className="sidebar-icon-link" data-tooltip="Notifications" aria-label="Notifications">
          <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" /></svg>
        </Link>
      </nav>
      <div className="sidebar-icon-divider"></div>
      <nav>
        <Link href="/profile" className="sidebar-icon-link" data-tooltip="Profile" aria-label="Profile">
          <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 3.5-7 8-7s8 3 8 7" /></svg>
        </Link>
        <Link href="/settings" className="sidebar-icon-link" data-tooltip="Settings" aria-label="Settings">
          <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" /></svg>
        </Link>
        <Link href="/support" className="sidebar-icon-link" data-tooltip="Help & Support" aria-label="Help & Support">
          <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M9.5 9a2.5 2.5 0 0 1 4.9.8c0 1.6-2.4 1.9-2.4 3.5" /><path d="M12 17.2v.1" /></svg>
        </Link>
      </nav>
    </div>
  );
}

export function MarketplaceBottomNav({ homeHref }: { homeHref: string }) {
  return (
    <nav className="mobile-bottom-nav" aria-label="Mobile navigation">
  <Link href={homeHref}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 11.5 12 4l9 7.5" /><path d="M5.5 10v9a1 1 0 0 0 1 1H9v-4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v4h2.5a1 1 0 0 0 1-1v-9" /></svg><span>Home</span></Link>
  <Link href="/marketplace" className="active"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7A8.4 8.4 0 0 1 4 11.5a8.5 8.5 0 0 1 4.7-7.6A8.4 8.4 0 0 1 12.5 3h.5a8.48 8.48 0 0 1 8 8v.5Z" /></svg>  <span>Marketplace</span></Link>
  <Link href="/list"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="12" cy="12" r="8" /><path d="M8 14c1.2 1.1 2.5 1.6 4 1.6s2.8-.5 4-1.6M9 9h.01M15 9h.01" /></svg>  <span>Create</span></Link>
  <Link href="/chats"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><rect x="3.5" y="5" width="17" height="16" rx="2" /><path d="M8 3v4M16 3v4M3.5 10h17" /></svg>  <span>Inbox</span></Link>
  <Link href="/client-home?view=saved"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.7 21a2 2 0 0 1-3.4 0" /></svg>  <span>Saved</span></Link>
</nav>
  );
}
