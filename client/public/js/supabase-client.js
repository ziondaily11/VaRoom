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

  window.VaRoomMedia = {
    sortPhotos(photos) {
      return (Array.isArray(photos) ? photos : []).slice().sort(function (left, right) {
        return (Number(left.sort_order) || 0) - (Number(right.sort_order) || 0);
      });
    },
    publicUrl(bucket, path) {
      if (!path) return '';
      if (/^(?:https?:|data:|blob:)/i.test(path)) return path;
      if (/^(?:listing-photos|avatars|updates)\//.test(path)) {
        return '/api/media/public?key=' + encodeURIComponent(path);
      }
      return window.supabaseClient.storage.from(bucket).getPublicUrl(path).data.publicUrl;
    },
    async upload(category, file, options) {
      const settings = options || {};
      const mimeType = file.type;
      const extension = ({ 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' })[mimeType];
      if (!extension) throw new Error('Choose a JPG, PNG, or WebP image.');
      if (!file.size || file.size > 5 * 1024 * 1024) throw new Error('Images must be 5 MB or smaller.');
      const sessionResult = await window.supabaseClient.auth.getSession();
      const session = sessionResult.data && sessionResult.data.session;
      if (!session || !session.access_token) throw new Error('Your session expired. Please sign in again.');

      const request = async (path, method, body) => {
        const response = await fetch(path, {
          method,
          headers: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer ' + session.access_token,
          },
          body: body ? JSON.stringify(body) : undefined,
        });
        const payload = await response.json().catch(function () { return {}; });
        if (!response.ok) throw new Error(payload.error || 'Media upload failed.');
        return payload;
      };

      const init = await request('/api/media/upload-init', 'POST', {
        category,
        listingId: settings.listingId,
        photoId: settings.photoId,
        sortOrder: settings.sortOrder,
        filename: settings.filename || file.name || ('upload.' + extension),
        mimeType,
        fileSize: file.size,
      });
      let uploaded = false;
      try {
        const uploadResponse = await fetch(init.uploadUrl, {
          method: 'PUT',
          headers: { 'Content-Type': mimeType },
          body: file,
        });
        if (!uploadResponse.ok) throw new Error('The image could not be stored in Cloudflare R2.');
        uploaded = true;
        return await request('/api/media/upload-complete', 'POST', {
          category,
          listingId: settings.listingId,
          mediaId: init.mediaId,
          mimeType,
          sortOrder: settings.sortOrder,
        }).then(function (result) {
          return Object.assign(result, { extension: extension, listingId: settings.listingId });
        });
      } catch (error) {
        try {
          await request('/api/media/uploads/' + encodeURIComponent(category) + '/' +
            encodeURIComponent(init.mediaId) + '?extension=' + extension +
            (settings.listingId ? '&listingId=' + encodeURIComponent(settings.listingId) : ''), 'DELETE');
        } catch (cleanupError) {
          if (uploaded) console.error('Unable to clean up an incomplete media upload:', cleanupError);
        }
        throw error;
      }
    },
    async removeUnattached(category, media) {
      const sessionResult = await window.supabaseClient.auth.getSession();
      const session = sessionResult.data && sessionResult.data.session;
      if (!session || !session.access_token) throw new Error('Your session expired. Please sign in again.');
      const url = '/api/media/uploads/' + encodeURIComponent(category) + '/' +
        encodeURIComponent(media.mediaId) + '?extension=' + encodeURIComponent(media.extension) +
        (media.listingId ? '&listingId=' + encodeURIComponent(media.listingId) : '');
      const response = await fetch(url, {
        method: 'DELETE',
        headers: { Authorization: 'Bearer ' + session.access_token },
      });
      const payload = await response.json().catch(function () { return {}; });
      if (!response.ok) throw new Error(payload.error || 'Unable to remove uploaded media.');
      return payload;
    },
  };

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
