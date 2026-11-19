import React, { useCallback, useEffect, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useAuth } from '../lib/auth/AuthProvider';
import { accountRole } from '../lib/types/profile';
import { describeLocation, fetchLocation, locationEndpoint, LOCATION_PROBLEMS, type LocationView } from '../lib/maps/maps';
import LocationMap from '../components/maps/LocationMap';
import { MAP_STYLES } from '../components/maps/mapStyles';

// Property location (migrated from legacy-pages/map.html): /map?listing=… or
// /map?booking=…. The server decides how much is shown (general area or exact
// address); directions open in Google Maps once the exact location is
// unlocked. A location that can't be shown says why (missing link, not
// allowed, not found, could not load) and offers the way forward.

type MapState =
  | { kind: 'loading' }
  | { kind: 'missing' | 'forbidden' | 'notFound' | 'failed' }
  | { kind: 'ready'; view: LocationView };

function queryValue(value: string | string[] | undefined): string | null {
  return typeof value === 'string' && value ? value : null;
}

export default function MapPage() {
  const router = useRouter();
  const { status, session, profile } = useAuth();
  const role = accountRole(profile);
  const homeHref = status === 'signed-in' ? (role === 'host' ? '/host-home' : '/client-home') : '/';
  const [state, setState] = useState<MapState>({ kind: 'loading' });
  const [attempt, setAttempt] = useState(0);

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
    fetchLocation(endpoint, session?.access_token || null).then((outcome) => {
      if (cancelled) return;
      if (outcome.kind === 'ok') setState({ kind: 'ready', view: describeLocation(outcome.result) });
      else setState({ kind: outcome.kind === 'missing' ? 'notFound' : outcome.kind });
    });
    return () => { cancelled = true; };
  }, [router.isReady, status, listing, booking, session?.access_token, attempt]);

  // Back: where the person came from (a booking, a listing), else Bookings.
  const goBack = useCallback((event: React.MouseEvent) => {
    event.preventDefault();
    if (window.history.length > 1) router.back();
    else void router.push('/bookings');
  }, [router]);

  const view = state.kind === 'ready' ? state.view : null;
  const problem = state.kind === 'ready' || state.kind === 'loading' ? null : LOCATION_PROBLEMS[state.kind];
  const title = state.kind === 'loading' ? 'Loading location…' : problem ? problem.title : (view as LocationView).title;
  const sub = problem ? problem.sub : view ? view.sub : '';

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

        <div className="map-layout">
          <LocationMap view={view} message={state.kind === 'loading' ? 'Loading the map…' : problem ? problem.title : null} />
          <div className="sheet">
            <div className="sheet-title" id="sheet-title">{title}</div>
            {sub && <div className="sheet-sub" id="sheet-sub">{sub}</div>}
            {view && <div className={`sheet-status ${view.statusKind}`} id="sheet-status">{view.status}</div>}
            <div className="sheet-actions">
              {view && (
                <button
                  className="map-btn map-btn-primary"
                  id="directions-btn"
                  type="button"
                  disabled={!view.directionsUrl}
                  onClick={() => { if (view.directionsUrl) window.open(view.directionsUrl, '_blank', 'noopener'); }}
                >
                  Get Directions
                </button>
              )}
              {state.kind === 'failed' && (
                <button className="map-btn map-btn-primary" type="button" onClick={() => setAttempt((n) => n + 1)}>Try again</button>
              )}
              {(state.kind === 'missing' || state.kind === 'forbidden' || state.kind === 'notFound') && (
                <Link className="map-btn" href="/bookings">Go to Bookings</Link>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

// The app's mobile navigation shows here, as it did on the legacy page.
(MapPage as unknown as { appNavigation: boolean }).appNavigation = true;
