(function (window) {
  'use strict';

  var PREFIX = 'varoom:data-cache:v1:';
  var memory = Object.create(null);
  var pending = Object.create(null);
  var defaultTtl = 2 * 60 * 1000;
  var maxAge = 15 * 60 * 1000;

  function storageKey(key) {
    return PREFIX + encodeURIComponent(key);
  }

  function read(key) {
    if (memory[key]) return memory[key];
    var entry = null;
    try {
      var raw = window.sessionStorage.getItem(storageKey(key));
      if (raw) entry = JSON.parse(raw);
    } catch (error) {
      entry = null;
    }
    if (!entry || typeof entry.updatedAt !== 'number') return null;
    if (Date.now() - entry.updatedAt > maxAge) {
      remove(key);
      return null;
    }
    memory[key] = entry;
    return entry;
  }

  function write(key, value) {
    var entry = { updatedAt: Date.now(), value: value };
    memory[key] = entry;
    try {
      window.sessionStorage.setItem(storageKey(key), JSON.stringify(entry));
    } catch (error) {}
  }

  function remove(key) {
    delete memory[key];
    try { window.sessionStorage.removeItem(storageKey(key)); } catch (error) {}
  }

  function get(key, loader, options) {
    options = options || {};
    var ttl = typeof options.ttl === 'number' ? options.ttl : defaultTtl;
    var cached = read(key);
    if (cached && Date.now() - cached.updatedAt <= ttl) {
      return Promise.resolve(cached.value);
    }
    if (pending[key]) return pending[key];

    pending[key] = Promise.resolve().then(loader).then(function (value) {
      if (!value || !value.error) write(key, value);
      return value;
    }).finally(function () {
      delete pending[key];
    });
    return pending[key];
  }

  function invalidate(prefix) {
    Object.keys(memory).forEach(function (key) {
      if (!prefix || key.indexOf(prefix) === 0) remove(key);
    });
    try {
      for (var index = window.sessionStorage.length - 1; index >= 0; index -= 1) {
        var storageName = window.sessionStorage.key(index);
        if (storageName && storageName.indexOf(PREFIX) === 0) {
          var key = decodeURIComponent(storageName.slice(PREFIX.length));
          if (!prefix || key.indexOf(prefix) === 0) remove(key);
        }
      }
    } catch (error) {}
  }

  window.VaRoomDataCache = {
    get: get,
    invalidate: invalidate,
    remove: remove
  };

  window.addEventListener('storage', function (event) {
    if (event.key && event.key.indexOf(PREFIX) === 0) {
      delete memory[decodeURIComponent(event.key.slice(PREFIX.length))];
    }
  });
})(window);
