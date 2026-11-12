import Head from 'next/head';
import { useRouter } from 'next/router';
import React, { useCallback, useEffect } from 'react';
import { getSupabaseClient } from '../lib/supabase/client';
import { loginUrl } from '../lib/safeRedirect';
import { useAuth } from '../lib/auth/AuthProvider';
import HostAnalytics from '../components/analytics/Analytics';

// Host analytics. Rendered inside the persistent host shell (icon-only rail,
// see lib/accountRoleLayout.ts), with the session and profile from the shared
// AuthProvider, so arriving here from another host page reloads nothing but
// this page's own data. `?listing=<id>` narrows everything to one listing.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const messageStyle: React.CSSProperties = { margin: '2rem', font: '500 .95rem Inter, Arial, sans-serif' };

export default function AnalyticsPage() {
  const router = useRouter();
  const { status, user, profile, profileError } = useAuth();
  const client = getSupabaseClient();
  const rawListing = router.query.listing;
  const listingId = typeof rawListing === 'string' && UUID.test(rawListing) ? rawListing : null;
  const isHost = profile?.role === 'host';

  useEffect(() => {
    if (status === 'signed-out') {
      window.location.assign(loginUrl(router.asPath || '/analytics'));
    } else if (status === 'signed-in' && profile && profile.role !== 'host') {
      void router.replace('/');
    }
  }, [status, profile, router]);

  const changeListing = useCallback((next: string | null) => {
    void router.replace({ pathname: '/analytics', query: next ? { listing: next } : {} }, undefined, { shallow: true, scroll: false });
  }, [router]);

  const error = status === 'signed-in' && !profile && profileError
    ? 'Unable to verify your host account.'
    : !client && status !== 'loading' ? 'The shared Supabase client did not initialize.' : null;

  return (
    <>
      <Head>
        <title>Host Analytics — VaRoom</title>
      </Head>
      {error && <p style={{ ...messageStyle, color: '#8f1229' }} role="alert">{error}</p>}
      {!error && (!isHost || !user || !client) && <p style={messageStyle}>Loading your host account…</p>}
      {!error && isHost && user && client && router.isReady && (
        // Keyed by account: a switch never shows the previous account's numbers.
        <HostAnalytics
          key={user.id} client={client} userId={user.id}
          firstName={(profile?.full_name || '').trim().split(/\s+/)[0] || null}
          listingId={listingId} onListingChange={changeListing}
        />
      )}
    </>
  );
}
