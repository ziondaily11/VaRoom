import React, { useCallback, useEffect } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import MenuButton, { MenuIcon } from '../components/shell/MenuButton';
import { useAuth } from '../lib/auth/AuthProvider';
import { accountRole } from '../lib/types/profile';
import { managerHostId, useWorkspace } from '../lib/team/team';
import { loginUrl } from '../lib/safeRedirect';
import ClientBookingsView from '../components/bookings/ClientBookingsView';
import HostBookingsView, { HostBookingSkeleton } from '../components/bookings/HostBookingsView';
import { useToast } from '../components/bookings/useBookingActions';
import { BOOKINGS_STYLES } from '../components/bookings/bookingsStyles';
import SegmentedTabs from '../components/ui/SegmentedTabs';
import { bookingsView, type BookingsView } from '../lib/bookings/links';

// Bookings (migrated from legacy-pages/bookings.html) inside the persistent
// app shell: the client's stays or the host's booking requests, by the
// signed-in account's role (AuthProvider), with the right rail beside the
// list on every screen wider than 860px. Hosts can book stays too: on their
// own account a Hosting | My trips switch (?view=trips) shows their stays.

const VIEWS: Array<{ key: BookingsView; label: string }> = [
  { key: 'hosting', label: 'Hosting' },
  { key: 'trips', label: 'My trips' },
];

function CheckingSkeleton() {
  return (
    <div id="checking-auth" role="status" aria-label="Loading bookings">
      <div className="host-bookings-auth-skeleton" aria-hidden="true">
        <div className="host-bookings-auth-head">
          <div>
            <div className="host-bookings-auth-title host-booking-skeleton skeleton-block" />
            <div className="host-bookings-auth-subtitle host-booking-skeleton skeleton-block" />
          </div>
          <div className="host-bookings-auth-month host-booking-skeleton skeleton-block" />
        </div>
        <div className="host-bookings-auth-tabs">
          {[0, 1, 2, 3].map((i) => <div key={i} className="host-bookings-auth-tab host-booking-skeleton skeleton-block" />)}
        </div>
        <HostBookingSkeleton /><HostBookingSkeleton /><HostBookingSkeleton />
      </div>
    </div>
  );
}

export default function BookingsPage() {
  const router = useRouter();
  const { status, profile, user } = useAuth();
  const userId = user?.id || null;
  const hostId = managerHostId(userId, useWorkspace(userId));
  // Working as a company (Settings → Team) shows its bookings, whatever this account's own role.
  const role = hostId !== userId ? 'host' : accountRole(profile);
  const toast = useToast();
  // Trips are the person's own: not shown while working as a company.
  const ownHost = role === 'host' && hostId === userId;
  const view: BookingsView = ownHost ? bookingsView(router.query.view) : 'hosting';

  const showView = useCallback((next: BookingsView, bookingId?: string) => {
    const query = { ...(next === 'trips' ? { view: 'trips' } : {}), ...(bookingId ? { booking: bookingId } : {}) };
    void router.replace({ pathname: '/bookings', query }, undefined, { shallow: true, scroll: false });
  }, [router]);
  const openTrip = useCallback((bookingId: string) => showView('trips', bookingId), [showView]);

  const switcher = ownHost ? (
    <div className="bookings-view-switch">
      <SegmentedTabs label="Bookings" activeKey={view}>
        {VIEWS.map((v) => (
          <button key={v.key} type="button" role="tab" aria-selected={view === v.key} onClick={() => { if (v.key !== view) showView(v.key); }}>{v.label}</button>
        ))}
      </SegmentedTabs>
    </div>
  ) : null;

  useEffect(() => {
    if (status === 'signed-out') router.replace(loginUrl(router.asPath || '/bookings'));
  }, [status, router]);

  return (
    <>
      <Head>
        <title>My Bookings — VaRoom</title>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,600;0,9..144,700;0,9..144,900&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
      </Head>
      <style dangerouslySetInnerHTML={{ __html: BOOKINGS_STYLES }} />
      <div className="bookings-page">
        {toast.element}
        <div className="app-shell">
          <div className="main-col">
            <header className="topbar">
              <MenuButton className="topbar-avatar-btn">
                <div className="avatar-circle" aria-hidden="true"><MenuIcon /></div>
              </MenuButton>
              <span className="mobile-page-title">{role === 'host' ? 'Bookings' : 'My Bookings'}</span>
            </header>
            <div className={`content-row${role === 'host' && view === 'hosting' ? ' host-layout' : ''}`} id="content-row">
              {role === 'host' && hostId && view === 'hosting' && (
                <HostBookingsView key={hostId} hostId={hostId} showToast={toast.show} switcher={switcher} onMissingBooking={ownHost ? openTrip : undefined} />
              )}
              {(role === 'client' || view === 'trips') && <ClientBookingsView showToast={toast.show} switcher={switcher} />}
              {!role && (
                <>
                  <div className="feed-area"><CheckingSkeleton /></div>
                  <aside className="right-rail host-empty" />
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
