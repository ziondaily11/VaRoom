import React from 'react';
import Link from 'next/link';
import { useAuth } from '../../lib/auth/AuthProvider';
import { setWorkspace, useWorkspace } from '../../lib/team/team';

/** While working as a company (Settings → Team), a bar says so on every page. */
export default function WorkspaceBanner() {
  const { user } = useAuth();
  const workspace = useWorkspace(user?.id || null);
  if (!workspace) return null;
  return (
    <div className="workspace-banner" role="status">
      <span>Working as <strong>{workspace.name}</strong></span>
      <Link href="/settings?section=team">Team</Link>
      <button type="button" onClick={() => setWorkspace(null)}>Switch back</button>
      <style>{`
        .workspace-banner{ position:sticky; top:0; z-index:60; display:flex; align-items:center; justify-content:center; flex-wrap:wrap; gap:.4rem 1rem;
          padding:.5rem 1rem; background:#1a1210; color:#fff; font-size:.85rem; }
        .workspace-banner a, .workspace-banner button{ color:#fff; font:inherit; font-weight:600; text-decoration:underline; background:none; border:0; padding:0; cursor:pointer; }
      `}</style>
    </div>
  );
}
