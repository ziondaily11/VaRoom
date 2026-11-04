import type { VideoMetadata, VideoMetadataInput } from '../clientHomeVideoMetadataCache';

// Client Home listing-video discovery: batching, response validation, the
// compatibility route and the terminal state each card settles in. The page
// supplies the authenticated requests; these helpers decide what they mean.

/** The server's limit on listing ids per discovery request. */
export const VIDEO_DISCOVERY_BATCH_SIZE = 24;

export type VideoState = 'loading' | 'none' | 'unavailable';

export interface ListingVideo {
  url: string;
  thumbnailUrl?: string | null;
  width?: number;
  height?: number;
}

type ResponseLike = Pick<Response, 'ok' | 'status' | 'json'>;
interface MediaItem { id?: string; type?: string; width?: number | null; height?: number | null }

export function chunkListingIds(ids: string[], size = VIDEO_DISCOVERY_BATCH_SIZE): string[][] {
  const batches: string[][] = [];
  for (let offset = 0; offset < ids.length; offset += size) batches.push(ids.slice(offset, offset + size));
  return batches;
}

/** Only a missing discovery endpoint falls back to per-listing lookups; other errors fail the batch. */
export function isVideoDiscoveryUnavailable(status: number): boolean {
  return status === 404 || status === 405;
}

/** Maps a discovery response to metadata for each requested listing, or throws when it is malformed. */
export function parseVideoDiscoveryResponse(payload: unknown, listingIds: string[]): Record<string, VideoMetadataInput> {
  const body = payload as {
    videoMedia?: unknown;
    videoDimensions?: Record<string, { width?: number | null; height?: number | null } | undefined> | null;
  } | null | undefined;
  if (!body?.videoMedia || typeof body.videoMedia !== 'object' || Array.isArray(body.videoMedia)) {
    throw new Error('Video media response was invalid.');
  }
  const videoMedia = body.videoMedia as Record<string, unknown>;
  const discovered: Record<string, VideoMetadataInput> = {};
  listingIds.forEach((id) => {
    const mediaId = videoMedia[id];
    const dimensions = body.videoDimensions?.[id] || {};
    discovered[id] = typeof mediaId === 'string' && mediaId
      ? { mediaId, width: dimensions.width, height: dimensions.height }
      : { mediaId: null };
  });
  return discovered;
}

/** Reads one listing's media list from the compatibility route, or throws when it is malformed. */
export function parseCompatibilityMediaResponse(result: unknown): VideoMetadataInput {
  const media = (result as { media?: unknown } | null | undefined)?.media;
  if (!Array.isArray(media)) throw new Error('Video media response was invalid.');
  const videoMedia = (media as MediaItem[]).find((mediaItem) => mediaItem?.type === 'video' && typeof mediaItem.id === 'string');
  return videoMedia
    ? { mediaId: videoMedia.id || null, width: videoMedia.width, height: videoMedia.height }
    : { mediaId: null };
}

/** Per-listing lookups used while the batched discovery endpoint is unavailable. Any failure fails the batch. */
export async function loadCompatibilityVideoMetadata(
  listingIds: string[],
  request: (id: string) => Promise<ResponseLike>,
): Promise<Record<string, VideoMetadataInput>> {
  console.warn('Video discovery endpoint is unavailable; using the compatibility route.');
  const discovered: Record<string, VideoMetadataInput> = {};
  await Promise.all(listingIds.map(async (id) => {
    try {
      const response = await request(id);
      if (!response.ok) throw new Error(`Video media lookup returned ${response.status}.`);
      discovered[id] = parseCompatibilityMediaResponse(await response.json());
    } catch (fallbackError) {
      console.error(`Video media for listing ${id} could not be loaded:`, fallbackError);
      throw fallbackError;
    }
  }));
  return discovered;
}

/** Discovers metadata for listings missing from the cache, in server-sized batches. */
export async function discoverVideoMetadata(
  missingIds: string[],
  requests: {
    requestBatch: (listingIds: string[]) => Promise<ResponseLike>;
    loadCompatibility: (listingIds: string[]) => Promise<Record<string, VideoMetadataInput>>;
  },
): Promise<Record<string, VideoMetadataInput>> {
  const discovered: Record<string, VideoMetadataInput> = {};
  for (const missingBatch of chunkListingIds(missingIds)) {
    const response = await requests.requestBatch(missingBatch);
    if (isVideoDiscoveryUnavailable(response.status)) {
      Object.assign(discovered, await requests.loadCompatibility(missingBatch));
      continue;
    }
    if (!response.ok) throw new Error(`Video media lookup returned ${response.status}.`);
    Object.assign(discovered, parseVideoDiscoveryResponse(await response.json(), missingBatch));
  }
  return discovered;
}

/**
 * Resolves each queued listing to a terminal state: listings without a video
 * settle as 'none'; a failed batch settles every listing in it as
 * 'unavailable'. Playback for listings with a video is left to `loadPlayback`,
 * which settles them itself. No request is retried.
 */
export async function settleVideoBatches(
  ids: string[],
  steps: {
    discover: (batch: string[]) => Promise<Record<string, VideoMetadata | VideoMetadataInput | null>>;
    isCurrent: () => boolean;
    loadPlayback: (id: string, mediaId: string, dimensions: { width?: number | null; height?: number | null }) => Promise<void>;
    settle: (listingIds: string[], state: 'none' | 'unavailable') => void;
  },
): Promise<void> {
  for (const batch of chunkListingIds(ids)) {
    try {
      const metadata = await steps.discover(batch);
      if (!steps.isCurrent()) return;
      await Promise.all(batch.map(async (id) => {
        const videoMetadata = metadata[id];
        if (!videoMetadata || !videoMetadata.mediaId) {
          steps.settle([id], 'none');
          return;
        }
        await steps.loadPlayback(id, videoMetadata.mediaId, videoMetadata);
      }));
    } catch (lookupError) {
      console.error('Batched listing video lookup could not be completed:', lookupError);
      steps.settle(batch, 'unavailable');
    }
  }
}

/** Sets the same state for several listings without touching the others. */
export function markVideoStates(
  current: Record<string, VideoState>,
  listingIds: string[],
  state: VideoState,
): Record<string, VideoState> {
  const next = { ...current };
  listingIds.forEach((id) => { next[id] = state; });
  return next;
}

/** The card's video from a playback response; a response without a URL is a failure. */
export function toListingVideo(
  playback: { url?: string | null; thumbnailUrl?: string | null } | null | undefined,
  dimensions: { width?: number | null; height?: number | null },
): ListingVideo {
  if (!playback?.url) throw new Error('Video playback did not include a URL.');
  return { url: playback.url, thumbnailUrl: playback.thumbnailUrl || null, width: dimensions.width || undefined, height: dimensions.height || undefined };
}

/** Intrinsic size (once the element reports it for this URL) wins over supplied metadata. */
export function resolveVideoFrameSize(
  video: { url: string; width?: number; height?: number },
  naturalSize: { url: string; width: number; height: number } | null,
): { width: number; height: number; hasDimensions: boolean } {
  const current = naturalSize?.url === video.url
    ? naturalSize
    : null;
  const width = current?.width || video.width || 0;
  const height = current?.height || video.height || 0;
  return { width, height, hasDimensions: width > 0 && height > 0 };
}
