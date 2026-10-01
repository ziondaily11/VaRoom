import Head from 'next/head';
import Script from 'next/script';
import { useRouter } from 'next/router';
import React, { useEffect, useState } from 'react';
import { GetStaticProps } from 'next';
import { HeroSection } from '../components/landing/HeroSection';
import { PlacesSection } from '../components/landing/PlacesSection';
import { HostSection } from '../components/landing/HostSection';
import { ClientSection } from '../components/landing/ClientSection';
import { HowItWorksSection } from '../components/landing/HowItWorksSection';
import { DifferentiatorSection } from '../components/landing/DifferentiatorSection';
import { Footer } from '../components/landing/Footer';
import { RoleModal } from '../components/landing/RoleModal';
import { Listing } from '../components/landing/types';
import { INITIAL_LISTINGS } from '../components/landing/initialListings';

interface LandingPageProps {
  initialListings: Listing[];
}

export default function LandingPage({ initialListings }: LandingPageProps) {
  const router = useRouter();
  const [isRoleModalOpen, setRoleModalOpen] = useState(false);
  const [listings, setListings] = useState<Listing[]>(initialListings && initialListings.length > 0 ? initialListings : INITIAL_LISTINGS);

  // Synchronize modal state with ?signup=1 parameter
  useEffect(() => {
    if (router.isReady && router.query.signup === '1') {
      setRoleModalOpen(true);
    }
  }, [router.isReady, router.query.signup]);

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

        const { data, error } = await sb
          .from('listings')
          .select('id,title,description,location_text,category,verified,created_at,host_id,availability_status,listing_photos(storage_path),listing_booking_details(*),host:profiles(full_name,verified,avatar_url,username)')
          .eq('moderation_status', 'active')
          .order('created_at', { ascending: false })
          .limit(12);

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
          href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap"
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
        `}</style>
      </Head>

      {/* Supabase scripts required for authentication and session check */}
      <Script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2" strategy="beforeInteractive" />
      <Script src="/js/supabase-client.js" strategy="beforeInteractive" />

      <main className="min-h-screen w-full max-w-full overflow-x-hidden box-border bg-[#f7f3ec] text-[#181513] font-sans antialiased selection:bg-[#bd2337] selection:text-white">
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
            <div className="absolute inset-0 bg-gradient-to-b from-[#efe8de]/40 via-[#f7f3ec]/65 to-[#f7f3ec]/95 pointer-events-none" />
          </div>

          {/* Page 1: Hero Section */}
          <HeroSection
            onOpenRoleModal={() => setRoleModalOpen(true)}
            onTryElie={handleTryElie}
          />

          {/* Page 2: Places worth discovering (Real listings from Supabase) */}
          <PlacesSection listings={listings} />
        </div>

        {/* For Clients Section */}
        <ClientSection onTryElie={handleTryElie} />

        {/* For Hosts Section */}
        <HostSection onTryElie={handleTryElie} />

        {/* How VaRoom Works */}
        <HowItWorksSection />

        {/* More than a marketplace (Differentiators) */}
        <DifferentiatorSection />

        {/* Footer */}
        <Footer onTryElie={handleTryElie} />

        {/* Role Selection Modal */}
        <RoleModal
          isOpen={isRoleModalOpen}
          onClose={() => setRoleModalOpen(false)}
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
