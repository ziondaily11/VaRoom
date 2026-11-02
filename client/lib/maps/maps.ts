// Google Maps helpers for location screens (ported from public/js/varoom-maps.js
// and legacy-pages/map.html). The server decides how much location a user may
// see (server/lib/locationAccess.js); these helpers only show what it returns.

export const NAIROBI = { lat: -1.286389, lng: 36.817223 };

let mapsLoad: Promise<boolean> | null = null;

/**
 * Load the Maps JS SDK once. Resolves false (never throws) when no API key is
 * configured or the script fails, so the page can stay usable without a map.
 */
export function loadGoogleMaps(fetchFn: typeof fetch = fetch): Promise<boolean> {
  if (mapsLoad) return mapsLoad;
  mapsLoad = fetchFn('/api/maps-config')
    .then((response) => (response.ok ? response.json() : null))
    .then((config: { apiKey?: string | null } | null) => {
      if (!config || !config.apiKey) return false;
      const w = window as unknown as { google?: { maps?: unknown } };
      if (w.google && w.google.maps) return true;
      return new Promise<boolean>((resolve) => {
        const script = document.createElement('script');
        script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(config.apiKey as string)}&libraries=places&loading=async`;
        script.async = true;
        script.onload = () => resolve(true);
        script.onerror = () => resolve(false);
        document.head.appendChild(script);
      });
    })
    .catch(() => false);
  return mapsLoad;
}

/** For tests: forget the cached SDK load. */
export function resetGoogleMapsLoad(): void {
  mapsLoad = null;
}

/** Google Maps directions to a point (VaRoom hands off; it never navigates in-app). */
export function getDirectionsUrl(lat: number, lng: number): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
}

export interface LocationResult {
  level?: number;
  pendingApproval?: boolean;
  location?: {
    latitude?: number | null;
    longitude?: number | null;
    formatted_address?: string | null;
    neighborhood?: string | null;
    city?: string | null;
  } | null;
}

export interface LocationView {
  title: string;
  sub: string;
  status: string;
  statusKind: 'locked' | 'unlocked';
  exact: boolean;
  /** Where to center the map; the general area uses Nairobi (no coordinates at that level). */
  center: { lat: number; lng: number };
  zoom: number;
  directionsUrl: string | null;
}

/** What the sheet and map show for a server answer (legacy renderResult). */
export function describeLocation(result: LocationResult): LocationView {
  const loc = result.location || {};
  const exact = (result.level || 0) >= 3 && loc.latitude != null && loc.longitude != null;
  if (exact) {
    const lat = Number(loc.latitude);
    const lng = Number(loc.longitude);
    return {
      title: loc.formatted_address || (loc.neighborhood ? `${loc.neighborhood}, ${loc.city}` : 'Property location'),
      sub: loc.neighborhood && loc.city ? `${loc.neighborhood}, ${loc.city}` : '',
      status: 'Exact location unlocked',
      statusKind: 'unlocked',
      exact: true,
      center: { lat, lng },
      zoom: 16,
      directionsUrl: getDirectionsUrl(lat, lng),
    };
  }
  return {
    title: [loc.neighborhood, loc.city].filter(Boolean).join(', ') || loc.city || 'General area only',
    sub: result.pendingApproval
      ? 'The exact location becomes available once your host approves this booking.'
      : 'The exact address is shared once a booking with this property is approved.',
    status: result.pendingApproval ? 'Awaiting host approval' : 'General area shown for now',
    statusKind: 'locked',
    exact: false,
    center: NAIROBI,
    zoom: 12,
    directionsUrl: null,
  };
}

/** The endpoint for a map link: a booking's location, else a listing's. */
export function locationEndpoint(params: { listing?: string | null; booking?: string | null }): string | null {
  if (params.booking) return `/api/bookings/${encodeURIComponent(params.booking)}/location`;
  if (params.listing) return `/api/listings/${encodeURIComponent(params.listing)}/location`;
  return null;
}

/**
 * Fetch the location. Resolves the server's answer, or null for any failure
 * (non-JSON, error status, network), which the page shows as the "map
 * integration in progress" state, as legacy did.
 */
export async function fetchLocation(endpoint: string, accessToken: string | null, fetchFn: typeof fetch = fetch): Promise<LocationResult | null> {
  try {
    const response = await fetchFn(endpoint, { headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {} });
    const raw = await response.text();
    let result: LocationResult & { error?: string };
    try {
      result = JSON.parse(raw);
    } catch {
      return null;
    }
    return response.ok ? result : null;
  } catch {
    return null;
  }
}
