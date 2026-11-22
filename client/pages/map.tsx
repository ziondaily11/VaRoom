import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useAuth } from '../lib/auth/AuthProvider';
import { accountRole } from '../lib/types/profile';
import type { MapTarget } from '../lib/maps/maps';
import LocationPanel from '../components/maps/LocationPanel';
import { MAP_STYLES } from '../components/maps/mapStyles';

// Property location (migrated from legacy-pages/map.html): /map?listing=… or
// /map?booking=…. Inside the app, "View on Map" opens the same map in a card
// over the page (components/maps/LocationCard.tsx); this page serves links
// opened in a new tab and older shared links. The map fills the page; the
// server decides how much is shown (general area or exact location).

function queryValue(value: string | string[] | undefined): string | null {
  return typeof value === 'string' && value ? value : null;
}

export default function MapPage() {
  const router = useRouter();
  const { status, profile } = useAuth();
  const role = accountRole(profile);
  const homeHref = status === 'signed-in' ? (role === 'host' ? '/host-home' : '/client-home') : '/';

  // The page is static: the address is read after the first paint, so the
  // server and the browser draw the same first frame.
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  const listing = queryValue(router.query.listing);
  const booking = queryValue(router.query.booking);
  const target = useMemo<MapTarget | null>(
    () => (booking ? { kind: 'booking', id: booking } : listing ? { kind: 'listing', id: listing } : null),
    [booking, listing],
  );

  // Back: where the person came from (a booking, a listing), else Bookings.
  const goBack = useCallback((event: React.MouseEvent) => {
    event.preventDefault();
    if (window.history.length > 1) router.back();
    else void router.push('/bookings');
  }, [router]);

  return (
    <>
      <Head>
        <title>Map · VaRoom</title>
      </Head>
      <style dangerouslySetInnerHTML={{ __html: MAP_STYLES }} />
      <div className="map-page">
        <header>
          <Link className="logo" href={homeHref}><span className="va">Va</span>Room</Link>
          <a className="back-link" id="back-link" href="/bookings" onClick={goBack}>← Back</a>
        </header>
        <div className="map-stage">
          <LocationPanel target={mounted && router.isReady ? target : undefined} titleId="map-page-title" />
        </div>
      </div>
    </>
  );
}

// The app's mobile navigation shows here, as it did on the legacy page.
(MapPage as unknown as { appNavigation: boolean }).appNavigation = true;
