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
import { searchSettings, SECTION_TITLES, type SearchEntry } from '../../lib/settings/settingsSearch';
import { newTabProps } from '../../lib/navigation/newTab';
import ChatSettings from '../chat/ChatSettings';
import { CAT_ICONS, ChevronRight, DetailHead, INFO_ICONS, SearchIcon, THEME_ICONS } from './SettingsIcons';
import SettingsBox from './SettingsBox';

// The Settings sections other than Your Account (legacy settings.html).

type Notify = (message: string) => void;

// ---------- Category list ----------

const CATEGORIES: Array<{ key: string; title: string; desc: string; href?: string }> = [
  { key: 'account', title: 'Your Account', desc: 'Manage your personal info, password and account status.' },
  { key: 'notifications', title: 'Notifications', desc: 'Choose what notifications you want to receive.' },
  { key: 'chats', title: 'Chats', desc: 'Chat theme, quick replies, read receipts and archived chats.' },
  { key: 'display', title: 'Display', desc: 'Customise appearance and font size.' },
  { key: 'team', title: 'Team', desc: 'Your team and the teams you work on.' },
  { key: 'privacy', title: 'Privacy & Security', desc: 'Control your privacy, visibility and security preferences.' },
  { key: 'support', title: 'Support & About', desc: 'Get help, view policies and learn more about VaRoom.', href: '/support' },
  { key: 'login-accounts', title: 'Login & Accounts', desc: 'Switch or add accounts, or log out of VaRoom.' },
];
// Hosts only, after Your Account.
const PLANS_CATEGORY: (typeof CATEGORIES)[number] = { key: 'plans', title: 'Plans & Billing', desc: 'Your subscription, payment method and invoices.' };
const BOOKINGS_CATEGORY: (typeof CATEGORIES)[number] = { key: 'bookings', title: 'Bookings', desc: 'Instant book, stay lengths, check-in times and cancellations.' };

/**
 * The categories, or while searching, the matching settings (lib/settings/settingsSearch).
 * showPlans: hosts, and Finance members working as a company.
 */
export function CategoryList({ onOpen, onPick, isHost = false, showPlans = isHost }: {
  onOpen: (key: string) => void; onPick: (entry: SearchEntry) => void; isHost?: boolean; showPlans?: boolean;
}) {
  const [query, setQuery] = useState('');
  const categories = [CATEGORIES[0], ...(showPlans ? [PLANS_CATEGORY] : []), ...(isHost ? [BOOKINGS_CATEGORY] : []), ...CATEGORIES.slice(1)];
  const searching = query.trim() !== '';
  const results = searching ? searchSettings(query, { isHost, showPlans }) : [];
  return (
    <div id="view-list">
      <h1 className="page-title">Settings</h1>
      <p className="page-sub">Manage your account, preferences and app experience.</p>
      <div className="settings-search" role="search">
        <SearchIcon />
        <input
          type="search"
          id="settings-search-input"
          placeholder="Search Settings"
          aria-label="Search settings"
          aria-controls="settings-search-results"
          autoComplete="off"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Escape') setQuery('');
            if (event.key === 'Enter' && results[0]) { event.preventDefault(); onPick(results[0]); }
          }}
        />
      </div>
      {searching ? (
        <div className="cat-list" id="settings-search-results" aria-live="polite">
          {results.map((entry) => (
            <button key={`${entry.section}:${entry.label}`} type="button" className="cat-row" onClick={() => onPick(entry)}>
              <span className="cat-icon">{CAT_ICONS[entry.section]}</span>
              <span className="cat-main">
                <span className="cat-title">{entry.label}</span>
                {entry.label !== SECTION_TITLES[entry.section] && <span className="search-where">{SECTION_TITLES[entry.section]}</span>}
              </span>
              <span className="cat-chevron"><ChevronRight /></span>
            </button>
          ))}
          {!results.length && <p className="search-empty">No results for “{query.trim()}”</p>}
        </div>
      ) : (
        <div className="cat-list">
          {categories.map((cat) => {
            const inner = (
              <>
                <span className="cat-icon">{CAT_ICONS[cat.key]}</span>
                <span className="cat-main"><span className="cat-title">{cat.title}</span><span className="cat-desc">{cat.desc}</span></span>
                <span className="cat-chevron"><ChevronRight /></span>
              </>
            );
            if (cat.href) return <Link key={cat.key} href={cat.href} className="cat-row" {...newTabProps(cat.href)}>{inner}</Link>;
            return <button key={cat.key} type="button" className="cat-row" onClick={() => onOpen(cat.key)}>{inner}</button>;
          })}
          <div className="soon-divider">Coming soon</div>
          <div className="cat-row disabled">
            <span className="cat-icon">{CAT_ICONS.payments}</span>
            <span className="cat-main">
              <span className="cat-title-row"><span className="cat-title">Payments &amp; Payouts</span><span className="soon-badge">Soon</span></span>
              <span className="cat-desc">Get paid and manage your payouts.</span>
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

export function SettingsSkeleton() {
  const row = (chevron: boolean, key: number) => (
    <div className="skeleton-cat-row" key={key}>
      <span className="skeleton-nav-icon"><span className="skeleton-nav-icon-shape" /></span>
      <span className="cat-main"><span className="skeleton-nav-title" /><span className="skeleton-nav-title is-desc" /></span>
      {chevron && <span className="skeleton-nav-chevron"><span className="skeleton-nav-chevron-shape" /></span>}
    </div>
  );
  return (
    <div className="settings-skeleton" aria-label="Loading settings navigation" role="status">
      <div className="page-title" aria-hidden="true"><div className="skeleton-heading" /></div>
      <div className="page-sub" aria-hidden="true">Manage your account, preferences and app experience.</div>
      <div className="skeleton-search" aria-hidden="true"><span className="skeleton-search-glyph" /><span className="skeleton-search-placeholder" /></div>
      <div className="cat-list" aria-hidden="true">
        {[0, 1, 2, 3, 4, 5, 6].map((i) => row(true, i))}
        <div className="soon-divider" aria-hidden="true">Coming soon</div>
        {row(false, 7)}
      </div>
    </div>
  );
}

// ---------- Notifications ----------

export function NotificationsSection({ userId, prefs, isHost = false, onBack, notify }: { userId: string; prefs: Preferences | null; isHost?: boolean; onBack: () => void; notify: Notify }) {
  const rows = NOTIFICATION_ROWS.filter((row) => isHost || !row.hostOnly);
  const [values, setValues] = useState<Partial<Record<NotificationKey, boolean>>>({});
  useEffect(() => {
    if (prefs) setValues(Object.fromEntries(NOTIFICATION_ROWS.map((row) => [row.key, Boolean(prefs[row.key])])));
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
      <SettingsBox title="Notify me about" icon={INFO_ICONS.bell}>
        {rows.map((row) => (
          <div className="toggle-row" key={row.key} id={`notify-${row.key}`}>
            <div><div className="toggle-label">{row.label}</div>{row.desc && <div className="toggle-desc">{row.desc}</div>}</div>
            <label className="switch"><input type="checkbox" checked={Boolean(values[row.key])} onChange={(event) => change(row.key, event.target.checked)} /><span className="switch-track" /></label>
          </div>
        ))}
      </SettingsBox>
    </div>
  );
}

// ---------- Chats ----------

/** The Chat Settings from Chats (components/chat/ChatSettings), shown in grey boxes. */
export function ChatsSection({ role, onBack }: { role: 'host' | 'client'; onBack: () => void }) {
  const router = useRouter();
  return (
    <div id="view-chats">
      <DetailHead title="Chats" onBack={onBack} />
      <div className="settings-chats">
        <ChatSettings key={role} role={role} onOpenArchived={() => { void router.push('/chats?archived=1'); }} />
      </div>
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
      <SettingsBox title="Appearance" icon={INFO_ICONS.monitor} padded>
        <div className="appearance-options" id="appearance-options">
          {(['light', 'dark', 'system'] as ThemeChoice[]).map((choice) => (
            <button key={choice} type="button" className={`appearance-pill${theme === choice ? ' active' : ''}`} data-theme-choice={choice} onClick={() => chooseTheme(choice)}>
              {THEME_ICONS[choice]} {choice === 'light' ? 'Light' : choice === 'dark' ? 'Dark' : 'System'}
            </button>
          ))}
        </div>
      </SettingsBox>
      <SettingsBox title="Font size" icon={INFO_ICONS.text} padded>
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
          <p className="font-size-note">This device only.</p>
        </div>
      </SettingsBox>
    </div>
  );
}

// ---------- Privacy & Security ----------

type PrivacyValues = { profile_visibility: string; who_can_message: string; location_visibility: string };

/** Each choice saves as soon as it changes (as Notifications do); a failed save puts the old choice back. */
export function PrivacySection({ userId, prefs, onBack, onPassword, notify }: { userId: string; prefs: Preferences | null; onBack: () => void; onPassword: () => void; notify: Notify }) {
  const [values, setValues] = useState<PrivacyValues>({ profile_visibility: 'public', who_can_message: 'everyone', location_visibility: 'general_area' });
  useEffect(() => {
    if (!prefs) return;
    setValues((current) => ({
      profile_visibility: prefs.profile_visibility || current.profile_visibility,
      who_can_message: prefs.who_can_message || current.who_can_message,
      location_visibility: prefs.location_visibility || current.location_visibility,
    }));
  }, [prefs]);
  const set = (key: keyof PrivacyValues) => async (event: React.ChangeEvent<HTMLSelectElement>) => {
    const next = event.target.value;
    const previous = values[key];
    if (next === previous) return;
    setValues((current) => ({ ...current, [key]: next }));
    const client = getSupabaseClient();
    if (!client) return;
    const error = await savePreferences(client, userId, { [key]: next });
    if (error) {
      setValues((current) => ({ ...current, [key]: previous }));
      notify('That privacy setting could not be saved. Please try again.');
    } else {
      notify('Saved.');
    }
  };

  return (
    <div id="view-privacy">
      <DetailHead title="Privacy & Security" onBack={onBack} />
      <SettingsBox title="Privacy" icon={INFO_ICONS.eye} padded>
          <div className="field">
            <label htmlFor="profile-visibility">Profile visibility</label>
            <select id="profile-visibility" value={values.profile_visibility} onChange={set('profile_visibility')}>
              <option value="public">Public</option>
              <option value="private">Private — only people you’ve chatted or booked with</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="who-can-message">Who can message you</label>
            <select id="who-can-message" value={values.who_can_message} onChange={set('who_can_message')}>
              <option value="everyone">Everyone</option>
              <option value="no_one">No one — existing chats carry on</option>
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
      </SettingsBox>
      <SettingsBox title="Security" icon={INFO_ICONS.shield}>
          <a href="#" className="info-row clickable" onClick={(event) => { event.preventDefault(); onPassword(); }}>
            <span className="info-icon">{INFO_ICONS.lock}</span>
            <span className="info-main"><span className="info-label">Change password</span></span>
            <span className="info-chevron"><ChevronRight size={16} /></span>
          </a>
      </SettingsBox>
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
      <SettingsBox title="Help" icon={INFO_ICONS.help}>
          <LinkRow href="/support" icon={INFO_ICONS.help} label="Help Centre" external />
          <LinkRow href="mailto:privacy@varoom.co.ke?subject=VaRoom%20Support" icon={INFO_ICONS.chat} label="Contact VaRoom" />
          <LinkRow href="mailto:privacy@varoom.co.ke?subject=VaRoom%20—%20Problem%20report" icon={INFO_ICONS.warning} label="Report a Problem" />
      </SettingsBox>
      <SettingsBox title="Policies" icon={INFO_ICONS.file}>
          <LinkRow href="/privacy" icon={INFO_ICONS.shield} label="Privacy Policy" external />
          <LinkRow href="/terms" icon={INFO_ICONS.file} label="Terms & Conditions" external />
      </SettingsBox>
      <SettingsBox title="About" icon={INFO_ICONS.info}>
          <div className="about-block">
            <strong>VaRoom</strong> is a hospitality marketplace connecting hosts and guests across Kenya.
            <br /><br />
            VaRoom, Nairobi, Kenya.<br />
            © {new Date().getFullYear()} VaRoom. All rights reserved.
          </div>
      </SettingsBox>
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
      notify('Account removed from this dashboard.');
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
      <SettingsBox title="Accounts on this dashboard" icon={INFO_ICONS.users} id="dashboard-accounts-list">
        <div className="dashboard-accounts">
          {current && row(current, true)}
          {!others.length && <p className="accounts-empty">No other accounts.</p>}
          {others.map((account) => row(account, false))}
        </div>
      </SettingsBox>
      <div className="settings-section">
        <button
          type="button"
          id="add-account-btn"
          className="btn btn-ghost"
          disabled={atLimit}
          aria-disabled={atLimit}
          onClick={() => { if (!atLimit) switcher()?.startAddAccount?.('/settings'); }}
        >+ Add account</button>
        <p className="account-limit-note">{atLimit ? 'Account limit reached (3/3).' : `${accounts.length}/3 accounts`}</p>
      </div>
      <div className="logout-section">
        <button type="button" id="logout-btn" className="btn btn-ghost" onClick={() => setConfirmLogout(true)}>Log out</button>
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
          ? `Removes ${name} from this dashboard only. The account and its data aren’t deleted.`
          : 'Removes it from this dashboard only. The account and its data aren’t deleted.'}</p>
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
      <p>You&apos;re signed out everywhere and your profile and listings are hidden. After 30 days the account and its data are deleted for good. Sign in before then to restore it.</p>
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
