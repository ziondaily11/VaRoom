'use strict';

// Public photo answers this server gave in the last minute, by request
// (category, key and width). Many visitors loading the same listings then
// cost one round of checks a minute — the photo and listing lookups, the R2
// copy check and the signing — instead of one per visitor, even when the CDN
// misses (a new region, the first request after expiry). Only public answers
// are kept, and only requests without an Authorization header use them; a
// listing unpublished or a host deactivated is seen within the minute.

function createPhotoRedirectCache({ ttlMs = 60 * 1000, limit = 5000, now = () => Date.now() } = {}) {
  const entries = new Map();

  const keyFor = (category, key, width) => `${category}\n${key}\n${width || ''}`;

  function get(category, key, width) {
    const cacheKey = keyFor(category, key, width);
    const entry = entries.get(cacheKey);
    if (!entry) return null;
    if (entry.expiresAt <= now()) {
      entries.delete(cacheKey);
      return null;
    }
    return entry.url;
  }

  function set(category, key, width, url) {
    const cacheKey = keyFor(category, key, width);
    entries.delete(cacheKey);
    entries.set(cacheKey, { url, expiresAt: now() + ttlMs });
    if (entries.size > limit) entries.delete(entries.keys().next().value);
  }

  return { get, set, clear: () => entries.clear(), size: () => entries.size };
}

module.exports = { createPhotoRedirectCache };
