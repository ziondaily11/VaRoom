(function(root, factory){
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.VaRoomListingDraftCache = api;
})(typeof window !== 'undefined' ? window : null, function(){
  const DATABASE_NAME = 'varoom-listing-drafts';
  const STORE_NAME = 'drafts';
  const POINTER_PREFIX = 'varoom_listing_draft_pointer:';

  function createListingDraftCache(options){
    const settings = options || {};
    const indexedDBRef = settings.indexedDBRef || (typeof indexedDB !== 'undefined' ? indexedDB : null);
    const storage = settings.storage || (typeof localStorage !== 'undefined' ? localStorage : null);

    function openDatabase(){
      if (!indexedDBRef) return Promise.reject(new Error('Browser draft storage is unavailable.'));
      return new Promise(function(resolve, reject){
        const request = indexedDBRef.open(DATABASE_NAME, 1);
        request.onupgradeneeded = function(){
          const database = request.result;
          if (!database.objectStoreNames.contains(STORE_NAME)) database.createObjectStore(STORE_NAME, { keyPath: 'cacheKey' });
        };
        request.onsuccess = function(){ resolve(request.result); };
        request.onerror = function(){ reject(request.error || new Error('Unable to open browser draft storage.')); };
        request.onblocked = function(){ reject(new Error('Browser draft storage is blocked by another tab.')); };
      });
    }

    function transact(cacheKey, action){
      return openDatabase().then(function(database){
        return new Promise(function(resolve, reject){
          const transaction = database.transaction(STORE_NAME, 'readwrite');
          const request = action(transaction.objectStore(STORE_NAME), cacheKey);
          let result;
          if (request) request.onsuccess = function(){ result = request.result; };
          transaction.oncomplete = function(){ database.close(); resolve(result); };
          transaction.onerror = function(){
            database.close();
            reject(transaction.error || new Error('Unable to update browser draft storage.'));
          };
          transaction.onabort = function(){
            database.close();
            reject(transaction.error || new Error('Browser draft storage update was aborted.'));
          };
        });
      });
    }

    return {
      save: function(draft){
        if (!draft || typeof draft.cacheKey !== 'string' || !draft.cacheKey) {
          return Promise.reject(new Error('A valid listing draft key is required.'));
        }
        return transact(draft.cacheKey, function(store){ return store.put(draft); });
      },
      load: function(cacheKey){
        if (typeof cacheKey !== 'string' || !cacheKey) return Promise.resolve(null);
        return transact(cacheKey, function(store, key){ return store.get(key); }).then(function(value){ return value || null; });
      },
      remove: function(cacheKey){
        if (typeof cacheKey !== 'string' || !cacheKey) return Promise.resolve();
        return transact(cacheKey, function(store, key){ return store.delete(key); });
      },
      setPointer: function(hostId, pointer){
        if (!storage) throw new Error('Browser draft index is unavailable.');
        if (!hostId || !pointer || pointer.hostId !== hostId || !pointer.cacheKey) {
          throw new Error('A valid host-scoped draft pointer is required.');
        }
        storage.setItem(POINTER_PREFIX + hostId, JSON.stringify(pointer));
      },
      getPointer: function(hostId){
        if (!storage || !hostId) return null;
        const value = storage.getItem(POINTER_PREFIX + hostId);
        if (!value) return null;
        let pointer;
        try { pointer = JSON.parse(value); }
        catch (error) {
          console.warn('Ignoring a corrupt saved listing draft pointer:', error);
          storage.removeItem(POINTER_PREFIX + hostId);
          return null;
        }
        if (!pointer || pointer.hostId !== hostId || typeof pointer.cacheKey !== 'string'
            || !Number.isFinite(pointer.createdAt)) return null;
        return pointer;
      },
      clearForHost: function(hostId){
        if (!storage || !hostId) return Promise.resolve();
        const pointer = this.getPointer(hostId);
        storage.removeItem(POINTER_PREFIX + hostId);
        return this.remove(pointer && pointer.cacheKey);
      },
    };
  }

  return { createListingDraftCache };
});
