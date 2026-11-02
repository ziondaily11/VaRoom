import React, { useEffect, useRef } from 'react';
import { loadGoogleMaps, type LocationView } from '../../lib/maps/maps';

// The map canvas for /map (legacy map.html): a pin for an exact location, an
// approximate circle (never a pin) for the general area, the animated
// "integration in progress" globe when the location could not be loaded, and
// an empty canvas when no Maps API key is configured.

// The parts of the Google Maps JS SDK used here.
interface GoogleMapsSdk {
  Map: new (element: HTMLElement, options: Record<string, unknown>) => object;
  Marker: new (options: { position: { lat: number; lng: number }; map: object }) => object;
  Circle: new (options: Record<string, unknown>) => object;
}

function mapsSdk(): GoogleMapsSdk | null {
  const w = window as unknown as { google?: { maps?: GoogleMapsSdk } };
  return (w.google && w.google.maps) || null;
}

export function PendingMap() {
  return (
    <div className="pending-map">
      <div className="pending-globe-wrap">
        <div className="pending-globe" />
        <div className="pending-pin-ring" />
        <div className="pending-pin-ring r2" />
        <div className="pending-pin-dot" />
      </div>
      <div className="pending-map-label">Nairobi and beyond — VaRoom&apos;s live map is on its way.</div>
    </div>
  );
}

export default function LocationMap({ view, pending = false }: { view: LocationView | null; pending?: boolean }) {
  const canvasRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!view) return undefined;
    let cancelled = false;
    loadGoogleMaps().then((ok) => {
      const sdk = mapsSdk();
      const canvas = canvasRef.current;
      if (cancelled || !ok || !sdk || !canvas) return;
      const map = new sdk.Map(canvas, { center: view.center, zoom: view.zoom, disableDefaultUI: true, zoomControl: true });
      if (view.exact) {
        new sdk.Marker({ position: view.center, map });
      } else {
        // Approximate circle only, never a precise pin, for the general area.
        new sdk.Circle({
          center: view.center, radius: 1200, map,
          fillColor: '#C41E3A', fillOpacity: 0.15, strokeColor: '#C41E3A', strokeOpacity: 0.4, strokeWeight: 1,
        });
      }
    });
    return () => { cancelled = true; };
  }, [view]);

  if (pending) return <div id="vrm-map-canvas"><PendingMap /></div>;
  return <div id="vrm-map-canvas" ref={canvasRef} />;
}
