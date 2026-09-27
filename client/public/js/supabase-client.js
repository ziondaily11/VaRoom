(function () {
  const SUPABASE_URL = window.VAROOM_SUPABASE_URL || 'https://deaphymimdaygeavhyek.supabase.co';
  const SUPABASE_ANON_KEY = window.VAROOM_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRlYXBoeW1pbWRheWdlYXZoeWVrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY1MjAwNDQsImV4cCI6MjEwMjA5NjA0NH0.rbgVhuZCK1fZP7gKV5oO1OUvIT61ir23VhAYm8739SI';

  window.VAROOM_SUPABASE_URL = SUPABASE_URL;
  window.VAROOM_SUPABASE_ANON_KEY = SUPABASE_ANON_KEY;

  if (!window.supabaseClient) {
    window.supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    if (window.VaRoomDataCache) {
      window.supabaseClient.auth.onAuthStateChange(function (event, session) {
        var nextUserId = session && session.user ? session.user.id : null;
        if (window.__varoomCacheUserId && window.__varoomCacheUserId !== nextUserId) {
          window.VaRoomDataCache.invalidate('account:' + window.__varoomCacheUserId + ':');
        }
        window.__varoomCacheUserId = nextUserId;
        if (event === 'SIGNED_OUT') window.VaRoomDataCache.invalidate('account:');
      });
    }
  }

  // Keep the R2 migration compatibility in place for already-migrated keys, but
  // do not hijack the browser's legacy photo upload calls. The direct signed PUT
  // flow here was incomplete and caused real upload failures in production.
  // Legacy pages still use the normal Supabase Storage API for uploads; migrated
  // R2 object keys are resolved through the server-side /api/photos route.
  (function routePhotoStorageToR2(client) {
    if (client.__varoomR2PhotoStoragePatched) return;
    var photoCategories = { 'listing-photos': true, avatars: true, 'update-images': true };
    var migratedKeyPrefixes = {
      'listing-photos': 'listing-photos/',
      avatars: 'avatars/',
      'update-images': 'updates/'
    };
    var originalFrom = client.storage.from.bind(client.storage);
    client.storage.from = function (bucket) {
      var storage = originalFrom(bucket);
      if (!photoCategories[bucket]) return storage;
      var originalGetPublicUrl = storage.getPublicUrl.bind(storage);

      storage.getPublicUrl = function (path) {
        var isNewR2Key = typeof path === 'string' && path.indexOf('photos/') === 0;
        var migratedPrefix = migratedKeyPrefixes[bucket];
        var isMigratedR2Key = typeof path === 'string'
          && migratedPrefix
          && path.indexOf(migratedPrefix) === 0;
        if (isNewR2Key || isMigratedR2Key) {
          return { data: { publicUrl: '/api/photos/' + encodeURIComponent(bucket) + '/' + path.split('/').map(encodeURIComponent).join('/') } };
        }
        return originalGetPublicUrl(path);
      };
      return storage;
    };
    client.__varoomR2PhotoStoragePatched = true;
  })(window.supabaseClient);

  window.VaRoomNotificationAPI = {
    async create(payload) {
      const { data: { session } } = await window.supabaseClient.auth.getSession();
      if (!session || !session.access_token) {
        throw new Error('Authentication is required to create notifications.');
      }
      const response = await fetch('/api/notifications', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + session.access_token,
        },
        body: JSON.stringify(payload || {}),
      });
      const result = await response.json().catch(function () { return {}; });
      if (!response.ok) {
        throw new Error(result.error || 'Unable to create notification.');
      }
      return result.notification || null;
    },
  };
})();
