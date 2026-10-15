function resolveStoredPhotoUrl(url, category, supabaseClient) {
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
    } catch (error) {
      return url;
    }
  }

  const environment = '(?:production|development)';
  const newKeyPrefix = new RegExp(`^photos/${environment}/${category}/`);
  const migratedKeyPrefixes = {
    'listing-photos': new RegExp(`^listing-photos/${environment}/`),
    avatars: new RegExp(`^avatars/${environment}/`),
    'update-images': new RegExp(`^updates/${environment}/`),
    'profile-banners': new RegExp(`^photos/${environment}/profile-banners/`),
  };
  if (newKeyPrefix.test(objectKey) || migratedKeyPrefixes[category]?.test(objectKey)) {
    return `/api/photos/${encodeURIComponent(category)}/${objectKey.split('/').map(encodeURIComponent).join('/')}`;
  }

  if (/^https?:\/\//i.test(url)) return url;
  if (supabaseClient) {
    return supabaseClient.storage.from(category).getPublicUrl(url).data.publicUrl;
  }
  return url;
}

function resolveAvatarUrl(url, supabaseClient) {
  return resolveStoredPhotoUrl(url, 'avatars', supabaseClient);
}

module.exports = { resolveStoredPhotoUrl, resolveAvatarUrl };
