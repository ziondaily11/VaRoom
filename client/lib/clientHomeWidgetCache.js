const STORAGE_PREFIX = 'varoom:client-home:widget:v1:';
const MAX_AGE_MS = 5 * 60 * 1000;
const memory = new Map();
const requests = new Map();

function isValidValue(key, value) {
  if (key === 'destinations') {
    return value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length > 0 &&
      Object.values(value).every((count) => count === null || (Number.isSafeInteger(count) && count >= 0));
  }
  if (key === 'updates') {
    return Array.isArray(value) && value.every((item) =>
      item && typeof item.id === 'string' && typeof item.body === 'string');
  }
  if (key === 'recommended') {
    return Array.isArray(value) && value.every((item) => item && typeof item.id === 'string');
  }
  return false;
}

function readClientHomeWidgetCache(storage, key) {
  if (!key) return null;
  let entry = memory.get(key);
  if (!entry && storage) {
    try {
      const raw = storage.getItem(`${STORAGE_PREFIX}${encodeURIComponent(key)}`);
      if (raw) {
        entry = JSON.parse(raw);
        if (entry && isValidValue(key, entry.value) && typeof entry.updatedAt === 'number') {
          memory.set(key, entry);
        } else {
          entry = null;
        }
      }
    } catch (error) {
      console.warn(`Client Home ${key} cache could not be read:`, error);
      entry = null;
    }
  }
  if (!entry || !isValidValue(key, entry.value)) return null;
  const age = Date.now() - entry.updatedAt;
  if (!Number.isFinite(age) || age < 0) return null;
  return { value: entry.value, isFresh: age < MAX_AGE_MS };
}

function writeClientHomeWidgetCache(storage, key, value) {
  if (!key || !isValidValue(key, value)) return false;
  const entry = { value, updatedAt: Date.now() };
  memory.set(key, entry);
  if (!storage) return true;
  try {
    storage.setItem(`${STORAGE_PREFIX}${encodeURIComponent(key)}`, JSON.stringify(entry));
    return true;
  } catch (error) {
    console.warn(`Client Home ${key} cache could not be saved:`, error);
    return false;
  }
}

function fetchClientHomeWidget(key, loader) {
  const existing = requests.get(key);
  if (existing) return existing;
  const request = Promise.resolve().then(loader);
  requests.set(key, request);
  request.then(
    () => { if (requests.get(key) === request) requests.delete(key); },
    () => { if (requests.get(key) === request) requests.delete(key); },
  );
  return request;
}

module.exports = {
  fetchClientHomeWidget,
  readClientHomeWidgetCache,
  writeClientHomeWidgetCache,
};
