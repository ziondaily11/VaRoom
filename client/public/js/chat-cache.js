/**
 * VaRoom Chat Persistent Client Cache (IndexedDB)
 * -----------------------------------------------
 * Provides fast, offline-first client caching for VaRoom Chats:
 * - Inbox conversation list caching with instant render
 * - Per-conversation message caching with background delta sync
 * - Background Chat Prefetch (low-priority, non-blocking, asynchronous)
 * - In-flight request deduplication across prefetch and UI operations
 * - Shared chat media caching (images, videos, audio, thumbnails)
 * - LRU eviction and maximum media cache size management (50MB quota)
 * - Deduplication and chronological sorting
 * - User-scoped storage isolation & cleanup on sign-out
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

  // Background Prefetch Constants
  var DEFAULT_PREFETCH_CONVERSATIONS = 4;
  var PREFETCH_COOLDOWN_MS = 60 * 1000; // 60s cooldown

  // In-memory fallback structures
  var memoryInbox = new Map();
  var memoryMessages = new Map();
  var memoryMedia = new Map();
  var activeObjectUrls = new Map();
  var inFlightMediaFetches = new Map();

  // In-flight sync request deduplication
  var inFlightInboxSync = new Map();
  var inFlightConversationSyncs = new Map();

  // Prefetch execution state
  var prefetchState = {
    inProgress: false,
    currentUserId: null,
    lastPrefetchTime: 0,
    activePromise: null,
    cancelled: false
  };

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

  async function resolveAuthToken(options) {
    options = options || {};
    if (options.accessToken) return options.accessToken;
    if (options.supabaseClient && options.supabaseClient.auth) {
      try {
        var sessRes = await options.supabaseClient.auth.getSession();
        if (sessRes && sessRes.data && sessRes.data.session) {
          return sessRes.data.session.access_token;
        }
      } catch (e) {}
    }
    if (typeof window !== 'undefined' && window.supabaseClient && window.supabaseClient.auth) {
      try {
        var sessRes2 = await window.supabaseClient.auth.getSession();
        if (sessRes2 && sessRes2.data && sessRes2.data.session) {
          return sessRes2.data.session.access_token;
        }
      } catch (e) {}
    }
    return null;
  }

  /**
   * Synchronize inbox conversations from server with in-flight request deduplication.
   */
  function syncInbox(userId, options) {
    if (!userId) return Promise.resolve([]);
    var strUserId = String(userId);
    options = options || {};

    if (inFlightInboxSync.has(strUserId)) {
      return inFlightInboxSync.get(strUserId);
    }

    var syncPromise = (async function () {
      try {
        var conversations = null;
        if (typeof options.fetchFn === 'function') {
          var res = await options.fetchFn('/api/chat/conversations');
          conversations = res && res.conversations ? res.conversations : (Array.isArray(res) ? res : []);
        } else {
          var token = await resolveAuthToken(options);
          if (!token) {
            var cached = await getInbox(strUserId);
            return cached || [];
          }
          var headers = { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token };
          var response = await fetch('/api/chat/conversations', { headers: headers });
          if (!response.ok) throw new Error('Inbox sync HTTP ' + response.status);
          var data = await response.json();
          conversations = data && data.conversations ? data.conversations : [];
        }

        if (Array.isArray(conversations)) {
          await setInbox(strUserId, conversations);
          return cloneData(conversations);
        }
        var currentCached = await getInbox(strUserId);
        return currentCached || [];
      } catch (err) {
        console.warn('[VaRoomChatCache] Inbox sync warning:', err && err.message);
        var fallback = await getInbox(strUserId);
        return fallback || [];
      } finally {
        inFlightInboxSync.delete(strUserId);
      }
    })();

    inFlightInboxSync.set(strUserId, syncPromise);
    return syncPromise;
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

  /**
   * Synchronize conversation messages with server using delta query and request deduplication.
   */
  function syncConversationMessages(userId, conversationId, options) {
    if (!userId || !conversationId) return Promise.resolve([]);
    var strUserId = String(userId);
    var strConvId = String(conversationId);
    var key = conversationMessageKey(strUserId, strConvId);
    options = options || {};

    if (inFlightConversationSyncs.has(key)) {
      return inFlightConversationSyncs.get(key);
    }

    var syncPromise = (async function () {
      try {
        var cached = await getMessages(strUserId, strConvId);
        var newestCached = cached && cached.length ? cached[cached.length - 1] : null;
        var fetchUrl = '/api/chat/conversations/' + encodeURIComponent(strConvId) + '/messages';
        var isDelta = false;
        if (newestCached && newestCached.created_at) {
          fetchUrl += '?since=' + encodeURIComponent(newestCached.created_at);
          isDelta = true;
        }

        var incomingMessages = [];
        if (typeof options.fetchFn === 'function') {
          var res = await options.fetchFn(fetchUrl);
          incomingMessages = res && res.messages ? res.messages : (Array.isArray(res) ? res : []);
        } else {
          var token = await resolveAuthToken(options);
          if (!token) {
            return cached || [];
          }
          var headers = { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token };
          var response = await fetch(fetchUrl, { headers: headers });
          if (!response.ok) throw new Error('Conversation messages sync HTTP ' + response.status);
          var data = await response.json();
          incomingMessages = data && data.messages ? data.messages : [];
        }

        var finalMessages = [];
        if (isDelta && cached && cached.length) {
          if (incomingMessages && incomingMessages.length) {
            finalMessages = await mergeMessages(strUserId, strConvId, incomingMessages);
          } else {
            finalMessages = cached;
          }
        } else {
          finalMessages = incomingMessages || [];
          await setMessages(strUserId, strConvId, finalMessages);
        }

        if (finalMessages && finalMessages.length) {
          var latestMsg = finalMessages[finalMessages.length - 1];
          if (latestMsg) {
            updateInboxConversation(strUserId, strConvId, { lastMessage: latestMsg }).catch(function () {});
          }
        }

        return cloneData(finalMessages);
      } catch (err) {
        console.warn('[VaRoomChatCache] Conversation sync warning:', err && err.message);
        var fallback = await getMessages(strUserId, strConvId);
        return fallback || [];
      } finally {
        inFlightConversationSyncs.delete(key);
      }
    })();

    inFlightConversationSyncs.set(key, syncPromise);
    return syncPromise;
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

    return getMediaUrl(strId).then(function (cached) {
      if (cached && cached.url) {
        return cached.url;
      }

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

  // --- Background Chat Prefetch ---

  function scheduleIdleTask(callback, timeoutMs) {
    if (typeof window !== 'undefined' && typeof window.requestIdleCallback === 'function') {
      return window.requestIdleCallback(callback, { timeout: timeoutMs || 2500 });
    }
    return setTimeout(callback, 200);
  }

  function cancelPrefetch() {
    prefetchState.cancelled = true;
    prefetchState.inProgress = false;
  }

  function isPrefetching() {
    return prefetchState.inProgress;
  }

  /**
   * Performs low-priority, non-blocking background Chats prefetching.
   * Priority 1: Fetch lightweight inbox
   * Priority 2: Fetch recent messages for top active conversations
   * Priority 3: Pre-cache lightweight thumbnails/previews
   */
  function prefetch(userId, options) {
    if (!userId) return Promise.resolve({ success: false, reason: 'no-user' });
    var strUserId = String(userId);
    options = options || {};
    var cooldown = options.cooldownMs || PREFETCH_COOLDOWN_MS;
    var maxConversations = options.priorityCount || DEFAULT_PREFETCH_CONVERSATIONS;

    if (prefetchState.inProgress && prefetchState.currentUserId === strUserId) {
      return prefetchState.activePromise || Promise.resolve({ success: true, reason: 'in-progress' });
    }

    var now = Date.now();
    if (prefetchState.currentUserId === strUserId && (now - prefetchState.lastPrefetchTime) < cooldown) {
      return Promise.resolve({ success: true, skipped: true, reason: 'cooldown-active' });
    }

    prefetchState.cancelled = false;
    prefetchState.inProgress = true;
    prefetchState.currentUserId = strUserId;

    var prefetchPromise = new Promise(function (resolve) {
      scheduleIdleTask(async function () {
        if (prefetchState.cancelled || prefetchState.currentUserId !== strUserId) {
          prefetchState.inProgress = false;
          resolve({ success: false, reason: 'cancelled' });
          return;
        }

        try {
          // Priority 1: Fetch lightweight inbox data
          var conversations = await syncInbox(strUserId, options);
          if (prefetchState.cancelled || prefetchState.currentUserId !== strUserId) {
            prefetchState.inProgress = false;
            resolve({ success: false, reason: 'cancelled' });
            return;
          }

          var prefetchedCount = 0;
          if (Array.isArray(conversations) && conversations.length > 0) {
            // Priority 2: Select the top most active/recent conversations
            var recentConversations = conversations.slice(0, maxConversations);

            for (var i = 0; i < recentConversations.length; i++) {
              if (prefetchState.cancelled || prefetchState.currentUserId !== strUserId) break;
              var conv = recentConversations[i];
              if (!conv || !conv.id) continue;

              // Synchronize newest messages for this conversation
              var messages = await syncConversationMessages(strUserId, conv.id, options);
              prefetchedCount++;

              // Priority 3: Lightweight thumbnail pre-caching if present
              if (messages && messages.length && !options.skipMedia) {
                var lastFew = messages.slice(-3);
                for (var m = 0; m < lastFew.length; m++) {
                  var msg = lastFew[m];
                  if (msg && msg.listing_id && msg.listing && msg.listing.thumbnail_url) {
                    var thumbKey = 'listing-thumb:' + msg.listing_id;
                    fetchAndCacheMedia(thumbKey, msg.listing.thumbnail_url, { type: 'image' }).catch(function () {});
                  }
                }
              }

              // Yield to event loop between conversation syncs
              await new Promise(function (r) { setTimeout(r, 40); });
            }
          }

          prefetchState.lastPrefetchTime = Date.now();
          prefetchState.inProgress = false;
          resolve({ success: true, prefetchedConversations: prefetchedCount });
        } catch (err) {
          console.warn('[VaRoomChatCache] Background prefetch warning:', err && err.message);
          prefetchState.inProgress = false;
          resolve({ success: false, error: err && err.message });
        }
      }, 3000);
    });

    prefetchState.activePromise = prefetchPromise;
    return prefetchPromise;
  }

  // --- Cache Invalidation & Session Cleanup ---

  function clearUser(userId) {
    if (!userId) return Promise.resolve();
    var strUserId = String(userId);

    if (prefetchState.currentUserId === strUserId) {
      cancelPrefetch();
    }

    inFlightInboxSync.delete(strUserId);
    memoryInbox.delete(strUserId);

    var prefix = strUserId + ':';
    memoryMessages.forEach(function (_, key) {
      if (key.indexOf(prefix) === 0) {
        memoryMessages.delete(key);
      }
    });
    inFlightConversationSyncs.forEach(function (_, key) {
      if (key.indexOf(prefix) === 0) {
        inFlightConversationSyncs.delete(key);
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
    cancelPrefetch();
    inFlightInboxSync.clear();
    inFlightConversationSyncs.clear();
    inFlightMediaFetches.clear();

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
    syncInbox: syncInbox,
    updateInboxConversation: updateInboxConversation,
    getMessages: getMessages,
    setMessages: setMessages,
    syncConversationMessages: syncConversationMessages,
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
    prefetch: prefetch,
    cancelPrefetch: cancelPrefetch,
    isPrefetching: isPrefetching,
    clearUser: clearUser,
    clearAll: clearAll
  };
});
