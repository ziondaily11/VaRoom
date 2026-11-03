import type { SupabaseClient } from '@supabase/supabase-js';

/** Photo storage buckets ("categories"). */
export type PhotoCategory = 'listing-photos' | 'avatars' | 'update-images' | 'profile-banners' | (string & {});

type PublicUrlClient = Pick<SupabaseClient, 'storage'>;

const environment = '(?:production|development)';
const migratedKeyPrefixes: Record<string, RegExp> = {
  'listing-photos': new RegExp(`^listing-photos/${environment}/`),
  avatars: new RegExp(`^avatars/${environment}/`),
  'update-images': new RegExp(`^updates/${environment}/`),
  'profile-banners': new RegExp(`^photos/${environment}/profile-banners/`),
};

/** A stored photo's URL: R2 keys go through /api/photos; older keys are Supabase public URLs. */
export function resolveStoredPhotoUrl(url: string | null | undefined, category: PhotoCategory | null | undefined, supabaseClient?: PublicUrlClient | null): string | null {
  if (!url || !category) return null;

  let objectKey = url;
  if (/^https?:\/\//i.test(url)) {
    try {
      const parsedUrl = new URL(url);
      const publicStoragePrefix = `/storage/v1/object/public/${category}/`;
      if (!parsedUrl.pathname.startsWith(publicStoragePrefix)) return url;
      objectKey = parsedUrl.pathname.slice(publicStoragePrefix.length)
        .split('/')
        .map(decodeURIComponent)
        .join('/');
    } catch {
      return url;
    }
  }

  const newKeyPrefix = new RegExp(`^photos/${environment}/${category}/`);
  if (newKeyPrefix.test(objectKey) || migratedKeyPrefixes[category]?.test(objectKey)) {
    return `/api/photos/${encodeURIComponent(category)}/${objectKey.split('/').map(encodeURIComponent).join('/')}`;
  }

  if (/^https?:\/\//i.test(url)) return url;
  if (supabaseClient) {
    return supabaseClient.storage.from(category).getPublicUrl(url).data.publicUrl;
  }
  return url;
}

export function resolveAvatarUrl(url: string | null | undefined, supabaseClient?: PublicUrlClient | null): string | null {
  return resolveStoredPhotoUrl(url, 'avatars', supabaseClient);
}
