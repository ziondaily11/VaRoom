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

  // Keep the existing legacy pages' Storage API usage working while routing
  // new public-image uploads through the server's signed R2 upload flow.
  // Older paths continue to resolve from Supabase, so no data migration is
  // required before deploying this change.
  (function routePhotoStorageToR2(client) {
    if (client.__varoomR2PhotoStoragePatched) return;
    var photoCategories = { 'listing-photos': true, avatars: true, 'update-images': true };
    var originalFrom = client.storage.from.bind(client.storage);
    client.storage.from = function (bucket) {
      var storage = originalFrom(bucket);
      if (!photoCategories[bucket]) return storage;
      var originalGetPublicUrl = storage.getPublicUrl.bind(storage);
      var originalUpload = storage.upload.bind(storage);

      storage.getPublicUrl = function (path) {
        // R2 keys are deliberately distinguishable from pre-existing
        // Supabase paths. The API redirects to a short-lived private R2 URL.
        if (typeof path === 'string' && path.indexOf('photos/') === 0) {
          return { data: { publicUrl: '/api/photos/' + encodeURIComponent(bucket) + '/' + path.split('/').map(encodeURIComponent).join('/') } };
        }
        return originalGetPublicUrl(path);
      };

      storage.upload = async function (_path, file, options) {
        if (!file || !file.type || !/^image\/(jpeg|png|webp|gif)$/.test(file.type)) {
          return originalUpload(_path, file, options);
        }
        try {
          var sessionResult = await client.auth.getSession();
          var token = sessionResult.data && sessionResult.data.session && sessionResult.data.session.access_token;
          if (!token) throw new Error('Authentication is required to upload photos.');
          var filename = file.name || (_path && String(_path).split('/').pop()) || 'photo.jpg';
          var initResponse = await fetch('/api/photos/upload-init', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
            body: JSON.stringify({ category: bucket, filename: filename, mimeType: file.type, fileSize: file.size })
          });
          var init = await initResponse.json().catch(function () { return {}; });
          if (!initResponse.ok) throw new Error(init.error || 'Unable to prepare photo upload.');
          var uploadResponse = await fetch(init.uploadUrl, { method: 'PUT', headers: { 'Content-Type': file.type }, body: file });
          if (!uploadResponse.ok) throw new Error('Photo upload to storage failed.');
          var completeResponse = await fetch('/api/photos/upload-complete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
            body: JSON.stringify({ category: bucket, key: init.key })
          });
          var complete = await completeResponse.json().catch(function () { return {}; });
          if (!completeResponse.ok) throw new Error(complete.error || 'Unable to finalize photo upload.');
          return { data: { path: complete.key, fullPath: complete.key }, error: null };
        } catch (error) {
          return { data: null, error: error };
        }
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
