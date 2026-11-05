'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { acceptsNewConversations, canViewProfile } = require('../lib/privacySettings');

// A stand-in admin client: each table answers with fixed rows; `or` filters
// are recorded and matched as "between these two people".
function fakeAdmin(tables) {
  return {
    from(table) {
      const filters = [];
      let pair = null;
      const query = {
        select() { return query; },
        eq(column, value) { filters.push((row) => row[column] === value); return query; },
        or(expression) {
          const ids = [...expression.matchAll(/host_id\.eq\.([^,]+),client_id\.eq\.([^)]+)/g)].map((m) => [m[1], m[2]]);
          pair = (row) => ids.some(([h, c]) => row.host_id === h && row.client_id === c);
          return query;
        },
        limit() { return query; },
        rows() { return (tables[table] || []).filter((row) => filters.every((f) => f(row)) && (!pair || pair(row))); },
        maybeSingle: async () => ({ data: query.rows()[0] || null, error: null }),
        then(resolve) { return resolve({ data: query.rows(), error: null }); },
      };
      return query;
    },
  };
}

test('who can message: "No one" stops new conversations; a missing setting allows them', async () => {
  const admin = fakeAdmin({ profiles: [{ id: 'H1', who_can_message: 'no_one' }, { id: 'H2', who_can_message: 'everyone' }] });
  assert.equal(await acceptsNewConversations(admin, 'H1'), false);
  assert.equal(await acceptsNewConversations(admin, 'H2'), true);
  assert.equal(await acceptsNewConversations(admin, 'H3'), true);
});

test('profile visibility: private profiles for the owner and people with a chat or booking only', async () => {
  const admin = fakeAdmin({
    conversations: [{ id: 'C1', host_id: 'H1', client_id: 'chatter' }],
    bookings: [{ id: 'B1', host_id: 'H1', client_id: 'guest' }],
  });
  const host = { id: 'H1', profile_visibility: 'private' };
  assert.equal(await canViewProfile(admin, null, { id: 'H1', profile_visibility: 'public' }), true, 'public: anyone');
  assert.equal(await canViewProfile(admin, null, host), false, 'private: not signed-out visitors');
  assert.equal(await canViewProfile(admin, 'stranger', host), false, 'private: not strangers');
  assert.equal(await canViewProfile(admin, 'H1', host), true, 'the owner');
  assert.equal(await canViewProfile(admin, 'chatter', host), true, 'someone with a chat');
  assert.equal(await canViewProfile(admin, 'guest', host), true, 'someone with a booking');
  assert.equal(await canViewProfile(admin, 'x', null), false);
});

test('chat start refuses a new conversation with a host who turned messages off, after reusing an existing one', () => {
  const routes = fs.readFileSync(path.join(__dirname, '..', 'routes', 'chatRoutes.js'), 'utf8');
  const start = routes.slice(routes.indexOf("router.post('/chat/conversations/start'"), routes.indexOf('// Archive or unarchive'));
  const reuse = start.indexOf('return res.json({ conversationId, created: false });');
  const check = start.indexOf('acceptsNewConversations(supabaseAdmin, listing.host_id)');
  const create = start.indexOf(".from('conversations')\n      .upsert(");
  assert.ok(reuse > 0 && check > reuse && create > check, 'existing chats carry on; the check comes before creating');
  assert.match(start, /status\(403\)\.json\(\{ error: MESSAGES_OFF_ERROR, code: MESSAGES_OFF \}\)/);
});

test('host profile endpoint applies visibility and never returns the setting itself', () => {
  const routes = fs.readFileSync(path.join(__dirname, '..', 'routes', 'profileRoutes.js'), 'utf8');
  assert.match(routes, /router\.get\('\/host-profiles\/:key'/);
  assert.match(routes, /canViewProfile\(supabaseAdmin, viewer \? viewer\.id : null, profile\)/);
  assert.match(routes, /code: 'profile_private'/);
  assert.match(routes, /const \{ profile_visibility: _visibility, \.\.\.shown \} = profile;/);
  assert.match(routes, /'Cache-Control', 'private, no-store'/);
});
