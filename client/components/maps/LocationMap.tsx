import React, { useEffect, useRef, useState } from 'react';
import { loadGoogleMaps, type LocationView } from '../../lib/maps/maps';
import MapIllustration from './MapIllustration';

// The map for a location (the map card and /map): a pin for an exact location,
// or an approximate circle (never a pin) for the general area. The general
// area has no coordinates, so the map looks the area up by its name ("Nyali,
// Mombasa, Kenya") and draws the circle there; if the name can't be found it
// shows Kenya without a circle rather than a circle in the wrong city.
//
// A drawn map sits underneath: it shows while the live map loads, and stays
// (with "Live map coming soon") when Google Maps is not configured or can't
// load, so the place is always shown on a map the person can zoom and drag.

interface MapsListener { remove(): void }
interface GoogleMap {
  setCenter(c: unknown): void;
  setZoom(z: number): void;
  addListener(event: string, handler: () => void): MapsListener;
}
interface GoogleMapsSdk {
  Map: new (element: HTMLElement, options: Record<string, unknown>) => GoogleMap;
  Marker: new (options: { position: { lat: number; lng: number }; map: object }) => object;
  Circle: new (options: Record<string, unknown>) => object;
  Geocoder?: new () => { geocode(request: { address: string; region?: string }, callback: (results: Array<{ geometry: { location: unknown } }> | null, status: string) => void): void };
}

const KENYA = { lat: 0.0236, lng: 37.9062 };

function mapsSdk(): GoogleMapsSdk | null {
  const w = window as unknown as { google?: { maps?: GoogleMapsSdk } };
  return (w.google && w.google.maps) || null;
}

type LiveState = 'pending' | 'live' | 'unavailable';

export default function LocationMap({ view, loadingText }: {
  /** The location to show; null while loading or when it can't be shown. */
  view: LocationView | null;
  /** Shown over the drawing while the location loads; null when there is nothing to load. */
  loadingText: string | null;
}) {
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const [live, setLive] = useState<LiveState>('pending');

  useEffect(() => {
    if (!view) return undefined;
    let cancelled = false;
    let listener: MapsListener | null = null;
    setLive('pending');
    loadGoogleMaps().then((ok) => {
      const sdk = mapsSdk();
      const canvas = canvasRef.current;
      if (cancelled || !canvas) return;
      if (!ok || !sdk) { setLive('unavailable'); return; }
      const map = new sdk.Map(canvas, {
        center: view.center,
        zoom: view.zoom,
        disableDefaultUI: true,
        zoomControl: true,
        fullscreenControl: true,
        gestureHandling: 'greedy',
        clickableIcons: false,
      });
      // The live map fades in over the drawing once its tiles are drawn.
      listener = map.addListener('tilesloaded', () => { if (!cancelled) setLive('live'); });
      if (view.exact) {
        new sdk.Marker({ position: view.center, map });
        return;
      }
      const showKenya = () => { map.setCenter(KENYA); map.setZoom(6); };
      if (!view.areaQuery || !sdk.Geocoder) { showKenya(); return; }
      // Only the area's name is looked up: the general area never reveals an address.
      new sdk.Geocoder().geocode({ address: view.areaQuery, region: 'ke' }, (results, status) => {
        if (cancelled) return;
        if (status !== 'OK' || !results || !results[0]) { showKenya(); return; }
        const center = results[0].geometry.location;
        map.setCenter(center);
        map.setZoom(13);
        // Approximate circle only, never a precise pin, for the general area.
        new sdk.Circle({
          center, radius: 1200, map,
          fillColor: '#C41E3A', fillOpacity: 0.15, strokeColor: '#C41E3A', strokeOpacity: 0.4, strokeWeight: 1,
        });
      });
    });
    return () => {
      cancelled = true;
      if (listener) listener.remove();
    };
  }, [view]);

  let notice: React.ReactNode | null = null;
  if (!view) notice = loadingText;
  else if (live === 'unavailable') {
    notice = (
      <>
        <strong>Map preview</strong>
        <span>The live map is coming soon. This drawing shows {view.exact ? 'the place' : 'the general area'}, not the real streets.</span>
      </>
    );
  }

  return (
    <div className="vr-loc-map">
      <MapIllustration exact={Boolean(view && view.exact)} showMarker={Boolean(view)} notice={notice} />
      {view && live !== 'unavailable' && (
        <div className={`vr-loc-live${live === 'live' ? ' is-live' : ''}`} ref={canvasRef} />
      )}
    </div>
  );
}
