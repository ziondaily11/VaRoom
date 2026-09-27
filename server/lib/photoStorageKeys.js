const PHOTO_CATEGORIES = new Set(['listing-photos', 'avatars', 'update-images']);

function isNewR2PhotoObjectKey(category, key, environment = process.env.NODE_ENV || 'development') {
  return PHOTO_CATEGORIES.has(category)
    && typeof key === 'string'
    && key.startsWith(`photos/${environment}/${category}/`)
    && !key.includes('..');
}

function isR2PhotoObjectKey(category, key, environment = process.env.NODE_ENV || 'development') {
  if (typeof key !== 'string' || key.includes('..')) return false;
  if (isNewR2PhotoObjectKey(category, key, environment)) return true;

  const migratedPrefixByCategory = {
    'listing-photos': `listing-photos/${environment}/`,
    avatars: `avatars/${environment}/`,
    'update-images': `updates/${environment}/`,
  };
  const migratedPrefix = migratedPrefixByCategory[category];
  return Boolean(migratedPrefix && key.startsWith(migratedPrefix));
}

module.exports = { isNewR2PhotoObjectKey, isR2PhotoObjectKey };
