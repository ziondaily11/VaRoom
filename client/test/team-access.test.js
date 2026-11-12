const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadTs } = require('./helpers/loadTs');

const root = path.join(__dirname, '..');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');
const team = loadTs(path.join(root, 'lib', 'team', 'team.ts'), { mocks: { react: { useSyncExternalStore: () => null } } });

test('team: three roles; whose bookings a page shows', () => {
  assert.deepEqual(team.TEAM_ROLES.map((role) => role.key), ['manager', 'messaging', 'finance']);
  const work = (roles) => ({ userId: 'u1', hostId: 'h1', name: 'Palm View Realty', roles });
  assert.equal(team.managerHostId('u1', null), 'u1');
  assert.equal(team.managerHostId('u1', work(['manager'])), 'h1');
  assert.equal(team.managerHostId('u1', work(['messaging'])), 'u1', 'only Managers handle bookings');
  assert.equal(team.personName({ id: 'x', full_name: null, username: 'palmview', avatar_url: null }), '@palmview');
});

test('team: changes go through the database functions, and their reasons are shown', async () => {
  const calls = [];
  const client = { rpc: async (name, args) => { calls.push([name, args]); return { error: name === 'varoom_team_accept' ? { message: 'team: That invitation is no longer open.' } : null }; } };
  assert.equal(await team.inviteToTeam(client, '@palmview', ['manager']), null);
  assert.equal(await team.acceptTeam(client, 'h1'), 'That invitation is no longer open.');
  await team.leaveTeam(client, 'h1', 'u1');
  assert.deepEqual(calls, [
    ['varoom_team_invite', { p_username: '@palmview', p_roles: ['manager'] }],
    ['varoom_team_accept', { p_host: 'h1' }],
    ['varoom_team_remove', { p_host: 'h1', p_member: 'u1' }],
  ]);
});

test('wiring: Settings → Team, the banner, and bookings for the company', () => {
  assert.match(read('components', 'settings', 'SettingsSections.tsx'), /\{ key: 'team', title: 'Team'/);
  assert.match(read('pages', 'settings.tsx'), /<TeamSection userId=\{userId\} isHost=\{role === 'host'\} onBack=\{back\} \/>/);
  assert.match(read('components', 'shell', 'AppShell.tsx'), /<WorkspaceBanner \/>/);
  const page = read('pages', 'bookings.tsx');
  assert.match(page, /const hostId = managerHostId\(userId, useWorkspace\(userId\)\);/);
  assert.match(page, /<HostBookingsView key=\{hostId\} hostId=\{hostId\}/);
  const view = read('components', 'bookings', 'HostBookingsView.tsx');
  assert.match(view, /const userId = ownId \? \(hostId === ownId \? ownId : `\$\{ownId\}@\$\{hostId\}`\) : null;/, 'a company\'s bookings are cached apart from the account\'s own');
  assert.match(view, /respondToBooking\(client, \{ booking, userId: hostId, decision \}\)/);
  assert.match(read('lib', 'bookings', 'hostBookings.ts'), /if \(hostId\) headers\['X-VaRoom-Host'\] = hostId;/);
  assert.match(read('lib', 'notificationsCache.ts'), /if \(notification\.related_entity_type === 'team'\) return '\/settings\?section=team';/);
});

test('working as a company: API calls name it; the listing wizard and Team page use it', () => {
  const lib = read('lib', 'team', 'team.ts');
  assert.match(lib, /const ownApi = url\.startsWith\('\/api\/'\) \|\| url\.startsWith\(`\$\{window\.location\.origin\}\/api\/`\);/, 'only VaRoom\'s own API');
  assert.match(lib, /if \(!headers\.has\('X-VaRoom-Host'\)\) headers\.set\('X-VaRoom-Host', workspace\.hostId\);/);
  const list = read('pages', 'list.tsx');
  assert.match(list, /const userId = managerHostId\(ownId, useWorkspace\(ownId\)\);/);
  assert.match(list, /session\.user\.id === ownId \? session\.access_token : null/, 'the session check stays the signed-in account');
  const section = read('components', 'settings', 'TeamSection.tsx');
  assert.match(section, /\{current && row\.roles\.includes\('manager'\) && <CompanyListings hostId=\{row\.host\.id\} \/>\}/);
  assert.match(section, /href=\{`\/list\?edit=\$\{encodeURIComponent\(listing\.id\)\}`\}/);
  assert.match(read('components', 'shell', 'WorkspaceBanner.tsx'), /if \(userId && stored && stored\.userId !== userId\) setWorkspace\(null\);/, 'another account on this tab goes back to its own');
});
