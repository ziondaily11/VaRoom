const STORAGE_PREFIX = 'varoom:client-home:video-metadata:v1:';
const MAX_AGE_MS = 5 * 60 * 1000;
const memory = new Map();
const MAX_ENTRIES = 250;
const requests = new Map();

function storageKey(accountId) {
  return `${STORAGE_PREFIX}${encodeURIComponent(accountId)}`;
}

function normaliseMetadata(value) {
  if (value === null || value?.mediaId === null) return { mediaId: null, width: null, height: null };
  if (!value || typeof value.mediaId !== 'string' || value.mediaId.length === 0) return null;
  return {
    mediaId: value.mediaId,
    width: Number.isFinite(value.width) && value.width > 0 ? value.width : null,
    height: Number.isFinite(value.height) && value.height > 0 ? value.height : null,
  };
}

function readClientHomeVideoMetadata(storage, accountId, listingIds) {
  if (!accountId || !Array.isArray(listingIds)) return {};
  let parsed = memory.get(accountId);
  try {
    if (!parsed && storage) {
      const raw = storage.getItem(storageKey(accountId));
      parsed = raw ? JSON.parse(raw) : null;
      if (parsed?.accountId === accountId && parsed.entries && typeof parsed.entries === 'object') {
        memory.set(accountId, parsed);
      }
    }
    if (parsed?.accountId !== accountId || !parsed.entries || typeof parsed.entries !== 'object') return {};
    const now = Date.now();
    return listingIds.reduce((result, listingId) => {
      const entry = parsed.entries[listingId];
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

function writeClientHomeVideoMetadata(storage, accountId, values) {
  if (!accountId || !values || typeof values !== 'object') return false;
  let entries = memory.get(accountId)?.entries || {};
  try {
    if (!Object.keys(entries).length && storage) {
      const raw = storage.getItem(storageKey(accountId));
      const parsed = raw ? JSON.parse(raw) : null;
      if (parsed?.accountId === accountId && parsed.entries && typeof parsed.entries === 'object') {
        entries = parsed.entries;
      }
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
  const updated = {
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

function fetchClientHomeVideoMetadata(storage, accountId, listingIds, loader) {
  const cached = readClientHomeVideoMetadata(storage, accountId, listingIds);
  const missingIds = listingIds.filter((listingId) => !Object.prototype.hasOwnProperty.call(cached, listingId));
  if (missingIds.length === 0) return Promise.resolve(cached);

  const requestKey = `${accountId}:${missingIds.slice().sort().join(',')}`;
  let request = requests.get(requestKey);
  if (!request) {
    request = Promise.resolve()
      .then(() => loader(missingIds))
      .then((metadata) => {
        writeClientHomeVideoMetadata(storage, accountId, metadata);
        return metadata;
      });
    requests.set(requestKey, request);
    request.then(
      () => { if (requests.get(requestKey) === request) requests.delete(requestKey); },
      () => { if (requests.get(requestKey) === request) requests.delete(requestKey); },
    );
  }
  return request.then((metadata) => ({ ...cached, ...metadata }));
}

module.exports = {
  fetchClientHomeVideoMetadata,
  readClientHomeVideoMetadata,
  writeClientHomeVideoMetadata,
};
