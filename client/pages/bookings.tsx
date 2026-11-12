import React, { useEffect } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { useAuth } from '../lib/auth/AuthProvider';
import { accountRole } from '../lib/types/profile';
import { bookingsHostId, useWorkspace } from '../lib/team/team';
import { loginUrl } from '../lib/safeRedirect';
import ClientBookingsView from '../components/bookings/ClientBookingsView';
import HostBookingsView, { HostBookingSkeleton } from '../components/bookings/HostBookingsView';
import { useToast } from '../components/bookings/useBookingActions';
import { BOOKINGS_STYLES } from '../components/bookings/bookingsStyles';

// Bookings (migrated from legacy-pages/bookings.html) inside the persistent
// app shell: the client's stays or the host's booking requests, by the
// signed-in account's role (AuthProvider), with the right rail beside the
// list on every screen wider than 860px.

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
  const hostId = bookingsHostId(userId, useWorkspace(userId));
  // Working as a company (Settings → Team) shows its bookings, whatever this account's own role.
  const role = hostId !== userId ? 'host' : accountRole(profile);
  const toast = useToast();

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
              <button type="button" className="topbar-avatar-btn" id="topbar-avatar-btn" aria-label="Open menu">
                <div className="avatar-circle" aria-hidden="true">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="4" y1="7" x2="20" y2="7" /><line x1="4" y1="12" x2="20" y2="12" /><line x1="4" y1="17" x2="20" y2="17" /></svg>
                </div>
              </button>
              <span className="mobile-page-title">{role === 'host' ? 'Bookings' : 'My Bookings'}</span>
            </header>
            <div className={`content-row${role === 'host' ? ' host-layout' : ''}`} id="content-row">
              {role === 'host' && hostId && <HostBookingsView key={hostId} hostId={hostId} showToast={toast.show} />}
              {role === 'client' && <ClientBookingsView showToast={toast.show} />}
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
