import React, { useCallback, useEffect, useRef, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useAuth } from '../lib/auth/AuthProvider';
import { getSupabaseClient } from '../lib/supabase/client';
import { accountRole } from '../lib/types/profile';
import { loginUrl } from '../lib/safeRedirect';
import { logout } from '../lib/account/accountActions';
import {
  completeGoogleVerification, deleteAccount, loadPreferences, VERIFICATION_ERROR_KEY, VERIFICATION_SESSION_KEY, type Preferences,
} from '../lib/settings/settings';
import AccountSection from '../components/settings/AccountSection';
import PlansSection, { PLANS_STYLES } from '../components/settings/PlansSection';
import {
  CategoryList, DeleteAccountDialog, DisplaySection, LoginAccountsSection, NotificationsSection, PrivacySection, SettingsSkeleton, SupportSection,
} from '../components/settings/SettingsSections';
import { MenuIcon } from '../components/settings/SettingsIcons';
import { SETTINGS_STYLES } from '../components/settings/settingsStyles';

// Settings (migrated from legacy-pages/settings.html), inside the app shell:
// the category list and the chosen section side by side on larger screens;
// on phones the list, then the section. Identity comes from AuthProvider;
// the profile's preferences are read once.

type View = 'list' | 'account' | 'plans' | 'notifications' | 'display' | 'privacy' | 'support' | 'login-accounts';

const TOAST_STYLES = `
  .settings-toast{ position:fixed; left:50%; bottom:1.5rem; transform:translateX(-50%) translateY(20px); z-index:300; max-width:min(92vw, 30rem);
    padding:.8rem 1.4rem; border-radius:100px; background:var(--ink); color:var(--white); font-size:.88rem; font-weight:600; text-align:center;
    opacity:0; pointer-events:none; transition:opacity .25s ease, transform .25s ease; }
  .settings-toast.show{ opacity:1; transform:translateX(-50%) translateY(0); }
  @media (max-width:860px){ .settings-toast{ bottom:calc(5.6rem + env(safe-area-inset-bottom)); } }
`;

export default function SettingsPage() {
  const router = useRouter();
  const { status, user, session, profile } = useAuth();
  const role = accountRole(profile);
  const userId = user?.id || null;
  const token = session?.access_token || null;

  const [view, setView] = useState<View>('account');
  const [mobileDetail, setMobileDetail] = useState(false);
  const [prefs, setPrefs] = useState<Preferences | null>(null);
  const [verified, setVerified] = useState(false);
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

  // ?section=notifications (or plans, for hosts) opens that section.
  useEffect(() => {
    if (!router.isReady) return;
    const wanted = router.query.section;
    if (wanted === 'notifications' || (wanted === 'plans' && role === 'host')) { setView(wanted); setMobileDetail(true); }
  }, [router.isReady, router.query.section, role]);

  // Plans & Billing is for hosts; another account type falls back to Your Account.
  useEffect(() => {
    if (view === 'plans' && profile && role !== 'host') setView('account');
  }, [view, profile, role]);

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

  // Back from Google re-verification (?account_verification=google).
  useEffect(() => {
    if (!router.isReady || router.query.account_verification !== 'google' || !token || verificationHandled.current) return;
    verificationHandled.current = true;
    const client = getSupabaseClient();
    (async () => {
      let saved: { access_token?: string; refresh_token?: string } | null = null;
      try { saved = JSON.parse(window.sessionStorage.getItem(VERIFICATION_SESSION_KEY) || 'null'); } catch { saved = null; }
      try {
        const result = await completeGoogleVerification(token);
        if (result.verified) {
          setVerified(true);
        } else if (client) {
          // Another Google identity may have replaced the session: put the
          // account that started back before keeping the page locked.
          if (saved && saved.access_token && saved.refresh_token) {
            await client.auth.setSession({ access_token: saved.access_token, refresh_token: saved.refresh_token });
            const restored = await client.auth.getSession();
            if (!restored.data.session) {
              await client.auth.signOut({ scope: 'local' });
              window.location.href = '/?auth=login&account_verification=failed';
              return;
            }
          } else {
            await client.auth.signOut({ scope: 'local' });
            window.location.href = '/?auth=login&account_verification=failed';
            return;
          }
          window.sessionStorage.setItem(VERIFICATION_ERROR_KEY, result.error || 'The Google account does not match this VaRoom account.');
        }
      } catch {
        try { window.sessionStorage.setItem(VERIFICATION_ERROR_KEY, 'Google verification could not be completed. Please try again.'); } catch { /* ignore */ }
      } finally {
        try { window.sessionStorage.removeItem(VERIFICATION_SESSION_KEY); } catch { /* ignore */ }
        router.replace('/settings', undefined, { shallow: true });
      }
    })();
  }, [router, router.isReady, router.query.account_verification, token]);

  const show = useCallback((next: View) => {
    setView(next);
    setMobileDetail(next !== 'list');
    window.scrollTo({ top: 0 });
  }, []);
  const back = useCallback(() => show('list'), [show]);
  const passwordOpened = useCallback(() => setOpenPassword(false), []);

  const openMenu = () => {
    window.dispatchEvent(new Event(role === 'host' ? 'open-host-sidebar' : 'open-client-sidebar'));
  };

  const confirmDelete = async (reason: string, details: string) => {
    const client = getSupabaseClient();
    if (!token || !userId || !client) throw new Error('Your session has expired.');
    try {
      await deleteAccount(token, reason, details);
    } catch (error) {
      notify((error as Error).message);
      throw error;
    }
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
    window.location.href = '/?auth=login&deleted=1';
  };

  const ready = Boolean(profile && userId && prefs);
  const homeHref = role === 'host' ? '/host-home' : '/client-home';
  const pageClass = `${ready ? '' : 'is-loading '}${ready && view !== 'list' ? 'has-selection ' : ''}${mobileDetail ? 'mobile-detail' : ''}`.trim();

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
          token={token}
          verified={verified}
          onVerified={() => setVerified(true)}
          openPassword={openPassword}
          onPasswordOpened={passwordOpened}
          onBack={back}
          onDelete={() => setDeleting(true)}
        />
      );
    } else if (view === 'plans' && role === 'host') {
      section = <PlansSection userId={userId} token={token} billedTo={profile?.full_name || profile?.username || user?.email || ''} email={user?.email || ''} onBack={back} notify={notify} />;
    } else if (view === 'notifications') section = <NotificationsSection userId={userId} prefs={prefs} onBack={back} notify={notify} />;
    else if (view === 'display') section = <DisplaySection userId={userId} onBack={back} />;
    else if (view === 'privacy') section = <PrivacySection userId={userId} prefs={prefs} onBack={back} onPassword={() => { setOpenPassword(true); show('account'); }} />;
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
      <style dangerouslySetInnerHTML={{ __html: SETTINGS_STYLES + PLANS_STYLES + TOAST_STYLES }} />
      <div className="settings-page">
        <div className="app-shell">
          <div className="main-col">
            <div className="mobile-topbar">
              <button type="button" className="mobile-menu-btn" id="mobile-menu-btn" aria-label="Open menu" onClick={openMenu}><MenuIcon /></button>
              <Link href={homeHref} className="logo" style={{ fontSize: '1.15rem' }}><span className="va">Va</span><span className="room">Room</span></Link>
            </div>
            <main className="settings-main">
              <div id="settings-page" className={pageClass} style={{ display: 'grid' }}>
                {!ready && <SettingsSkeleton />}
                {ready && <CategoryList active={view} isHost={role === 'host'} onOpen={(key) => show(key as View)} />}
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
