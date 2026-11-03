import React from 'react';
import Link from 'next/link';
import { SIDEBAR_ICONS } from '../../lib/booking/bookingIcons';
import Svg from './Svg';

// The booking page's own icon sidebar (laptops and desktops), host and client
// versions, unchanged from legacy-pages/booking.html, with in-app links.

type Item = [href: string, label: string, icon: string, active?: boolean];

const HOST_ITEMS: Item[] = [
  ['/host-home', 'Home', SIDEBAR_ICONS.home],
  ['/marketplace', 'Marketplace', SIDEBAR_ICONS.hostMarketplace, true],
  ['/host-home', 'Saved', SIDEBAR_ICONS.saved],
  ['/bookings', 'Bookings', SIDEBAR_ICONS.bookings],
  ['/chats', 'Chats', SIDEBAR_ICONS.chats],
  ['/notifications', 'Notifications', SIDEBAR_ICONS.notifications],
  ['/list', 'List a space', SIDEBAR_ICONS.listSpace],
  ['/host-home', 'My Listings', SIDEBAR_ICONS.myListings],
  ['/analytics', 'Analytics', SIDEBAR_ICONS.analytics],
  ['/profile', 'Profile', SIDEBAR_ICONS.profile],
  ['/settings', 'Settings', SIDEBAR_ICONS.settings],
  ['/support', 'Help and Support', SIDEBAR_ICONS.support],
  ['/pricing', 'Upgrade', SIDEBAR_ICONS.upgrade],
];

const CLIENT_ITEMS: Item[] = [
  ['/client-home', 'Home', SIDEBAR_ICONS.home],
  ['/marketplace', 'Discover marketplace', SIDEBAR_ICONS.clientMarketplace, true],
  ['/client-home?view=saved', 'Saved', SIDEBAR_ICONS.saved],
  ['/bookings', 'Bookings', SIDEBAR_ICONS.bookings],
  ['/chats', 'Chat', SIDEBAR_ICONS.chats],
  ['/notifications', 'Notifications', SIDEBAR_ICONS.notifications],
  ['/profile', 'Profile', SIDEBAR_ICONS.profile],
  ['/settings', 'Settings', SIDEBAR_ICONS.settings],
  ['/support', 'Help and Support', SIDEBAR_ICONS.support],
];

export default function BookingSidebar({ role }: { role: 'host' | 'client' }) {
  const items = role === 'host' ? HOST_ITEMS : CLIENT_ITEMS;
  return (
    <aside className="client-sidebar" id="booking-sidebar" aria-label={role === 'host' ? 'Host navigation' : 'Client navigation'} aria-hidden="false">
      {items.map(([href, label, icon, active], index) => (
        <Link key={index} href={href} className={`client-nav-link${active ? ' active' : ''}`} aria-label={label} title={label} aria-current={active ? 'page' : undefined}>
          <Svg markup={icon} />
        </Link>
      ))}
    </aside>
  );
}
