import React, { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import { applyTheme } from '../../lib/theme';
import { switchAccount, useLinkedAccounts } from '../../lib/account/accountActions';
import { resolveAvatarUrl } from '../resolveStoredPhotoUrl';
import { getSupabaseClient } from '../../lib/supabase/client';
import { AddAccountIcon, BellIcon, ChevronDownIcon, MoonIcon, SunIcon } from './ProfileIcons';

// The profile's topbar (theme, notifications, account menu), over the
// banner, as in legacy-pages/profile.html. The account menu lists this
// dashboard's saved accounts (shared with the sidebar's account menu).

const MAX_ACCOUNTS = 3;

function Avatar({ url, name, className }: { url: string | null; name: string; className: string }) {
  return <span className={className}>{url ? <img src={url} alt="" /> : (name || '?').charAt(0).toUpperCase()}</span>;
}

export default function ProfileTopbar({ userId, name, avatarUrl, notify }: { userId: string; name: string; avatarUrl: string | null; notify: (message: string) => void }) {
  const router = useRouter();
  const accounts = useLinkedAccounts();
  const [dark, setDark] = useState(false);
  const [open, setOpen] = useState(false);
  const [switching, setSwitching] = useState<string | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => { setDark(document.documentElement.getAttribute('data-theme') === 'dark'); }, []);
  useEffect(() => {
    if (!open) return undefined;
    const onClick = (event: MouseEvent) => { if (!wrapRef.current?.contains(event.target as Node)) setOpen(false); };
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false); };
    document.addEventListener('click', onClick);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('click', onClick); document.removeEventListener('keydown', onKey); };
  }, [open]);

  const toggleTheme = () => {
    const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    try { window.localStorage.setItem('varoom_theme', next); } catch { /* storage unavailable */ }
    applyTheme(router.asPath);
    setDark(next === 'dark');
  };

  const choose = async (accountId: string) => {
    if (accountId === userId || switching) return;
    setSwitching(accountId);
    try {
      await switchAccount(accountId);
    } catch {
      setSwitching(null);
      notify('That account needs you to sign in again.');
    }
  };

  const addAccount = () => {
    const switcher = (window as unknown as { VaRoomAccountSwitcher?: { startAddAccount?: (path: string) => void } }).VaRoomAccountSwitcher;
    setOpen(false);
    switcher?.startAddAccount?.('/profile');
  };

  const ordered = [...accounts.filter((account) => account.id === userId), ...accounts.filter((account) => account.id !== userId)];
  const atLimit = accounts.length >= MAX_ACCOUNTS;
  const client = getSupabaseClient();

  return (
    <header className="profile-topbar">
      <div className="topbar-spacer" />
      <div className="topbar-actions">
        <button className="topbar-icon" type="button" id="theme-toggle-btn" aria-label="Toggle theme" onClick={toggleTheme}>{dark ? <SunIcon /> : <MoonIcon />}</button>
        <button className="topbar-icon" type="button" id="desktop-notifications-btn" aria-label="Notifications" onClick={() => { void router.push('/notifications'); }}><BellIcon /></button>
        <div className="topbar-user-wrap" ref={wrapRef}>
          <button className="topbar-user" type="button" id="topbar-user-btn" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
            <Avatar url={avatarUrl} name={name} className="topbar-user-avatar" />
            <span id="topbar-name">{name}</span>
            <ChevronDownIcon />
          </button>
          <div className={`account-dropdown${open ? ' open' : ''}`} id="account-dropdown">
            {ordered.map((account) => {
              const active = account.id === userId;
              return (
                <button
                  key={account.id}
                  type="button"
                  className={`account-row${active ? ' active' : ''}${switching === account.id ? ' switching' : ''}`}
                  onClick={() => { void choose(account.id); }}
                >
                  <Avatar url={account.avatar_url ? resolveAvatarUrl(account.avatar_url, client) : null} name={account.full_name || 'VaRoom member'} className="account-row-avatar" />
                  <span className="account-row-info">
                    <span className="account-row-name">{account.full_name || 'VaRoom member'}</span>
                    <span className="account-row-meta">{account.email || ''}</span>
                  </span>
                  {active && <span className="account-row-check">✓</span>}
                </button>
              );
            })}
            <div className="account-dropdown-divider" />
            <button type="button" className={`account-add-btn${atLimit ? ' disabled' : ''}`} disabled={atLimit} aria-disabled={atLimit} onClick={addAccount}>
              <AddAccountIcon />
              {atLimit ? 'Account limit reached (3/3)' : 'Add existing account'}
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}
