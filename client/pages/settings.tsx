import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useAuth } from '../lib/auth/AuthProvider';
import { getSupabaseClient } from '../lib/supabase/client';
import { accountRole } from '../lib/types/profile';
import { loginUrl } from '../lib/safeRedirect';
import { logout } from '../lib/account/accountActions';
import {
  deactivateAccount, finishGoogleVerification, deleteAccount, loadPreferences, loadSecurityStatus, rememberedUnlock, rememberUnlock, tokenSessionId, VERIFICATION_ERROR_KEY, type Preferences,
} from '../lib/settings/settings';
import AccountSection from '../components/settings/AccountSection';
import PlansSection, { PLANS_STYLES } from '../components/settings/PlansSection';
import BookingsSection from '../components/settings/BookingsSection';
import TeamSection from '../components/settings/TeamSection';
import { useWorkspace } from '../lib/team/team';
import {
  CategoryList, ChatsSection, DeleteAccountDialog, DisplaySection, LoginAccountsSection, NotificationsSection, PrivacySection, SettingsSkeleton, SupportSection,
} from '../components/settings/SettingsSections';
import { ChatSettingsStyles } from '../components/chat/ChatSettings';
import type { SearchEntry } from '../lib/settings/settingsSearch';
import { opensInNewTab } from '../lib/navigation/newTab';
import { MenuIcon } from '../components/settings/SettingsIcons';
import { SETTINGS_STYLES } from '../components/settings/settingsStyles';

// Settings (migrated from legacy-pages/settings.html), inside the app shell:
// one column beside the sidebar showing the category list, or the section
// named by ?section= (shallow routing, so Back, refresh and deep links work).
// Identity comes from AuthProvider; the profile's preferences are read once.

const SECTIONS = ['account', 'plans', 'bookings', 'team', 'notifications', 'chats', 'display', 'privacy', 'support', 'login-accounts'] as const;
type Section = (typeof SECTIONS)[number];
type View = 'list' | Section;
const isSection = (value: unknown): value is Section => typeof value === 'string' && (SECTIONS as readonly string[]).includes(value);

// The element a search result points at, highlighted in its row (or box).
const HIT_CONTAINER = '.field, .toggle-row, .info-row, .cs-row, .cs-section, .plan-box';

const TOAST_STYLES = `
  .settings-toast{ position:fixed; left:50%; bottom:1.5rem; transform:translateX(-50%) translateY(20px); z-index:300; max-width:min(92vw, 30rem);
    padding:.8rem 1.4rem; border-radius:100px; background:var(--ink); color:var(--white); font-size:.88rem; font-weight:600; text-align:center;
    opacity:0; pointer-events:none; transition:opacity var(--motion-quick,200ms) var(--ease-in,ease), transform var(--motion-quick,200ms) var(--ease-in,ease); }
  .settings-toast.show{ opacity:1; transform:translateX(-50%) translateY(0); transition-duration:var(--motion-standard,250ms); transition-timing-function:var(--ease-out,ease); }
  @media (prefers-reduced-motion:reduce){ .settings-toast, .settings-toast.show{ transition:none; transform:translateX(-50%); } }
  @media (max-width:860px){ .settings-toast{ bottom:calc(5.6rem + env(safe-area-inset-bottom)); } }
`;

export default function SettingsPage() {
  const router = useRouter();
  const { status, user, session, profile, refreshProfile } = useAuth();
  const role = accountRole(profile);
  // Plans & Billing: the host's own, or the company a Finance member works as.
  const company = useWorkspace(user?.id || null);
  const financeFor = company && company.roles.includes('finance') ? company : null;
  const showPlans = role === 'host' || Boolean(financeFor);
  const userId = user?.id || null;
  const token = session?.access_token || null;

  // Plans & Billing and Bookings only for those who have them; anything else shows the list.
  const wanted = router.query.section;
  const view: View = isSection(wanted) && (wanted !== 'plans' || showPlans) && (wanted !== 'bookings' || role === 'host') ? wanted : 'list';
  // How the person moved (for the slide): into a section, or back to the list. None on first paint.
  const [nav, setNav] = useState<'forward' | 'back' | null>(null);
  // Whether this visit pushed the open section, so going back can pop it instead of adding history.
  const pushedSection = useRef(false);
  const [prefs, setPrefs] = useState<Preferences | null>(null);
  // Your Account opens without asking unless the server sees a risk (lib/settings/settings.ts).
  const [lock, setLock] = useState<'checking' | 'unlocked' | 'locked'>('checking');
  const [unlockedUntil, setUnlockedUntil] = useState<number | null>(null);
  const sessionId = useMemo(() => tokenSessionId(token), [token]);
  const tokenRef = useRef(token);
  tokenRef.current = token;
  const [openPassword, setOpenPassword] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [toast, setToast] = useState({ text: '', shown: false });
  const toastTimer = useRef<number | null>(null);
  const verificationHandled = useRef(false);

  const notify = useCallback((text: string) => {
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    setToast({ text, shown: true });
    toastTimer.current = window.setTimeout(() => setToast((current) => ({ ...current, shown: false })), 3200);
  }, []);
  useEffect(() => () => { if (toastTimer.current) window.clearTimeout(toastTimer.current); }, []);

  useEffect(() => {
    if (status === 'signed-out') router.replace(loginUrl('/settings'));
  }, [status, router]);

  // The profile's preferences (the app's profile already has the rest).
  useEffect(() => {
    const client = getSupabaseClient();
    if (!client || !userId) return undefined;
    let cancelled = false;
    loadPreferences(client, userId).then((value) => { if (!cancelled) setPrefs(value); }).catch((error) => {
      console.error('Settings could not load your preferences:', error);
      if (!cancelled) setPrefs({} as Preferences);
    });
    return () => { cancelled = true; };
  }, [userId]);

  const sessionStore = () => { try { return window.sessionStorage; } catch { return null; } };
  const unlock = useCallback((until: string | null) => {
    rememberUnlock(sessionStore(), tokenSessionId(tokenRef.current), until);
    const at = until ? Date.parse(until) : NaN;
    setUnlockedUntil(Number.isFinite(at) ? at : null);
    setLock('unlocked');
  }, []);

  // Once per session: remembered, else asked of the server (a refreshed token keeps its session id).
  // A token without a session id is still asked; only remembering needs the id.
  const hasToken = Boolean(token);
  useEffect(() => {
    if (!hasToken || !tokenRef.current) return undefined;
    const remembered = sessionId ? rememberedUnlock(sessionStore(), sessionId) : null;
    if (remembered) { setUnlockedUntil(remembered); setLock('unlocked'); return undefined; }
    let cancelled = false;
    setLock('checking');
    loadSecurityStatus(tokenRef.current).then((status) => {
      if (cancelled) return;
      if (status.unlocked) unlock(status.unlockedUntil); else setLock('locked');
    }).catch((error) => {
      console.error('Account security check failed:', error);
      if (!cancelled) setLock('locked');
    });
    return () => { cancelled = true; };
  }, [hasToken, sessionId, unlock]);

  // The unlock runs out while the page is open: lock again.
  useEffect(() => {
    if (lock !== 'unlocked' || !unlockedUntil) return undefined;
    const timer = window.setTimeout(() => setLock('locked'), Math.max(0, unlockedUntil - Date.now()));
    return () => window.clearTimeout(timer);
  }, [lock, unlockedUntil]);

  // Back from Google re-verification (?account_verification=google).
  useEffect(() => {
    if (!router.isReady || router.query.account_verification !== 'google' || !token || verificationHandled.current) return;
    verificationHandled.current = true;
    const client = getSupabaseClient();
    if (!client) return;
    finishGoogleVerification(client, token).then((result) => {
      if (result.verified) unlock(result.unlockedUntil);
      else { try { window.sessionStorage.setItem(VERIFICATION_ERROR_KEY, result.error); } catch { /* ignore */ } }
      router.replace({ pathname: '/settings', query: { section: 'account' } }, undefined, { shallow: true });
    });
  }, [router, router.isReady, router.query.account_verification, token, unlock]);

  const show = useCallback((next: View) => {
    if (next === view) return; // Already there (a search result in the open section): no extra history entry.
    setNav(next === 'list' ? 'back' : 'forward');
    if (next === 'list') {
      if (pushedSection.current) { pushedSection.current = false; router.back(); }
      else void router.replace('/settings', undefined, { shallow: true });
      return;
    }
    pushedSection.current = true;
    void router.push({ pathname: '/settings', query: { section: next } }, undefined, { shallow: true });
  }, [router, view]);
  const back = useCallback(() => show('list'), [show]);

  // Each screen starts at the top (the shell's content column scrolls, phones may scroll the window).
  useEffect(() => {
    document.getElementById('settings-page')?.closest('.client-page-content, .host-page-content')?.scrollTo({ top: 0 });
    window.scrollTo({ top: 0 });
  }, [view]);

  // A search result: leave for its page, or open its section and point at the setting.
  const [target, setTarget] = useState<{ id: string; at: number } | null>(null);
  const pick = useCallback((entry: SearchEntry) => {
    if (entry.href) {
      if (entry.href.startsWith('mailto:')) window.location.href = entry.href;
      // Help & Support and the legal pages open in a new tab, like their links.
      else if (opensInNewTab(entry.href)) window.open(entry.href, '_blank', 'noopener,noreferrer');
      else void router.push(entry.href);
      return;
    }
    show(entry.section);
    setTarget(entry.target ? { id: entry.target, at: Date.now() } : null);
  }, [router, show]);

  // The section may still be loading its data: look for the setting for up to 2 s.
  useEffect(() => {
    if (!target) return undefined;
    let tries = 0;
    let timer = 0;
    const find = () => {
      const element = document.getElementById(target.id);
      if (!element) {
        tries += 1;
        if (tries < 20) timer = window.setTimeout(find, 100);
        return;
      }
      const row = element.closest<HTMLElement>(HIT_CONTAINER) || element;
      row.scrollIntoView({ behavior: 'smooth', block: 'center' });
      row.classList.remove('search-hit');
      void row.offsetWidth; // Restart the animation when the same result is picked again.
      row.classList.add('search-hit');
      timer = window.setTimeout(() => row.classList.remove('search-hit'), 1900);
    };
    timer = window.setTimeout(find, 0);
    return () => window.clearTimeout(timer);
  }, [target]);
  const passwordOpened = useCallback(() => setOpenPassword(false), []);

  const openMenu = () => {
    window.dispatchEvent(new Event(role === 'host' ? 'open-host-sidebar' : 'open-client-sidebar'));
  };

  // After Delete or Deactivate (the server has signed out every session):
  // forget the account on this dashboard and leave.
  const leave = async (destination: string) => {
    const client = getSupabaseClient();
    if (!userId || !client) return;
    const switcher = window.VaRoomAccountSwitcher as unknown as { removeAccount?: (id: string) => void } | undefined;
    try { switcher?.removeAccount?.(userId); } catch { /* ignore */ }
    try { window.VaRoomDataCache?.invalidate(`account:${userId}:`); } catch { /* ignore */ }
    try {
      window.sessionStorage.clear();
      window.localStorage.removeItem('varoom_linked_accounts');
      window.localStorage.removeItem('varoom_theme');
    } catch { /* ignore */ }
    setDeleting(false);
    await client.auth.signOut({ scope: 'local' });
    window.location.href = destination;
  };

  const confirmDelete = async (reason: string, details: string) => {
    if (!token || !userId) throw new Error('Your session has expired.');
    try {
      await deleteAccount(token, reason, details);
    } catch (error) {
      notify((error as Error).message);
      throw error;
    }
    await leave('/?auth=login&deleted=1');
  };

  const confirmDeactivate = async () => {
    if (!token || !userId) throw new Error('Your session has expired.');
    await deactivateAccount(token);
    await leave('/?auth=login&deactivated=1');
  };

  // A detail changed in Your Account: the phone lives in prefs; name and username in the app's profile.
  const detailSaved = useCallback((key: 'full_name' | 'username' | 'phone', value: string) => {
    if (key === 'phone') setPrefs((current) => (current ? { ...current, phone: value } : current));
    else void refreshProfile();
  }, [refreshProfile]);

  const ready = Boolean(profile && userId && prefs);
  const homeHref = role === 'host' ? '/host-home' : '/client-home';
  const pageClass = `${ready ? '' : 'is-loading '}${ready && view !== 'list' ? 'has-selection ' : ''}${nav ? `nav-${nav}` : ''}`.trim();

  let section: React.ReactNode = null;
  if (ready && userId) {
    if (view === 'account') {
      section = (
        <AccountSection
          userId={userId}
          email={user?.email || ''}
          username={profile?.username || null}
          fullName={profile?.full_name || null}
          phone={prefs?.phone || null}
          isHost={role === 'host'}
          token={token}
          verified={lock === 'unlocked'}
          checking={lock === 'checking'}
          onVerified={unlock}
          openPassword={openPassword}
          onPasswordOpened={passwordOpened}
          onBack={back}
          onDelete={() => setDeleting(true)}
          onDeactivate={confirmDeactivate}
          onDetailSaved={detailSaved}
        />
      );
    } else if (view === 'plans' && showPlans) {
      section = financeFor
        ? <PlansSection key={financeFor.hostId} userId={financeFor.hostId} token={token} billedTo={financeFor.name} email="" onBack={back} notify={notify} />
        : <PlansSection userId={userId} token={token} billedTo={profile?.full_name || profile?.username || user?.email || ''} email={user?.email || ''} onBack={back} notify={notify} />;
    } else if (view === 'bookings' && role === 'host') {
      section = <BookingsSection userId={userId} onBack={back} />;
    } else if (view === 'team') {
      section = <TeamSection userId={userId} isHost={role === 'host'} onBack={back} />;
    } else if (view === 'notifications') section = <NotificationsSection userId={userId} prefs={prefs} isHost={role === 'host'} onBack={back} notify={notify} />;
    else if (view === 'chats') section = <ChatsSection role={role === 'host' ? 'host' : 'client'} onBack={back} />;
    else if (view === 'display') section = <DisplaySection userId={userId} onBack={back} />;
    else if (view === 'privacy') section = <PrivacySection userId={userId} prefs={prefs} onBack={back} notify={notify} onPassword={() => { setOpenPassword(true); show('account'); }} />;
    else if (view === 'support') section = <SupportSection onBack={back} />;
    else if (view === 'login-accounts') section = <LoginAccountsSection userId={userId} onBack={back} onDelete={() => setDeleting(true)} notify={notify} onLogout={logout} />;
  }

  return (
    <>
      <Head>
        <title>Settings — VaRoom</title>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,600;0,9..144,700;0,9..144,900&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
      </Head>
      <ChatSettingsStyles />
      <style dangerouslySetInnerHTML={{ __html: SETTINGS_STYLES + PLANS_STYLES + TOAST_STYLES }} />
      <div className="settings-page">
        <div className="app-shell">
          <div className="main-col">
            <div className="mobile-topbar">
              <button type="button" className="mobile-menu-btn" id="mobile-menu-btn" aria-label="Open menu" onClick={openMenu}><MenuIcon /></button>
              <Link href={homeHref} className="logo" style={{ fontSize: '1.15rem' }}><span className="va">Va</span><span className="room">Room</span></Link>
            </div>
            <main className="settings-main">
              <div id="settings-page" className={pageClass}>
                {!ready && <SettingsSkeleton />}
                {ready && <CategoryList isHost={role === 'host'} showPlans={showPlans} onOpen={(key) => { if (isSection(key)) show(key); }} onPick={pick} />}
                {section}
              </div>
            </main>
          </div>
        </div>
        <DeleteAccountDialog open={deleting} onClose={() => setDeleting(false)} onConfirm={confirmDelete} />
        <div className={`settings-toast${toast.shown ? ' show' : ''}`} role="status" aria-live="polite">{toast.text}</div>
      </div>
    </>
  );
}
