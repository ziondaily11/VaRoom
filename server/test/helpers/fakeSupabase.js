'use strict';

const crypto = require('node:crypto');

// An in-memory stand-in for the Supabase client over plain arrays: the
// filters, ordering and writes the enforcement, support-inbox and admin
// investigation code use. unique: { table: [column, …] } makes a duplicate
// insert fail with 23505; rpc: { name: (args) => data } answers .rpc().

/** A SQL ILIKE pattern (with \ escapes) as a case-insensitive RegExp. */
function likePattern(pattern) {
  let source = '';
  for (let i = 0; i < pattern.length; i += 1) {
    const c = pattern[i];
    if (c === '\\' && i + 1 < pattern.length) { i += 1; source += pattern[i].replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
    else if (c === '%') source += '.*';
    else if (c === '_') source += '.';
    else source += c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${source}$`, 'is');
}

function fakeSupabase(seed = {}, { unique = {}, rpc = {} } = {}) {
  const tables = { account_controls: [], account_enforcement_actions: [], admin_activity: [], notifications: [], moderation_rule_hits: [], ...seed };
  const bans = [];
  const from = (name) => {
    tables[name] = tables[name] || [];
    const filters = [];
    let op = 'select', values = null, head = false, single = false, countMode = false, limit = Infinity, order = null, aliases = [];
    const q = {
      select(columns, options = {}) {
        head = Boolean(options.head);
        countMode = options.count === 'exact';
        // JSON-path aliases (alias:column->key) are added to the rows read.
        aliases = [...String(columns || '').matchAll(/(\w+):(\w+)->(\w+)/g)].map(([, alias, column, key]) => [alias, column, key]);
        return q;
      },
      is(c, v) { filters.push((r) => (r[c] ?? null) === v); return q; },
      insert(row) { op = 'insert'; values = row; return q; },
      upsert(row) { op = 'upsert'; values = row; return q; },
      update(row) { op = 'update'; values = row; return q; },
      delete() { op = 'delete'; return q; },
      eq(c, v) { filters.push((r) => r[c] === v); return q; },
      neq(c, v) { filters.push((r) => r[c] !== v); return q; },
      in(c, list) { filters.push((r) => list.includes(r[c])); return q; },
      gte(c, v) { filters.push((r) => r[c] >= v); return q; },
      lte(c, v) { filters.push((r) => r[c] <= v); return q; },
      lt(c, v) { filters.push((r) => r[c] < v); return q; },
      ilike(c, pattern) { const regex = likePattern(pattern); filters.push((r) => regex.test(String(r[c] ?? ''))); return q; },
      // Only the form adminInvestigation.search uses: col.ilike."pattern",col.ilike."pattern"
      or(expression) {
        const parts = [...expression.matchAll(/(\w+)\.ilike\.("(?:[^"\\]|\\.)*")/g)].map(([, c, quoted]) => [c, likePattern(JSON.parse(quoted))]);
        filters.push((r) => parts.some(([c, regex]) => regex.test(String(r[c] ?? ''))));
        return q;
      },
      not(c) { filters.push((r) => r[c] != null); return q; },
      order(c, options = {}) { order = [c, options.ascending !== false]; return q; },
      limit(n) { limit = n; return q; },
      maybeSingle() { single = true; return q.then((r) => r); },
      single() { single = true; return q.then((r) => r); },
      then(resolve, reject) {
        const rows = tables[name];
        const now = new Date().toISOString();
        let result;
        let error = null;
        if (op === 'insert') {
          const row = { id: crypto.randomUUID(), created_at: now, ...values };
          const clash = (unique[name] || []).some((column) => row[column] != null && rows.some((r) => r[column] === row[column]));
          if (clash) { error = { code: '23505', message: 'duplicate key' }; result = []; } else { rows.push(row); result = [row]; }
        } else if (op === 'upsert') {
          const existing = rows.find((r) => r.user_id === values.user_id);
          if (existing) Object.assign(existing, values); else rows.push({ ...values });
          result = [values];
        } else {
          let matched = rows.filter((r) => filters.every((f) => f(r)));
          if (order) matched = [...matched].sort((a, b) => (a[order[0]] > b[order[0]] ? 1 : -1) * (order[1] ? 1 : -1));
          const total = matched.length;
          matched = matched.slice(0, limit);
          if (op === 'update') matched.forEach((r) => Object.assign(r, values));
          if (op === 'delete') tables[name] = rows.filter((r) => !matched.includes(r));
          result = matched;
          result.total = total;
        }
        if (aliases.length && op === 'select') {
          const total = result.total;
          result = result.map((r) => ({ ...r, ...Object.fromEntries(aliases.map(([alias, column, key]) => [alias, r[column] && r[column][key] !== undefined ? r[column][key] : null])) }));
          result.total = total;
        }
        const payload = error ? { data: null, error }
          : countMode ? { count: result.total ?? result.length, data: head ? null : result, error: null }
            : { data: single ? (result[0] || null) : result, error: null };
        return Promise.resolve(payload).then(resolve, reject);
      },
    };
    return q;
  };
  const users = {};
  const auth = { admin: {
    updateUserById: async (id, change) => { bans.push([id, change.ban_duration]); return { error: null }; },
    getUserById: async (id) => ({ data: { user: users[id] || { id, email: null } } }),
  } };
  return {
    from, auth, tables, bans, users,
    rpc: async (fn, args) => ({ data: rpc[fn] ? rpc[fn](args) : null, error: null }),
  };
}

module.exports = { fakeSupabase };
