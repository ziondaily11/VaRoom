import type { SupabaseClient } from '@supabase/supabase-js';

// Port of the storage patch in public/js/supabase-client.js. Photo buckets
// resolve through the server's /api/photos route and upload through the signed
// R2 flow; older Supabase Storage paths keep resolving from Supabase. Both
// implementations share the __varoomR2PhotoStoragePatched flag so a client is
// never patched twice.

type StorageBucket = ReturnType<SupabaseClient['storage']['from']>;

interface PatchableClient extends SupabaseClient {
  __varoomR2PhotoStoragePatched?: boolean;
}

interface UploadResult {
  data: { path: string; fullPath: string } | null;
  error: Error | null;
}

const PHOTO_BUCKETS = new Set(['listing-photos', 'avatars', 'update-images']);
const SUPPORTED_PHOTO_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const MIGRATED_KEY_PREFIXES: Record<string, string> = {
  'listing-photos': 'listing-photos/',
  avatars: 'avatars/',
  'update-images': 'updates/',
};

export function photoProxyUrl(bucket: string, path: string): string {
  return '/api/photos/' + encodeURIComponent(bucket) + '/' + path.split('/').map(encodeURIComponent).join('/');
}

function usesPhotoProxy(bucket: string, path: unknown): path is string {
  if (typeof path !== 'string') return false;
  const migratedPrefix = MIGRATED_KEY_PREFIXES[bucket];
  return bucket === 'listing-photos'
    || path.indexOf('photos/') === 0
    || Boolean(migratedPrefix && path.indexOf(migratedPrefix) === 0);
}

async function readJson(response: Response): Promise<Record<string, unknown>> {
  try {
    const body: unknown = await response.json();
    return body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function errorMessage(body: Record<string, unknown>, fallback: string): string {
  return typeof body.error === 'string' && body.error ? body.error : fallback;
}

async function uploadPhoto(client: SupabaseClient, bucket: string, requestedPath: string, file: File): Promise<UploadResult> {
  if (!file || !SUPPORTED_PHOTO_TYPES.has(file.type)) {
    return { data: null, error: new Error('Only JPEG, PNG, WebP, and GIF photos are supported.') };
  }
  try {
    const { data: sessionData } = await client.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) throw new Error('Authentication is required to upload photos.');

    const filename = file.name || (requestedPath && String(requestedPath).split('/').pop()) || 'photo.jpg';
    const pathParts = typeof requestedPath === 'string' ? requestedPath.split('/') : [];
    const listingId = bucket === 'listing-photos' && pathParts.length >= 3 ? pathParts[1] : null;
    const headers = { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token };

    const initResponse = await fetch('/api/photos/upload-init', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        category: bucket,
        filename,
        mimeType: file.type,
        fileSize: file.size,
        ...(listingId ? { listingId } : {}),
      }),
    });
    const init = await readJson(initResponse);
    if (!initResponse.ok) throw new Error(errorMessage(init, 'Unable to prepare photo upload.'));

    const uploadResponse = await fetch(String(init.uploadUrl), { method: 'PUT', headers: { 'Content-Type': file.type }, body: file });
    if (!uploadResponse.ok) throw new Error('Photo upload to storage failed.');

    const completeResponse = await fetch('/api/photos/upload-complete', {
      method: 'POST',
      headers,
      body: JSON.stringify({ category: bucket, key: init.key, ...(listingId ? { listingId } : {}) }),
    });
    const complete = await readJson(completeResponse);
    if (!completeResponse.ok) throw new Error(errorMessage(complete, 'Unable to finalize photo upload.'));

    const key = String(complete.key);
    return { data: { path: key, fullPath: key }, error: null };
  } catch (error) {
    return { data: null, error: error instanceof Error ? error : new Error(String(error)) };
  }
}

export function installR2PhotoStorage(client: SupabaseClient): void {
  const patchable = client as PatchableClient;
  if (patchable.__varoomR2PhotoStoragePatched) return;

  const originalFrom = client.storage.from.bind(client.storage) as (bucket: string) => StorageBucket;
  client.storage.from = ((bucket: string) => {
    const storage = originalFrom(bucket);
    if (!PHOTO_BUCKETS.has(bucket)) return storage;

    const originalGetPublicUrl = storage.getPublicUrl.bind(storage) as StorageBucket['getPublicUrl'];
    storage.getPublicUrl = ((path: string, options?: Parameters<StorageBucket['getPublicUrl']>[1]) => {
      if (usesPhotoProxy(bucket, path)) return { data: { publicUrl: photoProxyUrl(bucket, path) } };
      return originalGetPublicUrl(path, options);
    }) as StorageBucket['getPublicUrl'];

    storage.upload = ((path: string, file: File) => uploadPhoto(client, bucket, path, file)) as unknown as StorageBucket['upload'];
    return storage;
  }) as SupabaseClient['storage']['from'];

  patchable.__varoomR2PhotoStoragePatched = true;
}
