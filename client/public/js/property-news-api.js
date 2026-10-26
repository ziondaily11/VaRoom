/* Public VaRoom Property News client. It only calls the same-origin public
   API proxy; pending/rejected records and service credentials stay server-side. */
(function(window){
  'use strict';

  async function request(path, options){
    const response = await fetch(path, {
      headers: { Accept: 'application/json' },
      signal: options && options.signal,
    });
    if (!response.ok) {
      throw new Error('Property news request failed (' + response.status + ')');
    }
    return response.json();
  }

  window.VaRoomPropertyNews = {
    latest: function(limit, options){ return request('/api/news/latest?limit=' + encodeURIComponent(limit || 5), options); },
    all: function(limit, options){ return request('/api/news?limit=' + encodeURIComponent(limit || 50), options); },
    get: function(id, options){ return request('/api/news/' + encodeURIComponent(id), options); }
  };
})(window);
