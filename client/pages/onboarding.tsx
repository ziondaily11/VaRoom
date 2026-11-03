import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { useAuth } from '../lib/auth/AuthProvider';
import { getSupabaseClient } from '../lib/supabase/client';
import { getSafeRedirect, loginUrl } from '../lib/safeRedirect';
import { accountRole } from '../lib/types/profile';
import { resolveAvatarUrl } from '../components/resolveStoredPhotoUrl';
import {
  destination, hostStepKey, initialCategories, initialHostStep, initialNiche, initialTimeline, loadHostExtras, phoneForInput, roleHome,
  type Category, type HostExtras, type Timeline,
} from '../lib/onboarding/onboarding';
import { OnboardingLayout, type StepInfo } from '../components/onboarding/OnboardingParts';
import { ClientPreview, ClientStep, HostListingStep, HostPreview, HostProfileStep, type ProfileDraft } from '../components/onboarding/OnboardingSteps';
import { ONBOARDING_STYLES } from '../components/onboarding/onboardingStyles';

// Onboarding (migrated from legacy-pages/onboarding.html, redesigned in the
// Split style): hosts set up their profile, then what they list; clients say
// what they're looking for. The account and profile come from AuthProvider;
// hosts' phone, city and listing category are read once. When done, people
// go back to the link they signed in from (if safe), else their role's home.

const storage = () => { try { return window.localStorage; } catch { return null; } };

export default function OnboardingPage() {
  const router = useRouter();
  const { status, user, profile, profileError, refreshProfile } = useAuth();
  const userId = user?.id || null;
  // As before the migration: the role chosen at sign-up stands in until the profile row has one.
  const metadataRole: unknown = user?.user_metadata?.role;
  const role = accountRole(profile) || (metadataRole === 'host' || metadataRole === 'client' ? metadataRole : null);
  const redirect = useMemo(() => {
    const safe = getSafeRedirect(router.query.redirect);
    return safe && !safe.startsWith('/onboarding') ? safe : null;
  }, [router.query.redirect]);

  const [extras, setExtras] = useState<HostExtras | null>(null);
  const [step, setStep] = useState<1 | 2 | null>(null);
  const [profileDraft, setProfileDraft] = useState<ProfileDraft>({ username: '', phone: '', city: '', photo: null });
  const [listingDraft, setListingDraft] = useState<{ niche: Category | null; name: string }>({ niche: null, name: '' });
  const [clientDraft, setClientDraft] = useState<{ categories: Category[]; timeline: Timeline | null }>({ categories: [], timeline: null });
  const [leaving, setLeaving] = useState(false);
  // Step 1's saved username (the auth profile refreshes only at the end).
  const [savedUsername, setSavedUsername] = useState<string | null>(null);
  // Right after sign-up the cached profile can predate the row the sign-in
  // callback just wrote, so a missing profile or role is read fresh once
  // before sending anyone back to sign in.
  const [recheck, setRecheck] = useState<'idle' | 'running' | 'done'>('idle');

  // Who may be here: signed in, a known role, not yet onboarded.
  useEffect(() => {
    if (!router.isReady || leaving) return;
    if (status === 'signed-out') { void router.replace(loginUrl(router.asPath)); return; }
    if (status !== 'signed-in' || (!profile && !profileError)) return;
    if (!profile || !role) {
      if (recheck === 'idle') {
        setRecheck('running');
        refreshProfile().catch(() => {}).finally(() => setRecheck('done'));
        return;
      }
      if (recheck === 'done') void router.replace(loginUrl(router.asPath));
      return;
    }
    if (profile.onboarding_completed) void router.replace(redirect || roleHome(role));
  }, [router, router.isReady, status, profile, profileError, role, redirect, leaving, recheck, refreshProfile]);

  // Hosts: the rest of their profile, and which step to resume.
  useEffect(() => {
    const client = getSupabaseClient();
    if (!client || !userId || role !== 'host' || profile?.onboarding_completed) return undefined;
    let cancelled = false;
    loadHostExtras(client, userId).then((row) => {
      if (cancelled) return;
      setExtras(row);
      let stored: string | null = null;
      try { stored = storage()?.getItem(hostStepKey(userId)) || null; } catch { stored = null; }
      setStep(initialHostStep(stored, { username: profile?.username, phone: row.phone, city: row.city }));
    }).catch((error) => {
      console.error('Onboarding could not load your profile:', error);
      if (!cancelled) { setExtras({ phone: null, city: null, listing_categories: null }); setStep(1); }
    });
    return () => { cancelled = true; };
    // Loaded once per account.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, role]);

  const goToStep = useCallback((next: 1 | 2) => {
    setStep(next);
    if (userId) { try { storage()?.setItem(hostStepKey(userId), String(next)); } catch { /* storage unavailable */ } }
    window.scrollTo({ top: 0 });
  }, [userId]);

  const leave = useCallback(async (timeline: Timeline | null) => {
    if (!role) return;
    setLeaving(true);
    if (userId && role === 'host') { try { storage()?.removeItem(hostStepKey(userId)); } catch { /* storage unavailable */ } }
    // The app (navigation, home pages) must see onboarding as done.
    try { await refreshProfile(); } catch { /* the next page reads it anyway */ }
    void router.replace(destination(role, timeline, redirect));
  }, [role, userId, refreshProfile, router, redirect]);

  const onProfileDraft = useCallback((draft: ProfileDraft) => setProfileDraft(draft), []);
  const onListingDraft = useCallback((draft: { niche: Category | null; name: string }) => setListingDraft(draft), []);
  const onClientDraft = useCallback((draft: { categories: Category[]; timeline: Timeline | null }) => setClientDraft(draft), []);

  const head = (
    <Head>
      <title>Welcome to VaRoom</title>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
      <link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,700;9..144,900&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
    </Head>
  );
  const styles = <style dangerouslySetInnerHTML={{ __html: ONBOARDING_STYLES }} />;

  const ready = Boolean(userId && profile && role && !profile.onboarding_completed && !leaving && (role === 'client' || (extras && step)));
  if (!ready || !userId || !profile || !role) {
    return (
      <>
        {head}{styles}
        <div className="onb"><div className="onb-loading" role="status" aria-label="Loading"><span className="onb-spinner" /></div></div>
      </>
    );
  }

  if (role === 'client') {
    return (
      <>
        {head}{styles}
        <OnboardingLayout
          steps={[{ label: 'Your account', state: 'done' }, { label: "What you're looking for", state: 'current' }]}
          mobileStep={clientDraft.categories.length ? `Your picks: ${clientDraft.categories.length}` : 'Almost there'}
          mobileTitle="What are you hoping to find?"
          preview={<ClientPreview categories={clientDraft.categories} timeline={clientDraft.timeline} />}
          note="You can change these preferences anytime."
        >
          <ClientStep
            userId={userId}
            initialCategories={initialCategories(profile.interested_categories)}
            initialTimeline={initialTimeline(profile.looking_timeline)}
            onDraft={onClientDraft}
            onDone={(timeline) => { void leave(timeline); }}
          />
        </OnboardingLayout>
      </>
    );
  }

  const hostExtras = extras as HostExtras;
  const existingAvatar = profile.avatar_url ? resolveAvatarUrl(profile.avatar_url, getSupabaseClient()) : null;
  const steps: StepInfo[] = [
    { label: 'Your profile', state: step === 1 ? 'current' : 'done' },
    { label: "What you'll list", state: step === 2 ? 'current' : 'next' },
  ];
  return (
    <>
      {head}{styles}
      <OnboardingLayout
        steps={steps}
        mobileStep={`Step ${step} of 2`}
        mobileTitle={step === 1 ? 'A little more you.' : 'What will you be listing?'}
        preview={(
          <HostPreview
            name={step === 2 ? listingDraft.name : (profile.full_name || '')}
            username={profileDraft.username || profile.username || ''}
            city={profileDraft.city || hostExtras.city || ''}
            niche={step === 2 ? listingDraft.niche : null}
            photo={profileDraft.photo}
            existingAvatar={existingAvatar}
          />
        )}
        note="You can change any of this later in your profile."
      >
        {step === 1 ? (
          <HostProfileStep
            userId={userId}
            currentUsername={savedUsername || profile.username || null}
            initial={{ username: savedUsername || profile.username || '', phone: phoneForInput(hostExtras.phone), city: hostExtras.city || '' }}
            existingAvatar={existingAvatar}
            onDraft={onProfileDraft}
            onDone={() => {
              setExtras((current) => (current ? { ...current, city: profileDraft.city, phone: profileDraft.phone } : current));
              setSavedUsername(profileDraft.username);
              goToStep(2);
            }}
          />
        ) : (
          <HostListingStep
            userId={userId}
            initialNiche={initialNiche(hostExtras.listing_categories)}
            initialName={profile.full_name || ''}
            onDraft={onListingDraft}
            onBack={() => goToStep(1)}
            onDone={() => { void leave(null); }}
          />
        )}
      </OnboardingLayout>
    </>
  );
}
