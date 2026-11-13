import Head from 'next/head';
import { useRouter } from 'next/router';
import React, { useCallback, useEffect, useState } from 'react';
import { HeroSection } from '../components/landing/HeroSection';
import { AuthPanel } from '../components/landing/AuthPanel';
import { normalizeSignupRole } from '../lib/auth/authFlow';
import { originOf } from '../lib/landing/useTriggerReveal';
import type { RevealOrigin } from '../lib/landing/useTriggerReveal';

export default function LandingPage() {
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
  const openSignup = useCallback((trigger?: HTMLElement) => {
    setAuthOrigin(originOf(trigger));
    setInitialAuthView('signup');
    setInitialRecoveryStep('email');
    setSignupRole('client');
    setAuthOpen(true);
  }, []);

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
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/favicon/favicon.ico" sizes="any" />
        <link rel="icon" type="image/png" sizes="32x32" href="/favicon/favicon-32_1.png" />
        <link rel="icon" type="image/png" sizes="16x16" href="/favicon/favicon-16.png" />
        <link rel="apple-touch-icon" sizes="180x180" href="/favicon/favicon-180.png" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Source+Serif+4:ital,wght@0,200..900;1,200..900&display=swap"
          rel="stylesheet"
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
          .hero-header-actions > :nth-child(1) { animation-delay: 150ms; }
          .hero-header-actions > :nth-child(2) { animation-delay: 200ms; }
          .hero-header-mobile > :nth-child(1) { animation-delay: 150ms; }
          .hero-header-mobile > :nth-child(2) { animation-delay: 200ms; }
          .hero-eyebrow {
            animation: heroFadeUp 600ms cubic-bezier(0.22, 1, 0.36, 1) both;
          }
          .hero-headline {
            animation: heroFadeUp 820ms cubic-bezier(0.22, 1, 0.36, 1) 80ms both;
          }
          .hero-subtitle {
            animation: heroFadeUp 650ms cubic-bezier(0.22, 1, 0.36, 1) 230ms both;
          }
          .hero-cta {
            animation: heroFadeUp 650ms cubic-bezier(0.22, 1, 0.36, 1) 390ms both;
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
            font-family: 'Source Serif 4', Georgia, serif !important;
          }
        `}</style>
      </Head>

      <main className="landing-page min-h-screen w-full max-w-full overflow-x-hidden box-border bg-[#f7f3ec] text-[#181513] font-sans antialiased selection:bg-[#bd2337] selection:text-white">
        {/* Hero stage: the rest of the landing page is being redesigned. */}
        <div className="relative w-full">
          {/* Nairobi illustration background pinned behind the hero */}
          <div
            className="sticky top-0 h-[100dvh] w-full -mb-[100dvh] pointer-events-none select-none overflow-hidden z-0"
            aria-hidden="true"
          >
            <picture className="absolute inset-0 block">
              <source media="(max-width: 767px)" srcSet="/assets/phonelanding.jpg" />
              <img
                src="/assets/landing.jpg"
                alt="VaRoom Nairobi Skyline"
                className="hero-background-image w-full h-full object-cover object-top"
                // @ts-expect-error fetchpriority is a modern HTML attribute
                fetchpriority="high"
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
          />
        </div>

        <AuthPanel
          isOpen={isAuthOpen}
          onClose={closeAuth}
          origin={authOrigin}
          initialView={initialAuthView}
          initialRole={signupRole}
          initialRecoveryStep={initialRecoveryStep}
        />
      </main>
    </>
  );
}
