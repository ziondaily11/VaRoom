import Head from 'next/head';
import { useRouter } from 'next/router';
import React, { useCallback, useEffect } from 'react';
import { getSupabaseClient } from '../lib/supabase/client';
import { loginUrl } from '../lib/safeRedirect';
import { useAuth } from '../lib/auth/AuthProvider';
import { managerHostId, useWorkspace } from '../lib/team/team';
import HostCalendar from '../components/calendar/HostCalendar';

// The host's Calendar (docs/host-controls/CALENDAR_PLAN.md). Rendered inside
// the persistent host shell (icon-only rail, lib/accountRoleLayout.ts), with
// the session from the shared AuthProvider, so arriving from another host page
// loads only this page's data. A manager working as a company sees the
// company's calendar. `?listing=<id>` shows one listing.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default function CalendarPage() {
  const router = useRouter();
  const { status, user, profile, profileError } = useAuth();
  const client = getSupabaseClient();
  const userId = user?.id || null;
  const hostId = managerHostId(userId, useWorkspace(userId));
  const isHost = Boolean(hostId && hostId !== userId) || profile?.role === 'host';
  const rawListing = router.query.listing;
  const listingId = typeof rawListing === 'string' && UUID.test(rawListing) ? rawListing : null;

  useEffect(() => {
    if (status === 'signed-out') void router.replace(loginUrl(router.asPath || '/calendar'));
    else if (status === 'signed-in' && profile && !isHost) void router.replace('/');
  }, [status, profile, isHost, router]);

  const changeListing = useCallback((next: string | null) => {
    void router.replace({ pathname: '/calendar', query: next ? { listing: next } : {} }, undefined, { shallow: true, scroll: false });
  }, [router]);

  const error = status === 'signed-in' && !profile && profileError ? 'Unable to verify your host account.' : null;

  return (
    <>
      <Head><title>Calendar · VaRoom</title></Head>
      {error && <p style={{ margin: '2rem', color: '#8f1229', font: '500 .95rem Inter, Arial, sans-serif' }} role="alert">{error}</p>}
      {!error && isHost && hostId && client && router.isReady && (
        // Keyed by account: a switch never shows the previous account's days.
        <HostCalendar key={hostId} client={client} hostId={hostId} listingId={listingId} onListingChange={changeListing} />
      )}
    </>
  );
}
