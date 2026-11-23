import Head from 'next/head';
import type { GetStaticProps } from 'next';
import { createClient } from '@supabase/supabase-js';
import { useRouter } from 'next/router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { HeroSection } from '../components/landing/HeroSection';
import { AuthPanel } from '../components/landing/AuthPanel';
import { HostFeaturesSection } from '../components/landing/HostFeaturesSection';
import { SpacesSection } from '../components/landing/SpacesSection';
import { TrustSection } from '../components/landing/TrustSection';
import { landingSections } from '../lib/landing/sections';
import { fetchFeaturedSpaces } from '../lib/landing/featuredSpaces';
import type { FeaturedSpace } from '../lib/landing/featuredSpaces';
import { fetchFeaturedReviews } from '../lib/reviews/varoomReviews';
import type { FeaturedReview } from '../lib/reviews/varoomReviews';
import { SUPABASE_ANON_KEY, SUPABASE_URL } from '../lib/supabase/config';
import { normalizeSignupRole } from '../lib/auth/authFlow';
import { originOf } from '../lib/landing/useTriggerReveal';
import type { RevealOrigin } from '../lib/landing/useTriggerReveal';
import { Plus_Jakarta_Sans, Source_Serif_4 } from 'next/font/google';
import heroDesktop from '../assets/landing/hero-desktop.webp';
import heroPhone from '../assets/landing/hero-phone.webp';

// Self-hosted with the page's assets (long-cached, no third-party stylesheet
// blocking the first paint). The serif is the hero's font, so it is preloaded;
// the sans only dresses the product pieces further down.
const landingSerif = Source_Serif_4({ subsets: ['latin'], style: ['normal', 'italic'], variable: '--font-landing-serif' });
const landingSans = Plus_Jakarta_Sans({ subsets: ['latin'], variable: '--font-landing-sans', preload: false });

interface LandingPageProps {
  spaces: FeaturedSpace[];
  /** The approved reviews of VaRoom (newest first) the sign-in panel and the last page show in turn. */
  reviews: FeaturedReview[];
}

export default function LandingPage({ spaces, reviews }: LandingPageProps) {
  // The top bar links to the pages below; Spaces only when it has cards.
  const sections = useMemo(() => landingSections(spaces.length > 0), [spaces.length]);
  const router = useRouter();
  const [isAuthOpen, setAuthOpen] = useState(false);
  const [initialAuthView, setInitialAuthView] = useState<'login' | 'signup' | 'recovery'>('login');
  const [initialRecoveryStep, setInitialRecoveryStep] = useState<'email' | 'password'>('email');
  const [signupRole, setSignupRole] = useState<'host' | 'client'>('client');
  // The control that opened the auth panel: it grows out of it and closes back into it.
  const [authOrigin, setAuthOrigin] = useState<RevealOrigin>(null);
  const closeAuth = useCallback(() => {
    setInitialRecoveryStep('email');
    setAuthOpen(false);
  }, []);
  const openSignIn = useCallback((trigger?: HTMLElement) => {
    setAuthOrigin(originOf(trigger));
    setInitialAuthView('login');
    setInitialRecoveryStep('email');
    setSignupRole('client');
    setAuthOpen(true);
  }, []);
  const openSignup = useCallback((trigger?: HTMLElement, role: 'host' | 'client' = 'client') => {
    setAuthOrigin(originOf(trigger));
    setInitialAuthView('signup');
    setInitialRecoveryStep('email');
    setSignupRole(role);
    setAuthOpen(true);
  }, []);
  const openHostSignup = useCallback((trigger: HTMLElement) => openSignup(trigger, 'host'), [openSignup]);

  // Landing page must strictly remain in light mode
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', 'light');
    document.documentElement.style.colorScheme = 'light';
    return () => {
      try {
        const saved = localStorage.getItem('varoom_theme') || 'system';
        const resolved = saved === 'system'
          ? (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
          : saved;
        document.documentElement.setAttribute('data-theme', resolved);
        document.documentElement.style.colorScheme = resolved;
      } catch (e) {}
    };
  }, []);

  // Route legacy auth URLs into the shared authentication shell.
  useEffect(() => {
    if (router.isReady && (router.query.auth === 'login' || router.query.auth === 'signup' || router.query.auth === 'recovery' || router.query.signup === '1')) {
      const isSignup = router.query.auth === 'signup' || router.query.signup === '1';
      const isRecovery = router.query.auth === 'recovery';
      setInitialAuthView(isRecovery ? 'recovery' : isSignup ? 'signup' : 'login');
      setInitialRecoveryStep(isRecovery && (router.query.step === 'password' || router.query.mode === 'reset') ? 'password' : 'email');
      setSignupRole(isSignup ? normalizeSignupRole(router.query.role) : 'client');
      setAuthOrigin(null);
      setAuthOpen(true);
    }
  }, [router.isReady, router.query.auth, router.query.signup, router.query.role, router.query.step, router.query.mode]);

  return (
    <>
      <Head>
        <title>VaRoom | Spaces for the way you live. Real spaces across Kenya.</title>
        <meta
          name="description"
          content="Discover stays, spaces and experiences from real people across Kenya. GPS verified locations, trusted hosts, secure bookings."
        />
        <style>{`
          html, body {
            background: #f7f3ec !important;
            color: #181513 !important;
          }
          *, *::before, *::after {
            box-sizing: border-box;
          }
          html {
            scroll-behavior: smooth;
          }
          html, body {
            margin: 0;
            padding: 0;
            width: 100%;
            max-width: 100vw;
            overflow-x: hidden;
          }
          .hero-section {
            min-height: 100svh;
            min-height: 100dvh;
          }
          @media (max-height: 600px) {
            .hero-section {
              overflow: visible;
            }
          }
          @media (max-width: 639px) {
            .hero-section {
              overflow: visible;
            }
            .hero-cta .landing-cta {
              min-height: 48px;
            }
          }
          .landing-page {
            --radius-cta: 18px;
          }
          @media (min-width: 1280px) and (min-height: 850px) {
            .hero-animated-content {
              padding-bottom: 80px !important;
            }
          }
          @media (min-width: 640px) {
            html {
              scroll-snap-type: y proximity;
            }
            .snap-page {
              scroll-snap-align: start;
              scroll-snap-stop: normal;
            }
          }
          @keyframes heroExitAnim {
            0% {
              transform: translateY(0);
              opacity: 1;
            }
            100% {
              transform: translateY(-40px);
              opacity: 0.15;
            }
          }
          @keyframes heroFadeUp {
            from {
              opacity: 0;
              transform: translate3d(0, 22px, 0);
            }
            to {
              opacity: 1;
              transform: translate3d(0, 0, 0);
            }
          }
          @keyframes heroHeaderFadeUp {
            from {
              opacity: 0;
              transform: translate3d(0, 12px, 0);
            }
            to {
              opacity: 1;
              transform: translate3d(0, 0, 0);
            }
          }
          @keyframes heroBackgroundDrift {
            from {
              transform: scale(1);
            }
            to {
              transform: scale(1.03);
            }
          }
          .hero-background-image {
            animation: heroBackgroundDrift 26s ease-in-out infinite alternate;
            transform-origin: center top;
            will-change: transform;
          }
          .hero-header-logo,
          .hero-header-actions > *,
          .hero-header-mobile > * {
            animation: heroHeaderFadeUp 520ms cubic-bezier(0.22, 1, 0.36, 1) both;
          }
          /* The links to the pages below: centred in the top bar, the underline grows on hover. */
          /* Tablets: centred in the space between the logo and the buttons, so it never touches either. */
          .hero-header-nav {
            align-items: center;
            gap: clamp(18px, 2.4vw, 36px);
            margin: 0 auto;
            padding: 0 16px;
          }
          /* Wider screens: centred on the page. */
          @media (min-width: 1024px) {
            .hero-header-nav {
              position: absolute;
              left: 50%;
              top: 50%;
              translate: -50% -50%;
              margin: 0;
              padding: 0;
            }
          }
          .hero-nav-link {
            position: relative;
            padding: 6px 0;
            font-size: 0.9375rem;
            font-weight: 500;
            color: #181513;
            text-decoration: none !important;
            white-space: nowrap;
            animation: heroHeaderFadeUp 520ms cubic-bezier(0.22, 1, 0.36, 1) both;
          }
          .hero-nav-link:nth-child(1) { animation-delay: 60ms; }
          .hero-nav-link:nth-child(2) { animation-delay: 100ms; }
          .hero-nav-link:nth-child(3) { animation-delay: 140ms; }
          .hero-nav-link::after {
            content: '';
            position: absolute;
            left: 0;
            right: 0;
            bottom: 0;
            height: 1.5px;
            border-radius: 1px;
            background: currentColor;
            scale: 0 1;
            transform-origin: left center;
            transition: scale 200ms var(--ease-out);
          }
          .hero-nav-link:focus-visible { outline: 2px solid #bd2337; outline-offset: 4px; border-radius: 4px; }
          @media (hover: hover) and (pointer: fine) {
            .hero-nav-link:hover::after { scale: 1 1; }
          }
          .menu-nav-link:focus-visible { outline: 2px solid #f5efe7; outline-offset: 4px; }
          /* A page that receives focus after a jump shows no outline. */
          .snap-page:focus { outline: none; }
          .hero-header-actions > :nth-child(1) { animation-delay: 150ms; }
          .hero-header-actions > :nth-child(2) { animation-delay: 200ms; }
          .hero-header-mobile > :nth-child(1) { animation-delay: 150ms; }
          .hero-header-mobile > :nth-child(2) { animation-delay: 200ms; }
          .hero-eyebrow {
            animation: heroFadeUp 600ms cubic-bezier(0.22, 1, 0.36, 1) both;
          }
          /* The headline is the page's largest content: it rises in but is never
             invisible, so browsers can measure when the page has painted
             (fully transparent text does not count as content). */
          @keyframes heroRise {
            from {
              transform: translate3d(0, 22px, 0);
            }
            to {
              transform: translate3d(0, 0, 0);
            }
          }
          .hero-headline {
            animation: heroRise 820ms cubic-bezier(0.22, 1, 0.36, 1) 80ms both;
          }
          .hero-subtitle {
            animation: heroFadeUp 650ms cubic-bezier(0.22, 1, 0.36, 1) 230ms both;
          }
          .hero-cta {
            animation: heroFadeUp 650ms cubic-bezier(0.22, 1, 0.36, 1) 390ms both;
          }
          /* The hero's call to action is VaRoom red; the other landing buttons stay black. */
          .hero-cta .landing-cta.landing-cta-primary {
            background: #bd2337 !important;
            border-color: #bd2337 !important;
            box-shadow: 0 10px 24px -12px rgba(189, 35, 55, 0.7) !important;
          }
          .hero-cta .landing-cta.landing-cta-primary:hover:not(:disabled):not([aria-disabled='true']) {
            background: #a11c2e !important;
            border-color: #a11c2e !important;
          }
          .hero-cta-arrow {
            transition: transform 200ms cubic-bezier(0.22, 1, 0.36, 1);
          }
          .hero-cta .landing-cta:hover .hero-cta-arrow {
            transform: translateX(3px);
          }
          @supports (animation-timeline: view()) {
            .hero-animated-content {
              animation: heroExitAnim linear both;
              animation-timeline: view();
              animation-range: exit 0% exit 100%;
            }
          }
          @media (prefers-reduced-motion: reduce) {
            html {
              scroll-behavior: auto;
            }
            .hero-background-image,
            .hero-header-logo,
            .hero-nav-link,
            .hero-header-actions > *,
            .hero-header-mobile > *,
            .hero-headline,
            .hero-subtitle,
            .hero-cta,
            .hero-eyebrow,
            .hero-animated-content {
              animation: none !important;
              transform: none !important;
              opacity: 1 !important;
              will-change: auto;
            }
            .hero-nav-link::after {
              transition: none !important;
            }
            .hero-cta-arrow {
              transition: none !important;
              transform: none !important;
            }
          }
          .varoom-logo, .varoom-logo:hover, .varoom-logo:focus, .varoom-logo * {
            text-decoration: none !important;
            border-bottom: none !important;
            box-shadow: none !important;
          }
          .landing-page,
          .landing-page * {
            font-family: var(--font-landing-serif), Georgia, serif !important;
          }
        `}</style>
      </Head>

      <main className={`${landingSerif.variable} ${landingSans.variable} landing-page min-h-screen w-full max-w-full overflow-x-hidden box-border bg-[#f7f3ec] text-[#181513] font-sans antialiased selection:bg-[#bd2337] selection:text-white`}>
        {/* Hero stage */}
        <div className="relative w-full">
          {/* Nairobi illustration background pinned behind the hero */}
          <div
            className="sticky top-0 h-[100dvh] w-full -mb-[100dvh] pointer-events-none select-none overflow-hidden z-0"
            aria-hidden="true"
          >
            <picture className="absolute inset-0 block">
              <source media="(max-width: 767px)" srcSet={heroPhone.src} />
              <img
                src={heroDesktop.src}
                alt="VaRoom Nairobi Skyline"
                className="hero-background-image w-full h-full object-cover object-top"
                fetchPriority="high"
              />
            </picture>
            {/* Darkens the bottom-left, where the white hero and auth copy sit */}
            <div
              className={`absolute inset-0 pointer-events-none ${
                isAuthOpen
                  ? 'bg-[linear-gradient(to_top,rgba(8,9,9,0.66)_0%,rgba(8,9,9,0.2)_38%,transparent_62%)]'
                  : 'bg-[linear-gradient(to_top_right,rgba(8,9,9,0.68)_0%,rgba(8,9,9,0.36)_34%,rgba(8,9,9,0.12)_58%,rgba(247,243,236,0.24)_100%)] max-[639px]:bg-[linear-gradient(to_top,rgba(8,9,9,0.78)_0%,rgba(8,9,9,0.45)_40%,transparent_70%)]'
              }`}
            />
          </div>

          {/* Hero Section */}
          <HeroSection
            isAuthOpen={isAuthOpen}
            onOpenAuth={openSignIn}
            onOpenSignup={openSignup}
            sections={sections}
          />
        </div>

        {/* Page 2: one card per niche */}
        <SpacesSection spaces={spaces} />

        {/* Page 3: what hosts get */}
        <HostFeaturesSection onListSpace={openHostSignup} />

        {/* Page 4: a review, why VaRoom is safe, a last call and the footer */}
        <TrustSection reviews={reviews} onListSpace={openHostSignup} />

        <AuthPanel
          isOpen={isAuthOpen}
          onClose={closeAuth}
          origin={authOrigin}
          initialView={initialAuthView}
          initialRole={signupRole}
          initialRecoveryStep={initialRecoveryStep}
          reviews={reviews}
        />
      </main>
    </>
  );
}

// Listings and approved reviews change slowly; the page is rebuilt at most
// every five minutes, so an approved review shows within about five minutes.
const SPACES_REVALIDATE_SECONDS = 300;

export const getStaticProps: GetStaticProps<LandingPageProps> = async () => {
  const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  // Each loads on its own: one failing does not take the other with it.
  const [spaces, reviews] = await Promise.all([
    fetchFeaturedSpaces(client).catch((error: unknown) => {
      console.warn('Landing spaces unavailable at build time', error);
      return null;
    }),
    fetchFeaturedReviews(client).catch(() => []),
  ]);
  // Without cards the section is left out; retry sooner.
  return { props: { spaces: spaces || [], reviews }, revalidate: spaces ? SPACES_REVALIDATE_SECONDS : 60 };
};
