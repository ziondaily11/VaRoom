import Head from 'next/head';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import styles from '../styles/landing.module.css';

function PinIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M20 10.5c0 5.2-8 10.5-8 10.5S4 15.7 4 10.5a8 8 0 1 1 16 0Z" />
      <circle cx="12" cy="10" r="2.4" />
    </svg>
  );
}

function ShieldIcon({ lock = false }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 3 20 6v5.3c0 4.6-3.2 7.8-8 9.7-4.8-1.9-8-5.1-8-9.7V6l8-3Z" />
      {lock ? <><rect x="9" y="10" width="6" height="5" rx="1" /><path d="M10.5 10V8.8a1.5 1.5 0 0 1 3 0V10" /></> : <path d="m8.5 12 2.2 2.2 4.8-5" />}
    </svg>
  );
}

function HostFeatureIcon({ type }) {
  if (type === 'assistant') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M9.5 4.5h5a3 3 0 0 1 3 3v4a3 3 0 0 1-3 3h-5a3 3 0 0 1-3-3v-4a3 3 0 0 1 3-3Z" />
        <path d="M9 14.5v2.2a1.8 1.8 0 0 0 1.8 1.8h2.4a1.8 1.8 0 0 0 1.8-1.8v-2.2M12 4.5V2.8M9.5 9.5h.01M14.5 9.5h.01M10 12h4" />
        <path d="m19.2 3.2.4 1.1 1.1.4-1.1.4-.4 1.1-.4-1.1-1.1-.4 1.1-.4.4-1.1Z" />
      </svg>
    );
  }

  if (type === 'dashboard') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <rect x="4" y="4" width="16" height="16" rx="2" />
        <path d="M8 16v-3M12 16V9M16 16v-5" />
      </svg>
    );
  }

  if (type === 'trust') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="m12 3 7 2.7v5.1c0 4.1-2.8 7-7 9.2-4.2-2.2-7-5.1-7-9.2V5.7L12 3Z" />
        <path d="m8.5 11.5 2.2 2.2 4.8-4.8" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 17 9 12l3.5 3.5L20 8" />
      <path d="M15.5 8H20v4.5" />
      <path d="M4 20h16" />
    </svg>
  );
}

function ClientFeatureIcon({ type }) {
  if (type === 'search') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="10.5" cy="10.5" r="5.5" />
        <path d="m15 15 4.5 4.5M18.5 3.5l.4 1.1 1.1.4-1.1.4-.4 1.1-.4-1.1-1.1-.4 1.1-.4.4-1.1Z" />
      </svg>
    );
  }

  if (type === 'location') return <PinIcon />;
  if (type === 'trust') return <ShieldIcon />;

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 10.5 12 4l8 6.5V20H4v-9.5Z" />
      <path d="M8 20v-5h8v5M8 10h.01M12 10h.01M16 10h.01" />
    </svg>
  );
}

const trustItems = [
  { label: <>GPS verified<br />locations</>, icon: <PinIcon /> },
  { label: <>Trusted<br />hosts</>, icon: <ShieldIcon /> },
  { label: <>Secure<br />bookings</>, icon: <ShieldIcon lock /> },
];

const roleOptions = [
  {
    title: 'Register as Host',
    description: 'List and showcase your spaces — Airbnbs, hotels, venues, offices, shops, or property.',
    href: '/signup-host',
  },
  {
    title: 'Register as Client',
    description: 'Find suitable places for events, stays, workspaces and more.',
    href: '/signup-client',
  },
];

export default function LandingPage() {
  const router = useRouter();
  const [isRoleModalOpen, setRoleModalOpen] = useState(false);

  useEffect(() => {
    if (router.isReady && router.query.signup === '1') {
      setRoleModalOpen(true);
    }
  }, [router.isReady, router.query.signup]);

  useEffect(() => {
    if (!isRoleModalOpen) return undefined;
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') setRoleModalOpen(false);
    };
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [isRoleModalOpen]);

  useEffect(() => {
    const revealItems = document.querySelectorAll('[data-reveal]');
    if (!('IntersectionObserver' in window)) {
      revealItems.forEach((item) => item.classList.add(styles.visible));
      return undefined;
    }
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) entry.target.classList.add(styles.visible);
      });
    }, { threshold: 0.18 });
    revealItems.forEach((item) => observer.observe(item));
    return () => observer.disconnect();
  }, []);

  function openRoleModal(event) {
    event.preventDefault();
    setRoleModalOpen(true);
  }

  function signupHref(href) {
    const redirect = typeof router.query.redirect === 'string' ? router.query.redirect : '';
    return redirect ? `${href}?redirect=${encodeURIComponent(redirect)}` : href;
  }

  return (
    <>
      <Head>
        <title>VaRoom | Real spaces, right where you are</title>
        <meta name="description" content="Discover real, verified spaces with VaRoom." />
        <link rel="icon" href="/favicon/favicon.ico" sizes="any" />
        <style>{'html, body { margin: 0; min-height: 100%; } * { box-sizing: border-box; }'}</style>
      </Head>
      <main className={styles.page}>
        <img className={styles.heroImage} src="/assets/landingpageimage.png" alt="" aria-hidden="true" />
        <div className={styles.heroShade} aria-hidden="true" />

        <header className={styles.header}>
          <Link className={styles.logo} href="/" aria-label="VaRoom home">
            <span>Va</span>Room
          </Link>
          <nav className={styles.desktopNav} aria-label="Main navigation">
            <Link href="/signup-host">For hosts</Link>
            <Link href="/marketplace">For clients</Link>
            <Link href="/elie">Elie</Link>
            <a href="#why-us">Why us</a>
          </nav>
          <div className={styles.headerActions}>
            <Link className={styles.signIn} href="/login">Sign in</Link>
            <a className={styles.startButton} href="/?signup=1" onClick={openRoleModal}>Get started</a>
          </div>
        </header>

        <section className={styles.heroContent} aria-labelledby="hero-title">
          <div className={styles.eyebrow}><PinIcon /> Real locations. Real people. Real spaces.</div>
          <h1 id="hero-title">The Smarter, Safer Way to Find, Book, Rent, Buy, and Host Properties in Kenya</h1>
          <p className={styles.description}>
            From cozy stays to inspiring workspaces, vibrant venues<br className={styles.desktopBreak} />
            {' '}and prime properties — VaRoom connects you with<br className={styles.desktopBreak} />
            {' '}real, verified spaces, right where you are.
          </p>
          <Link className={styles.primaryButton} href="/marketplace">Marketplace <span aria-hidden="true">→</span></Link>

          <div className={styles.trustRow} aria-label="VaRoom trust indicators">
            {trustItems.map((item, index) => (
              <div className={styles.trustItem} key={index}>
                {item.icon}
                <span>{item.label}</span>
              </div>
            ))}
          </div>
        </section>

        <section className={styles.hostSection} aria-labelledby="host-title">
          <div className={styles.hostImage} aria-hidden="true" />
          <div className={styles.hostShade} aria-hidden="true" />
          <div className={styles.hostContent}>
            <span className={styles.hostEyebrow} data-reveal>FOR HOSTS</span>
            <h2 id="host-title" data-reveal>List Your Space.<br />Grow Your Business.<br /><em>Host Smarter.</em></h2>
            <p className={styles.hostIntroduction} data-reveal>
              Put your property in front of guests looking for their next stay while VaRoom gives you the tools to manage conversations, bookings, pricing, and your hosting business—all from one place.
            </p>
            <div className={styles.hostBenefits}>
              <article className={styles.hostBenefit} data-reveal>
                <span className={styles.hostBenefitIcon}><HostFeatureIcon type="assistant" /></span>
                <div>
                  <h3>YOUR 24/7 AI CO-HOST</h3>
                  <p>Let Elie handle the conversations that keep you busy. From guest questions and property details to listing recommendations and booking assistance, Elie keeps guests engaged around the clock.</p>
                </div>
              </article>
              <article className={styles.hostBenefit} data-reveal>
                <span className={styles.hostBenefitIcon}><HostFeatureIcon type="dashboard" /></span>
                <div>
                  <h3>ONE SMART HOST DASHBOARD</h3>
                  <p>Manage your properties, pricing, availability, bookings, analytics, payouts, and guest communications without jumping between multiple platforms.</p>
                </div>
              </article>
              <article className={styles.hostBenefit} data-reveal>
                <span className={styles.hostBenefitIcon}><HostFeatureIcon type="trust" /></span>
                <div>
                  <h3>A MORE TRUSTED GUEST COMMUNITY</h3>
                  <p>Make informed hosting decisions with access to guest profiles, ratings, and booking information before accepting inquiries or reservations.</p>
                </div>
              </article>
              <article className={styles.hostBenefit} data-reveal>
                <span className={styles.hostBenefitIcon}><HostFeatureIcon type="growth" /></span>
                <div>
                  <h3>GROW WITHOUT BEING GLUED TO YOUR PHONE</h3>
                  <p>Automate repetitive communication, respond faster to potential guests, and keep your attention on the parts of hosting that actually need you.</p>
                </div>
              </article>
            </div>
            <Link className={styles.hostCta} href="/signup-host">
              List Your Space <span aria-hidden="true">→</span>
            </Link>
          </div>
        </section>

        <section className={styles.clientSection} aria-labelledby="client-title">
          <video
            className={styles.clientVideo}
            src="/assets/forclientsplayer.mp4"
            autoPlay
            muted
            loop
            playsInline
            aria-hidden="true"
          />
          <div className={styles.clientShade} aria-hidden="true" />
          <div className={styles.clientContent}>
            <span className={styles.clientEyebrow} data-reveal>FOR CLIENTS</span>
            <h2 id="client-title" data-reveal>Find Your Space.<br /><em>Choose With Confidence.</em></h2>
            <p className={styles.clientIntroduction} data-reveal>
              VaRoom makes it easier to discover, compare, and book real spaces. Search naturally with Elie, explore verified properties, and learn more about the hosts behind the listings before you decide.
            </p>
            <div className={styles.clientBenefits}>
              <article className={styles.clientBenefit} data-reveal>
                <span className={styles.clientBenefitIcon}><ClientFeatureIcon type="search" /></span>
                <div>
                  <h3>AI-POWERED PROPERTY SEARCH — ELIE</h3>
                  <p>Tell Elie what you're looking for and let AI help you find it. Describe your location, property type, budget, stay duration, or preferences naturally, and Elie can surface relevant listings and guide you through your options.</p>
                </div>
              </article>
              <article className={styles.clientBenefit} data-reveal>
                <span className={styles.clientBenefitIcon}><ClientFeatureIcon type="location" /></span>
                <div>
                  <h3>GPS-VERIFIED AUTHENTICITY</h3>
                  <p>Know that the space you're viewing is where it says it is. Every listing is tied to its exact GPS location, helping you discover real, accurately located homes, offices, shops, and other spaces.</p>
                </div>
              </article>
              <article className={styles.clientBenefit} data-reveal>
                <span className={styles.clientBenefitIcon}><ClientFeatureIcon type="trust" /></span>
                <div>
                  <h3>TRANSPARENT HOSTS &amp; REVIEWS</h3>
                  <p>Know who you're dealing with before you book. Explore host profiles, view reviews and ratings, and learn more about the person behind the property before making a decision.</p>
                </div>
              </article>
              <article className={styles.clientBenefit} data-reveal>
                <span className={styles.clientBenefitIcon}><ClientFeatureIcon type="marketplace" /></span>
                <div>
                  <h3>ONE MARKETPLACE FOR EVERY NEED</h3>
                  <p>Whether you're booking a short stay, renting long-term, finding a workspace, or looking to buy—find it on VaRoom.</p>
                </div>
              </article>
            </div>
            <Link className={styles.clientCta} href="/marketplace">
              Explore the Marketplace <span aria-hidden="true">→</span>
            </Link>
          </div>
        </section>

        {isRoleModalOpen && (
          <div className={styles.modalOverlay} role="presentation" onMouseDown={(event) => {
            if (event.target === event.currentTarget) setRoleModalOpen(false);
          }}>
            <section className={styles.roleModal} role="dialog" aria-modal="true" aria-labelledby="join-title">
              <button className={styles.modalClose} type="button" onClick={() => setRoleModalOpen(false)} aria-label="Close account type selection">×</button>
              <h2 id="join-title">Join VaRoom</h2>
              <p className={styles.modalSubtitle}>How are you using VaRoom?</p>
              <div className={styles.roleOptions}>
                {roleOptions.map((option) => (
                  <Link className={styles.roleOption} href={signupHref(option.href)} key={option.href}>
                    <span className={styles.roleTitle}>{option.title}</span>
                    <span className={styles.roleDescription}>{option.description}</span>
                  </Link>
                ))}
              </div>
            </section>
          </div>
        )}
      </main>
    </>
  );
}
