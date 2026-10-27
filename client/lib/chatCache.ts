/**
 * VaRoom Chat Persistent Client Cache (TypeScript / IndexedDB & Memory)
 * ---------------------------------------------------------------------
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

export interface ChatParticipant {
  id: string;
  full_name?: string | null;
  username?: string | null;
  avatar_url?: string | null;
  phone?: string | null;
  role?: string | null;
}

export interface ChatAttachment {
  id: string;
  original_filename?: string | null;
  mime_type?: string | null;
  file_size_bytes?: number | null;
  kind: 'photo' | 'file' | 'voice' | string;
  status: 'pending' | 'ready' | 'failed' | 'deleted' | string;
  storage_key?: string | null;
}

export interface ChatListingSummary {
  id: string;
  title?: string | null;
  location_text?: string | null;
  category?: string | null;
  thumbnail_url?: string | null;
  listing_photos?: Array<{ storage_path: string }>;
}

export interface ChatReplyMessage {
  id: string;
  sender_id: string;
  body?: string | null;
  deleted_at?: string | null;
}

export interface ChatMessage {
  id: string;
  conversation_id: string;
  sender_id: string;
  body?: string | null;
  message_type?: 'text' | 'photo' | 'file' | 'voice' | 'listing' | string;
  attachment_id?: string | null;
  attachment?: ChatAttachment | null;
  listing_id?: string | null;
  listing?: ChatListingSummary | null;
  reply_to_message_id?: string | null;
  reply_to_message?: ChatReplyMessage | null;
  created_at: string;
  read_at?: string | null;
  deleted_at?: string | null;
  pinned_at?: string | null;
  ciphertext?: string | null;
  iv?: string | null;
  key_version?: number | null;
}

export interface ChatConversation {
  id: string;
  listing_id?: string | null;
  host_id?: string | null;
  client_id?: string | null;
  created_at?: string | null;
  participant?: ChatParticipant | null;
  lastMessage?: ChatMessage | null;
  isElie?: boolean;
}

export interface MediaRecord {
  id: string;
  type: string;
  mimeType: string;
  blob: Blob | any;
  size: number;
  createdAt: number;
  accessedAt: number;
}

export interface MediaUrlResult {
  url: string | null;
  mimeType: string;
  size: number;
  blob: Blob | any;
}

export interface MediaStatsResult {
  count: number;
  totalBytes: number;
}

export interface ChatSyncOptions {
  accessToken?: string;
  supabaseClient?: any;
  fetchFn?: (url: string) => Promise<any>;
  cooldownMs?: number;
  priorityCount?: number;
  skipMedia?: boolean;
}

export interface PrefetchResult {
  success: boolean;
  prefetchedConversations?: number;
  skipped?: boolean;
  reason?: string;
  error?: string;
}

export const DB_NAME = 'varoom_chat_cache';
export const DB_VERSION = 2;
export const STORE_INBOX = 'inbox';
export const STORE_MESSAGES = 'messages';
export const STORE_MEDIA = 'media';
export const MAX_CACHED_MESSAGES = 1000;

// Media Cache Quotas (50 MB total, 20 MB max single item)
export const MAX_TOTAL_MEDIA_CACHE_SIZE = 50 * 1024 * 1024;
export const MAX_SINGLE_MEDIA_SIZE = 20 * 1024 * 1024;

// Background Prefetch Constants
const DEFAULT_PREFETCH_CONVERSATIONS = 4;
const PREFETCH_COOLDOWN_MS = 60 * 1000; // 60s cooldown

// In-memory fallback structures
const memoryInbox = new Map<string, { userId: string; conversations: ChatConversation[]; updatedAt: number }>();
const memoryMessages = new Map<string, { key: string; userId: string; conversationId: string; messages: ChatMessage[]; updatedAt: number }>();
const memoryMedia = new Map<string, MediaRecord>();
const activeObjectUrls = new Map<string, string>();
const inFlightMediaFetches = new Map<string, Promise<string | null>>();

// In-flight sync request deduplication
const inFlightInboxSync = new Map<string, Promise<ChatConversation[]>>();
const inFlightConversationSyncs = new Map<string, Promise<ChatMessage[]>>();

// Prefetch execution state
const prefetchState = {
  inProgress: false,
  currentUserId: null as string | null,
  lastPrefetchTime: 0,
  activePromise: null as Promise<PrefetchResult> | null,
  cancelled: false,
};

let dbPromise: Promise<IDBDatabase | null> | null = null;
let dbFailed = false;

export function isIndexedDBAvailable(): boolean {
  try {
    return typeof indexedDB !== 'undefined' && indexedDB !== null;
  } catch {
    return false;
  }
}

function safeCreateObjectURL(blob: any): string | null {
  if (!blob) return null;
  if (typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function') {
    try {
      return URL.createObjectURL(blob);
    } catch {
      return null;
    }
  }
  return null;
}

function safeRevokeObjectURL(url: string | null): void {
  if (url && typeof URL !== 'undefined' && typeof URL.revokeObjectURL === 'function') {
    try {
      URL.revokeObjectURL(url);
    } catch {}
  }
}

function openDatabase(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise;
  if (!isIndexedDBAvailable() || dbFailed) {
    return Promise.resolve(null);
  }

  dbPromise = new Promise((resolve) => {
    try {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event: any) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains(STORE_INBOX)) {
          db.createObjectStore(STORE_INBOX, { keyPath: 'userId' });
        }
        if (!db.objectStoreNames.contains(STORE_MESSAGES)) {
          db.createObjectStore(STORE_MESSAGES, { keyPath: 'key' });
        }
        if (!db.objectStoreNames.contains(STORE_MEDIA)) {
          const mediaStore = db.createObjectStore(STORE_MEDIA, { keyPath: 'id' });
          mediaStore.createIndex('accessedAt', 'accessedAt', { unique: false });
          mediaStore.createIndex('type', 'type', { unique: false });
        }
      };

      request.onsuccess = (event: any) => {
        const db = event.target.result;
        db.onversionchange = () => {
          db.close();
          dbPromise = null;
        };
        resolve(db);
      };

      request.onerror = (event: any) => {
        console.warn('[VaRoomChatCache] IndexedDB open error, falling back to memory:', event.target && event.target.error);
        dbFailed = true;
        resolve(null);
      };

      request.onblocked = () => {
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

function conversationMessageKey(userId: string | number, conversationId: string | number): string {
  return String(userId) + ':' + String(conversationId);
}

function cloneData<T>(data: T): T {
  if (data === null || data === undefined) return data;
  try {
    if (typeof structuredClone === 'function') {
      return structuredClone(data);
    }
    return JSON.parse(JSON.stringify(data));
  } catch {
    return data;
  }
}

export function sortMessagesChronologically(messages: ChatMessage[]): ChatMessage[] {
  if (!Array.isArray(messages)) return [];
  return messages.slice().sort((a, b) => {
    const timeA = a && a.created_at ? new Date(a.created_at).getTime() : 0;
    const timeB = b && b.created_at ? new Date(b.created_at).getTime() : 0;
    if (timeA !== timeB) return timeA - timeB;
    const idA = a && a.id ? String(a.id) : '';
    const idB = b && b.id ? String(b.id) : '';
    return idA.localeCompare(idB);
  });
}

export function mergeMessageLists(existingMessages: ChatMessage[], incomingMessages: ChatMessage[]): ChatMessage[] {
  const existing = Array.isArray(existingMessages) ? existingMessages : [];
  const incoming = Array.isArray(incomingMessages) ? incomingMessages : [];
  if (!existing.length) return sortMessagesChronologically(incoming);
  if (!incoming.length) return sortMessagesChronologically(existing);

  const map = new Map<string, ChatMessage>();
  for (let i = 0; i < existing.length; i++) {
    const msg = existing[i];
    if (msg && msg.id) {
      map.set(String(msg.id), msg);
    }
  }

  for (let j = 0; j < incoming.length; j++) {
    const inc = incoming[j];
    if (inc && inc.id) {
      const prev = map.get(String(inc.id));
      map.set(String(inc.id), prev ? Object.assign({}, prev, inc) : inc);
    }
  }

  const merged = Array.from(map.values());
  const sorted = sortMessagesChronologically(merged);
  if (sorted.length > MAX_CACHED_MESSAGES) {
    return sorted.slice(sorted.length - MAX_CACHED_MESSAGES);
  }
  return sorted;
}

// --- Inbox Operations ---

export function getInbox(userId: string | number): Promise<ChatConversation[] | null> {
  if (!userId) return Promise.resolve(null);
  const strUserId = String(userId);

  return openDatabase().then((db) => {
    if (!db) {
      const mem = memoryInbox.get(strUserId);
      return mem ? cloneData(mem.conversations) : null;
    }

    return new Promise<ChatConversation[] | null>((resolve) => {
      try {
        const tx = db.transaction(STORE_INBOX, 'readonly');
        const store = tx.objectStore(STORE_INBOX);
        const req = store.get(strUserId);

        req.onsuccess = () => {
          const result = req.result;
          if (result && Array.isArray(result.conversations)) {
            memoryInbox.set(strUserId, { userId: strUserId, conversations: result.conversations, updatedAt: result.updatedAt });
            resolve(cloneData(result.conversations));
          } else {
            const memFallback = memoryInbox.get(strUserId);
            resolve(memFallback ? cloneData(memFallback.conversations) : null);
          }
        };

        req.onerror = () => {
          const memFallback = memoryInbox.get(strUserId);
          resolve(memFallback ? cloneData(memFallback.conversations) : null);
        };
      } catch {
        const memFallback = memoryInbox.get(strUserId);
        resolve(memFallback ? cloneData(memFallback.conversations) : null);
      }
    });
  });
}

export function setInbox(userId: string | number, conversations: ChatConversation[]): Promise<void> {
  if (!userId || !Array.isArray(conversations)) return Promise.resolve();
  const strUserId = String(userId);
  const record = {
    userId: strUserId,
    conversations: cloneData(conversations),
    updatedAt: Date.now(),
  };

  memoryInbox.set(strUserId, record);

  return openDatabase().then((db) => {
    if (!db) return;
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(STORE_INBOX, 'readwrite');
        const store = tx.objectStore(STORE_INBOX);
        store.put(record);
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
        tx.onabort = () => resolve();
      } catch {
        resolve();
      }
    });
  });
}

export function updateInboxConversation(
  userId: string | number,
  conversationId: string | number,
  patch: Partial<ChatConversation>
): Promise<void> {
  if (!userId || !conversationId || !patch) return Promise.resolve();
  const strConvId = String(conversationId);
  return getInbox(userId).then((inbox) => {
    if (!inbox || !Array.isArray(inbox)) return;
    let found = false;
    const updated = inbox.map((c) => {
      if (c && String(c.id) === strConvId) {
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

async function resolveAuthToken(options?: ChatSyncOptions): Promise<string | null> {
  options = options || {};
  if (options.accessToken) return options.accessToken;
  if (options.supabaseClient && options.supabaseClient.auth) {
    try {
      const sessRes = await options.supabaseClient.auth.getSession();
      if (sessRes && sessRes.data && sessRes.data.session) {
        return sessRes.data.session.access_token;
      }
    } catch {}
  }
  if (typeof window !== 'undefined' && (window as any).supabaseClient?.auth) {
    try {
      const globalSess = await (window as any).supabaseClient.auth.getSession();
      if (globalSess && globalSess.data && globalSess.data.session) {
        return globalSess.data.session.access_token;
      }
    } catch {}
  }
  return null;
}

export function syncInbox(userId: string | number, options?: ChatSyncOptions): Promise<ChatConversation[]> {
  if (!userId) return Promise.resolve([]);
  const strUserId = String(userId);
  options = options || {};

  if (inFlightInboxSync.has(strUserId)) {
    return inFlightInboxSync.get(strUserId)!;
  }

  const syncPromise = (async () => {
    try {
      let conversations: ChatConversation[] = [];
      if (typeof options.fetchFn === 'function') {
        const res = await options.fetchFn('/api/chat/conversations');
        conversations = res && res.conversations ? res.conversations : (Array.isArray(res) ? res : []);
      } else {
        const token = await resolveAuthToken(options);
        if (!token) {
          const cached = await getInbox(strUserId);
          return cached || [];
        }
        const headers: Record<string, string> = { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token };
        const response = await fetch('/api/chat/conversations', { headers });
        if (!response.ok) throw new Error('Inbox sync HTTP ' + response.status);
        const data = await response.json();
        conversations = data && data.conversations ? data.conversations : [];
      }

      if (Array.isArray(conversations)) {
        await setInbox(strUserId, conversations);
        return cloneData(conversations);
      }
      const currentCached = await getInbox(strUserId);
      return currentCached || [];
    } catch (err: any) {
      console.warn('[VaRoomChatCache] Inbox sync warning:', err && err.message);
      const fallback = await getInbox(strUserId);
      return fallback || [];
    } finally {
      inFlightInboxSync.delete(strUserId);
    }
  })();

  inFlightInboxSync.set(strUserId, syncPromise);
  return syncPromise;
}

// --- Messages Operations ---

export function getMessages(userId: string | number, conversationId: string | number): Promise<ChatMessage[] | null> {
  if (!userId || !conversationId) return Promise.resolve(null);
  const key = conversationMessageKey(userId, conversationId);

  return openDatabase().then((db) => {
    if (!db) {
      const mem = memoryMessages.get(key);
      return mem ? cloneData(mem.messages) : null;
    }

    return new Promise((resolve) => {
      try {
        const tx = db.transaction(STORE_MESSAGES, 'readonly');
        const store = tx.objectStore(STORE_MESSAGES);
        const req = store.get(key);

        req.onsuccess = () => {
          const result = req.result;
          if (result && Array.isArray(result.messages)) {
            memoryMessages.set(key, { key, userId: String(userId), conversationId: String(conversationId), messages: result.messages, updatedAt: result.updatedAt });
            resolve(cloneData(result.messages));
          } else {
            const memFallback = memoryMessages.get(key);
            resolve(memFallback ? cloneData(memFallback.messages) : null);
          }
        };

        req.onerror = () => {
          const memFallback = memoryMessages.get(key);
          resolve(memFallback ? cloneData(memFallback.messages) : null);
        };
      } catch {
        const memFallback = memoryMessages.get(key);
        resolve(memFallback ? cloneData(memFallback.messages) : null);
      }
    });
  });
}

export function setMessages(userId: string | number, conversationId: string | number, messages: ChatMessage[]): Promise<void> {
  if (!userId || !conversationId || !Array.isArray(messages)) return Promise.resolve();
  const key = conversationMessageKey(userId, conversationId);
  const sorted = sortMessagesChronologically(messages);
  const capped = sorted.length > MAX_CACHED_MESSAGES ? sorted.slice(sorted.length - MAX_CACHED_MESSAGES) : sorted;
  const record = {
    key: key,
    userId: String(userId),
    conversationId: String(conversationId),
    messages: cloneData(capped),
    updatedAt: Date.now(),
  };

  memoryMessages.set(key, record);

  return openDatabase().then((db) => {
    if (!db) return;
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(STORE_MESSAGES, 'readwrite');
        const store = tx.objectStore(STORE_MESSAGES);
        store.put(record);
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
        tx.onabort = () => resolve();
      } catch {
        resolve();
      }
    });
  });
}

export function mergeMessages(userId: string | number, conversationId: string | number, incomingMessages: ChatMessage[]): Promise<ChatMessage[]> {
  if (!userId || !conversationId) return Promise.resolve([]);
  return getMessages(userId, conversationId).then((existing) => {
    const merged = mergeMessageLists(existing || [], incomingMessages || []);
    return setMessages(userId, conversationId, merged).then(() => merged);
  });
}

export function appendMessage(userId: string | number, conversationId: string | number, message: ChatMessage): Promise<ChatMessage[] | undefined> {
  if (!userId || !conversationId || !message) return Promise.resolve(undefined);
  return mergeMessages(userId, conversationId, [message]).then((merged) => {
    return updateInboxConversation(userId, conversationId, {
      lastMessage: message,
    }).then(() => merged);
  });
}

export function updateMessage(
  userId: string | number,
  conversationId: string | number,
  messageIdOrObject: string | ChatMessage,
  patch?: Partial<ChatMessage>
): Promise<void> {
  if (!userId || !conversationId || !messageIdOrObject) return Promise.resolve();
  const targetId = typeof messageIdOrObject === 'object' && messageIdOrObject !== null ? messageIdOrObject.id : messageIdOrObject;
  const targetPatch = typeof messageIdOrObject === 'object' && messageIdOrObject !== null
    ? (patch ? Object.assign({}, messageIdOrObject, patch) : messageIdOrObject)
    : (patch || {});
  if (!targetId) return Promise.resolve();

  return getMessages(userId, conversationId).then((messages) => {
    if (!messages || !Array.isArray(messages)) return;
    let changed = false;
    const updated = messages.map((msg) => {
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

export function removeMessage(userId: string | number, conversationId: string | number, messageId: string | number): Promise<void> {
  if (!userId || !conversationId || !messageId) return Promise.resolve();
  const strMessageId = String(messageId);
  return getMessages(userId, conversationId).then((messages) => {
    if (!messages || !Array.isArray(messages)) return;
    const filtered = messages.filter((m) => m && String(m.id) !== strMessageId);
    if (filtered.length !== messages.length) {
      return setMessages(userId, conversationId, filtered);
    }
  });
}

export function syncConversationMessages(userId: string | number, conversationId: string | number, options?: ChatSyncOptions): Promise<ChatMessage[]> {
  if (!userId || !conversationId) return Promise.resolve([]);
  const strUserId = String(userId);
  const strConvId = String(conversationId);
  const key = conversationMessageKey(strUserId, strConvId);
  options = options || {};

  if (inFlightConversationSyncs.has(key)) {
    return inFlightConversationSyncs.get(key)!;
  }

  const syncPromise = (async () => {
    try {
      const cached = await getMessages(strUserId, strConvId);
      const newestCached = cached && cached.length ? cached[cached.length - 1] : null;
      let fetchUrl = '/api/chat/conversations/' + encodeURIComponent(strConvId) + '/messages';
      let isDelta = false;
      if (newestCached && newestCached.created_at) {
        fetchUrl += '?since=' + encodeURIComponent(newestCached.created_at);
        isDelta = true;
      }

      let incomingMessages: ChatMessage[] = [];
      if (typeof options.fetchFn === 'function') {
        const res = await options.fetchFn(fetchUrl);
        incomingMessages = res && res.messages ? res.messages : (Array.isArray(res) ? res : []);
      } else {
        const token = await resolveAuthToken(options);
        if (!token) {
          return cached || [];
        }
        const headers: Record<string, string> = { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token };
        const response = await fetch(fetchUrl, { headers });
        if (!response.ok) throw new Error('Conversation messages sync HTTP ' + response.status);
        const data = await response.json();
        incomingMessages = data && data.messages ? data.messages : [];
      }

      let finalMessages: ChatMessage[] = [];
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
        const latestMsg = finalMessages[finalMessages.length - 1];
        if (latestMsg) {
          updateInboxConversation(strUserId, strConvId, { lastMessage: latestMsg }).catch(() => {});
        }
      }

      return cloneData(finalMessages);
    } catch (err: any) {
      console.warn('[VaRoomChatCache] Conversation sync warning:', err && err.message);
      const fallback = await getMessages(strUserId, strConvId);
      return fallback || [];
    } finally {
      inFlightConversationSyncs.delete(key);
    }
  })();

  inFlightConversationSyncs.set(key, syncPromise);
  return syncPromise;
}

// --- Shared Chat Media Cache Operations ---

export function getMedia(id: string | number): Promise<MediaRecord | null> {
  if (!id) return Promise.resolve(null);
  const strId = String(id);

  return openDatabase().then((db) => {
    if (!db) {
      const mem = memoryMedia.get(strId);
      if (!mem) return null;
      mem.accessedAt = Date.now();
      return mem;
    }

    return new Promise((resolve) => {
      try {
        const tx = db.transaction(STORE_MEDIA, 'readwrite');
        const store = tx.objectStore(STORE_MEDIA);
        const req = store.get(strId);

        req.onsuccess = () => {
          const record = req.result;
          if (record && record.blob) {
            record.accessedAt = Date.now();
            store.put(record);
            memoryMedia.set(strId, record);
            resolve(record);
          } else {
            const memFallback = memoryMedia.get(strId);
            resolve(memFallback || null);
          }
        };

        req.onerror = () => {
          resolve(memoryMedia.get(strId) || null);
        };
      } catch {
        resolve(memoryMedia.get(strId) || null);
      }
    });
  });
}

export function getMediaUrl(id: string | number): Promise<MediaUrlResult | null> {
  if (!id) return Promise.resolve(null);
  const strId = String(id);

  if (activeObjectUrls.has(strId)) {
    const existingUrl = activeObjectUrls.get(strId)!;
    const mem = memoryMedia.get(strId);
    return Promise.resolve({
      url: existingUrl,
      mimeType: mem ? mem.mimeType : '',
      size: mem ? mem.size : 0,
      blob: mem ? mem.blob : null,
    });
  }

  return getMedia(strId).then((record) => {
    if (!record || !record.blob) return null;
    const objectUrl = safeCreateObjectURL(record.blob);
    if (objectUrl) {
      activeObjectUrls.set(strId, objectUrl);
    }
    return {
      url: objectUrl,
      mimeType: record.mimeType,
      size: record.size,
      blob: record.blob,
    };
  }).catch((err) => {
    console.warn('[VaRoomChatCache] Media retrieval error:', err);
    return null;
  });
}

function evictMediaIfNecessary(db: IDBDatabase, neededBytes: number): Promise<void> {
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_MEDIA, 'readwrite');
      const store = tx.objectStore(STORE_MEDIA);
      const index = store.index('accessedAt');
      const req = index.openCursor();
      let totalSize = 0;
      const items: Array<{ id: string; size: number; accessedAt: number }> = [];

      req.onsuccess = (event: any) => {
        const cursor = event.target.result;
        if (cursor) {
          const item = cursor.value;
          totalSize += (item.size || 0);
          items.push({ id: item.id, size: item.size || 0, accessedAt: item.accessedAt });
          cursor.continue();
        } else {
          if (totalSize + neededBytes <= MAX_TOTAL_MEDIA_CACHE_SIZE) {
            resolve();
            return;
          }

          const toEvict: string[] = [];
          let sizeAfterEviction = totalSize;
          for (let i = 0; i < items.length; i++) {
            if (sizeAfterEviction + neededBytes <= MAX_TOTAL_MEDIA_CACHE_SIZE) break;
            toEvict.push(items[i].id);
            sizeAfterEviction -= items[i].size;
          }

          toEvict.forEach((itemId) => {
            store.delete(itemId);
            memoryMedia.delete(itemId);
            if (activeObjectUrls.has(itemId)) {
              safeRevokeObjectURL(activeObjectUrls.get(itemId)!);
              activeObjectUrls.delete(itemId);
            }
          });

          resolve();
        }
      };

      req.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

export function saveMedia(
  id: string | number,
  blobOrBuffer: any,
  options?: { type?: string; mimeType?: string }
): Promise<{ url: string | null; mimeType: string; size: number } | null> {
  if (!id || !blobOrBuffer) return Promise.resolve(null);
  const strId = String(id);
  options = options || {};

  const size = blobOrBuffer.size || (blobOrBuffer.byteLength || 0);
  if (size > MAX_SINGLE_MEDIA_SIZE) {
    const directUrl = safeCreateObjectURL(blobOrBuffer);
    return Promise.resolve({ url: directUrl, mimeType: options.mimeType || '', size: size });
  }

  const record: MediaRecord = {
    id: strId,
    type: options.type || 'image',
    mimeType: options.mimeType || (blobOrBuffer.type || 'application/octet-stream'),
    blob: blobOrBuffer,
    size: size,
    createdAt: Date.now(),
    accessedAt: Date.now(),
  };

  memoryMedia.set(strId, record);
  const objectUrl = safeCreateObjectURL(blobOrBuffer);
  if (objectUrl) {
    activeObjectUrls.set(strId, objectUrl);
  }

  return openDatabase().then((db) => {
    if (!db) {
      return { url: objectUrl, mimeType: record.mimeType, size: size };
    }

    return evictMediaIfNecessary(db, size).then(() => {
      return new Promise<{ url: string | null; mimeType: string; size: number }>((resolve) => {
        try {
          const tx = db.transaction(STORE_MEDIA, 'readwrite');
          const store = tx.objectStore(STORE_MEDIA);
          store.put(record);
          tx.oncomplete = () => resolve({ url: objectUrl, mimeType: record.mimeType, size: size });
          tx.onerror = () => resolve({ url: objectUrl, mimeType: record.mimeType, size: size });
          tx.onabort = () => resolve({ url: objectUrl, mimeType: record.mimeType, size: size });
        } catch {
          resolve({ url: objectUrl, mimeType: record.mimeType, size: size });
        }
      });
    });
  }).catch((err) => {
    console.warn('[VaRoomChatCache] Media save error:', err);
    return { url: objectUrl, mimeType: record.mimeType, size: size };
  });
}

export function fetchAndCacheMedia(
  id: string | number,
  remoteUrl: string,
  options?: { type?: string; mimeType?: string }
): Promise<string> {
  if (!id || !remoteUrl) return Promise.resolve(remoteUrl);
  const strId = String(id);
  options = options || {};

  return getMediaUrl(strId).then((cached) => {
    if (cached && cached.url) {
      return cached.url;
    }

    if (inFlightMediaFetches.has(strId)) {
      return inFlightMediaFetches.get(strId)! as Promise<string>;
    }

    const fetchPromise = fetch(remoteUrl).then((response) => {
      if (!response.ok) throw new Error('Remote media fetch failed: ' + response.status);
      return response.blob();
    }).then((blob) => {
      const mimeType = options?.mimeType || blob.type || 'application/octet-stream';
      return saveMedia(strId, blob, { type: options?.type || 'image', mimeType: mimeType }).then((result) => {
        return result && result.url ? result.url : remoteUrl;
      });
    }).catch((error) => {
      console.warn('[VaRoomChatCache] Media caching fallback for ' + strId + ':', error && error.message);
      return remoteUrl;
    }).finally(() => {
      inFlightMediaFetches.delete(strId);
    });

    inFlightMediaFetches.set(strId, fetchPromise);
    return fetchPromise;
  });
}

export function removeMedia(id: string | number): Promise<void> {
  if (!id) return Promise.resolve();
  const strId = String(id);

  if (activeObjectUrls.has(strId)) {
    safeRevokeObjectURL(activeObjectUrls.get(strId)!);
    activeObjectUrls.delete(strId);
  }
  memoryMedia.delete(strId);

  return openDatabase().then((db) => {
    if (!db) return;
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(STORE_MEDIA, 'readwrite');
        tx.objectStore(STORE_MEDIA).delete(strId);
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      } catch {
        resolve();
      }
    });
  });
}

export function clearMedia(): Promise<void> {
  activeObjectUrls.forEach((url) => {
    safeRevokeObjectURL(url);
  });
  activeObjectUrls.clear();
  memoryMedia.clear();

  return openDatabase().then((db) => {
    if (!db) return;
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(STORE_MEDIA, 'readwrite');
        tx.objectStore(STORE_MEDIA).clear();
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      } catch {
        resolve();
      }
    });
  });
}

export function getMediaStats(): Promise<MediaStatsResult> {
  return openDatabase().then((db) => {
    if (!db) {
      const memCount = memoryMedia.size;
      let memBytes = 0;
      memoryMedia.forEach((val) => { memBytes += (val.size || 0); });
      return { count: memCount, totalBytes: memBytes };
    }

    return new Promise((resolve) => {
      try {
        const tx = db.transaction(STORE_MEDIA, 'readonly');
        const store = tx.objectStore(STORE_MEDIA);
        const req = store.openCursor();
        let count = 0;
        let totalBytes = 0;

        req.onsuccess = (event: any) => {
          const cursor = event.target.result;
          if (cursor) {
            count++;
            totalBytes += (cursor.value.size || 0);
            cursor.continue();
          } else {
            resolve({ count: count, totalBytes: totalBytes });
          }
        };

        req.onerror = () => {
          resolve({ count: memoryMedia.size, totalBytes: 0 });
        };
      } catch {
        resolve({ count: memoryMedia.size, totalBytes: 0 });
      }
    });
  });
}

// --- Background Chat Prefetch ---

function scheduleIdleTask(callback: () => void, timeoutMs?: number): any {
  if (typeof window !== 'undefined' && typeof (window as any).requestIdleCallback === 'function') {
    return (window as any).requestIdleCallback(callback, { timeout: timeoutMs || 2500 });
  }
  return setTimeout(callback, 200);
}

export function cancelPrefetch(): void {
  prefetchState.cancelled = true;
  prefetchState.inProgress = false;
}

export function isPrefetching(): boolean {
  return prefetchState.inProgress;
}

export function prefetch(userId: string | number, options?: ChatSyncOptions): Promise<PrefetchResult> {
  if (!userId) return Promise.resolve({ success: false, reason: 'no-user' });
  const strUserId = String(userId);
  options = options || {};
  const cooldown = options.cooldownMs || PREFETCH_COOLDOWN_MS;
  const maxConversations = options.priorityCount || DEFAULT_PREFETCH_CONVERSATIONS;

  if (prefetchState.inProgress && prefetchState.currentUserId === strUserId) {
    return prefetchState.activePromise || Promise.resolve({ success: true, reason: 'in-progress' });
  }

  const now = Date.now();
  if (prefetchState.currentUserId === strUserId && (now - prefetchState.lastPrefetchTime) < cooldown) {
    return Promise.resolve({ success: true, skipped: true, reason: 'cooldown-active' });
  }

  prefetchState.cancelled = false;
  prefetchState.inProgress = true;
  prefetchState.currentUserId = strUserId;

  const prefetchPromise = new Promise<PrefetchResult>((resolve) => {
    scheduleIdleTask(async () => {
      if (prefetchState.cancelled || prefetchState.currentUserId !== strUserId) {
        prefetchState.inProgress = false;
        resolve({ success: false, reason: 'cancelled' });
        return;
      }

      try {
        const conversations = await syncInbox(strUserId, options);
        if (prefetchState.cancelled || prefetchState.currentUserId !== strUserId) {
          prefetchState.inProgress = false;
          resolve({ success: false, reason: 'cancelled' });
          return;
        }

        let prefetchedCount = 0;
        if (Array.isArray(conversations) && conversations.length > 0) {
          const recentConversations = conversations.slice(0, maxConversations);

          for (let i = 0; i < recentConversations.length; i++) {
            if (prefetchState.cancelled || prefetchState.currentUserId !== strUserId) break;
            const conv = recentConversations[i];
            if (!conv || !conv.id) continue;

            await syncConversationMessages(strUserId, conv.id, options);
            prefetchedCount++;

            await new Promise((r) => setTimeout(r, 40));
          }
        }

        prefetchState.lastPrefetchTime = Date.now();
        prefetchState.inProgress = false;
        resolve({ success: true, prefetchedConversations: prefetchedCount });
      } catch (err: any) {
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

export function clearUser(userId: string | number): Promise<void> {
  if (!userId) return Promise.resolve();
  const strUserId = String(userId);

  if (prefetchState.currentUserId === strUserId) {
    cancelPrefetch();
  }

  inFlightInboxSync.delete(strUserId);
  memoryInbox.delete(strUserId);

  const prefix = strUserId + ':';
  memoryMessages.forEach((_, key) => {
    if (key.indexOf(prefix) === 0) {
      memoryMessages.delete(key);
    }
  });
  inFlightConversationSyncs.forEach((_, key) => {
    if (key.indexOf(prefix) === 0) {
      inFlightConversationSyncs.delete(key);
    }
  });

  return openDatabase().then((db) => {
    if (!db) return;
    return new Promise((resolve) => {
      try {
        const tx = db.transaction([STORE_INBOX, STORE_MESSAGES], 'readwrite');
        const inboxStore = tx.objectStore(STORE_INBOX);
        const messagesStore = tx.objectStore(STORE_MESSAGES);

        inboxStore.delete(strUserId);

        const req = messagesStore.openCursor();
        req.onsuccess = (event: any) => {
          const cursor = event.target.result;
          if (cursor) {
            if (cursor.value && cursor.value.userId === strUserId) {
              cursor.delete();
            }
            cursor.continue();
          }
        };

        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
        tx.onabort = () => resolve();
      } catch {
        resolve();
      }
    });
  });
}

export function clearAll(): Promise<void> {
  cancelPrefetch();
  inFlightInboxSync.clear();
  inFlightConversationSyncs.clear();
  inFlightMediaFetches.clear();

  activeObjectUrls.forEach((url) => {
    safeRevokeObjectURL(url);
  });
  activeObjectUrls.clear();
  memoryInbox.clear();
  memoryMessages.clear();
  memoryMedia.clear();

  return openDatabase().then((db) => {
    if (!db) return;
    return new Promise((resolve) => {
      try {
        const tx = db.transaction([STORE_INBOX, STORE_MESSAGES, STORE_MEDIA], 'readwrite');
        tx.objectStore(STORE_INBOX).clear();
        tx.objectStore(STORE_MESSAGES).clear();
        tx.objectStore(STORE_MEDIA).clear();
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
        tx.onabort = () => resolve();
      } catch {
        resolve();
      }
    });
  });
}

const chatCacheInstance = {
  DB_NAME,
  DB_VERSION,
  MAX_TOTAL_MEDIA_CACHE_SIZE,
  MAX_SINGLE_MEDIA_SIZE,
  isSupported: isIndexedDBAvailable,
  getInbox,
  setInbox,
  syncInbox,
  updateInboxConversation,
  getMessages,
  setMessages,
  syncConversationMessages,
  mergeMessages,
  appendMessage,
  updateMessage,
  removeMessage,
  getMedia,
  getMediaUrl,
  saveMedia,
  fetchAndCacheMedia,
  removeMedia,
  clearMedia,
  getMediaStats,
  prefetch,
  cancelPrefetch,
  isPrefetching,
  clearUser,
  clearAll,
};

if (typeof globalThis !== 'undefined') {
  (globalThis as any).VaRoomChatCache = chatCacheInstance;
} else if (typeof window !== 'undefined') {
  (window as any).VaRoomChatCache = chatCacheInstance;
}

export default chatCacheInstance;
