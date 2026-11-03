// A listing's video for previews (Marketplace cards, host Bookings): the
// listing's media, then a playback URL for its video. Playback URLs expire
// after five minutes on the server, so answers are kept for four. Import-free.

export interface ListingVideo { videoUrl: string | null; thumbnailUrl: string | null }

export const VIDEO_TTL_MS = 4 * 60 * 1000;

/** The listing's video (playback URL and poster), or null when it has none. */
export async function fetchListingVideo(listingId: string, token: string | null, fetchFn: typeof fetch = fetch): Promise<ListingVideo | null> {
  const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
  const mediaResponse = await fetchFn(`/api/properties/${encodeURIComponent(listingId)}/media`, { headers });
  if (!mediaResponse.ok) return null;
  const mediaPayload = await mediaResponse.json() as { media?: Array<{ id: string; type: string }> };
  const video = (Array.isArray(mediaPayload.media) ? mediaPayload.media : []).find((item) => item && item.type === 'video');
  if (!video) return null;
  const playbackResponse = await fetchFn(`/api/media/${encodeURIComponent(video.id)}/playback`, { headers });
  if (!playbackResponse.ok) return null;
  const playback = await playbackResponse.json() as { url?: string; thumbnailUrl?: string };
  return playback.url ? { videoUrl: playback.url, thumbnailUrl: playback.thumbnailUrl || null } : null;
}

const videos = new Map<string, { video: ListingVideo | null; expiresAt: number }>();
const inFlight = new Map<string, Promise<ListingVideo | null>>();

/** A listing's video if loaded recently (null = it has none); undefined otherwise. */
export function getCachedVideo(listingId: string, now: number = Date.now()): ListingVideo | null | undefined {
  const entry = videos.get(listingId);
  if (!entry || entry.expiresAt <= now) return undefined;
  return entry.video;
}

export function setCachedVideo(listingId: string, video: ListingVideo | null, now: number = Date.now()): void {
  videos.set(listingId, { video, expiresAt: now + VIDEO_TTL_MS });
}

/** The cached answer, or one shared request per listing. Failures resolve null and are not cached. */
export function loadListingVideo(listingId: string, token: string | null, fetchFn: typeof fetch = fetch): Promise<ListingVideo | null> {
  const cached = getCachedVideo(listingId);
  if (cached !== undefined) return Promise.resolve(cached);
  const pending = inFlight.get(listingId);
  if (pending) return pending;
  const request = fetchListingVideo(listingId, token, fetchFn).then((video) => {
    setCachedVideo(listingId, video);
    return video;
  }, () => null).finally(() => inFlight.delete(listingId));
  inFlight.set(listingId, request);
  return request;
}

export function clearListingVideos(): void {
  videos.clear();
  inFlight.clear();
}
