'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const test = require('node:test');
const express = require('express');
const createAccountGroupRoutes = require('../routes/accountGroupRoutes');
const { authenticatedUser, groupSnapshot, linkAccountGroupUsers, removeAccountGroupUser, linkFailure, removalFailure } = createAccountGroupRoutes;

function createMockAdmin() {
  const users = new Map(['x', 'y', 'z', 'f', 'a', 'b'].map((id) => [
    'access-' + id,
    { id, email: id + '@example.test', user_metadata: { full_name: id.toUpperCase() } }
  ]));
  const profiles = new Map([...users.values()].map((user) => [user.id, {
    id: user.id, full_name: user.user_metadata.full_name, username: user.id, role: 'client'
  }]));
  const memberships = new Map();
  let nextGroup = 0;
  let transaction = Promise.resolve();

  function query(table) {
    const filters = [];
    let memberOrder = false;
    const builder = {
      select() { return builder; },
      eq(key, value) { filters.push((row) => row[key] === value); return builder; },
      in(key, values) { filters.push((row) => values.includes(row[key])); return builder; },
      order() { memberOrder = true; return builder; },
      async maybeSingle() {
        const result = await builder.execute();
        return { data: result.data[0] || null, error: null };
      },
      async execute() {
        let rows;
        if (table === 'account_group_members') {
          rows = [...memberships.entries()].map(([user_id, group_id]) => ({ user_id, group_id, joined_at: '2026-01-01T00:00:00Z' }));
        } else {
          rows = [...profiles.values()];
        }
        rows = rows.filter((row) => filters.every((filter) => filter(row)));
        if (memberOrder) rows.sort((a, b) => a.user_id.localeCompare(b.user_id));
        return { data: rows, error: null };
      },
      then(resolve, reject) { return builder.execute().then(resolve, reject); }
    };
    return builder;
  }

  return {
    users,
    profiles,
    memberships,
    auth: {
      async getUser(token) {
        const user = users.get(token);
        return user
          ? { data: { user }, error: null }
          : { data: { user: null }, error: new Error('invalid token') };
      }
    },
    from: query,
    async rpc(name, args) {
      const operation = transaction.then(() => {
        if (name === 'varoom_remove_account_group_member') {
          const currentGroup = memberships.get(args.p_current_user);
          const removedGroup = memberships.get(args.p_removed_user);
          if (args.p_current_user === args.p_removed_user) return { data: null, error: new Error('cannot_remove_current_account') };
          if (!currentGroup || currentGroup !== removedGroup) return { data: null, error: new Error('account_group_member_not_linked') };
          memberships.delete(args.p_removed_user);
          return { data: null, error: null };
        }
        assert.equal(name, 'varoom_link_account_group_users');
        const a = args.p_user_a;
        const b = args.p_user_b;
        if (a === b) return { data: null, error: new Error('invalid_account_group_members') };
        const groupA = memberships.get(a);
        const groupB = memberships.get(b);
        if (groupA && groupA === groupB) return { data: groupA, error: null };
        const combined = [...memberships.entries()]
          .filter(([, group]) => group === groupA || group === groupB)
          .map(([id]) => id);
        const count = (groupA ? [...memberships.values()].filter((id) => id === groupA).length : 0)
          + (groupB && groupB !== groupA ? [...memberships.values()].filter((id) => id === groupB).length : 0);
        if (count + (groupA && groupB ? 0 : 1) > 3) {
          return { data: null, error: new Error('account_group_limit_reached') };
        }
        const target = groupA || groupB || 'group-' + (++nextGroup);
        if (groupB && groupA && groupA !== groupB) {
          for (const [userId, groupId] of memberships) if (groupId === groupB) memberships.set(userId, target);
        }
        memberships.set(a, target);
        memberships.set(b, target);
        return { data: target, error: null };
      });
      transaction = operation.then(() => undefined);
      return operation;
    }
  };
}

test('authenticated group lookup returns only that account group and never returns credentials', async () => {
  const admin = createMockAdmin();
  admin.memberships.set('x', 'group-xyz');
  admin.memberships.set('y', 'group-xyz');
  admin.memberships.set('z', 'group-xyz');
  admin.memberships.set('f', 'group-f');
  const user = await authenticatedUser(admin, { headers: { authorization: 'Bearer access-y' } });
  const body = await groupSnapshot(admin, user);
  assert.deepEqual(body.members.map((member) => member.id), ['x', 'y', 'z']);
  assert.equal(JSON.stringify(body).includes('refresh_token'), false);
  assert.equal(body.members.find((member) => member.id === 'x').email, '');

  const unrelatedUser = await authenticatedUser(admin, { headers: { authorization: 'Bearer access-f' } });
  assert.deepEqual((await groupSnapshot(admin, unrelatedUser)).members.map((member) => member.id), ['f']);
});

test('linking requires valid sessions for both the current and additional account', async () => {
  const admin = createMockAdmin();
  assert.equal(await authenticatedUser(admin, { headers: {} }), null);
  assert.equal(await authenticatedUser(admin, { headers: { authorization: 'Bearer not-a-token' } }), null);
  const currentUser = await authenticatedUser(admin, { headers: { authorization: 'Bearer access-x' } });
  const invalidAdditional = await admin.auth.getUser('not-a-token');
  assert.equal(invalidAdditional.error instanceof Error, true);
  await assert.rejects(linkAccountGroupUsers(admin, currentUser, currentUser), /invalid_account_group_members/);
});

test('explicitly authenticated accounts link durably and a fourth member receives a conflict', async () => {
  const admin = createMockAdmin();
  admin.memberships.set('x', 'group-x');
  admin.memberships.set('y', 'group-y');
  admin.memberships.set('z', 'group-y');
  const currentUser = await authenticatedUser(admin, { headers: { authorization: 'Bearer access-x' } });
  const additionalUser = await authenticatedUser(admin, { headers: { authorization: 'Bearer access-y' } });
  const merged = await linkAccountGroupUsers(admin, currentUser, additionalUser);
  assert.deepEqual(merged.members.map((member) => member.id), ['x', 'y', 'z']);
  assert.equal(admin.memberships.get('x'), admin.memberships.get('y'));

  const unrelated = await authenticatedUser(admin, { headers: { authorization: 'Bearer access-f' } });
  await assert.rejects(linkAccountGroupUsers(admin, currentUser, unrelated), /account_group_limit_reached/);
  assert.equal(linkFailure(new Error('account_group_limit_reached')).status, 409);
  assert.equal(admin.memberships.has('f'), false);
});

test('concurrent attempts cannot add two members to a group with one remaining slot', async () => {
  const admin = createMockAdmin();
  admin.memberships.set('x', 'group-x');
  admin.memberships.set('y', 'group-x');
  const currentUser = await authenticatedUser(admin, { headers: { authorization: 'Bearer access-x' } });
  const userA = await authenticatedUser(admin, { headers: { authorization: 'Bearer access-a' } });
  const userB = await authenticatedUser(admin, { headers: { authorization: 'Bearer access-b' } });
  const outcomes = await Promise.allSettled([
    linkAccountGroupUsers(admin, currentUser, userA),
    linkAccountGroupUsers(admin, currentUser, userB)
  ]);
  assert.deepEqual(outcomes.map((result) => result.status).sort(), ['fulfilled', 'rejected']);
  assert.equal([...admin.memberships.values()].filter((groupId) => groupId === 'group-x').length, 3);
});

test('removing a linked non-current account changes only that membership and retains its VaRoom data', async () => {
  const admin = createMockAdmin();
  admin.memberships.set('x', 'group-xyz');
  admin.memberships.set('y', 'group-xyz');
  admin.memberships.set('z', 'group-xyz');
  admin.memberships.set('f', 'group-f');
  const currentUser = await authenticatedUser(admin, { headers: { authorization: 'Bearer access-x' } });
  const originalProfile = admin.from('profiles');

  const snapshot = await removeAccountGroupUser(admin, currentUser, 'y');
  assert.deepEqual(snapshot.members.map((member) => member.id), ['x', 'z']);
  assert.equal(admin.memberships.has('y'), false);
  assert.equal(admin.memberships.get('f'), 'group-f');
  assert.equal((await originalProfile.in('id', ['y'])).data[0].id, 'y');
  await assert.rejects(removeAccountGroupUser(admin, currentUser, 'x'), /cannot_remove_current_account/);
  await assert.rejects(removeAccountGroupUser(admin, currentUser, 'y'), /account_group_member_not_linked/);
  assert.equal(removalFailure(new Error('account_group_member_not_linked')).status, 409);
});

test('the removal endpoint requires the active user and removes only a valid same-group UUID member', async () => {
  const admin = createMockAdmin();
  const currentId = '11111111-1111-4111-8111-111111111111';
  const removedId = '22222222-2222-4222-8222-222222222222';
  const currentUser = { id: currentId, email: 'current@example.test', user_metadata: { full_name: 'Current' } };
  const removedUser = { id: removedId, email: 'removed@example.test', user_metadata: { full_name: 'Removed' } };
  admin.users.set('access-current', currentUser);
  admin.users.set('access-removed', removedUser);
  admin.profiles.set(currentId, { id: currentId, full_name: 'Current', username: 'current', role: 'client' });
  admin.profiles.set(removedId, { id: removedId, full_name: 'Removed', username: 'removed', role: 'client' });
  admin.memberships.set(currentId, 'group-uuid');
  admin.memberships.set(removedId, 'group-uuid');

  const app = express();
  app.use(express.json());
  app.use('/api', createAccountGroupRoutes(admin));
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/account-groups/${removedId}`, {
      method: 'DELETE',
      headers: { authorization: 'Bearer access-current' }
    });
    assert.equal(response.status, 200);
    assert.deepEqual((await response.json()).members.map((member) => member.id), [currentId]);
    assert.equal(admin.memberships.has(removedId), false);

    const selfResponse = await fetch(`http://127.0.0.1:${server.address().port}/api/account-groups/${currentId}`, {
      method: 'DELETE',
      headers: { authorization: 'Bearer access-current' }
    });
    assert.equal(selfResponse.status, 400);
    assert.match((await selfResponse.json()).error, /switch accounts/i);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('migration makes membership private and enforces an atomic three-member cap', () => {
  const migration = fs.readFileSync(path.join(__dirname, '../migrations/20261023_000049_linked_account_groups.sql'), 'utf8');
  assert.match(migration, /user_id uuid primary key references auth\.users\(id\) on delete cascade/i);
  assert.match(migration, /enable row level security/i);
  assert.match(migration, /revoke all on table public\.account_group_members from public, anon, authenticated/i);
  assert.match(migration, /grant execute on function public\.varoom_link_account_group_users[\s\S]*to service_role/i);
  assert.match(migration, /pg_advisory_xact_lock\(hashtextextended\('varoom-account-group-membership'/i);
  assert.match(migration, /v_count > 3/i);
  assert.match(migration, /v_member_count >= 3/i);
});

test('saved-account removal migration deletes only a selected linked membership', () => {
  const migration = fs.readFileSync(path.join(__dirname, '../migrations/20261026_000050_remove_linked_account_group_member.sql'), 'utf8');
  assert.match(migration, /create or replace function public\.varoom_remove_account_group_member/i);
  assert.match(migration, /p_current_user = p_removed_user/i);
  assert.match(migration, /delete from public\.account_group_members/i);
  assert.match(migration, /grant execute on function public\.varoom_remove_account_group_member[\s\S]*to service_role/i);
  assert.doesNotMatch(migration, /delete from public\.(profiles|listings|bookings|chats)/i);
  assert.doesNotMatch(migration, /delete_user/i);
});
