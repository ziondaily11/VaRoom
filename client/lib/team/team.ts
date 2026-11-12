import { useSyncExternalStore } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';

// Team access: a host's team (people with their own VaRoom accounts and
// roles), the teams the signed-in person belongs to, and the company they are
// currently working as. The database decides what each role may do.

export type TeamRole = 'manager' | 'messaging' | 'finance';

export const TEAM_ROLES: Array<{ key: TeamRole; label: string; desc: string }> = [
  { key: 'manager', label: 'Manager', desc: 'Listings and bookings' },
  { key: 'messaging', label: 'Messaging', desc: 'Chats with guests' },
  { key: 'finance', label: 'Finance', desc: 'Plans, billing and analytics' },
];

export interface TeamPerson { id: string; full_name: string | null; username: string | null; avatar_url: string | null }
export interface TeamMember { member: TeamPerson; roles: TeamRole[]; status: 'invited' | 'active' }
export interface Membership { host: TeamPerson; roles: TeamRole[]; status: 'invited' | 'active' }

const PERSON = 'id,full_name,username,avatar_url';

export async function loadTeam(client: SupabaseClient, hostId: string): Promise<TeamMember[]> {
  const { data, error } = await client.from('host_team_members')
    .select(`roles,status,member:profiles!host_team_members_member_id_fkey(${PERSON})`)
    .eq('host_id', hostId).order('invited_at');
  if (error) throw new Error(error.message);
  return ((data || []) as unknown as TeamMember[]).filter((row) => row.member);
}

export async function loadMemberships(client: SupabaseClient, userId: string): Promise<Membership[]> {
  const { data, error } = await client.from('host_team_members')
    .select(`roles,status,host:profiles!host_team_members_host_id_fkey(${PERSON})`)
    .eq('member_id', userId).order('invited_at');
  if (error) throw new Error(error.message);
  return ((data || []) as unknown as Membership[]).filter((row) => row.host);
}

/** The database's reason ("team: …") without the prefix. */
const reason = (error: { message: string } | null) => (error ? error.message.replace(/^team: /, '') : null);

export const inviteToTeam = async (client: SupabaseClient, username: string, roles: TeamRole[]) =>
  reason((await client.rpc('varoom_team_invite', { p_username: username, p_roles: roles })).error);
export const setTeamRoles = async (client: SupabaseClient, memberId: string, roles: TeamRole[]) =>
  reason((await client.rpc('varoom_team_set_roles', { p_member: memberId, p_roles: roles })).error);
export const acceptTeam = async (client: SupabaseClient, hostId: string) =>
  reason((await client.rpc('varoom_team_accept', { p_host: hostId })).error);
/** The owner removes someone, or a member declines or leaves. */
export const leaveTeam = async (client: SupabaseClient, hostId: string, memberId: string) =>
  reason((await client.rpc('varoom_team_remove', { p_host: hostId, p_member: memberId })).error);

export const personName = (person: TeamPerson) => person.full_name || (person.username ? `@${person.username}` : 'VaRoom member');

// ---- Working as a company (this tab, per signed-in account) ----

export interface Workspace { userId: string; hostId: string; name: string; roles: TeamRole[] }

const KEY = 'varoom_workspace';
const listeners = new Set<() => void>();
let current: Workspace | null | undefined;

function read(): Workspace | null {
  if (current !== undefined) return current;
  try { current = JSON.parse(window.sessionStorage.getItem(KEY) || 'null') as Workspace | null; } catch { current = null; }
  return current;
}

export function setWorkspace(next: Workspace | null): void {
  current = next;
  try {
    if (next) window.sessionStorage.setItem(KEY, JSON.stringify(next)); else window.sessionStorage.removeItem(KEY);
  } catch { /* This page only. */ }
  listeners.forEach((listener) => listener());
}

const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };

/** The company the signed-in account is working as, or null (another account's choice never applies). */
export function useWorkspace(userId: string | null): Workspace | null {
  const workspace = useSyncExternalStore(subscribe, read, () => null);
  return workspace && workspace.userId === userId ? workspace : null;
}

/** Whose bookings the page shows: the company's for a Manager working as it, otherwise the account's own. */
export const bookingsHostId = (userId: string | null, workspace: Workspace | null) =>
  (workspace && workspace.roles.includes('manager') ? workspace.hostId : userId);
