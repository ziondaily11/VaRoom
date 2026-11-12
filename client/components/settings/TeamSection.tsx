import React, { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { getSupabaseClient } from '../../lib/supabase/client';
import {
  acceptTeam, inviteToTeam, leaveTeam, loadCompanyListings, loadMemberships, loadTeam, personName, setTeamRoles, setWorkspace, TEAM_ROLES, useWorkspace,
  type CompanyListing, type Membership, type TeamMember, type TeamRole,
} from '../../lib/team/team';
import { DetailHead } from './SettingsIcons';

// Settings → Team: a host's team (invite by username, roles, remove), and the
// teams this account belongs to (accept, work as the company, leave).

type Msg = { text: string; kind: '' | 'success' | 'error' };

/** Roles as plain rows (inviting), or one inline line (someone already on the team). */
function RolePicker({ value, onChange, idPrefix, compact = false }: { value: TeamRole[]; onChange: (roles: TeamRole[]) => void; idPrefix: string; compact?: boolean }) {
  return (
    <div className={`team-roles${compact ? ' compact' : ''}`} role="group" aria-label="Roles">
      {TEAM_ROLES.map((role) => (
        <label key={role.key} className="team-role" htmlFor={`${idPrefix}-${role.key}`}>
          <input
            type="checkbox"
            id={`${idPrefix}-${role.key}`}
            checked={value.includes(role.key)}
            onChange={(event) => onChange(event.target.checked ? [...value, role.key] : value.filter((key) => key !== role.key))}
          />
          <span className="team-role-text"><strong>{role.label}</strong>{!compact && <span>{role.desc}</span>}</span>
        </label>
      ))}
    </div>
  );
}

/** The company's listings for a Manager working as it: edit one, or add a new one. */
function CompanyListings({ hostId }: { hostId: string }) {
  const [listings, setListings] = useState<CompanyListing[] | null>(null);
  useEffect(() => {
    const client = getSupabaseClient();
    if (!client) return undefined;
    let active = true;
    loadCompanyListings(client, hostId).then((rows) => { if (active) setListings(rows); }, () => { if (active) setListings([]); });
    return () => { active = false; };
  }, [hostId]);
  return (
    <div className="team-listings">
      <div className="team-listings-head"><strong>Listings</strong><Link href="/list" className="team-link">+ Add a listing</Link></div>
      {listings === null ? <p className="team-empty">Loading listings…</p> : !listings.length ? <p className="team-empty">No listings yet.</p> : listings.map((listing) => (
        <div className="team-listing" key={listing.id}>
          <span>{listing.title || 'Untitled listing'}{listing.publication_state !== 'published' ? ' · Draft' : listing.availability_status === 'paused' ? ' · Paused' : ''}</span>
          <Link href={`/list?edit=${encodeURIComponent(listing.id)}`} className="team-link">Edit</Link>
        </div>
      ))}
    </div>
  );
}

export default function TeamSection({ userId, isHost, onBack }: { userId: string; isHost: boolean; onBack: () => void }) {
  const router = useRouter();
  const workspace = useWorkspace(userId);
  const workspaceRef = useRef(workspace);
  workspaceRef.current = workspace;
  const [team, setTeam] = useState<TeamMember[] | null>(null);
  const [memberships, setMemberships] = useState<Membership[] | null>(null);
  const [username, setUsername] = useState('');
  const [roles, setRoles] = useState<TeamRole[]>(['manager']);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>({ text: '', kind: '' });

  const reload = useCallback(async () => {
    const client = getSupabaseClient();
    if (!client) return;
    try {
      const [mine, joined] = await Promise.all([isHost ? loadTeam(client, userId) : Promise.resolve([]), loadMemberships(client, userId)]);
      setTeam(mine);
      setMemberships(joined);
      // Working as a company this account no longer belongs to: back to its own.
      const working = workspaceRef.current;
      if (working && !joined.some((m) => m.status === 'active' && m.host.id === working.hostId)) setWorkspace(null);
    } catch {
      setMsg({ text: 'Your team could not be loaded. Please try again.', kind: 'error' });
    }
  }, [isHost, userId]);

  useEffect(() => { void reload(); }, [reload]);

  // Every change: one request, then the lists again.
  const act = async (run: (client: NonNullable<ReturnType<typeof getSupabaseClient>>) => Promise<string | null>, done: string) => {
    const client = getSupabaseClient();
    if (!client || busy) return false;
    setBusy(true);
    const error = await run(client);
    setBusy(false);
    setMsg(error ? { text: error, kind: 'error' } : { text: done, kind: 'success' });
    if (!error) await reload();
    return !error;
  };

  const invite = async () => {
    if (!username.trim() || !roles.length) { setMsg({ text: 'Enter a username and choose at least one role.', kind: 'error' }); return; }
    if (await act((client) => inviteToTeam(client, username, roles), 'Invitation sent. They can accept it in Settings → Team.')) setUsername('');
  };

  const workAs = (membership: Membership) => {
    setWorkspace({ userId, hostId: membership.host.id, name: personName(membership.host), roles: membership.roles });
    void router.push(membership.roles.includes('manager') ? '/bookings' : '/settings?section=team');
  };

  return (
    <div id="view-team">
      <DetailHead title="Team" onBack={onBack} />
      <p className="detail-sub">People with their own VaRoom accounts can help run a host account, each with the roles they need.</p>

      {isHost && (
        <div className="settings-section">
          <p className="section-title">Your team</p>
          <div className="card" style={{ padding: '1.2rem' }}>
            <div className="field">
              <label htmlFor="team-invite-username">Invite by username</label>
              <input id="team-invite-username" placeholder="@username" autoComplete="off" value={username} onChange={(event) => { setUsername(event.target.value); setMsg({ text: '', kind: '' }); }} />
            </div>
            <RolePicker value={roles} onChange={setRoles} idPrefix="team-invite" />
            <button type="button" className="btn" disabled={busy} onClick={() => { void invite(); }}>Send invitation</button>
            <p className={`inline-msg${msg.kind ? ` ${msg.kind}` : ''}`} role="status" aria-live="polite">{msg.text}</p>
          </div>
          {team === null ? <p className="team-empty">Loading your team…</p> : !team.length ? <p className="team-empty">No one on your team yet.</p> : (
            <div className="card team-list">
              {team.map((row) => (
                <div className="team-row" key={row.member.id}>
                  <div className="team-person">
                    <strong>{personName(row.member)}</strong>
                    {row.member.username && <span>@{row.member.username}</span>}
                    {row.status === 'invited' && <span className="team-chip">Invited</span>}
                  </div>
                  <RolePicker
                    compact
                    value={row.roles}
                    idPrefix={`team-${row.member.id}`}
                    onChange={(next) => { if (next.length) void act((client) => setTeamRoles(client, row.member.id, next), 'Roles updated.'); }}
                  />
                  <button type="button" className="team-link danger" disabled={busy} onClick={() => { void act((client) => leaveTeam(client, userId, row.member.id), 'Removed from your team.'); }}>
                    Remove
                  </button>
                </div>
              ))}
            </div>
          )}
          <div className="note-box">Only you manage the team, Your Account, Plans and deleting the account. Managers handle your bookings and listings; chats for Messaging and billing for Finance follow.</div>
        </div>
      )}

      <div className="settings-section">
        <p className="section-title">Teams you&apos;re on</p>
        {memberships === null ? <p className="team-empty">Loading…</p> : !memberships.length ? <p className="team-empty">You haven&apos;t been invited to a team.</p> : (
          <div className="card team-list">
            {memberships.map((row) => {
              const roleNames = row.roles.map((key) => TEAM_ROLES.find((role) => role.key === key)?.label || key).join(', ');
              const current = workspace && workspace.hostId === row.host.id;
              return (
                <div className="team-row" key={row.host.id}>
                  <div className="team-person">
                    <strong>{personName(row.host)}</strong>
                    <span>{row.status === 'invited' ? `Invited you as ${roleNames}` : roleNames}</span>
                    {current && <span className="team-chip on">Working as</span>}
                  </div>
                  <div className="team-actions">
                    {row.status === 'invited' ? (
                      <>
                        <button type="button" className="btn" disabled={busy} onClick={() => { void act((client) => acceptTeam(client, row.host.id), 'You joined the team.'); }}>Accept</button>
                        <button type="button" className="team-link" disabled={busy} onClick={() => { void act((client) => leaveTeam(client, row.host.id, userId), 'Invitation declined.'); }}>Decline</button>
                      </>
                    ) : (
                      <>
                        {current
                          ? <button type="button" className="btn" onClick={() => setWorkspace(null)}>Switch back to my account</button>
                          : <button type="button" className="btn" onClick={() => workAs(row)}>Work as {personName(row.host)}</button>}
                        <button type="button" className="team-link danger" disabled={busy} onClick={() => { if (current) setWorkspace(null); void act((client) => leaveTeam(client, row.host.id, userId), 'You left the team.'); }}>Leave</button>
                      </>
                    )}
                  </div>
                  {current && row.roles.includes('manager') && <CompanyListings hostId={row.host.id} />}
                </div>
              );
            })}
          </div>
        )}
        {!isHost && msg.text && <p className={`inline-msg ${msg.kind}`} role="status">{msg.text}</p>}
      </div>
    </div>
  );
}
