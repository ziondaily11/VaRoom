import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { getSupabaseClient } from '../../lib/supabase/client';
import {
  googleVerificationEligible, startGoogleVerification, VERIFICATION_ERROR_KEY, VERIFICATION_SESSION_KEY, verifyPassword,
} from '../../lib/settings/settings';
import { DetailHead, EyeIcon, EyeOffIcon, INFO_ICONS, InfoRow, LockLarge } from './SettingsIcons';
import ReachOutSection from './ReachOutSection';

// Your Account (legacy #view-account): the account details, email and
// password changes, Reach Out (hosts) and account status. Locked only when
// the server sees a risk (a session not signed into recently): then the
// current password, or a server-checked Google re-sign-in for Google-only
// accounts, unlocks it for the rest of the session (lib/settings/settings.ts).

type Msg = { text: string; kind: '' | 'success' | 'error' };

interface Props {
  userId: string;
  email: string;
  username: string | null;
  fullName: string | null;
  phone: string | null;
  /** Hosts get Reach Out (how clients contact them from their listings). */
  isHost: boolean;
  token: string | null;
  verified: boolean;
  /** The server is still deciding whether to ask (shown as a quiet placeholder, not the lock). */
  checking?: boolean;
  /** Verified: unlocked until the given time for this session. */
  onVerified: (unlockedUntil: string | null) => void;
  /** Open the password panel once unlocked (from Privacy & Security). */
  openPassword: boolean;
  onPasswordOpened: () => void;
  onBack: () => void;
  onDelete: () => void;
  /** Deactivate (no deadline); resolves once signed out, rejects with the reason it failed. */
  onDeactivate: () => Promise<void>;
}

function VerifyGate({ userId, email, token, onVerified, onBack }: Pick<Props, 'userId' | 'email' | 'token' | 'onVerified' | 'onBack'>) {
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [googleOffered, setGoogleOffered] = useState(false);
  const [googleError, setGoogleError] = useState('');
  const [googleBusy, setGoogleBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => inputRef.current?.focus(), 50);
    let pending: string | null = null;
    try {
      pending = window.sessionStorage.getItem(VERIFICATION_ERROR_KEY);
      if (pending) window.sessionStorage.removeItem(VERIFICATION_ERROR_KEY);
    } catch { /* Storage unavailable. */ }
    if (pending) { setGoogleError(pending); setGoogleOffered(true); }
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!token) return undefined;
    let cancelled = false;
    googleVerificationEligible(token).then((eligible) => { if (!cancelled && eligible) setGoogleOffered(true); });
    return () => { cancelled = true; };
  }, [token]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!password) return;
    setBusy(true);
    setError('');
    if (!token) { setError('Your session has expired. Please sign in again.'); setBusy(false); return; }
    const result = await verifyPassword(token, password);
    if (result.ok) { onVerified(result.unlockedUntil); return; }
    setError(result.error);
    setBusy(false);
    inputRef.current?.select();
  };

  const verifyWithGoogle = async () => {
    const client = getSupabaseClient();
    setGoogleBusy(true);
    setGoogleError('');
    try {
      const { data } = client ? await client.auth.getSession() : { data: { session: null } };
      const session = data.session;
      if (!client || !session) throw new Error('Your session has expired. Please sign in again.');
      await startGoogleVerification(session.access_token);
      // Kept only to restore this account if Google returns a different one;
      // it never unlocks the page.
      window.sessionStorage.setItem(VERIFICATION_SESSION_KEY, JSON.stringify({ access_token: session.access_token, refresh_token: session.refresh_token }));
      const { error: oauthError } = await client.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: `${window.location.origin}/settings?account_verification=google` },
      });
      if (oauthError) throw oauthError;
    } catch (failure) {
      setGoogleError((failure as Error).message || 'Google verification could not be started. Please try again.');
      setGoogleBusy(false);
    }
  };

  return (
    <div id="account-verify-view">
      <DetailHead title="Your Account" onBack={onBack} />
      <p className="detail-sub">Enter your current account password to view your account details.</p>
      <div className="settings-section">
        <div className="card" style={{ padding: '1.8rem', maxWidth: '440px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '.85rem', marginBottom: '1.4rem' }}>
            <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: 'var(--line)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--ink)', flexShrink: 0 }}>
              <LockLarge />
            </div>
            <div>
              <div style={{ fontWeight: 600, fontSize: '.95rem', color: 'var(--ink)' }}>Security Verification</div>
              <div style={{ fontSize: '.82rem', color: 'var(--muted)', marginTop: '.15rem' }}>Confirm your password to continue</div>
            </div>
          </div>
          <form id="verify-account-form" autoComplete="on" onSubmit={submit}>
            <div className="field" style={{ marginBottom: '1.1rem' }}>
              <label htmlFor="verify-account-password">Current password</label>
              <div style={{ position: 'relative' }}>
                <input
                  ref={inputRef}
                  type={show ? 'text' : 'password'}
                  id="verify-account-password"
                  placeholder="Enter your password"
                  required
                  autoComplete="current-password"
                  className={error ? 'error' : undefined}
                  style={{ paddingRight: '2.6rem' }}
                  value={password}
                  onChange={(event) => { setPassword(event.target.value); setError(''); }}
                />
                <button
                  type="button"
                  aria-label={show ? 'Hide password' : 'Show password'}
                  style={{ position: 'absolute', right: '.7rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                  onClick={() => setShow((value) => !value)}
                >{show ? <EyeOffIcon /> : <EyeIcon />}</button>
              </div>
              {error && <p className="inline-msg error" style={{ marginTop: '.5rem' }}>{error}</p>}
            </div>
            <button type="submit" className="btn btn-danger btn-block" disabled={busy}>{busy ? 'Verifying...' : 'Continue'}</button>
          </form>
          {googleOffered && (
            <div style={{ marginTop: '1rem' }}>
              <p style={{ fontSize: '.82rem', color: 'var(--muted)', textAlign: 'center', marginBottom: '.75rem' }}>or verify with the Google account linked to VaRoom</p>
              <button type="button" className="btn btn-block" disabled={googleBusy} onClick={verifyWithGoogle}>{googleBusy ? 'Starting Google verification...' : 'Verify with Google'}</button>
              {googleError && <p className="inline-msg error" style={{ marginTop: '.5rem' }}>{googleError}</p>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function AccountDetails({ userId, email, username, fullName, phone, isHost, openPassword, onPasswordOpened, onBack, onDelete, onDeactivate }: Omit<Props, 'token' | 'verified' | 'onVerified'>) {
  const [open, setOpen] = useState<Record<string, boolean>>({ password: openPassword });
  const [deactivating, setDeactivating] = useState(false);
  const [deactivateMsg, setDeactivateMsg] = useState<Msg>({ text: '', kind: '' });
  const deactivate = async () => {
    setDeactivating(true);
    setDeactivateMsg({ text: '', kind: '' });
    try {
      await onDeactivate();
    } catch (error) {
      setDeactivating(false);
      setDeactivateMsg({ text: (error as Error).message || 'Your account could not be deactivated. Please try again.', kind: 'error' });
    }
  };
  const [newEmail, setNewEmail] = useState(email);
  const [emailMsg, setEmailMsg] = useState<Msg>({ text: '', kind: '' });
  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [passwordMsg, setPasswordMsg] = useState<Msg>({ text: '', kind: '' });
  // Supabase asks for an emailed code to change the password from a session older than 24 hours.
  const [codeSent, setCodeSent] = useState(false);
  const [code, setCode] = useState('');
  const toggle = (key: string) => setOpen((current) => ({ ...current, [key]: !current[key] }));

  useEffect(() => {
    if (!openPassword) return;
    setOpen((current) => ({ ...current, password: true }));
    window.requestAnimationFrame(() => document.getElementById('password-row')?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
    onPasswordOpened();
  }, [openPassword, onPasswordOpened]);

  const saveEmail = async () => {
    const value = newEmail.trim();
    const client = getSupabaseClient();
    if (!value || value === email || !client) return;
    const { error } = await client.auth.updateUser({ email: value });
    setEmailMsg(error
      ? { text: error.message, kind: 'error' }
      : { text: 'Check both your old and new email for confirmation links — the change applies once confirmed.', kind: 'success' });
  };

  const savePassword = async () => {
    if (newPassword.length < 8) { setPasswordMsg({ text: 'Password must be at least 8 characters.', kind: 'error' }); return; }
    if (newPassword !== confirm) { setPasswordMsg({ text: "Passwords don't match.", kind: 'error' }); return; }
    const client = getSupabaseClient();
    if (!client) return;
    if (codeSent && !code.trim()) { setPasswordMsg({ text: 'Enter the code we emailed you.', kind: 'error' }); return; }
    const { error } = await client.auth.updateUser(codeSent ? { password: newPassword, nonce: code.trim() } : { password: newPassword });
    if (error && (error as { code?: string }).code === 'reauthentication_needed') {
      const { error: sendError } = await client.auth.reauthenticate();
      if (sendError) { setPasswordMsg({ text: sendError.message, kind: 'error' }); return; }
      setCodeSent(true);
      setPasswordMsg({ text: `For your security, we emailed a code to ${email}. Enter it to change your password.`, kind: 'success' });
      return;
    }
    if (error) { setPasswordMsg({ text: error.message, kind: 'error' }); return; }
    setPasswordMsg({ text: 'Password updated.', kind: 'success' });
    setNewPassword('');
    setConfirm('');
    setCodeSent(false);
    setCode('');
  };

  return (
    <div id="account-verified-view">
      <DetailHead title="Your Account" onBack={onBack} />
      <p className="detail-sub">Manage your personal information and account settings.</p>

      <div className="settings-section">
        <p className="section-title">Account Information</p>
        <div className="card">
          <InfoRow icon={INFO_ICONS.user} label="Username" value={username ? `@${username}` : 'Not set'} />
          <InfoRow icon={INFO_ICONS.user} label="Full name" value={fullName || 'Not set'} />
          <InfoRow icon={INFO_ICONS.mail} label="Email address" value={email || '—'} onClick={() => toggle('email')} id="email-row" />
          <div className={`expand-panel${open.email ? ' show' : ''}`} id="email-panel">
            <div className="field">
              <label htmlFor="email-input">New email address</label>
              <input type="email" id="email-input" value={newEmail} onChange={(event) => setNewEmail(event.target.value)} />
            </div>
            <button type="button" className="btn" onClick={saveEmail}>Update email</button>
            <p className={`inline-msg${emailMsg.kind ? ` ${emailMsg.kind}` : ''}`}>{emailMsg.text}</p>
          </div>
          <InfoRow icon={INFO_ICONS.phone} label="Phone number" value={phone || 'Not set'} />
        </div>
        <Link href="/profile" className="btn btn-danger btn-block" style={{ marginTop: '.9rem', display: 'block' }}>Edit information</Link>
      </div>

      <div className="settings-section">
        <p className="section-title">Password</p>
        <div className="card">
          <InfoRow icon={INFO_ICONS.lock} label="Change password" value="Update your password regularly" valueStyle={{ fontWeight: 500 }} onClick={() => toggle('password')} id="password-row" />
          <div className={`expand-panel${open.password ? ' show' : ''}`} id="password-panel">
            <div className="field">
              <label htmlFor="new-password-input">New password</label>
              <input type="password" id="new-password-input" placeholder="At least 8 characters" minLength={8} value={newPassword} onChange={(event) => setNewPassword(event.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="confirm-password-input">Confirm new password</label>
              <input type="password" id="confirm-password-input" minLength={8} value={confirm} onChange={(event) => setConfirm(event.target.value)} />
            </div>
            {codeSent && (
              <div className="field">
                <label htmlFor="password-code-input">Code from your email</label>
                <input type="text" id="password-code-input" inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(event) => setCode(event.target.value)} />
              </div>
            )}
            <button type="button" className="btn" onClick={savePassword}>Update password</button>
            <p className={`inline-msg${passwordMsg.kind ? ` ${passwordMsg.kind}` : ''}`}>{passwordMsg.text}</p>
          </div>
        </div>
      </div>

      {isHost && <ReachOutSection userId={userId} accountPhone={phone} accountEmail={email} />}

      <div className="settings-section">
        <p className="section-title">Account Status</p>
        <div className="card">
          <InfoRow icon={INFO_ICONS.alert} label="Deactivate account" value="Temporarily deactivate your account" valueStyle={{ fontWeight: 500 }} onClick={() => toggle('deactivate')} id="deactivate-row" />
          <div className={`expand-panel${open.deactivate ? ' show' : ''}`} id="deactivate-panel">
            <p className="inline-msg neutral">Your profile, listings and reviews are hidden from other people and you&apos;re signed out on every device. Nothing is deleted. Sign in again at any time to reactivate your account.</p>
            <button type="button" className="btn btn-danger btn-block" disabled={deactivating} onClick={() => { void deactivate(); }}>{deactivating ? 'Deactivating...' : 'Deactivate my account'}</button>
            <p className={`inline-msg${deactivateMsg.kind ? ` ${deactivateMsg.kind}` : ''}`}>{deactivateMsg.text}</p>
          </div>
          <InfoRow icon={INFO_ICONS.trash} label="Delete account" value="Permanently delete your account" valueStyle={{ fontWeight: 500 }} danger onClick={() => toggle('delete')} id="show-delete-confirm" />
          <div className={`expand-panel${open.delete ? ' show' : ''}`} id="delete-confirm">
            <p className="inline-msg neutral">Your account is deactivated straight away and permanently deleted after 30 days. Sign in during those 30 days to keep it.</p>
            <button type="button" className="btn btn-danger btn-block" onClick={onDelete}>Delete my account</button>
            <p className="inline-msg" />
          </div>
        </div>
      </div>
    </div>
  );
}

export default function AccountSection(props: Props) {
  return (
    <div id="view-account">
      {props.verified
        ? <AccountDetails {...props} />
        : props.checking
          ? <div className="settings-section" aria-busy="true"><DetailHead title="Your Account" onBack={props.onBack} /></div>
          : <VerifyGate userId={props.userId} email={props.email} token={props.token} onVerified={props.onVerified} onBack={props.onBack} />}
    </div>
  );
}
