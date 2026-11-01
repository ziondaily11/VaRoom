import { CACHE_NAMESPACES } from './cache/namespaces';

// Per-account video metadata for Client Home listings (media id and frame
// size), plus short-lived signed playback responses held in memory only.
// Kept as a dedicated structure rather than the generic cache: one bounded
// map per account with per-entry ages, and playback entries that expire with
// their signed URL. Signed URLs are never written to storage.

const STORAGE_PREFIX = CACHE_NAMESPACES.clientHomeVideoMetadata;
const MAX_AGE_MS = 5 * 60 * 1000;
const PLAYBACK_EXPIRY_MARGIN_MS = 30 * 1000;
const MAX_ENTRIES = 250;

export interface VideoMetadata {
  mediaId: string | null;
  width: number | null;
  height: number | null;
}

export interface VideoMetadataInput {
  mediaId: string | null;
  width?: number | null;
  height?: number | null;
}

export interface VideoPlayback {
  url: string;
  expiresAt: string;
  thumbnailUrl?: string | null;
}

interface MetadataEntry {
  metadata: VideoMetadata;
  updatedAt: number;
}

interface AccountMetadata {
  accountId: string;
  entries: Record<string, MetadataEntry>;
}

type MetadataStorage = Pick<Storage, 'getItem' | 'setItem'> | null | undefined;

const memory = new Map<string, AccountMetadata>();
const playbackMemory = new Map<string, { playback: VideoPlayback; expiresAt: number }>();
const requests = new Map<string, Promise<Record<string, VideoMetadataInput | null>>>();
const playbackRequests = new Map<string, Promise<VideoPlayback>>();

function storageKey(accountId: string): string {
  return `${STORAGE_PREFIX}${encodeURIComponent(accountId)}`;
}

function normaliseMetadata(value: VideoMetadataInput | null | undefined): VideoMetadata | null {
  if (value === null || value?.mediaId === null) return { mediaId: null, width: null, height: null };
  if (!value || typeof value.mediaId !== 'string' || value.mediaId.length === 0) return null;
  return {
    mediaId: value.mediaId,
    width: Number.isFinite(value.width) && (value.width as number) > 0 ? (value.width as number) : null,
    height: Number.isFinite(value.height) && (value.height as number) > 0 ? (value.height as number) : null,
  };
}

function isAccountMetadata(value: unknown, accountId: string): value is AccountMetadata {
  const candidate = value as AccountMetadata | null;
  return Boolean(candidate && candidate.accountId === accountId && candidate.entries && typeof candidate.entries === 'object');
}

export function readClientHomeVideoMetadata(storage: MetadataStorage, accountId: string, listingIds: string[]): Record<string, VideoMetadata> {
  if (!accountId || !Array.isArray(listingIds)) return {};
  let parsed: AccountMetadata | null | undefined = memory.get(accountId);
  try {
    if (!parsed && storage) {
      const raw = storage.getItem(storageKey(accountId));
      const stored: unknown = raw ? JSON.parse(raw) : null;
      if (isAccountMetadata(stored, accountId)) {
        parsed = stored;
        memory.set(accountId, stored);
      }
    }
    if (!isAccountMetadata(parsed, accountId)) return {};
    const entries = parsed.entries;
    const now = Date.now();
    return listingIds.reduce<Record<string, VideoMetadata>>((result, listingId) => {
      const entry = entries[listingId];
      if (!entry || typeof entry.updatedAt !== 'number') return result;
      const age = now - entry.updatedAt;
      if (age < 0 || age > MAX_AGE_MS) return result;
      const metadata = normaliseMetadata(entry.metadata);
      if (metadata) result[listingId] = metadata;
      return result;
    }, {});
  } catch (error) {
    console.warn('Client Home video metadata cache could not be read:', error);
    return {};
  }
}

export function writeClientHomeVideoMetadata(
  storage: MetadataStorage,
  accountId: string,
  values: Record<string, VideoMetadataInput | null>,
): boolean {
  if (!accountId || !values || typeof values !== 'object') return false;
  let entries: Record<string, MetadataEntry> = memory.get(accountId)?.entries || {};
  try {
    if (!Object.keys(entries).length && storage) {
      const raw = storage.getItem(storageKey(accountId));
      const parsed: unknown = raw ? JSON.parse(raw) : null;
      if (isAccountMetadata(parsed, accountId)) entries = parsed.entries;
    }
  } catch (error) {
    console.warn('Client Home video metadata cache could not be read before updating:', error);
  }
  const updatedAt = Date.now();
  Object.entries(values).forEach(([listingId, value]) => {
    const metadata = normaliseMetadata(value);
    if (listingId && metadata) entries[listingId] = { metadata, updatedAt };
  });
  const orderedEntries = Object.entries(entries)
    .filter(([, entry]) => entry && typeof entry.updatedAt === 'number' && entry.metadata)
    .sort((left, right) => right[1].updatedAt - left[1].updatedAt)
    .slice(0, MAX_ENTRIES);
  const updated: AccountMetadata = {
    accountId,
    entries: Object.fromEntries(orderedEntries),
  };
  memory.set(accountId, updated);
  if (!storage) return true;
  try {
    storage.setItem(storageKey(accountId), JSON.stringify(updated));
    return true;
  } catch (error) {
    console.warn('Client Home video metadata cache could not be saved:', error);
    return false;
  }
}

export function fetchClientHomeVideoMetadata(
  storage: MetadataStorage,
  accountId: string,
  listingIds: string[],
  loader: (missingIds: string[]) => Promise<Record<string, VideoMetadataInput | null>>,
): Promise<Record<string, VideoMetadata | VideoMetadataInput | null>> {
  const cached = readClientHomeVideoMetadata(storage, accountId, listingIds);
  const missingIds = listingIds.filter((listingId) => !Object.prototype.hasOwnProperty.call(cached, listingId));
  if (missingIds.length === 0) return Promise.resolve(cached);

  const requestKey = `${accountId}:${missingIds.slice().sort().join(',')}`;
  let request = requests.get(requestKey);
  if (!request) {
    const created = Promise.resolve()
      .then(() => loader(missingIds))
      .then((metadata) => {
        writeClientHomeVideoMetadata(storage, accountId, metadata);
        return metadata;
      });
    request = created;
    requests.set(requestKey, created);
    created.then(
      () => { if (requests.get(requestKey) === created) requests.delete(requestKey); },
      () => { if (requests.get(requestKey) === created) requests.delete(requestKey); },
    );
  }
  return request.then((metadata) => ({ ...cached, ...metadata }));
}

export function getClientHomePlayback(accountId: string, mediaId: string): VideoPlayback | null {
  if (!accountId || !mediaId) return null;
  const key = `${accountId}:${mediaId}`;
  const entry = playbackMemory.get(key);
  if (!entry || entry.expiresAt <= Date.now() + PLAYBACK_EXPIRY_MARGIN_MS) {
    playbackMemory.delete(key);
    return null;
  }
  playbackMemory.delete(key);
  playbackMemory.set(key, entry);
  return entry.playback;
}

export function resolveClientHomePlayback(accountId: string, mediaId: string, loader: () => Promise<VideoPlayback>): Promise<VideoPlayback> {
  const cached = getClientHomePlayback(accountId, mediaId);
  if (cached) return Promise.resolve(cached);
  const key = `${accountId}:${mediaId}`;
  let request = playbackRequests.get(key);
  if (!request) {
    const created = Promise.resolve()
      .then(loader)
      .then((playback) => {
        if (!playback || typeof playback.url !== 'string' || playback.url.length === 0) {
          throw new Error('Video playback response did not include a URL.');
        }
        const expiresAt = Date.parse(playback.expiresAt);
        if (Number.isFinite(expiresAt) && expiresAt > Date.now() + PLAYBACK_EXPIRY_MARGIN_MS) {
          playbackMemory.set(key, { playback, expiresAt });
          while (playbackMemory.size > MAX_ENTRIES) {
            playbackMemory.delete(playbackMemory.keys().next().value as string);
          }
        }
        return playback;
      });
    request = created;
    playbackRequests.set(key, created);
    created.then(
      () => { if (playbackRequests.get(key) === created) playbackRequests.delete(key); },
      () => { if (playbackRequests.get(key) === created) playbackRequests.delete(key); },
    );
  }
  return request;
}
