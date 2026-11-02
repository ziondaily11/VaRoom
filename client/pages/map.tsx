import React, { useEffect, useState } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { useAuth } from '../lib/auth/AuthProvider';
import { describeLocation, fetchLocation, locationEndpoint, type LocationView } from '../lib/maps/maps';
import LocationMap from '../components/maps/LocationMap';
import { MAP_STYLES } from '../components/maps/mapStyles';

// Property location (migrated from legacy-pages/map.html): /map?listing=… or
// /map?booking=…. The server decides how much is shown (general area or exact
// address); directions open in Google Maps once the exact location is unlocked.

type MapState =
  | { kind: 'loading' }
  | { kind: 'missing' }
  | { kind: 'pending' }
  | { kind: 'ready'; view: LocationView };

function queryValue(value: string | string[] | undefined): string | null {
  return typeof value === 'string' && value ? value : null;
}

export default function MapPage() {
  const router = useRouter();
  const { status, session } = useAuth();
  const [state, setState] = useState<MapState>({ kind: 'loading' });

  const listing = queryValue(router.query.listing);
  const booking = queryValue(router.query.booking);

  useEffect(() => {
    // The page is static: the query and the session are known only on the client.
    if (!router.isReady || status === 'loading') return undefined;
    const endpoint = locationEndpoint({ listing, booking });
    if (!endpoint) {
      setState({ kind: 'missing' });
      return undefined;
    }
    let cancelled = false;
    setState({ kind: 'loading' });
    fetchLocation(endpoint, session?.access_token || null).then((result) => {
      if (cancelled) return;
      setState(result ? { kind: 'ready', view: describeLocation(result) } : { kind: 'pending' });
    });
    return () => { cancelled = true; };
  }, [router.isReady, status, listing, booking, session?.access_token]);

  const view = state.kind === 'ready' ? state.view : null;
  const title = state.kind === 'loading' ? 'Loading location…'
    : state.kind === 'missing' ? 'No property specified'
      : state.kind === 'pending' ? 'Map integration in progress'
        : state.view.title;
  const sub = state.kind === 'pending'
    ? "We're still connecting this feature — the map and directions will be available here soon."
    : view ? view.sub : '';

  return (
    <>
      <Head>
        <title>Map — VaRoom</title>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,600;0,9..144,700;0,9..144,900&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
      </Head>
      <style dangerouslySetInnerHTML={{ __html: MAP_STYLES }} />
      <div className="map-page">
        <header>
          <a className="logo" href="/"><span className="va">Va</span>Room</a>
          <a className="back-link" id="back-link" href="/">← Back</a>
        </header>

        <div className="map-layout">
          <LocationMap view={view} pending={state.kind === 'pending'} />
          <div className="sheet">
            <div className="sheet-title" id="sheet-title">{title}</div>
            <div className="sheet-sub" id="sheet-sub">{sub}</div>
            <div
              className={`sheet-status${view ? ` ${view.statusKind}` : ''}`}
              id="sheet-status"
              style={state.kind === 'pending' ? { display: 'none' } : undefined}
            >
              {view ? view.status : ''}
            </div>
            <div className="sheet-actions">
              <button
                className="map-btn map-btn-primary"
                id="directions-btn"
                type="button"
                disabled={!view || !view.directionsUrl}
                onClick={() => { if (view && view.directionsUrl) window.open(view.directionsUrl, '_blank'); }}
              >
                Get Directions
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

// The app's mobile navigation shows here, as it did on the legacy page.
(MapPage as unknown as { appNavigation: boolean }).appNavigation = true;
