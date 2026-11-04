'use strict';

// In-memory stand-ins for the listing wizard's browser dependencies
// (IndexedDB, localStorage, fetch, Supabase) used by list-wizard-*.test.js.

const path = require('node:path');
const { loadTs } = require('./loadTs');

const dir = path.join(__dirname, '..', '..', 'lib', 'listWizard');
const keyRange = { bound: (lower, upper) => ({ lower, upper }) };
/** Loads a lib/listWizard module with IDBKeyRange (and any other globals) injected. */
const loadWizard = (file, globals = {}) => loadTs(path.join(dir, file), { globals: { IDBKeyRange: keyRange, ...globals } });

function createMemoryIndexedDB(records = new Map()) {
  let hasStore = false;
  const database = {
    objectStoreNames: { contains: () => hasStore },
    createObjectStore() { hasStore = true; },
    close() {},
    transaction() {
      const transaction = {};
      const schedule = (callback) => {
        const request = {};
        queueMicrotask(() => {
          try {
            request.result = callback();
            if (request.onsuccess) request.onsuccess();
            if (transaction.oncomplete) transaction.oncomplete();
          } catch (error) {
            transaction.error = error;
            if (transaction.onerror) transaction.onerror();
          }
        });
        return request;
      };
      transaction.objectStore = () => ({
        put: (value) => schedule(() => records.set(value.cacheKey, structuredClone(value))),
        get: (key) => schedule(() => { const value = records.get(key); return value && structuredClone(value); }),
        delete: (key) => schedule(() => {
          if (key && typeof key === 'object') {
            [...records.keys()].filter((name) => name >= key.lower && name <= key.upper).forEach((name) => records.delete(name));
          } else records.delete(key);
        }),
      });
      return transaction;
    },
  };
  return {
    records,
    open() {
      const request = {};
      queueMicrotask(() => {
        request.result = database;
        if (!hasStore && request.onupgradeneeded) request.onupgradeneeded();
        if (request.onsuccess) request.onsuccess();
      });
      return request;
    },
    deleteDatabase() {
      const request = {};
      queueMicrotask(() => { records.clear(); if (request.onsuccess) request.onsuccess(); });
      return request;
    },
  };
}

function createMemoryStorage() {
  const values = new Map();
  return {
    values,
    get length() { return values.size; },
    key: (index) => [...values.keys()][index] || null,
    getItem: (key) => (values.has(key) ? values.get(key) : null),
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
}

const jsonResponse = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });

/**
 * A fetch that answers by "METHOD url" (or just url) from `routes` and logs
 * every call as { method, url, body }. A route may be a value or a function
 * of the call; unknown requests answer 404.
 */
function routedFetch(routes = {}) {
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    const method = options.method || 'GET';
    const call = { method, url, body: typeof options.body === 'string' ? JSON.parse(options.body) : options.body, options };
    calls.push(call);
    const route = routes[`${method} ${url}`] || routes[url];
    if (!route) return jsonResponse(404, { error: 'Not found' });
    const reply = typeof route === 'function' ? await route(call) : route;
    return reply && typeof reply.status === 'number' && typeof reply.json === 'function' ? reply : jsonResponse(200, reply);
  };
  return { fetch: fetchImpl, calls };
}

/**
 * A Supabase client whose tables answer from `tables[name]` (an object, an
 * array, or a function of the query). Every query is logged with its filters.
 */
function fakeSupabase({ tables = {}, accessToken = 'token-1', userId = 'host-1' } = {}) {
  const queries = [];
  const answer = (query) => {
    const value = tables[query.table];
    const data = typeof value === 'function' ? value(query) : value;
    return { data: data === undefined ? null : data, error: null };
  };
  return {
    queries,
    auth: { getSession: async () => ({ data: { session: accessToken ? { access_token: accessToken, user: { id: userId } } : null } }) },
    storage: { from: () => ({ getPublicUrl: (file) => ({ data: { publicUrl: `https://cdn.test/${file}` } }) }) },
    from(table) {
      const query = {
        table, columns: null, filters: [],
        select(columns) { query.columns = columns; return query; },
        eq(column, value) { query.filters.push([column, value]); return query; },
        in(column, value) { query.filters.push([column, value]); return query; },
        single: async () => answer(query),
        maybeSingle: async () => answer(query),
        then: (resolve, reject) => Promise.resolve(answer(query)).then(resolve, reject),
      };
      queries.push(query);
      return query;
    },
  };
}

const plain = (value) => JSON.parse(JSON.stringify(value));
const tick = (ms = 0) => new Promise((resolve) => setTimeout(resolve, ms));

module.exports = { loadWizard, createMemoryIndexedDB, createMemoryStorage, jsonResponse, routedFetch, fakeSupabase, plain, tick };
