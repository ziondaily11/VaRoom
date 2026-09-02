/* Public VaRoom Property News client. It only calls the same-origin public
   API proxy; pending/rejected records and service credentials stay server-side. */
(function(window){
  'use strict';

  async function request(path){
    const response = await fetch(path, { headers: { Accept: 'application/json' } });
    if (!response.ok) {
      throw new Error('Property news request failed (' + response.status + ')');
    }
    return response.json();
  }

  window.VaRoomPropertyNews = {
    latest: function(limit){ return request('/api/news/latest?limit=' + encodeURIComponent(limit || 2)); },
    all: function(limit){ return request('/api/news?limit=' + encodeURIComponent(limit || 50)); },
    get: function(id){ return request('/api/news/' + encodeURIComponent(id)); }
  };
})(window);
