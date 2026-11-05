// A listing's video for previews (Marketplace cards, host Bookings): the
// listing's media, then a playback URL for its video. Playback URLs expire
// after five minutes on the server, so answers are kept for four. Marketplace
// cards use the batched loadPublicListingVideo. Import-free.

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
  queue.length = 0;
}

// ---------- Batched lookup (Marketplace) ----------
// Cards that come into view together share one /api/discover/video-media
// request (up to 24 listings) instead of one /media request each. Listings
// the batch does not cover (not public) and a failed batch fall back to the
// per-listing lookup, so the result is the same as loadListingVideo.

const BATCH_WAIT_MS = 30;
const BATCH_SIZE = 24;
const queue: Array<{ listingId: string; resolve: (video: ListingVideo | null) => void }> = [];
let batchTimer: ReturnType<typeof setTimeout> | null = null;

async function playbackFor(mediaId: string, headers: Record<string, string>, fetchFn: typeof fetch): Promise<ListingVideo | null> {
  const response = await fetchFn(`/api/media/${encodeURIComponent(mediaId)}/playback`, { headers });
  if (!response.ok) return null;
  const playback = await response.json() as { url?: string; thumbnailUrl?: string };
  return playback.url ? { videoUrl: playback.url, thumbnailUrl: playback.thumbnailUrl || null } : null;
}

async function runBatch(batch: typeof queue, token: string | null, fetchFn: typeof fetch): Promise<void> {
  const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
  const ids = batch.map((item) => item.listingId);
  let covered: Set<string> | null = null;
  let videoMedia: Record<string, string> = {};
  try {
    const response = await fetchFn(`/api/discover/video-media?listingIds=${encodeURIComponent(ids.join(','))}`, { headers });
    if (response.ok) {
      const payload = await response.json() as { videoMedia?: Record<string, string>; publishedIds?: string[] };
      if (Array.isArray(payload.publishedIds)) {
        covered = new Set(payload.publishedIds);
        videoMedia = payload.videoMedia || {};
      }
    }
  } catch {
    covered = null;
  }
  await Promise.all(batch.map(async ({ listingId, resolve }) => {
    let video: ListingVideo | null;
    try {
      if (!covered || !covered.has(listingId)) video = await fetchListingVideo(listingId, token, fetchFn);
      else video = videoMedia[listingId] ? await playbackFor(videoMedia[listingId], headers, fetchFn) : null;
      setCachedVideo(listingId, video);
    } catch {
      video = null;
    }
    resolve(video);
  }));
}

/** loadListingVideo for public listing cards: same answer, one request per 24 cards. */
export function loadPublicListingVideo(listingId: string, token: string | null, fetchFn: typeof fetch = fetch): Promise<ListingVideo | null> {
  const cached = getCachedVideo(listingId);
  if (cached !== undefined) return Promise.resolve(cached);
  const pending = inFlight.get(listingId);
  if (pending) return pending;
  const request = new Promise<ListingVideo | null>((resolve) => {
    queue.push({ listingId, resolve });
    if (batchTimer) return;
    batchTimer = setTimeout(() => {
      batchTimer = null;
      while (queue.length) void runBatch(queue.splice(0, BATCH_SIZE), token, fetchFn);
    }, BATCH_WAIT_MS);
  }).finally(() => inFlight.delete(listingId));
  inFlight.set(listingId, request);
  return request;
}
