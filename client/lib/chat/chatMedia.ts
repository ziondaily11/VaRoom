import { fetchAndCacheMedia, getMediaUrl } from '../chatCache';

// Media for chat messages (ported from public/js/chat-data.js
// downloadAttachment / loadListingVideo). Concurrent requests for the same
// file share one lookup.
//
// Attachments are served through short-lived signed URLs. Three layers:
// 1. a blob in the chat media cache (IndexedDB), which never expires;
// 2. the signed URL in memory until shortly before it expires;
// 3. the download API.
// A signed URL is shown at once; saving the blob happens in the background
// and is skipped for the session once storage refuses cross-origin reads
// (CORS), so a refused fetch never delays a photo.

export type ChatApi = (url: string, options?: RequestInit) => Promise<any>;

const inFlight = new Map<string, Promise<string>>();
const SIGNED_URL_LIMIT = 300;
const SIGNED_URL_MARGIN_MS = 5 * 60 * 1000;
const DEFAULT_SIGNED_URL_TTL_MS = 45 * 60 * 1000;
const signedUrls = new Map<string, { url: string; expiresAt: number }>();
let blobCachingRefused = false;

function shared(key: string, load: () => Promise<string>): Promise<string> {
  const existing = inFlight.get(key);
  if (existing) return existing;
  const promise = load().finally(() => inFlight.delete(key));
  inFlight.set(key, promise);
  return promise;
}

function rememberSignedUrl(key: string, url: string, expiresAt: unknown) {
  const expiry = typeof expiresAt === 'string' || typeof expiresAt === 'number' ? new Date(expiresAt).getTime() : NaN;
  const usableUntil = Number.isFinite(expiry) ? expiry - SIGNED_URL_MARGIN_MS : Date.now() + DEFAULT_SIGNED_URL_TTL_MS;
  signedUrls.delete(key);
  signedUrls.set(key, { url, expiresAt: usableUntil });
  while (signedUrls.size > SIGNED_URL_LIMIT) signedUrls.delete(signedUrls.keys().next().value as string);
}

function freshSignedUrl(key: string): string | null {
  const entry = signedUrls.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    signedUrls.delete(key);
    return null;
  }
  return entry.url;
}

function saveBlobInBackground(key: string, url: string) {
  if (blobCachingRefused) return;
  fetchAndCacheMedia(key, url, { type: 'attachment' })
    .then((result) => {
      // The cache returns the remote URL when it could not read the file.
      if (result === url) blobCachingRefused = true;
    })
    .catch(() => { blobCachingRefused = true; });
}

/** A displayable URL for a chat attachment: cached blob, a fresh signed URL, else the download API. */
export function attachmentUrl(attachmentId: string, api: ChatApi): Promise<string> {
  const cacheKey = `attachment:${attachmentId}`;
  const remembered = freshSignedUrl(cacheKey);
  if (remembered) return Promise.resolve(remembered);
  return shared(cacheKey, async () => {
    try {
      const cached = await getMediaUrl(cacheKey);
      if (cached && cached.url) return cached.url;
    } catch {
      // Cache unavailable: fall through to the network.
    }
    const result = await api(`/api/chat/attachments/${encodeURIComponent(attachmentId)}/download`);
    if (!result || !result.url) throw new Error('Attachment unavailable');
    rememberSignedUrl(cacheKey, result.url, result.expiresAt);
    saveBlobInBackground(cacheKey, result.url);
    return result.url as string;
  });
}

/** A cached copy of a remote image (listing photos, thumbnails), else the remote URL while it is cached in the background. */
export function cachedImageUrl(cacheKey: string, remoteUrl: string): Promise<string> {
  return shared(cacheKey, async () => {
    try {
      const cached = await getMediaUrl(cacheKey);
      if (cached && cached.url) return cached.url;
    } catch {
      return remoteUrl;
    }
    fetchAndCacheMedia(cacheKey, remoteUrl, { type: 'image' }).catch(() => {});
    return remoteUrl;
  });
}

export interface ListingVideo {
  videoId: string;
  url: string;
  thumbnailUrl: string;
}

/** The first video of a listing, with its playback URL, or null. */
export async function listingVideo(listingId: string, api: ChatApi): Promise<ListingVideo | null> {
  const media = await api(`/api/properties/${encodeURIComponent(listingId)}/media`);
  const video = (media && media.media || []).find((item: { type?: string }) => item.type === 'video');
  if (!video) return null;
  const playback = await api(`/api/media/${encodeURIComponent(video.id)}/playback`);
  const rawThumb: string = playback.thumbnailUrl || video.thumbnailUrl || '';
  const thumbnailUrl = rawThumb ? await cachedImageUrl(`listing-thumb:${video.id}`, rawThumb) : '';
  return { videoId: video.id, url: playback.url, thumbnailUrl };
}

/** "Read 09:14" on outgoing messages the other person has read, otherwise the send time. */
export function messageMetaText(message: { created_at: string; read_at?: string | null }, outgoing: boolean, formatTime: (value: string) => string): string {
  return message.read_at && outgoing ? `Read ${formatTime(message.read_at)}` : formatTime(message.created_at);
}
