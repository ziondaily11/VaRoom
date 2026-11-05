import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { getSupabaseClient } from '../../lib/supabase/client';
import { applyTheme } from '../../lib/theme';
import { switchAccount, useLinkedAccounts, type LinkedAccount } from '../../lib/account/accountActions';
import {
  applyFontSize, canDelete, DEFAULT_FONT_INDEX, DELETE_REASONS, FONT_SIZE_KEY, FONT_SIZES, fontSizeIndex, NOTIFICATION_ROWS, savedTheme, savePreferences,
  THEME_KEY, type NotificationKey, type Preferences, type ThemeChoice,
} from '../../lib/settings/settings';
import { CAT_ICONS, ChevronRight, DetailHead, INFO_ICONS, SearchIcon, THEME_ICONS } from './SettingsIcons';

// The Settings sections other than Your Account (legacy settings.html).

type Notify = (message: string) => void;

// ---------- Category list ----------

const CATEGORIES: Array<{ key: string; title: string; desc: string; href?: string }> = [
  { key: 'account', title: 'Your Account', desc: 'Manage your personal info, password and account status.' },
  { key: 'notifications', title: 'Notifications', desc: 'Choose what notifications you want to receive.' },
  { key: 'display', title: 'Display', desc: 'Customize appearance and accessibility settings.' },
  { key: 'privacy', title: 'Privacy & Security', desc: 'Control your privacy, visibility and security preferences.' },
  { key: 'support', title: 'Support & About', desc: 'Get help, view policies and learn more about VaRoom.', href: '/support' },
  { key: 'login-accounts', title: 'Login & Accounts', desc: 'Log out of VaRoom.' },
];
// Hosts only, after Your Account.
const PLANS_CATEGORY: (typeof CATEGORIES)[number] = { key: 'plans', title: 'Plans & Billing', desc: 'See your plan, listings left, payment method and invoices.' };

export function CategoryList({ active, onOpen, isHost = false }: { active: string; onOpen: (key: string) => void; isHost?: boolean }) {
  const [query, setQuery] = useState('');
  const categories = isHost ? [CATEGORIES[0], PLANS_CATEGORY, ...CATEGORIES.slice(1)] : CATEGORIES;
  const q = query.trim().toLowerCase();
  const visible = (title: string) => !q || title.toLowerCase().includes(q);
  return (
    <div id="view-list">
      <h1 className="page-title">Settings</h1>
      <div className="settings-search">
        <SearchIcon />
        <input type="search" id="settings-search-input" placeholder="Search Settings" aria-label="Search settings" value={query} onChange={(event) => setQuery(event.target.value)} />
      </div>
      <div className="cat-list">
        {categories.map((cat) => {
          const inner = (
            <>
              <span className="cat-icon">{CAT_ICONS[cat.key]}</span>
              <span className="cat-main"><span className="cat-title">{cat.title}</span><span className="cat-desc">{cat.desc}</span></span>
              <span className="cat-chevron"><ChevronRight /></span>
            </>
          );
          if (cat.href) return <Link key={cat.key} href={cat.href} className="cat-row" hidden={!visible(cat.title)}>{inner}</Link>;
          return <button key={cat.key} type="button" className={`cat-row${active === cat.key ? ' active' : ''}`} hidden={!visible(cat.title)} onClick={() => onOpen(cat.key)}>{inner}</button>;
        })}
        <div className="soon-divider">Coming soon</div>
        <div className="cat-row disabled" hidden={!visible('Payments & Payouts')}>
          <span className="cat-icon">{CAT_ICONS.payments}</span>
          <span className="cat-main">
            <span className="cat-title-row"><span className="cat-title">Payments &amp; Payouts</span><span className="soon-badge">Soon</span></span>
            <span className="cat-desc">Manage payment methods, payouts and transaction history.</span>
          </span>
          <span className="cat-chevron mobile-only-chevron"><ChevronRight /></span>
        </div>
      </div>
    </div>
  );
}

export function SettingsSkeleton() {
  const row = (chevron: boolean, key: number) => (
    <div className="skeleton-cat-row" key={key}>
      <span className="skeleton-nav-icon"><span className="skeleton-nav-icon-shape" /></span>
      <span className="cat-main"><span className="skeleton-nav-title" /></span>
      {chevron && <span className="skeleton-nav-chevron"><span className="skeleton-nav-chevron-shape" /></span>}
    </div>
  );
  return (
    <div className="settings-skeleton" aria-label="Loading settings navigation" role="status">
      <div className="page-title" aria-hidden="true"><div className="skeleton-heading" /></div>
      <div className="skeleton-search" aria-hidden="true"><span className="skeleton-search-glyph" /><span className="skeleton-search-placeholder" /></div>
      <div className="cat-list" aria-hidden="true">
        {[0, 1, 2, 3, 4, 5].map((i) => row(true, i))}
        <div className="soon-divider skeleton-soon-divider" aria-hidden="true">Coming soon</div>
        {row(false, 6)}
      </div>
    </div>
  );
}

// ---------- Notifications ----------

export function NotificationsSection({ userId, prefs, onBack, notify }: { userId: string; prefs: Preferences | null; onBack: () => void; notify: Notify }) {
  const [values, setValues] = useState<Record<NotificationKey, boolean>>({ notify_messages: false, notify_bookings: false, notify_account_updates: false, notify_marketing: false });
  useEffect(() => {
    if (!prefs) return;
    setValues({
      notify_messages: Boolean(prefs.notify_messages),
      notify_bookings: Boolean(prefs.notify_bookings),
      notify_account_updates: Boolean(prefs.notify_account_updates),
      notify_marketing: Boolean(prefs.notify_marketing),
    });
  }, [prefs]);

  const change = async (key: NotificationKey, value: boolean) => {
    setValues((current) => ({ ...current, [key]: value }));
    const client = getSupabaseClient();
    if (!client) return;
    const error = await savePreferences(client, userId, { [key]: value });
    if (error) {
      setValues((current) => ({ ...current, [key]: !value }));
      notify('That notification setting could not be saved. Please try again.');
    }
  };

  return (
    <div id="view-notifications">
      <DetailHead title="Notifications" onBack={onBack} />
      <p className="detail-sub">Choose what VaRoom is allowed to send you.</p>
      <div className="card">
        {NOTIFICATION_ROWS.map((row) => (
          <div className="toggle-row" key={row.key}>
            <div><div className="toggle-label">{row.label}</div></div>
            <label className="switch"><input type="checkbox" checked={values[row.key]} onChange={(event) => change(row.key, event.target.checked)} /><span className="switch-track" /></label>
          </div>
        ))}
      </div>
      <div className="note-box">In-app notifications (the bell icon) already reflect your activity. These preferences control which of them you get, and will extend to email/push once those exist.</div>
    </div>
  );
}

// ---------- Display ----------

export function DisplaySection({ userId, onBack }: { userId: string; onBack: () => void }) {
  const router = useRouter();
  const [theme, setTheme] = useState<ThemeChoice>('system');
  const [fontIndex, setFontIndex] = useState(DEFAULT_FONT_INDEX);
  const frame = useRef<number | null>(null);

  useEffect(() => {
    let storage: Storage | null = null;
    try { storage = window.localStorage; } catch { /* default */ }
    setTheme(savedTheme(storage));
    setFontIndex(fontSizeIndex(storage));
  }, []);
  useEffect(() => () => { if (frame.current !== null) cancelAnimationFrame(frame.current); }, []);

  const chooseTheme = (choice: ThemeChoice) => {
    setTheme(choice);
    try { window.localStorage.setItem(THEME_KEY, choice); } catch { /* This visit only. */ }
    applyTheme(router.asPath || '/settings');
    const client = getSupabaseClient();
    if (client) void savePreferences(client, userId, { theme_preference: choice });
  };

  const previewFont = (index: number) => {
    setFontIndex(index);
    if (frame.current !== null) return;
    frame.current = requestAnimationFrame(() => { frame.current = null; applyFontSize(document, index); });
  };
  const saveFont = (index: number) => {
    const size = applyFontSize(document, index);
    setFontIndex(index);
    try { window.localStorage.setItem(FONT_SIZE_KEY, size.key); } catch { /* This visit only. */ }
  };
  const label = (FONT_SIZES[fontIndex] || FONT_SIZES[DEFAULT_FONT_INDEX]).label;
  const lastStop = FONT_SIZES.length - 1;

  return (
    <div id="view-display">
      <DetailHead title="Display" onBack={onBack} />
      <p className="detail-sub">Appearance and accessibility preferences.</p>
      <div className="settings-section">
        <p className="section-title">Appearance</p>
        <div className="appearance-options" id="appearance-options">
          {(['light', 'dark', 'system'] as ThemeChoice[]).map((choice) => (
            <button key={choice} type="button" className={`appearance-pill${theme === choice ? ' active' : ''}`} data-theme-choice={choice} onClick={() => chooseTheme(choice)}>
              {THEME_ICONS[choice]} {choice === 'light' ? 'Light' : choice === 'dark' ? 'Dark' : 'System'}
            </button>
          ))}
        </div>
        <div className="font-size-setting">
          {/* How text reads at this size (resizes as the slider moves). */}
          <div className="font-preview" aria-hidden="true">
            <span className="font-preview-avatar"><span className="va">Va</span></span>
            <div className="font-preview-body">
              <div className="font-preview-head"><strong>VaRoom</strong><span>@varoom · now</span></div>
              <p>VaRoom is home to every space you&apos;re looking for — a weekend stay, a home to rent, an office, a shop or a venue for your big day — with hosts who make it yours.</p>
            </div>
          </div>
          <div className="font-size-setting-head">
            <span className="font-size-setting-label">Font size</span>
            <span className="font-size-setting-value">{label}</span>
          </div>
          <div className="font-size-slider-row">
            <span className="font-size-mark small" aria-hidden="true">Aa</span>
            <div className="font-size-rail" style={{ '--fs-progress': `${(fontIndex / lastStop) * 100}%` } as React.CSSProperties}>
              <span className="font-size-line" aria-hidden="true" />
              <span className="font-size-fill" aria-hidden="true" />
              {FONT_SIZES.map((size, index) => (
                <span
                  key={size.key}
                  aria-hidden="true"
                  className={`font-size-stop${index <= fontIndex ? ' reached' : ''}${index === fontIndex ? ' current' : ''}`}
                  style={{ left: `${(index / lastStop) * 100}%` }}
                />
              ))}
              <input
                id="font-size-slider"
                className="font-size-range"
                type="range"
                min={0}
                max={lastStop}
                step={1}
                value={fontIndex}
                aria-label="Font size across VaRoom"
                aria-valuetext={label}
                onChange={(event) => previewFont(Number(event.target.value))}
                onPointerUp={(event) => saveFont(Number((event.target as HTMLInputElement).value))}
                onKeyUp={(event) => saveFont(Number((event.target as HTMLInputElement).value))}
              />
            </div>
            <span className="font-size-mark large" aria-hidden="true">Aa</span>
          </div>
          <p className="font-size-note">Applies on every VaRoom page on this device.</p>
        </div>
      </div>
    </div>
  );
}

// ---------- Privacy & Security ----------

export function PrivacySection({ userId, prefs, onBack, onPassword }: { userId: string; prefs: Preferences | null; onBack: () => void; onPassword: () => void }) {
  const [values, setValues] = useState({ profile_visibility: 'public', who_can_message: 'everyone', location_visibility: 'general_area' });
  const [msg, setMsg] = useState<{ text: string; kind: string }>({ text: '', kind: '' });
  useEffect(() => {
    if (!prefs) return;
    setValues((current) => ({
      profile_visibility: prefs.profile_visibility || current.profile_visibility,
      who_can_message: prefs.who_can_message || current.who_can_message,
      location_visibility: prefs.location_visibility || current.location_visibility,
    }));
  }, [prefs]);
  const set = (key: keyof typeof values) => (event: React.ChangeEvent<HTMLSelectElement>) => setValues((current) => ({ ...current, [key]: event.target.value }));

  const save = async () => {
    const client = getSupabaseClient();
    if (!client) return;
    const error = await savePreferences(client, userId, values);
    setMsg(error ? { text: error, kind: 'error' } : { text: 'Saved.', kind: 'success' });
  };

  return (
    <div id="view-privacy">
      <DetailHead title="Privacy & Security" onBack={onBack} />
      <p className="detail-sub">Control your visibility and how people can reach you.</p>
      <div className="settings-section">
        <p className="section-title">Privacy</p>
        <div className="card" style={{ padding: '1.2rem' }}>
          <div className="field">
            <label htmlFor="profile-visibility">Profile visibility</label>
            <select id="profile-visibility" value={values.profile_visibility} onChange={set('profile_visibility')}>
              <option value="public">Public — visible to anyone browsing VaRoom</option>
              <option value="private">Private</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="who-can-message">Who can message you</label>
            <select id="who-can-message" value={values.who_can_message} onChange={set('who_can_message')}>
              <option value="everyone">Everyone</option>
              <option value="no_one">No one</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="location-visibility">Location visibility</label>
            <select id="location-visibility" value={values.location_visibility} onChange={set('location_visibility')}>
              <option value="general_area">General area only</option>
              <option value="hidden">Hidden</option>
              <option value="exact">Exact location only when required for a booking</option>
            </select>
          </div>
          <button type="button" className="btn" onClick={save}>Save privacy settings</button>
          <p className={`inline-msg${msg.kind ? ` ${msg.kind}` : ''}`}>{msg.text}</p>
        </div>
        <div className="note-box">Private: only people you already have a chat or booking with can open your host profile. No one: nobody can start a new chat with you, and chats you already have carry on. Location visibility is saved for when location-based search uses it.</div>
      </div>
      <div className="settings-section">
        <p className="section-title">Security</p>
        <div className="card">
          <a href="#" className="info-row clickable" onClick={(event) => { event.preventDefault(); onPassword(); }}>
            <span className="info-icon">{INFO_ICONS.lock}</span>
            <span className="info-main"><span className="info-label">Password</span><span className="info-value" style={{ fontWeight: 500 }}>Manage it from Your Account</span></span>
            <span className="info-chevron"><ChevronRight size={16} /></span>
          </a>
        </div>
        <div className="note-box">Login activity, device management and two-factor authentication aren&apos;t built yet — they&apos;ll land here as the platform matures.</div>
      </div>
    </div>
  );
}

// ---------- Support & About ----------

function LinkRow({ href, icon, label, value, external }: { href: string; icon: React.ReactNode; label: string; value?: string; external?: boolean }) {
  const inner = (
    <>
      <span className="info-icon">{icon}</span>
      <span className="info-main"><span className="info-label">{label}</span>{value && <span className="info-value" style={{ fontWeight: 500 }}>{value}</span>}</span>
      <span className="info-chevron"><ChevronRight size={16} /></span>
    </>
  );
  if (href.startsWith('mailto:') || external) {
    return <a className="info-row clickable" href={href} {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>{inner}</a>;
  }
  return <Link className="info-row clickable" href={href}>{inner}</Link>;
}

export function SupportSection({ onBack }: { onBack: () => void }) {
  return (
    <div id="view-support">
      <DetailHead title="Support & About" onBack={onBack} />
      <p className="detail-sub">Help, contact, policies and information about VaRoom.</p>
      <div className="settings-section">
        <p className="section-title">Help</p>
        <div className="card">
          <LinkRow href="/support" icon={INFO_ICONS.help} label="Help Centre" value="Answers to common questions" />
          <LinkRow href="mailto:privacy@varoom.co.ke?subject=VaRoom%20Support" icon={INFO_ICONS.chat} label="Contact VaRoom" value="Get in touch with the team" />
          <LinkRow href="mailto:privacy@varoom.co.ke?subject=VaRoom%20—%20Problem%20report" icon={INFO_ICONS.warning} label="Report a Problem" value="Something not working right?" />
        </div>
      </div>
      <div className="settings-section">
        <p className="section-title">Policies</p>
        <div className="card">
          <LinkRow href="/privacy" icon={INFO_ICONS.shield} label="Privacy Policy" external />
          <LinkRow href="/terms" icon={INFO_ICONS.file} label="Terms & Conditions" external />
        </div>
      </div>
      <div className="settings-section">
        <p className="section-title">About</p>
        <div className="card">
          <div className="about-block">
            <strong>VaRoom</strong> is a hospitality marketplace connecting hosts and guests across Kenya.
            <br /><br />
            VaRoom, Nairobi, Kenya.<br />
            © {new Date().getFullYear()} VaRoom. All rights reserved.
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------- Login & Accounts ----------

interface SwitcherExtras {
  canAddAccount?: () => boolean;
  startAddAccount?: (redirect: string) => void;
  removeLinkedAccount?: (client: unknown, accountId: string) => Promise<unknown>;
}
const switcher = () => (typeof window === 'undefined' ? null : (window.VaRoomAccountSwitcher as unknown as SwitcherExtras | undefined) || null);

function accountInitial(account: LinkedAccount): string {
  const name = (account.full_name || account.email || 'VaRoom member').trim();
  return name ? name.charAt(0).toUpperCase() : '?';
}

export function LoginAccountsSection({ userId, onBack, onDelete, notify, onLogout }: {
  userId: string; onBack: () => void; onDelete: () => void; notify: Notify; onLogout: () => Promise<void>;
}) {
  const accounts = useLinkedAccounts();
  const [confirmLogout, setConfirmLogout] = useState(false);
  const [switching, setSwitching] = useState<string | null>(null);
  const [removing, setRemoving] = useState<LinkedAccount | null>(null);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const removeDialog = useRef<HTMLDialogElement>(null);

  const current = accounts.find((account) => account.id === userId);
  const others = accounts.filter((account) => account.id !== userId && !hidden.has(account.id));
  const atLimit = switcher()?.canAddAccount ? !switcher()!.canAddAccount!() : false;

  const logIn = async (account: LinkedAccount) => {
    setSwitching(account.id);
    try {
      await switchAccount(account.id);
    } catch {
      setSwitching(null);
      notify('That account needs you to sign in again.');
    }
  };

  const openRemove = (account: LinkedAccount) => {
    setRemoving(account);
    removeDialog.current?.showModal?.();
  };
  const confirmRemove = () => {
    const account = removing;
    const s = switcher();
    removeDialog.current?.close?.();
    setRemoving(null);
    if (!account || !s?.removeLinkedAccount) return;
    // The row goes at once; the switcher updates the group and the list.
    setHidden((current) => new Set(current).add(account.id));
    s.removeLinkedAccount(getSupabaseClient(), account.id).then(() => {
      notify('Saved account removed. Its VaRoom account and data were not deleted.');
    }).catch((error: Error & { removalSucceeded?: boolean }) => {
      if (!error?.removalSucceeded) setHidden((current) => { const next = new Set(current); next.delete(account.id); return next; });
      notify(error?.message || 'Unable to remove this saved account.');
    });
  };

  const row = (account: LinkedAccount, isActive: boolean) => (
    <div className="dashboard-account" key={account.id}>
      <span className="dashboard-account-avatar">
        {account.avatar_url && account.avatar_url.indexOf('http') === 0 ? <img src={account.avatar_url} alt="" /> : accountInitial(account)}
      </span>
      <span className="dashboard-account-info">
        <span className="dashboard-account-name">{account.full_name || 'VaRoom member'}</span>
        <span className="dashboard-account-email">{account.email || 'Email unavailable'}</span>
        {isActive && <span className="dashboard-account-current">Current account</span>}
      </span>
      <span className="dashboard-account-actions">
        {!isActive && (
          <>
            <button type="button" className="login-account-btn" disabled={switching === account.id} onClick={() => logIn(account)}>Log in</button>
            <button type="button" className="remove-account-btn" onClick={() => openRemove(account)}>Remove account</button>
          </>
        )}
        {isActive && <button type="button" className="delete-account-btn" onClick={onDelete}>Delete account</button>}
      </span>
    </div>
  );

  const name = removing ? removing.full_name || removing.email || 'this account' : '';
  return (
    <div id="view-login-accounts">
      <DetailHead title="Login & Accounts" onBack={onBack} />
      <p className="detail-sub">Manage how you&apos;re signed in to VaRoom.</p>
      <div className="settings-section">
        <p className="section-title">Accounts on this dashboard</p>
        <div className="card dashboard-accounts" id="dashboard-accounts-list">
          {current && row(current, true)}
          {!others.length && <p className="accounts-empty">No other accounts are stored on this dashboard.</p>}
          {others.map((account) => row(account, false))}
        </div>
        <button
          type="button"
          className="btn btn-ghost"
          style={{ marginTop: '.9rem' }}
          disabled={atLimit}
          aria-disabled={atLimit}
          onClick={() => { if (!atLimit) switcher()?.startAddAccount?.('/settings'); }}
        >+ Add account</button>
        <p className="account-limit-note">{atLimit ? 'Account limit reached (3/3).' : `${accounts.length}/3 accounts stored on this dashboard.`}</p>
      </div>
      <div className="accounts-divider" aria-hidden="true" />
      <div className="logout-section">
        <button type="button" className="btn btn-ghost" onClick={() => setConfirmLogout(true)}>Log out</button>
        <div className={`logout-confirm-panel${confirmLogout ? ' show' : ''}`}>
          <p className="inline-msg neutral">Are you sure you want to log out?</p>
          <div className="logout-confirm-actions">
            <button type="button" className="btn btn-ghost" onClick={() => setConfirmLogout(false)}>Cancel</button>
            <button type="button" className="btn" onClick={() => { void onLogout(); }}>Log out</button>
          </div>
        </div>
      </div>
      <dialog className="delete-account-dialog" ref={removeDialog} aria-labelledby="remove-linked-account-title" onClose={() => setRemoving(null)}>
        <h2 id="remove-linked-account-title">Remove saved account?</h2>
        <p>{removing
          ? `Remove ${name} from this dashboard? This only removes the saved account association. The VaRoom account and its listings, bookings, chats, profile, and other data will remain available.`
          : 'This removes the saved account association from this dashboard. The VaRoom account and its listings, bookings, chats, profile, and other data will remain available.'}</p>
        <div className="delete-account-actions">
          <button type="button" className="btn btn-ghost" onClick={() => removeDialog.current?.close?.()}>Cancel</button>
          <button type="button" className="btn btn-danger" onClick={confirmRemove}>Remove account</button>
        </div>
      </dialog>
    </div>
  );
}

// ---------- Delete account dialog ----------

export function DeleteAccountDialog({ open, onClose, onConfirm }: { open: boolean; onClose: () => void; onConfirm: (reason: string, details: string) => Promise<void> }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [reason, setReason] = useState('');
  const [details, setDetails] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) { setReason(''); setDetails(''); setBusy(false); dialog.showModal?.(); }
    if (!open && dialog.open) dialog.close();
  }, [open]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canDelete(reason, details)) return;
    setBusy(true);
    try {
      await onConfirm(reason, details);
    } catch {
      setBusy(false);
    }
  };

  return (
    <dialog className="delete-account-dialog" ref={ref} aria-labelledby="delete-account-title" onClose={onClose}>
      <h2 id="delete-account-title">Delete account?</h2>
      <p>Your account is deactivated straight away: your profile, listings and other content are hidden from other people, and you&apos;re signed out on every device. If you don&apos;t sign in within 30 days, the account and its data are permanently deleted and can&apos;t be recovered. Signing in before then restores everything.</p>
      <form onSubmit={submit}>
        <label htmlFor="delete-account-reason">Why are you deleting your account?</label>
        <select id="delete-account-reason" required value={reason} onChange={(event) => setReason(event.target.value)}>
          <option value="">Select a reason</option>
          {DELETE_REASONS.map((value) => <option key={value}>{value}</option>)}
        </select>
        <textarea placeholder="Tell us more" hidden={reason !== 'Other'} required={reason === 'Other'} value={details} onChange={(event) => setDetails(event.target.value)} />
        <div className="delete-account-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-danger" disabled={busy || !canDelete(reason, details)}>{busy ? 'Deleting...' : 'Delete my account'}</button>
        </div>
      </form>
    </dialog>
  );
}
