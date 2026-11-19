import React, { useEffect, useRef, useState } from 'react';
import { loadGoogleMaps, type LocationView } from '../../lib/maps/maps';

// The map canvas for /map: a pin for an exact location, or an approximate
// circle (never a pin) for the general area. The general area has no
// coordinates, so the map looks the area up by its name ("Nyali, Mombasa,
// Kenya") and draws the circle there; if the name can't be found it shows
// Kenya without a circle rather than a circle in the wrong city. When the
// map can't load (no API key, script blocked), a card offers Google Maps.

interface GoogleMapsSdk {
  Map: new (element: HTMLElement, options: Record<string, unknown>) => { setCenter(c: unknown): void; setZoom(z: number): void };
  Marker: new (options: { position: { lat: number; lng: number }; map: object }) => object;
  Circle: new (options: Record<string, unknown>) => object;
  Geocoder?: new () => { geocode(request: { address: string; region?: string }, callback: (results: Array<{ geometry: { location: unknown } }> | null, status: string) => void): void };
}

const KENYA = { lat: 0.0236, lng: 37.9062 };

function mapsSdk(): GoogleMapsSdk | null {
  const w = window as unknown as { google?: { maps?: GoogleMapsSdk } };
  return (w.google && w.google.maps) || null;
}

const PinIcon = () => (
  <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z" /><circle cx="12" cy="10" r="2.5" />
  </svg>
);

/** Shown instead of the map when it can't load (or while the location can't be shown). */
export function MapFallback({ view, text }: { view: LocationView | null; text: string }) {
  return (
    <div className="map-fallback">
      <span className="map-fallback-icon"><PinIcon /></span>
      <p>{text}</p>
      {view && view.mapsUrl && (
        <a className="map-btn" href={view.mapsUrl} target="_blank" rel="noopener noreferrer">Open in Google Maps</a>
      )}
    </div>
  );
}

export default function LocationMap({ view, message }: { view: LocationView | null; message?: string | null }) {
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    if (!view) return undefined;
    let cancelled = false;
    setUnavailable(false);
    loadGoogleMaps().then((ok) => {
      const sdk = mapsSdk();
      const canvas = canvasRef.current;
      if (cancelled || !canvas) return;
      if (!ok || !sdk) { setUnavailable(true); return; }
      const map = new sdk.Map(canvas, { center: view.center, zoom: view.zoom, disableDefaultUI: true, zoomControl: true });
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
    return () => { cancelled = true; };
  }, [view]);

  if (!view) return <div id="vrm-map-canvas" className="is-empty"><MapFallback view={null} text={message || 'Loading the map…'} /></div>;
  if (unavailable) {
    return (
      <div id="vrm-map-canvas" className="is-empty">
        <MapFallback view={view} text={view.exact ? 'The map preview is not available right now.' : 'The map preview is not available right now. You can still look up the area.'} />
      </div>
    );
  }
  return <div id="vrm-map-canvas" ref={canvasRef} />;
}
