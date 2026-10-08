/**
 * VaRoom Chat Persistent Client Cache (IndexedDB)
 * -----------------------------------------------
 * Provides fast, offline-first client caching for VaRoom Chats:
 * - Inbox conversation list caching with instant render
 * - Per-conversation message caching with background delta sync
 * - Shared chat media caching (images, videos, audio, thumbnails)
 * - LRU eviction and maximum media cache size management
 * - Deduplication and chronological sorting
 * - User-scoped storage isolation
 * - Resilient fallback to memory when IndexedDB is unavailable
 */
(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.VaRoomChatCache = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function () {
  'use strict';

  var DB_NAME = 'varoom_chat_cache';
  var DB_VERSION = 2;
  var STORE_INBOX = 'inbox';
  var STORE_MESSAGES = 'messages';
  var STORE_MEDIA = 'media';
  var MAX_CACHED_MESSAGES = 1000;

  // Media Cache Quotas (50 MB total, 20 MB max single item)
  var MAX_TOTAL_MEDIA_CACHE_SIZE = 50 * 1024 * 1024;
  var MAX_SINGLE_MEDIA_SIZE = 20 * 1024 * 1024;

  // In-memory fallback structures
  var memoryInbox = new Map();
  var memoryMessages = new Map();
  var memoryMedia = new Map();
  var activeObjectUrls = new Map();
  var inFlightMediaFetches = new Map();
  var dbPromise = null;
  var dbFailed = false;

  function isIndexedDBAvailable() {
    try {
      return typeof indexedDB !== 'undefined' && indexedDB !== null;
    } catch (e) {
      return false;
    }
  }

  function safeCreateObjectURL(blob) {
    if (!blob) return null;
    if (typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function') {
      try {
        return URL.createObjectURL(blob);
      } catch (e) {
        return null;
      }
    }
    return null;
  }

  function safeRevokeObjectURL(url) {
    if (url && typeof URL !== 'undefined' && typeof URL.revokeObjectURL === 'function') {
      try {
        URL.revokeObjectURL(url);
      } catch (e) {}
    }
  }

  function openDatabase() {
    if (dbPromise) return dbPromise;
    if (!isIndexedDBAvailable() || dbFailed) {
      return Promise.resolve(null);
    }

    dbPromise = new Promise(function (resolve) {
      try {
        var request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onupgradeneeded = function (event) {
          var db = event.target.result;
          if (!db.objectStoreNames.contains(STORE_INBOX)) {
            db.createObjectStore(STORE_INBOX, { keyPath: 'userId' });
          }
          if (!db.objectStoreNames.contains(STORE_MESSAGES)) {
            db.createObjectStore(STORE_MESSAGES, { keyPath: 'key' });
          }
          if (!db.objectStoreNames.contains(STORE_MEDIA)) {
            var mediaStore = db.createObjectStore(STORE_MEDIA, { keyPath: 'id' });
            mediaStore.createIndex('accessedAt', 'accessedAt', { unique: false });
            mediaStore.createIndex('type', 'type', { unique: false });
          }
        };

        request.onsuccess = function (event) {
          var db = event.target.result;
          db.onversionchange = function () {
            db.close();
            dbPromise = null;
          };
          resolve(db);
        };

        request.onerror = function (event) {
          console.warn('[VaRoomChatCache] IndexedDB open error, falling back to memory:', event.target && event.target.error);
          dbFailed = true;
          resolve(null);
        };

        request.onblocked = function () {
          console.warn('[VaRoomChatCache] IndexedDB open blocked');
          resolve(null);
        };
      } catch (err) {
        console.warn('[VaRoomChatCache] IndexedDB initialization exception:', err);
        dbFailed = true;
        resolve(null);
      }
    });

    return dbPromise;
  }

  function conversationMessageKey(userId, conversationId) {
    return String(userId) + ':' + String(conversationId);
  }

  function cloneData(data) {
    if (data === null || data === undefined) return data;
    try {
      if (typeof structuredClone === 'function') {
        return structuredClone(data);
      }
      return JSON.parse(JSON.stringify(data));
    } catch (err) {
      return data;
    }
  }

  function sortMessagesChronologically(messages) {
    if (!Array.isArray(messages)) return [];
    return messages.slice().sort(function (a, b) {
      var timeA = a && a.created_at ? new Date(a.created_at).getTime() : 0;
      var timeB = b && b.created_at ? new Date(b.created_at).getTime() : 0;
      if (timeA !== timeB) return timeA - timeB;
      var idA = a && a.id ? String(a.id) : '';
      var idB = b && b.id ? String(b.id) : '';
      return idA.localeCompare(idB);
    });
  }

  function mergeMessageLists(existingMessages, incomingMessages) {
    var existing = Array.isArray(existingMessages) ? existingMessages : [];
    var incoming = Array.isArray(incomingMessages) ? incomingMessages : [];
    if (!existing.length) return sortMessagesChronologically(incoming);
    if (!incoming.length) return sortMessagesChronologically(existing);

    var map = new Map();
    for (var i = 0; i < existing.length; i++) {
      var msg = existing[i];
      if (msg && msg.id) {
        map.set(String(msg.id), msg);
      }
    }

    for (var j = 0; j < incoming.length; j++) {
      var inc = incoming[j];
      if (inc && inc.id) {
        var prev = map.get(String(inc.id));
        map.set(String(inc.id), prev ? Object.assign({}, prev, inc) : inc);
      }
    }

    var merged = Array.from(map.values());
    var sorted = sortMessagesChronologically(merged);
    if (sorted.length > MAX_CACHED_MESSAGES) {
      sorted = sorted.slice(sorted.length - MAX_CACHED_MESSAGES);
    }
    return sorted;
  }

  // --- Inbox Operations ---

  function getInbox(userId) {
    if (!userId) return Promise.resolve(null);
    var strUserId = String(userId);

    return openDatabase().then(function (db) {
      if (!db) {
        var mem = memoryInbox.get(strUserId);
        return mem ? cloneData(mem.conversations) : null;
      }

      return new Promise(function (resolve) {
        try {
          var tx = db.transaction(STORE_INBOX, 'readonly');
          var store = tx.objectStore(STORE_INBOX);
          var req = store.get(strUserId);

          req.onsuccess = function () {
            var result = req.result;
            if (result && Array.isArray(result.conversations)) {
              memoryInbox.set(strUserId, { conversations: result.conversations, updatedAt: result.updatedAt });
              resolve(cloneData(result.conversations));
            } else {
              var memFallback = memoryInbox.get(strUserId);
              resolve(memFallback ? cloneData(memFallback.conversations) : null);
            }
          };

          req.onerror = function () {
            var memFallback = memoryInbox.get(strUserId);
            resolve(memFallback ? cloneData(memFallback.conversations) : null);
          };
        } catch (err) {
          var memFallback = memoryInbox.get(strUserId);
          resolve(memFallback ? cloneData(memFallback.conversations) : null);
        }
      });
    });
  }

  function setInbox(userId, conversations) {
    if (!userId || !Array.isArray(conversations)) return Promise.resolve();
    var strUserId = String(userId);
    var record = {
      userId: strUserId,
      conversations: cloneData(conversations),
      updatedAt: Date.now()
    };

    memoryInbox.set(strUserId, record);

    return openDatabase().then(function (db) {
      if (!db) return;
      return new Promise(function (resolve) {
        try {
          var tx = db.transaction(STORE_INBOX, 'readwrite');
          var store = tx.objectStore(STORE_INBOX);
          store.put(record);
          tx.oncomplete = function () { resolve(); };
          tx.onerror = function () { resolve(); };
          tx.onabort = function () { resolve(); };
        } catch (err) {
          resolve();
        }
      });
    });
  }

  function updateInboxConversation(userId, conversationId, patch) {
    if (!userId || !conversationId || !patch) return Promise.resolve();
    return getInbox(userId).then(function (inbox) {
      if (!inbox || !Array.isArray(inbox)) return;
      var found = false;
      var updated = inbox.map(function (c) {
        if (c && c.id === conversationId) {
          found = true;
          return Object.assign({}, c, patch);
        }
        return c;
      });
      if (found) {
        return setInbox(userId, updated);
      }
    });
  }

  // --- Messages Operations ---

  function getMessages(userId, conversationId) {
    if (!userId || !conversationId) return Promise.resolve(null);
    var key = conversationMessageKey(userId, conversationId);

    return openDatabase().then(function (db) {
      if (!db) {
        var mem = memoryMessages.get(key);
        return mem ? cloneData(mem.messages) : null;
      }

      return new Promise(function (resolve) {
        try {
          var tx = db.transaction(STORE_MESSAGES, 'readonly');
          var store = tx.objectStore(STORE_MESSAGES);
          var req = store.get(key);

          req.onsuccess = function () {
            var result = req.result;
            if (result && Array.isArray(result.messages)) {
              memoryMessages.set(key, { messages: result.messages, updatedAt: result.updatedAt });
              resolve(cloneData(result.messages));
            } else {
              var memFallback = memoryMessages.get(key);
              resolve(memFallback ? cloneData(memFallback.messages) : null);
            }
          };

          req.onerror = function () {
            var memFallback = memoryMessages.get(key);
            resolve(memFallback ? cloneData(memFallback.messages) : null);
          };
        } catch (err) {
          var memFallback = memoryMessages.get(key);
          resolve(memFallback ? cloneData(memFallback.messages) : null);
        }
      });
    });
  }

  function setMessages(userId, conversationId, messages) {
    if (!userId || !conversationId || !Array.isArray(messages)) return Promise.resolve();
    var key = conversationMessageKey(userId, conversationId);
    var sorted = sortMessagesChronologically(messages);
    if (sorted.length > MAX_CACHED_MESSAGES) {
      sorted = sorted.slice(sorted.length - MAX_CACHED_MESSAGES);
    }
    var record = {
      key: key,
      userId: String(userId),
      conversationId: String(conversationId),
      messages: cloneData(sorted),
      updatedAt: Date.now()
    };

    memoryMessages.set(key, record);

    return openDatabase().then(function (db) {
      if (!db) return;
      return new Promise(function (resolve) {
        try {
          var tx = db.transaction(STORE_MESSAGES, 'readwrite');
          var store = tx.objectStore(STORE_MESSAGES);
          store.put(record);
          tx.oncomplete = function () { resolve(); };
          tx.onerror = function () { resolve(); };
          tx.onabort = function () { resolve(); };
        } catch (err) {
          resolve();
        }
      });
    });
  }

  function mergeMessages(userId, conversationId, incomingMessages) {
    if (!userId || !conversationId) return Promise.resolve([]);
    return getMessages(userId, conversationId).then(function (existing) {
      var merged = mergeMessageLists(existing || [], incomingMessages || []);
      return setMessages(userId, conversationId, merged).then(function () {
        return merged;
      });
    });
  }

  function appendMessage(userId, conversationId, message) {
    if (!userId || !conversationId || !message) return Promise.resolve();
    return mergeMessages(userId, conversationId, [message]).then(function (merged) {
      return updateInboxConversation(userId, conversationId, {
        lastMessage: message
      }).then(function () {
        return merged;
      });
    });
  }

  function updateMessage(userId, conversationId, messageIdOrObject, patch) {
    if (!userId || !conversationId || !messageIdOrObject) return Promise.resolve();
    var targetId = typeof messageIdOrObject === 'object' && messageIdOrObject !== null ? messageIdOrObject.id : messageIdOrObject;
    var targetPatch = typeof messageIdOrObject === 'object' && messageIdOrObject !== null
      ? (patch ? Object.assign({}, messageIdOrObject, patch) : messageIdOrObject)
      : (patch || {});
    if (!targetId) return Promise.resolve();

    return getMessages(userId, conversationId).then(function (messages) {
      if (!messages || !Array.isArray(messages)) return;
      var changed = false;
      var updated = messages.map(function (msg) {
        if (msg && String(msg.id) === String(targetId)) {
          changed = true;
          return Object.assign({}, msg, targetPatch);
        }
        return msg;
      });
      if (changed) {
        return setMessages(userId, conversationId, updated);
      }
    });
  }

  function removeMessage(userId, conversationId, messageId) {
    if (!userId || !conversationId || !messageId) return Promise.resolve();
    return getMessages(userId, conversationId).then(function (messages) {
      if (!messages || !Array.isArray(messages)) return;
      var filtered = messages.filter(function (msg) {
        return msg && String(msg.id) !== String(messageId);
      });
      if (filtered.length !== messages.length) {
        return setMessages(userId, conversationId, filtered);
      }
    });
  }

  // --- Shared Chat Media Cache Operations ---

  function getMedia(id) {
    if (!id) return Promise.resolve(null);
    var strId = String(id);

    return openDatabase().then(function (db) {
      if (!db) {
        var mem = memoryMedia.get(strId);
        if (!mem) return null;
        mem.accessedAt = Date.now();
        return mem;
      }

      return new Promise(function (resolve) {
        try {
          var tx = db.transaction(STORE_MEDIA, 'readwrite');
          var store = tx.objectStore(STORE_MEDIA);
          var req = store.get(strId);

          req.onsuccess = function () {
            var record = req.result;
            if (record && record.blob) {
              record.accessedAt = Date.now();
              store.put(record);
              memoryMedia.set(strId, record);
              resolve(record);
            } else {
              var memFallback = memoryMedia.get(strId);
              resolve(memFallback || null);
            }
          };

          req.onerror = function () {
            resolve(memoryMedia.get(strId) || null);
          };
        } catch (err) {
          resolve(memoryMedia.get(strId) || null);
        }
      });
    });
  }

  function getMediaUrl(id) {
    if (!id) return Promise.resolve(null);
    var strId = String(id);

    if (activeObjectUrls.has(strId)) {
      var existingUrl = activeObjectUrls.get(strId);
      var mem = memoryMedia.get(strId);
      return Promise.resolve({
        url: existingUrl,
        mimeType: mem ? mem.mimeType : '',
        size: mem ? mem.size : 0,
        blob: mem ? mem.blob : null
      });
    }

    return getMedia(strId).then(function (record) {
      if (!record || !record.blob) return null;
      var objectUrl = safeCreateObjectURL(record.blob);
      if (objectUrl) {
        activeObjectUrls.set(strId, objectUrl);
      }
      return {
        url: objectUrl,
        mimeType: record.mimeType,
        size: record.size,
        blob: record.blob
      };
    }).catch(function (err) {
      console.warn('[VaRoomChatCache] Media retrieval error:', err);
      return null;
    });
  }

  function evictMediaIfNecessary(db, neededBytes) {
    return new Promise(function (resolve) {
      try {
        var tx = db.transaction(STORE_MEDIA, 'readwrite');
        var store = tx.objectStore(STORE_MEDIA);
        var index = store.index('accessedAt');
        var req = index.openCursor();
        var totalSize = 0;
        var items = [];

        req.onsuccess = function (event) {
          var cursor = event.target.result;
          if (cursor) {
            var item = cursor.value;
            totalSize += (item.size || 0);
            items.push({ id: item.id, size: item.size || 0, accessedAt: item.accessedAt });
            cursor.continue();
          } else {
            if (totalSize + neededBytes <= MAX_TOTAL_MEDIA_CACHE_SIZE) {
              resolve();
              return;
            }

            // Evict least recently used items until space is available
            var toEvict = [];
            var sizeAfterEviction = totalSize;
            for (var i = 0; i < items.length; i++) {
              if (sizeAfterEviction + neededBytes <= MAX_TOTAL_MEDIA_CACHE_SIZE) break;
              toEvict.push(items[i].id);
              sizeAfterEviction -= items[i].size;
            }

            toEvict.forEach(function (itemId) {
              store.delete(itemId);
              memoryMedia.delete(itemId);
              if (activeObjectUrls.has(itemId)) {
                safeRevokeObjectURL(activeObjectUrls.get(itemId));
                activeObjectUrls.delete(itemId);
              }
            });

            resolve();
          }
        };

        req.onerror = function () { resolve(); };
      } catch (err) {
        resolve();
      }
    });
  }

  function saveMedia(id, blobOrBuffer, options) {
    if (!id || !blobOrBuffer) return Promise.resolve(null);
    var strId = String(id);
    options = options || {};

    var size = blobOrBuffer.size || (blobOrBuffer.byteLength || 0);
    if (size > MAX_SINGLE_MEDIA_SIZE) {
      // Exceeds single item limit - skip storing in IndexedDB to avoid quota errors
      var directUrl = safeCreateObjectURL(blobOrBuffer);
      return Promise.resolve({ url: directUrl, mimeType: options.mimeType || '', size: size });
    }

    var record = {
      id: strId,
      type: options.type || 'image',
      mimeType: options.mimeType || (blobOrBuffer.type || 'application/octet-stream'),
      blob: blobOrBuffer,
      size: size,
      createdAt: Date.now(),
      accessedAt: Date.now()
    };

    memoryMedia.set(strId, record);
    var objectUrl = safeCreateObjectURL(blobOrBuffer);
    if (objectUrl) {
      activeObjectUrls.set(strId, objectUrl);
    }

    return openDatabase().then(function (db) {
      if (!db) {
        return { url: objectUrl, mimeType: record.mimeType, size: size };
      }

      return evictMediaIfNecessary(db, size).then(function () {
        return new Promise(function (resolve) {
          try {
            var tx = db.transaction(STORE_MEDIA, 'readwrite');
            var store = tx.objectStore(STORE_MEDIA);
            store.put(record);
            tx.oncomplete = function () {
              resolve({ url: objectUrl, mimeType: record.mimeType, size: size });
            };
            tx.onerror = function () {
              resolve({ url: objectUrl, mimeType: record.mimeType, size: size });
            };
            tx.onabort = function () {
              resolve({ url: objectUrl, mimeType: record.mimeType, size: size });
            };
          } catch (err) {
            resolve({ url: objectUrl, mimeType: record.mimeType, size: size });
          }
        });
      });
    }).catch(function (err) {
      console.warn('[VaRoomChatCache] Media save error:', err);
      return { url: objectUrl, mimeType: record.mimeType, size: size };
    });
  }

  function fetchAndCacheMedia(id, remoteUrl, options) {
    if (!id || !remoteUrl) return Promise.resolve(remoteUrl);
    var strId = String(id);
    options = options || {};

    // Check if already cached
    return getMediaUrl(strId).then(function (cached) {
      if (cached && cached.url) {
        return cached.url;
      }

      // Deduplicate concurrent in-flight fetches for the same media
      if (inFlightMediaFetches.has(strId)) {
        return inFlightMediaFetches.get(strId);
      }

      var fetchPromise = fetch(remoteUrl).then(function (response) {
        if (!response.ok) throw new Error('Remote media fetch failed: ' + response.status);
        return response.blob();
      }).then(function (blob) {
        var mimeType = options.mimeType || blob.type || 'application/octet-stream';
        return saveMedia(strId, blob, { type: options.type || 'image', mimeType: mimeType }).then(function (result) {
          return result && result.url ? result.url : remoteUrl;
        });
      }).catch(function (error) {
        console.warn('[VaRoomChatCache] Media caching fallback for ' + strId + ':', error && error.message);
        return remoteUrl;
      }).finally(function () {
        inFlightMediaFetches.delete(strId);
      });

      inFlightMediaFetches.set(strId, fetchPromise);
      return fetchPromise;
    });
  }

  function removeMedia(id) {
    if (!id) return Promise.resolve();
    var strId = String(id);

    if (activeObjectUrls.has(strId)) {
      safeRevokeObjectURL(activeObjectUrls.get(strId));
      activeObjectUrls.delete(strId);
    }
    memoryMedia.delete(strId);

    return openDatabase().then(function (db) {
      if (!db) return;
      return new Promise(function (resolve) {
        try {
          var tx = db.transaction(STORE_MEDIA, 'readwrite');
          tx.objectStore(STORE_MEDIA).delete(strId);
          tx.oncomplete = function () { resolve(); };
          tx.onerror = function () { resolve(); };
        } catch (err) {
          resolve();
        }
      });
    });
  }

  function clearMedia() {
    activeObjectUrls.forEach(function (url) {
      safeRevokeObjectURL(url);
    });
    activeObjectUrls.clear();
    memoryMedia.clear();

    return openDatabase().then(function (db) {
      if (!db) return;
      return new Promise(function (resolve) {
        try {
          var tx = db.transaction(STORE_MEDIA, 'readwrite');
          tx.objectStore(STORE_MEDIA).clear();
          tx.oncomplete = function () { resolve(); };
          tx.onerror = function () { resolve(); };
        } catch (err) {
          resolve();
        }
      });
    });
  }

  function getMediaStats() {
    return openDatabase().then(function (db) {
      if (!db) {
        var memCount = memoryMedia.size;
        var memBytes = 0;
        memoryMedia.forEach(function (val) { memBytes += (val.size || 0); });
        return { count: memCount, totalBytes: memBytes };
      }

      return new Promise(function (resolve) {
        try {
          var tx = db.transaction(STORE_MEDIA, 'readonly');
          var store = tx.objectStore(STORE_MEDIA);
          var req = store.openCursor();
          var count = 0;
          var totalBytes = 0;

          req.onsuccess = function (event) {
            var cursor = event.target.result;
            if (cursor) {
              count++;
              totalBytes += (cursor.value.size || 0);
              cursor.continue();
            } else {
              resolve({ count: count, totalBytes: totalBytes });
            }
          };

          req.onerror = function () {
            resolve({ count: memoryMedia.size, totalBytes: 0 });
          };
        } catch (err) {
          resolve({ count: memoryMedia.size, totalBytes: 0 });
        }
      });
    });
  }

  // --- Cache Invalidation & Session Cleanup ---

  function clearUser(userId) {
    if (!userId) return Promise.resolve();
    var strUserId = String(userId);
    memoryInbox.delete(strUserId);

    // Remove user keys from memoryMessages
    var prefix = strUserId + ':';
    memoryMessages.forEach(function (_, key) {
      if (key.indexOf(prefix) === 0) {
        memoryMessages.delete(key);
      }
    });

    return openDatabase().then(function (db) {
      if (!db) return;
      return new Promise(function (resolve) {
        try {
          var tx = db.transaction([STORE_INBOX, STORE_MESSAGES], 'readwrite');
          var inboxStore = tx.objectStore(STORE_INBOX);
          var messagesStore = tx.objectStore(STORE_MESSAGES);

          inboxStore.delete(strUserId);

          var req = messagesStore.openCursor();
          req.onsuccess = function (event) {
            var cursor = event.target.result;
            if (cursor) {
              if (cursor.value && cursor.value.userId === strUserId) {
                cursor.delete();
              }
              cursor.continue();
            }
          };

          tx.oncomplete = function () { resolve(); };
          tx.onerror = function () { resolve(); };
          tx.onabort = function () { resolve(); };
        } catch (err) {
          resolve();
        }
      });
    });
  }

  function clearAll() {
    activeObjectUrls.forEach(function (url) {
      safeRevokeObjectURL(url);
    });
    activeObjectUrls.clear();
    memoryInbox.clear();
    memoryMessages.clear();
    memoryMedia.clear();

    return openDatabase().then(function (db) {
      if (!db) return;
      return new Promise(function (resolve) {
        try {
          var tx = db.transaction([STORE_INBOX, STORE_MESSAGES, STORE_MEDIA], 'readwrite');
          tx.objectStore(STORE_INBOX).clear();
          tx.objectStore(STORE_MESSAGES).clear();
          tx.objectStore(STORE_MEDIA).clear();
          tx.oncomplete = function () { resolve(); };
          tx.onerror = function () { resolve(); };
          tx.onabort = function () { resolve(); };
        } catch (err) {
          resolve();
        }
      });
    });
  }

  return {
    DB_NAME: DB_NAME,
    DB_VERSION: DB_VERSION,
    MAX_TOTAL_MEDIA_CACHE_SIZE: MAX_TOTAL_MEDIA_CACHE_SIZE,
    MAX_SINGLE_MEDIA_SIZE: MAX_SINGLE_MEDIA_SIZE,
    isSupported: isIndexedDBAvailable,
    getInbox: getInbox,
    setInbox: setInbox,
    updateInboxConversation: updateInboxConversation,
    getMessages: getMessages,
    setMessages: setMessages,
    mergeMessages: mergeMessages,
    appendMessage: appendMessage,
    updateMessage: updateMessage,
    removeMessage: removeMessage,
    getMedia: getMedia,
    getMediaUrl: getMediaUrl,
    saveMedia: saveMedia,
    fetchAndCacheMedia: fetchAndCacheMedia,
    removeMedia: removeMedia,
    clearMedia: clearMedia,
    getMediaStats: getMediaStats,
    clearUser: clearUser,
    clearAll: clearAll
  };
});
