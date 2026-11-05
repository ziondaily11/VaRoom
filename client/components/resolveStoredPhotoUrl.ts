import type { SupabaseClient } from '@supabase/supabase-js';

/** Photo storage buckets ("categories"). */
export type PhotoCategory = 'listing-photos' | 'avatars' | 'update-images' | 'profile-banners' | (string & {});

type PublicUrlClient = Pick<SupabaseClient, 'storage'>;

/**
 * Widths /api/photos can serve as smaller copies (server/lib/photoVariants.js).
 * Ask for about twice the displayed CSS width: avatars, thumbnails, grid
 * cards, full-width feed cards. Omit it for full-size views (galleries).
 */
export type PhotoWidth = 192 | 480 | 800 | 1200;
export const PHOTO_WIDTH = { avatar: 192, thumb: 480, card: 800, feed: 1200 } as const;

const withWidth = (url: string | null, width?: PhotoWidth): string | null => (
  url && width && url.startsWith('/api/photos/') && !url.includes('?') ? `${url}?w=${width}` : url);

const environment = '(?:production|development)';
const migratedKeyPrefixes: Record<string, RegExp> = {
  'listing-photos': new RegExp(`^listing-photos/${environment}/`),
  avatars: new RegExp(`^avatars/${environment}/`),
  'update-images': new RegExp(`^updates/${environment}/`),
  'profile-banners': new RegExp(`^photos/${environment}/profile-banners/`),
};

/** A stored photo's URL: R2 keys go through /api/photos; older keys are Supabase public URLs. */
export function resolveStoredPhotoUrl(url: string | null | undefined, category: PhotoCategory | null | undefined, supabaseClient?: PublicUrlClient | null, width?: PhotoWidth): string | null {
  return withWidth(resolvePhotoUrl(url, category, supabaseClient), width);
}

function resolvePhotoUrl(url: string | null | undefined, category: PhotoCategory | null | undefined, supabaseClient?: PublicUrlClient | null): string | null {
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

/** Avatars are shown small, so they default to the 192 px copy. */
export function resolveAvatarUrl(url: string | null | undefined, supabaseClient?: PublicUrlClient | null, width: PhotoWidth = PHOTO_WIDTH.avatar): string | null {
  return resolveStoredPhotoUrl(url, 'avatars', supabaseClient, width);
}
