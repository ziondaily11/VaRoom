const R2_LISTING_PHOTO_KEY =
  /^(?:photos\/(?:production|development)\/listing-photos|listing-photos\/(?:production|development))\//;

export function getListingPhotoUrl(
  storagePath: string,
  getSupabasePublicUrl: (path: string) => string,
): string {
  if (R2_LISTING_PHOTO_KEY.test(storagePath)) {
    const encodedPath = storagePath.split('/').map(encodeURIComponent).join('/');
    return `/api/photos/listing-photos/${encodedPath}`;
  }

  return getSupabasePublicUrl(storagePath);
}
