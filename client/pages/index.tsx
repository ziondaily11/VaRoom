import Head from 'next/head';
import Script from 'next/script';
import { useRouter } from 'next/router';
import React, { useCallback, useEffect, useState } from 'react';
import { GetStaticProps } from 'next';
import { HeroSection } from '../components/landing/HeroSection';
import { PlacesSection } from '../components/landing/PlacesSection';
import { HostSection } from '../components/landing/HostSection';
import { ClientSection } from '../components/landing/ClientSection';
import { HowItWorksSection } from '../components/landing/HowItWorksSection';
import { DifferentiatorSection } from '../components/landing/DifferentiatorSection';
import { Footer } from '../components/landing/Footer';
import { AuthPanel } from '../components/landing/AuthPanel';
import { Listing } from '../components/landing/types';
import { INITIAL_LISTINGS } from '../components/landing/initialListings';

interface LandingPageProps {
  initialListings: Listing[];
}

export default function LandingPage({ initialListings }: LandingPageProps) {
  const router = useRouter();
  const [isAuthOpen, setAuthOpen] = useState(false);
  const [initialAuthView, setInitialAuthView] = useState<'login' | 'signup'>('login');
  const [signupRole, setSignupRole] = useState<'host' | 'client'>('client');
  const [listings, setListings] = useState<Listing[]>(initialListings && initialListings.length > 0 ? initialListings : INITIAL_LISTINGS);
  const closeAuth = useCallback(() => setAuthOpen(false), []);
  const openSignIn = useCallback(() => {
    setInitialAuthView('login');
    setSignupRole('client');
    setAuthOpen(true);
  }, []);
  const openSignup = useCallback((role: 'host' | 'client' = 'client') => {
    setInitialAuthView('signup');
    setSignupRole(role);
    setAuthOpen(true);
  }, []);

  // Route legacy auth URLs into the shared authentication shell.
  useEffect(() => {
    if (router.isReady && (router.query.auth === 'login' || router.query.auth === 'signup' || router.query.signup === '1')) {
      const isSignup = router.query.auth === 'signup' || router.query.signup === '1';
      setInitialAuthView(isSignup ? 'signup' : 'login');
      setSignupRole(isSignup && router.query.role === 'host' ? 'host' : 'client');
      setAuthOpen(true);
    }
  }, [router.isReady, router.query.auth, router.query.signup, router.query.role]);

  // Fetch real listings and their actual stored amenities from Supabase
  useEffect(() => {
    let isMounted = true;
    async function loadRealListings() {
      try {
        // @ts-expect-error window.supabaseClient is initialized by script
        let sb = typeof window !== 'undefined' ? window.supabaseClient : null;
        if (!sb) {
          const { createClient } = await import('@supabase/supabase-js');
          const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://deaphymimdaygeavhyek.supabase.co';
          const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRlYXBoeW1pbWRheWdlYXZoeWVrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY1MjAwNDQsImV4cCI6MjEwMjA5NjA0NH0.rbgVhuZCK1fZP7gKV5oO1OUvIT61ir23VhAYm8739SI';
          sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
        }

        const baseSelect = 'id,title,description,location_text,category,verified,created_at,host_id,listing_photos(storage_path),listing_booking_details(*),host:profiles(full_name,verified,avatar_url,username)';
        const missingColumnMessage = 'availability_status';

        let { data, error } = await sb
          .from('listings')
          .select(`${baseSelect},availability_status`)
          .eq('moderation_status', 'active')
          .order('created_at', { ascending: false })
          .limit(12);

        if (error && String(error.message || error.details || error).toLowerCase().includes(missingColumnMessage) &&
          (String(error.message || error.details || error).toLowerCase().includes('does not exist') ||
           String(error.message || error.details || error).toLowerCase().includes('not found') ||
           String(error.message || error.details || error).toLowerCase().includes('column') ||
           String(error.message || error.details || error).toLowerCase().includes('missing'))) {
          ({ data, error } = await sb
            .from('listings')
            .select(baseSelect)
            .eq('moderation_status', 'active')
            .order('created_at', { ascending: false })
            .limit(12));
        }

        if (!error && data && data.length > 0 && isMounted) {
          const mapped: Listing[] = data.map((l: any) => {
            const photo = (l.listing_photos || []).find((p: any) => p && p.storage_path);
            const photoUrl = photo ? sb.storage.from('listing-photos').getPublicUrl(photo.storage_path).data.publicUrl : null;
            const details = Array.isArray(l.listing_booking_details) ? l.listing_booking_details[0] : l.listing_booking_details;
            return {
              id: l.id,
              title: l.title || 'VaRoom Space',
              category: l.category || 'property',
              location: l.location_text || 'Kenya',
              photoUrl,
              price: details ? details.price_amount : null,
              priceUnit: details ? details.price_unit || 'night' : 'night',
              guests: details ? details.max_guests : null,
              sizeOrType: details ? details.size_or_type : null,
              amenities: details && Array.isArray(details.amenities) ? details.amenities : [],
              verified: Boolean(l.verified || (l.host && l.host.verified)),
              hostName: l.host ? (l.host.full_name || l.host.username || 'VaRoom Host') : 'VaRoom Host',
            };
          });

          const validWithPhotos = mapped.filter((m) => Boolean(m.photoUrl));
          if (validWithPhotos.length > 0) {
            setListings(validWithPhotos);
          }
        }
      } catch (err) {
        console.warn('Live listings retrieval fallback:', err);
      }
    }

    loadRealListings();
    return () => {
      isMounted = false;
    };
  }, []);

  // Try Elie AI session handler (preserves existing VaRoom Elie flow)
  async function handleTryElie(event: React.MouseEvent) {
    event.preventDefault();
    const destination = '/signup-client';

    // @ts-expect-error window.supabaseClient is initialized by script
    const client = typeof window !== 'undefined' ? window.supabaseClient : null;
    if (!client) {
      window.location.assign(destination);
      return;
    }

    try {
      const { data, error } = await client.auth.getSession();
      if (error || !data.session) {
        window.location.assign(destination);
        return;
      }
      window.location.assign('/chats?conversation=elie');
    } catch {
      window.location.assign(destination);
    }
  }

  return (
    <>
      <Head>
        <title>VaRoom | Find your place. Real spaces across Kenya.</title>
        <meta
          name="description"
          content="Discover stays, spaces and experiences from real people across Kenya. GPS verified locations, trusted hosts, secure bookings."
        />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/favicon/favicon.ico" sizes="any" />
        <link rel="icon" type="image/png" sizes="32x32" href="/favicon/favicon-32.png" />
        <link rel="icon" type="image/png" sizes="16x16" href="/favicon/favicon-16.png" />
        <link rel="apple-touch-icon" sizes="180x180" href="/favicon/favicon-180.png" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Source+Serif+4:wght@200..900&display=swap"
          rel="stylesheet"
        />
        <style>{`
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
          @keyframes placesCardEnter {
            from {
              opacity: 0;
              transform: translate3d(0, 18px, 0);
            }
            to {
              opacity: 1;
              transform: translate3d(0, 0, 0);
            }
          }
          @keyframes placesCharacterReveal {
            from { opacity: 0; }
            to { opacity: 1; }
          }
          @keyframes placesSupportReveal {
            from {
              opacity: 0;
              transform: translate3d(0, 5px, 0);
            }
            to {
              opacity: 1;
              transform: translate3d(0, 0, 0);
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
          @keyframes heroTrustFade {
            from { opacity: 0; }
            to { opacity: 1; }
          }
          @keyframes clientBadgeReveal {
            from {
              opacity: 0;
              transform: translate3d(0, 10px, 0);
            }
            to {
              opacity: 1;
              transform: translate3d(0, 0, 0);
            }
          }
          @keyframes clientTitleReveal {
            from {
              opacity: 0;
              transform: translate3d(0, 14px, 0);
            }
            to {
              opacity: 1;
              transform: translate3d(0, 0, 0);
            }
          }
          @keyframes clientCopyReveal {
            from {
              opacity: 0;
              transform: translate3d(0, 12px, 0);
            }
            to {
              opacity: 1;
              transform: translate3d(0, 0, 0);
            }
          }
          @keyframes clientButtonReveal {
            from {
              opacity: 0;
              transform: translate3d(0, 12px, 0);
            }
            to {
              opacity: 1;
              transform: translate3d(0, 0, 0);
            }
          }
          @keyframes clientCardReveal {
            from {
              opacity: 0;
              transform: translate3d(0, 18px, 0);
            }
            to {
              opacity: 1;
              transform: translate3d(0, 0, 0);
            }
          }
          @keyframes hostFadeUp {
            from {
              opacity: 0;
              transform: translate3d(0, 8px, 0);
            }
            to {
              opacity: 1;
              transform: translate3d(0, 0, 0);
            }
          }
          @keyframes hostCharacterReveal {
            from { opacity: 0; }
            to { opacity: 1; }
          }
          @keyframes hostCardReveal {
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
          .hero-header-nav a,
          .hero-header-actions > *,
          .hero-header-mobile > * {
            animation: heroHeaderFadeUp 520ms cubic-bezier(0.22, 1, 0.36, 1) both;
          }
          .hero-header-nav a:nth-child(1) { animation-delay: 50ms; }
          .hero-header-nav a:nth-child(2) { animation-delay: 90ms; }
          .hero-header-nav a:nth-child(3) { animation-delay: 130ms; }
          .hero-header-nav a:nth-child(4) { animation-delay: 170ms; }
          .hero-header-actions > :nth-child(1) { animation-delay: 150ms; }
          .hero-header-actions > :nth-child(2) { animation-delay: 200ms; }
          .hero-header-mobile > :nth-child(1) { animation-delay: 150ms; }
          .hero-header-mobile > :nth-child(2) { animation-delay: 200ms; }
          .hero-headline {
            animation: heroFadeUp 820ms cubic-bezier(0.22, 1, 0.36, 1) 80ms both;
          }
          .hero-subtitle {
            animation: heroFadeUp 650ms cubic-bezier(0.22, 1, 0.36, 1) 230ms both;
          }
          .hero-cta {
            animation: heroFadeUp 650ms cubic-bezier(0.22, 1, 0.36, 1) 390ms both;
          }
          .hero-trust-location,
          .hero-trust-hosts,
          .hero-trust-bookings {
            animation: heroFadeUp 600ms cubic-bezier(0.22, 1, 0.36, 1) both;
          }
          .hero-trust-divider {
            animation: heroTrustFade 450ms ease both;
          }
          .hero-trust-location { animation-delay: 540ms; }
          .hero-trust-divider:nth-child(2) { animation-delay: 585ms; }
          .hero-trust-hosts { animation-delay: 630ms; }
          .hero-trust-divider:nth-child(4) { animation-delay: 675ms; }
          .hero-trust-bookings { animation-delay: 720ms; }
          .places-listing-card {
            transition: translate 240ms ease-out;
          }
          .places-listing-card:hover {
            translate: 0 -4px;
          }
          .places-section.is-entered .places-heading-char {
            animation: placesCharacterReveal 90ms ease-out both;
          }
          .places-section.is-entered .places-supporting-copy {
            animation: placesSupportReveal 450ms cubic-bezier(0.22, 1, 0.36, 1) 1120ms both;
          }
          .places-section.is-entered .places-listing-card,
          .places-section.is-entered .places-marketplace-cta {
            animation: placesCardEnter 700ms cubic-bezier(0.22, 1, 0.36, 1) both;
          }
          .places-section.is-entered .places-listing-card:nth-child(1) { animation-delay: 1600ms; }
          .places-section.is-entered .places-listing-card:nth-child(2) { animation-delay: 1670ms; }
          .places-section.is-entered .places-listing-card:nth-child(3) { animation-delay: 1740ms; }
          .places-section.is-entered .places-listing-card:nth-child(4) { animation-delay: 1810ms; }
          .places-section.is-entered .places-listing-card:nth-child(5) { animation-delay: 1880ms; }
          .places-section.is-entered .places-listing-card:nth-child(6) { animation-delay: 1950ms; }
          .places-section.is-entered .places-marketplace-cta { animation-delay: 2700ms; }
          .client-section .client-badge,
          .client-section .client-title-line,
          .client-section .client-supporting-copy,
          .client-section .client-cta,
          .client-section .client-card {
            opacity: 0;
            transform: translate3d(0, 14px, 0);
          }
          .client-section.is-entered .client-badge {
            animation: clientBadgeReveal 550ms cubic-bezier(0.22, 1, 0.36, 1) both;
          }
          .client-section.is-entered .client-title-line-1 {
            animation: clientTitleReveal 600ms cubic-bezier(0.22, 1, 0.36, 1) 110ms both;
          }
          .client-section.is-entered .client-title-line-2 {
            animation: clientTitleReveal 600ms cubic-bezier(0.22, 1, 0.36, 1) 320ms both;
          }
          .client-section.is-entered .client-supporting-copy {
            animation: clientCopyReveal 600ms cubic-bezier(0.22, 1, 0.36, 1) 640ms both;
          }
          .client-section.is-entered .client-cta {
            animation: clientButtonReveal 600ms cubic-bezier(0.22, 1, 0.36, 1) 940ms both;
          }
          .client-section.is-entered .client-card {
            animation: clientCardReveal 640ms cubic-bezier(0.22, 1, 0.36, 1) both;
          }
          .client-section.is-entered .client-card:nth-child(1) { animation-delay: 1180ms; }
          .client-section.is-entered .client-card:nth-child(2) { animation-delay: 1320ms; }
          .client-section.is-entered .client-card:nth-child(3) { animation-delay: 1460ms; }
          .client-card {
            transition: transform 220ms ease, box-shadow 220ms ease, border-color 220ms ease;
          }
          .client-card:hover {
            transform: translateY(-4px);
            box-shadow: 0 10px 18px rgba(24, 21, 19, 0.04);
          }
          .client-card-icon {
            transition: transform 200ms ease, opacity 200ms ease;
          }
          .client-card:hover .client-card-icon {
            transform: scale(1.05);
            opacity: 1;
          }
          .host-section:not(.is-entered) .host-badge,
          .host-section:not(.is-entered) .host-headline-character,
          .host-section:not(.is-entered) .host-supporting-copy,
          .host-section:not(.is-entered) .host-cta,
          .host-section:not(.is-entered) .host-card {
            opacity: 0;
          }
          .host-section.is-entered .host-badge {
            animation: hostFadeUp 520ms cubic-bezier(0.22, 1, 0.36, 1) both;
          }
          .host-section.is-entered .host-headline-character {
            animation: hostCharacterReveal 120ms ease-out both;
          }
          .host-section.is-entered .host-supporting-copy {
            animation: hostFadeUp 620ms cubic-bezier(0.22, 1, 0.36, 1) 1050ms both;
          }
          .host-section.is-entered .host-cta {
            animation: hostFadeUp 560ms cubic-bezier(0.22, 1, 0.36, 1) 1740ms both;
          }
          .host-section.is-entered .host-card {
            animation: hostCardReveal 660ms cubic-bezier(0.22, 1, 0.36, 1) both;
          }
          .host-section.is-entered .host-card:nth-child(1) { animation-delay: 2380ms; }
          .host-section.is-entered .host-card:nth-child(2) { animation-delay: 2505ms; animation-duration: 620ms; }
          .host-section.is-entered .host-card:nth-child(3) { animation-delay: 2630ms; animation-duration: 700ms; }
          .host-section.is-entered .host-card:nth-child(4) { animation-delay: 2755ms; animation-duration: 640ms; }
          .host-card {
            transition: transform 240ms ease, box-shadow 240ms ease, border-color 240ms ease;
          }
          .host-card:hover {
            transform: translateY(-4px);
            box-shadow: 0 10px 18px rgba(24, 21, 19, 0.04);
          }
          .host-card-icon {
            transition: transform 200ms ease, opacity 200ms ease;
          }
          .host-card:hover .host-card-icon {
            transform: scale(1.04);
            opacity: 1;
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
            .hero-header-nav a,
            .hero-header-actions > *,
            .hero-header-mobile > *,
            .hero-headline,
            .hero-subtitle,
            .hero-cta,
            .hero-trust-location,
            .hero-trust-hosts,
            .hero-trust-bookings,
            .hero-trust-divider,
            .hero-animated-content,
            .places-listing-card,
            .places-marketplace-cta,
            .places-heading-char,
            .places-supporting-copy {
              animation: none !important;
              transform: none !important;
              opacity: 1 !important;
              will-change: auto;
            }
            .places-listing-card {
              transition: none !important;
              translate: none !important;
            }
            .client-section .client-badge,
            .client-section .client-title-line,
            .client-section .client-supporting-copy,
            .client-section .client-cta,
            .client-section .client-card,
            .host-section .host-badge,
            .host-section .host-headline-character,
            .host-section .host-supporting-copy,
            .host-section .host-cta,
            .host-section .host-card,
            .client-card-icon,
            .host-card,
            .host-card-icon {
              animation: none !important;
              opacity: 1 !important;
              transform: none !important;
              transition: none !important;
              will-change: auto;
            }
            .places-section a svg {
              transition: none !important;
              transform: none !important;
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
          .landing-page .landing-cta {
            background-image: linear-gradient(rgba(189, 35, 55, 0.2), rgba(189, 35, 55, 0.2));
            background-repeat: no-repeat;
            background-size: 0% 100%;
            transition: background-size 300ms ease, box-shadow 300ms ease, transform 300ms ease;
          }
          .landing-page .landing-cta:hover,
          .landing-page .landing-cta:focus-visible {
            background-size: 100% 100%;
            box-shadow: 0 7px 16px rgba(24, 21, 19, 0.14);
            transform: translateY(-2px);
          }
          .landing-page .landing-cta:focus-visible {
            outline: 2px solid #bd2337;
            outline-offset: 3px;
          }
          @media (prefers-reduced-motion: reduce) {
            .landing-page .landing-cta {
              transition: none !important;
            }
            .landing-page .landing-cta:hover,
            .landing-page .landing-cta:focus-visible {
              background-size: 100% 100%;
              transform: none;
            }
          }
        `}</style>
      </Head>

      {/* Supabase scripts required for authentication and session check */}
      <Script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2" strategy="beforeInteractive" />
      <Script src="/js/supabase-client.js" strategy="beforeInteractive" />

      <main className="landing-page min-h-screen w-full max-w-full overflow-x-hidden box-border bg-[#f7f3ec] text-[#181513] font-sans antialiased selection:bg-[#bd2337] selection:text-white">
        {/* Seamless 2-Page Stage: Page 1 (Hero) & Page 2 (Places worth discovering) */}
        <div className="relative w-full">
          {/* Shared Nairobi Illustration Background pinned behind Page 1 and Page 2 */}
          <div
            className="sticky top-0 h-screen w-full -mb-[100vh] pointer-events-none select-none overflow-hidden z-0"
            aria-hidden="true"
          >
            <img
              src="/assets/landing.jpg"
              alt="VaRoom Nairobi Skyline"
              className="hero-background-image w-full h-full object-cover object-top"
              // @ts-expect-error fetchpriority is a modern HTML attribute
              fetchpriority="high"
            />
            {/* Soft gradient wash ensuring high text contrast across both states */}
            <div
              className={`absolute inset-0 pointer-events-none ${
                isAuthOpen
                  ? 'bg-gradient-to-b from-black/10 via-transparent to-black/20'
                  : 'bg-gradient-to-b from-[#efe8de]/40 via-[#f7f3ec]/65 to-[#f7f3ec]/95'
              }`}
            />
          </div>

          {/* Page 1: Hero Section */}
          <HeroSection
            isAuthOpen={isAuthOpen}
            onOpenAuth={openSignIn}
            onCloseAuth={closeAuth}
            onOpenSignup={() => openSignup()}
            onTryElie={handleTryElie}
          />

          {/* Page 2: Places worth discovering (Real listings from Supabase) */}
          <PlacesSection listings={listings} />
        </div>

        {/* For Clients Section */}
        <ClientSection onTryElie={handleTryElie} />

        {/* For Hosts Section */}
        <HostSection onOpenSignup={() => openSignup('host')} onTryElie={handleTryElie} />

        {/* How VaRoom Works */}
        <HowItWorksSection />

        {/* More than a marketplace (Differentiators) */}
        <DifferentiatorSection />

        {/* Footer */}
        <Footer onTryElie={handleTryElie} />

        <AuthPanel
          isOpen={isAuthOpen}
          onClose={closeAuth}
          initialView={initialAuthView}
          initialRole={signupRole}
        />
      </main>
    </>
  );
}

export const getStaticProps: GetStaticProps<LandingPageProps> = async () => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { createClient } = require('@supabase/supabase-js');
    const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://deaphymimdaygeavhyek.supabase.co';
    const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRlYXBoeW1pbWRheWdlYXZoeWVrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY1MjAwNDQsImV4cCI6MjEwMjA5NjA0NH0.rbgVhuZCK1fZP7gKV5oO1OUvIT61ir23VhAYm8739SI';

    const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    const { data, error } = await sb
      .from('listings')
      .select('id,title,description,location_text,category,verified,created_at,host_id,availability_status,listing_photos(storage_path),listing_booking_details(*),host:profiles(full_name,verified,avatar_url,username)')
      .eq('moderation_status', 'active')
      .order('created_at', { ascending: false })
      .limit(12);

    if (error || !data || data.length === 0) {
      return {
        props: {
          initialListings: INITIAL_LISTINGS,
        },
        revalidate: 60,
      };
    }

    const initialListings: Listing[] = data.map((l: any) => {
      const photo = (l.listing_photos || []).find((p: any) => p && p.storage_path);
      const photoUrl = photo ? sb.storage.from('listing-photos').getPublicUrl(photo.storage_path).data.publicUrl : null;
      const details = Array.isArray(l.listing_booking_details) ? l.listing_booking_details[0] : l.listing_booking_details;
      return {
        id: l.id,
        title: l.title || 'VaRoom Space',
        category: l.category || 'property',
        location: l.location_text || 'Kenya',
        photoUrl,
        price: details ? details.price_amount : null,
        priceUnit: details ? details.price_unit || 'night' : 'night',
        guests: details ? details.max_guests : null,
        sizeOrType: details ? details.size_or_type : null,
        amenities: details && Array.isArray(details.amenities) ? details.amenities : [],
        verified: Boolean(l.verified || (l.host && l.host.verified)),
        hostName: l.host ? (l.host.full_name || l.host.username || 'VaRoom Host') : 'VaRoom Host',
      };
    });

    return {
      props: {
        initialListings,
      },
      revalidate: 60,
    };
  } catch {
    return {
      props: {
        initialListings: INITIAL_LISTINGS,
      },
      revalidate: 60,
    };
  }
};
