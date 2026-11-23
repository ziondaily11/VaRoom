import React, { useCallback, useEffect, useRef, useState } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { useAuth } from '../../lib/auth/AuthProvider';
import { getSupabaseClient } from '../../lib/supabase/client';
import { resolveAvatarUrl, PHOTO_WIDTH } from '../resolveStoredPhotoUrl';
import { discoverNameValid, loadHostExtras, locationValid, phoneForInput, phoneValid, uploadAvatar, type Category } from '../../lib/onboarding/onboarding';
import {
  beginGoogleVerification, finishGoogleVerification, googleVerificationEligible, loadSecurityStatus, rememberedUnlock, rememberUnlock, tokenSessionId, verifyPassword,
} from '../../lib/settings/settings';
import { atLeast, BECOME_HOST_HREF, convertToHost, PHASE_MIN_MS, PHASES, setConverting } from '../../lib/becomeHost/becomeHost';
import { CheckIcon, OnboardingLayout, type PhotoState, type StepDirection } from '../onboarding/OnboardingParts';
import { HostListingStep, HostProfileStep, type ProfileDraft } from '../onboarding/OnboardingSteps';
import { ONBOARDING_STYLES } from '../onboarding/onboardingStyles';
import { BECOME_HOST_STYLES } from './becomeHostStyles';

// Become a Host (lib/becomeHost/becomeHost.ts): over Client Home, the same
// account confirms it's them if the session is old (as Settings → Your
// Account asks), fills in the host profile and picks a niche. Nothing is
// saved until the last card; then each message stays up over its real work
// until the account is a host and Host Home is on screen.

type Stage = 'checking' | 'verify' | 'details' | 'niche' | 'converting';
interface Details { username: string; phone: string; city: string }
interface Failure { phase: number; message: string }

const sessionStore = () => { try { return window.sessionStorage; } catch { return null; } };
const errorText = (error: unknown) => (error as { error?: string; message?: string })?.error || (error as Error)?.message || 'Something went wrong. Please try again.';

export default function BecomeHostOverlay() {
  const router = useRouter();
  const { user, session, profile, refreshProfile } = useAuth();
  const userId = user?.id || null;
  const token = session?.access_token || null;
  const [stage, setStage] = useState<Stage>('checking');
  const [direction, setDirection] = useState<StepDirection>(null);
  const [initial, setInitial] = useState<Details | null>(null);
  const [verifyError, setVerifyError] = useState('');
  const [draft, setDraft] = useState<ProfileDraft>({ username: '', phone: '', city: '', photo: null });
  const [details, setDetails] = useState<Details | null>(null);
  const [photo, setPhoto] = useState<{ photo: PhotoState; blob: Blob } | null>(null);
  const [removedAvatar, setRemovedAvatar] = useState(false);
  const [listing, setListing] = useState<{ niche: Category | null; name: string } | null>(null);
  const [phase, setPhase] = useState(0);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [closing, setClosing] = useState(false);
  const avatarPath = useRef<string | null>(null);
  const googleHandled = useRef(false);
  const panel = useRef<HTMLDivElement>(null);

  const close = useCallback(() => {
    const { setup: _setup, account_verification: _verification, ...rest } = router.query;
    void router.replace({ pathname: router.pathname, query: rest }, undefined, { shallow: true, scroll: false });
  }, [router]);

  // Only a client who finished onboarding (a host arriving here has nothing to set up).
  const eligible = profile && profile.role === 'client' && profile.onboarding_completed;
  useEffect(() => {
    if (stage !== 'converting' && profile && !eligible) close();
  }, [stage, profile, eligible, close]);

  // The page behind stays still; Escape closes until converting starts.
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    panel.current?.focus();
    return () => { document.body.style.overflow = previous; };
  }, []);
  useEffect(() => {
    if (stage === 'converting') return undefined;
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') close(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [stage, close]);

  // First: is this session unlocked (or back from Google), and the saved phone and city.
  useEffect(() => {
    const client = getSupabaseClient();
    if (stage !== 'checking' || !client || !token || !userId || !eligible) return undefined;
    let cancelled = false;
    (async () => {
      const extras = loadHostExtras(client, userId).catch(() => ({ phone: null, city: null }));
      let unlocked = Boolean(rememberedUnlock(sessionStore(), tokenSessionId(token)));
      let failed = '';
      if (router.query.account_verification === 'google' && !googleHandled.current) {
        googleHandled.current = true;
        const result = await finishGoogleVerification(client, token);
        if (result.verified) { rememberUnlock(sessionStore(), tokenSessionId(token), result.unlockedUntil); unlocked = true; } else failed = result.error;
        void router.replace(BECOME_HOST_HREF, undefined, { shallow: true, scroll: false });
      } else if (!unlocked) {
        try {
          const status = await loadSecurityStatus(token);
          if (status.unlocked) { rememberUnlock(sessionStore(), tokenSessionId(token), status.unlockedUntil); unlocked = true; }
        } catch (error) { console.error('Become a host: security check failed:', error); }
      }
      const row = await extras;
      if (cancelled) return;
      setInitial({ username: profile?.username || '', phone: phoneForInput(row.phone), city: row.city || '' });
      setVerifyError(failed);
      setStage(unlocked ? 'details' : 'verify');
    })();
    return () => { cancelled = true; };
    // Once per opening (a refreshed token keeps its session).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage, Boolean(token), userId, eligible]);

  const goTo = useCallback((next: Stage, way: StepDirection) => {
    setDirection(way);
    setStage(next);
    panel.current?.scrollTo({ top: 0 });
  }, []);

  const run = useCallback(async (from: number, setup: { details: Details; niche: Category; name: string; photo: typeof photo }) => {
    const client = getSupabaseClient();
    if (!client || !userId) return;
    setFailure(null);
    setConverting(true);
    const steps: Array<() => Promise<unknown>> = [
      // Warming up your host tools: the photo, and Host Home's code.
      async () => {
        void router.prefetch('/host-home');
        if (setup.photo && !avatarPath.current) avatarPath.current = await uploadAvatar(client, userId, setup.photo.blob);
      },
      // Preparing your account: one server call makes it a host.
      async () => {
        const { data } = await client.auth.getSession();
        if (!data.session) throw new Error('Your session has expired. Please sign in again.');
        const result = await convertToHost(data.session.access_token, {
          ...setup.details, niche: setup.niche, discoverName: setup.name,
          ...(avatarPath.current ? { avatarPath: avatarPath.current } : removedAvatar ? { avatarPath: null } : {}),
        });
        if (!result.ok) throw result;
      },
      // Adjusting your pages: the app reads the host profile (the sidebar and pages follow).
      () => refreshProfile(),
      // Setting up analytics: Host Home opens under this screen.
      async () => { void router.prefetch('/analytics'); await router.replace('/host-home'); },
    ];
    for (let index = from; index < steps.length; index += 1) {
      setPhase(index);
      try {
        await atLeast(PHASE_MIN_MS, steps[index]());
      } catch (error) {
        const code = (error as { code?: string }).code;
        if (code === 'username_taken' || code === 'step_up_required') {
          // Nothing changed yet: back to the card that fixes it.
          setConverting(false);
          if (code === 'step_up_required') setVerifyError(errorText(error));
          goTo(code === 'username_taken' ? 'details' : 'verify', 'back');
          return;
        }
        console.error('Become a host failed:', error);
        setFailure({ phase: index, message: errorText(error) });
        return;
      }
    }
    setPhase(PHASES.length);
    await atLeast(700, Promise.resolve());
    setClosing(true);
    window.setTimeout(() => setConverting(false), 320);
  }, [userId, router, refreshProfile, removedAvatar, goTo]);

  const start = useCallback((name: string, niche: Category) => {
    if (!details) return Promise.resolve();
    goTo('converting', 'forward');
    void run(0, { details, niche, name, photo });
    return Promise.resolve();
  }, [details, photo, run, goTo]);

  const retry = (withoutPhoto = false) => {
    if (!details || !listing || !listing.niche) return;
    if (withoutPhoto) setPhoto(null);
    void run(failure ? failure.phase : 0, { details, niche: listing.niche, name: listing.name, photo: withoutPhoto ? null : photo });
  };
  const cancel = () => { setConverting(false); close(); };

  const onDraft = useCallback((next: ProfileDraft) => setDraft(next), []);
  const onListingDraft = useCallback((next: { niche: Category | null; name: string }) => setListing(next), []);

  let content: React.ReactNode;
  if (stage === 'checking' || !userId || !initial) {
    content = <div className="onb"><main className="onb-main"><div className="onb-loading bh-converting" role="status" aria-label="Loading"><span className="onb-spinner" /></div></main></div>;
  } else if (stage === 'verify') {
    content = (
      <OnboardingLayout progress={0} stageKey="verify" direction={direction}>
        <VerifyCard token={token} initialError={verifyError} onVerified={() => goTo('details', 'forward')} />
      </OnboardingLayout>
    );
  } else if (stage === 'details') {
    const filled = draft.username.length >= 3 && phoneValid(draft.phone) && locationValid(draft.city);
    const shown = details || initial;
    content = (
      <OnboardingLayout progress={(1 + (filled ? 1 : 0)) / 3} stageKey="details" direction={direction}>
        <HostProfileStep
          userId={userId}
          currentUsername={profile?.username || null}
          initial={shown}
          existingAvatar={profile?.avatar_url && !removedAvatar ? resolveAvatarUrl(profile.avatar_url, getSupabaseClient(), PHOTO_WIDTH.thumb) : null}
          initialPhoto={photo ? photo.photo : null}
          deferSave
          note={<p className="bh-note">Same account, same sign-in. Your own bookings stay under Bookings → My trips.</p>}
          onDraft={onDraft}
          onDone={(newPhoto, removed) => {
            if (removed) setRemovedAvatar(true);
            if (newPhoto) { setPhoto(newPhoto); avatarPath.current = null; }
            setDetails({ username: draft.username, phone: draft.phone, city: draft.city });
            goTo('niche', 'forward');
          }}
        />
      </OnboardingLayout>
    );
  } else if (stage === 'niche') {
    const filled = Boolean(listing && listing.niche && discoverNameValid(listing.name));
    content = (
      <OnboardingLayout progress={(2 + (filled ? 1 : 0)) / 3} onBack={() => goTo('details', 'back')} backLabel="Back to your details" stageKey="niche" direction={direction} wide>
        <HostListingStep
          userId={userId}
          initialNiche={listing ? listing.niche : null}
          initialName={listing ? listing.name : (profile?.full_name || '')}
          photoNotice={null}
          deferSave
          submitLabel="Become a host"
          onDraft={onListingDraft}
          onDone={() => (listing && listing.niche ? start(listing.name, listing.niche) : Promise.resolve())}
        />
      </OnboardingLayout>
    );
  } else {
    const done = phase >= PHASES.length;
    content = (
      <div className="onb"><main className="onb-main"><div className="onb-flow">
        <div className="bh-converting" role="status" aria-live="polite">
          <span className={`bh-mark${done ? ' is-done' : failure ? ' is-stopped' : ''}`} aria-hidden="true">{done && <CheckIcon size={26} />}</span>
          <p key={phase} className="bh-phase">{done ? 'Welcome to hosting' : `${PHASES[phase]}…`}</p>
          <ol className="bh-steps" aria-hidden="true">
            {PHASES.map((label, index) => <li key={label} className={index < phase ? 'is-done' : index === phase ? 'is-active' : undefined} />)}
          </ol>
          {failure && (
            <div className="bh-failure">
              <p className="onb-alert" role="alert">{failure.message}</p>
              <div className="bh-failure-actions">
                <button type="button" className="onb-primary" onClick={() => retry()}>Try again</button>
                {failure.phase === 0 && photo && <button type="button" className="bh-secondary" onClick={() => retry(true)}>Continue without photo</button>}
                {failure.phase <= 1 && <button type="button" className="bh-secondary" onClick={cancel}>Cancel</button>}
              </div>
            </div>
          )}
        </div>
      </div></main></div>
    );
  }

  return (
    <div className={`bh-layer${closing ? ' is-closing' : ''}`} role="dialog" aria-modal="true" aria-label="Become a host">
      <Head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,700;9..144,900&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
      </Head>
      <style dangerouslySetInnerHTML={{ __html: ONBOARDING_STYLES + BECOME_HOST_STYLES }} />
      <div className="bh-panel" ref={panel} tabIndex={-1}>
        {stage !== 'converting' && (
          <button type="button" className="bh-close" aria-label="Close" onClick={close}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
          </button>
        )}
        {content}
      </div>
    </div>
  );
}

/** The session is old: the password (checked by the server), or Google for Google-only accounts. */
function VerifyCard({ token, initialError, onVerified }: { token: string | null; initialError: string; onVerified: () => void }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState(initialError);
  const [busy, setBusy] = useState(false);
  const [google, setGoogle] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);

  useEffect(() => {
    if (!token) return undefined;
    let cancelled = false;
    googleVerificationEligible(token).then((eligible) => { if (!cancelled) setGoogle(eligible); });
    return () => { cancelled = true; };
  }, [token]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!password || busy) return;
    if (!token) { setError('Your session has expired. Please sign in again.'); return; }
    setBusy(true);
    setError('');
    const result = await verifyPassword(token, password);
    if (result.ok) { rememberUnlock(sessionStore(), tokenSessionId(token), result.unlockedUntil); onVerified(); return; }
    setError(result.error);
    setBusy(false);
  };

  const withGoogle = async () => {
    const client = getSupabaseClient();
    setGoogleBusy(true);
    setError('');
    try {
      if (!client) throw new Error('Your session has expired. Please sign in again.');
      await beginGoogleVerification(client, BECOME_HOST_HREF);
    } catch (failure) {
      setError((failure as Error).message || 'Google verification could not be started. Please try again.');
      setGoogleBusy(false);
    }
  };

  return (
    <form className="onb-form" onSubmit={(event) => { void submit(event); }} noValidate>
      <div className="onb-heading">
        <h1>First, confirm it's you.</h1>
        <p>It's been a while since you signed in. Confirm your password to set up hosting on this account.</p>
      </div>
      <div className="onb-sheet">
        <div className="onb-field">
          <label htmlFor="bh-password">Password</label>
          <div className={`onb-input${error ? ' is-invalid' : ''}`}>
            <input id="bh-password" type="password" value={password} autoComplete="current-password" placeholder="Enter your password" autoFocus
              onChange={(event) => { setPassword(event.target.value); setError(''); }} />
          </div>
        </div>
      </div>
      <div className="onb-actions">
        {error && <p className="onb-alert" role="alert">{error}</p>}
        <button type="submit" className="onb-primary" disabled={!password || busy} aria-busy={busy}>{busy ? 'Checking...' : 'Continue'}</button>
        {google && (
          <>
            <p className="bh-or">or</p>
            <button type="button" className="bh-secondary" disabled={googleBusy} onClick={() => { void withGoogle(); }}>{googleBusy ? 'Opening Google...' : 'Verify with Google'}</button>
          </>
        )}
      </div>
    </form>
  );
}
