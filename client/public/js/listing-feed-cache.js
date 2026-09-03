/*
 * Small, framework-free cache for the legacy dashboard feeds.
 *
 * These pages are full page navigations, so component-local state disappears
 * whenever a user opens Settings, Bookings, or Chat. sessionStorage gives the
 * feed a per-tab lifetime without exposing one user's cached listings to the
 * next signed-in user (callers include the user id in their cache key).
 */
(function (window) {
  'use strict';

  var STORAGE_PREFIX = 'varoom:listings:feed:v1:';
  var PAGE_SIZE = 12;
  var STALE_AFTER_MS = 5 * 60 * 1000;
  var memory = Object.create(null);
  var requests = Object.create(null);

  function storageKey(key) {
    return STORAGE_PREFIX + encodeURIComponent(key);
  }

  function blankEntry() {
    return {
      version: 1,
      updatedAt: 0,
      pages: {},
      endOffset: null
    };
  }

  function validPage(page) {
    return Array.isArray(page) && page.every(function (listing) {
      return listing && listing.id;
    });
  }

  function normalise(entry) {
    if (!entry || entry.version !== 1 || !entry.pages || typeof entry.pages !== 'object') {
      return blankEntry();
    }
    Object.keys(entry.pages).forEach(function (offset) {
      if (!validPage(entry.pages[offset])) delete entry.pages[offset];
    });
    if (typeof entry.updatedAt !== 'number') entry.updatedAt = 0;
    if (typeof entry.endOffset !== 'number') entry.endOffset = null;
    return entry;
  }

  function read(key) {
    if (memory[key]) return memory[key];
    var entry = blankEntry();
    try {
      var raw = window.sessionStorage.getItem(storageKey(key));
      if (raw) entry = normalise(JSON.parse(raw));
    } catch (error) {
      // A disabled or full storage area should not prevent the feed loading.
      entry = blankEntry();
    }
    memory[key] = entry;
    return entry;
  }

  function write(key, entry) {
    memory[key] = entry;
    try {
      window.sessionStorage.setItem(storageKey(key), JSON.stringify(entry));
    } catch (error) {
      // Keep the in-memory version for this page if browser storage is full.
    }
  }

  function orderedItems(entry) {
    var seen = Object.create(null);
    var items = [];
    Object.keys(entry.pages)
      .map(function (offset) { return Number(offset); })
      .sort(function (a, b) { return a - b; })
      .forEach(function (offset) {
        entry.pages[offset].forEach(function (listing) {
          if (!seen[listing.id]) {
            seen[listing.id] = true;
            items.push(listing);
          }
        });
      });
    return items;
  }

  function nextOffset(entry) {
    var offset = 0;
    while (true) {
      var page = entry.pages[offset];
      if (!page) return offset;
      if (entry.endOffset === offset || page.length < PAGE_SIZE) return null;
      offset += PAGE_SIZE;
    }
  }

  function snapshot(key) {
    var entry = read(key);
    return {
      items: orderedItems(entry),
      hasCachedPage: Object.keys(entry.pages).length > 0,
      updatedAt: entry.updatedAt,
      isStale: !entry.updatedAt || (Date.now() - entry.updatedAt) > STALE_AFTER_MS,
      nextOffset: nextOffset(entry),
      hasMore: nextOffset(entry) !== null
    };
  }

  function resultParts(result) {
    if (Array.isArray(result)) return { data: result, hasMore: undefined };
    result = result || {};
    if (result.error) throw result.error;
    return { data: Array.isArray(result.data) ? result.data : [], hasMore: result.hasMore };
  }

  function fetchPage(key, offset, requestPage, options) {
    options = options || {};
    var entry = read(key);
    if (!options.force && entry.pages[offset]) return Promise.resolve(snapshot(key));

    var requestKey = key + ':' + offset;
    if (requests[requestKey]) return requests[requestKey];

    requests[requestKey] = Promise.resolve()
      .then(function () { return requestPage(offset, PAGE_SIZE); })
      .then(function (result) {
        var parts = resultParts(result);
        var seen = Object.create(null);
        entry.pages[offset] = parts.data.filter(function (listing) {
          if (!listing || !listing.id || seen[listing.id]) return false;
          seen[listing.id] = true;
          return true;
        });
        if (parts.hasMore === false || entry.pages[offset].length < PAGE_SIZE) {
          entry.endOffset = offset;
        } else if (entry.endOffset !== null && offset <= entry.endOffset) {
          entry.endOffset = null;
        }
        entry.updatedAt = Date.now();
        write(key, entry);
        return snapshot(key);
      })
      .finally(function () {
        delete requests[requestKey];
      });

    return requests[requestKey];
  }

  function prefetchNext(key, requestPage) {
    var entry = read(key);
    var offset = nextOffset(entry);
    if (offset === null) return Promise.resolve(snapshot(key));
    return fetchPage(key, offset, requestPage);
  }

  function revalidate(key, requestPage) {
    if (!read(key).pages[0]) return Promise.resolve(snapshot(key));
    return fetchPage(key, 0, requestPage, { force: true });
  }

  function eachEntry(callback) {
    Object.keys(memory).forEach(function (key) { callback(key, read(key)); });
    try {
      for (var index = 0; index < window.sessionStorage.length; index += 1) {
        var keyName = window.sessionStorage.key(index);
        if (!keyName || keyName.indexOf(STORAGE_PREFIX) !== 0) continue;
        var feedKey = decodeURIComponent(keyName.slice(STORAGE_PREFIX.length));
        if (!memory[feedKey]) callback(feedKey, read(feedKey));
      }
    } catch (error) {
      // In-memory cache is still enough when sessionStorage is unavailable.
    }
  }

  function updateListing(id, patch) {
    eachEntry(function (key, entry) {
      var changed = false;
      Object.keys(entry.pages).forEach(function (offset) {
        entry.pages[offset] = entry.pages[offset].map(function (listing) {
          if (listing.id !== id) return listing;
          changed = true;
          return Object.assign({}, listing, patch);
        });
      });
      if (changed) {
        entry.updatedAt = Date.now();
        write(key, entry);
      }
    });
  }

  function removeListing(id) {
    eachEntry(function (key, entry) {
      var changed = false;
      Object.keys(entry.pages).forEach(function (offset) {
        var page = entry.pages[offset];
        var nextPage = page.filter(function (listing) { return listing.id !== id; });
        if (nextPage.length !== page.length) {
          entry.pages[offset] = nextPage;
          changed = true;
        }
      });
      if (changed) {
        // Ranges may shift after a deletion, so revalidate the first page on
        // the next visit while still rendering the corrected cache now.
        entry.updatedAt = 0;
        write(key, entry);
      }
    });
  }

  function invalidateAll() {
    eachEntry(function (key, entry) {
      entry.updatedAt = 0;
      write(key, entry);
    });
  }

  window.VaRoomListingFeedCache = {
    pageSize: PAGE_SIZE,
    staleAfterMs: STALE_AFTER_MS,
    snapshot: snapshot,
    fetchPage: fetchPage,
    prefetchNext: prefetchNext,
    revalidate: revalidate,
    updateListing: updateListing,
    removeListing: removeListing,
    invalidateAll: invalidateAll
  };
})(window);
