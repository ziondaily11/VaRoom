/**
 * VaRoom Chat Persistent Client Cache (IndexedDB)
 * -----------------------------------------------
 * Provides fast, offline-first client caching for VaRoom Chats:
 * - Inbox conversation list caching with instant render
 * - Per-conversation message caching with background delta sync
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
  var DB_VERSION = 1;
  var STORE_INBOX = 'inbox';
  var STORE_MESSAGES = 'messages';
  var MAX_CACHED_MESSAGES = 1000;

  // In-memory fallback structures
  var memoryInbox = new Map();
  var memoryMessages = new Map();
  var dbPromise = null;
  var dbFailed = false;

  function isIndexedDBAvailable() {
    try {
      return typeof indexedDB !== 'undefined' && indexedDB !== null;
    } catch (e) {
      return false;
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
      // Also update inbox lastMessage preview if inbox is cached
      return updateInboxConversation(userId, conversationId, {
        lastMessage: message
      }).then(function () {
        return merged;
      });
    });
  }

  function updateMessage(userId, conversationId, messageId, patch) {
    if (!userId || !conversationId || !messageId || !patch) return Promise.resolve();
    return getMessages(userId, conversationId).then(function (messages) {
      if (!messages || !Array.isArray(messages)) return;
      var changed = false;
      var updated = messages.map(function (msg) {
        if (msg && String(msg.id) === String(messageId)) {
          changed = true;
          return Object.assign({}, msg, patch);
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
    memoryInbox.clear();
    memoryMessages.clear();

    return openDatabase().then(function (db) {
      if (!db) return;
      return new Promise(function (resolve) {
        try {
          var tx = db.transaction([STORE_INBOX, STORE_MESSAGES], 'readwrite');
          tx.objectStore(STORE_INBOX).clear();
          tx.objectStore(STORE_MESSAGES).clear();
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
    clearUser: clearUser,
    clearAll: clearAll
  };
});
