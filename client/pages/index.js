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
      {lock ? (
        <>
          <rect x="9" y="10" width="6" height="5" rx="1" />
          <path d="M10.5 10V8.8a1.5 1.5 0 0 1 3 0V10" />
        </>
      ) : (
        <path d="m8.5 12 2.2 2.2 4.8-5" />
      )}
    </svg>
  );
}

function ArrowIcon() {
  return <span aria-hidden="true" className={styles.arrow}>→</span>;
}

const trustItems = [
  { label: 'GPS verified locations', icon: <PinIcon /> },
  { label: 'Trusted hosts', icon: <ShieldIcon /> },
  { label: 'Secure bookings', icon: <ShieldIcon lock /> },
];

const hostSteps = [
  'Create your host account',
  'List your space',
  'Get discovered',
  'Manage your space',
];

const clientSteps = [
  'Tell us what you need',
  'Explore real spaces',
  'Know before you book',
  'Book with confidence',
];

const categories = [
  {
    number: '01',
    name: 'STAY',
    items: ['Airbnbs', 'Short stays', 'Hotels'],
  },
  {
    number: '02',
    name: 'WORK',
    items: ['Offices', 'Meeting spaces', 'Workspaces'],
  },
  {
    number: '03',
    name: 'GATHER',
    items: ['Event grounds', 'Wedding venues', 'Party spaces', 'Conference venues'],
  },
  {
    number: '04',
    name: 'BUSINESS',
    items: ['Shops', 'Commercial spaces', 'Property to let or buy'],
  },
];

const trustPoints = [
  'GPS-verified locations',
  'Trusted hosts',
  'Real space information',
  'Photos and videos',
  'Secure bookings',
];

const platformFeatures = [
  'Listing management',
  'Photos and video',
  'Property information',
  'Booking management',
  'Client communication',
  'Host tools',
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
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add(styles.visible);
          }
        });
      },
      { threshold: 0.15 }
    );
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
        <style>{`
          html, body, #__next {
            margin: 0 !important;
            padding: 0 !important;
            width: 100% !important;
            min-height: 100vh !important;
            background-color: #080909 !important;
            overflow-x: hidden !important;
          }
          * {
            box-sizing: border-box;
          }
        `}</style>
      </Head>

      <div className={styles.pageContainer}>
        {/* Background Visual Foundation */}
        <div className={styles.bgImage} aria-hidden="true" />
        <div className={styles.bgShade} aria-hidden="true" />

        {/* Header Navigation */}
        <header className={styles.header}>
          <Link className={styles.logo} href="/" aria-label="VaRoom home">
            <span>Va</span>Room
          </Link>
          <nav className={styles.desktopNav} aria-label="Main navigation">
            <Link href="/properties">Properties</Link>
            <Link href="/marketplace">Marketplace</Link>
            <a href="#how-it-works">About</a>
            <a href="#trust">Trust</a>
          </nav>
          <div className={styles.headerActions}>
            <Link className={styles.signIn} href="/login">Sign in</Link>
            <a className={styles.startButton} href="/?signup=1" onClick={openRoleModal}>Get started</a>
          </div>
        </header>

        {/* 1. HERO */}
        <section className={styles.heroSection} id="top">
          <div className={styles.heroContent}>
            <div className={styles.eyebrow}>
              <PinIcon /> Real locations. Real people. Real spaces.
            </div>
            <h1>
              Find the perfect<br />
              place for what<br />
              <em>matters to you.</em>
            </h1>
            <p className={styles.heroDescription}>
              From cozy stays to inspiring workspaces, vibrant venues and prime properties — VaRoom connects you with real, verified spaces, right where you are.
            </p>
            <div className={styles.heroCtaGroup}>
              <Link className={styles.primaryButton} href="/marketplace">
                Marketplace <ArrowIcon />
              </Link>
            </div>
            <div className={styles.trustRow} aria-label="VaRoom trust indicators">
              {trustItems.map((item, index) => (
                <div className={styles.trustItem} key={index}>
                  {item.icon}
                  <span>{item.label}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* 2. HOW VAROOM WORKS */}
        <section className={styles.storySection} id="how-it-works">
          <div className={styles.sectionHeader} data-reveal>
            <span className={styles.sectionLabel}>HOW VAROOM WORKS</span>
            <h2>Two sides of the marketplace.<br /><em>One simple platform.</em></h2>
          </div>

          <div className={styles.dualGrid}>
            {/* FOR HOSTS */}
            <div className={styles.storyCard} data-reveal>
              <div className={styles.cardBadge}>FOR HOSTS</div>
              <h3>Have a space?<br /><em>Put it where people are looking.</em></h3>
              <p className={styles.cardSupporting}>
                Enjoy a premium platform with powerful tools designed to help you showcase, manage and grow your presence on VaRoom.
              </p>
              <ol className={styles.stepList}>
                {hostSteps.map((step, idx) => (
                  <li key={idx}>
                    <span className={styles.stepNum}>0{idx + 1}</span>
                    <span>{step}</span>
                  </li>
                ))}
              </ol>
              <Link className={styles.cardCta} href="/signup-host">
                Become a Host <ArrowIcon />
              </Link>
            </div>

            {/* FOR CLIENTS */}
            <div className={styles.storyCard} data-reveal>
              <div className={styles.cardBadge}>FOR CLIENTS</div>
              <h3>Looking for a place?<br /><em>Start with VaRoom.</em></h3>
              <p className={styles.cardSupporting}>
                Discover real spaces, explore photos and videos, understand the details and connect with trusted hosts.
              </p>
              <ol className={styles.stepList}>
                {clientSteps.map((step, idx) => (
                  <li key={idx}>
                    <span className={styles.stepNum}>0{idx + 1}</span>
                    <span>{step}</span>
                  </li>
                ))}
              </ol>
              <Link className={styles.cardCta} href="/marketplace">
                Explore Marketplace <ArrowIcon />
              </Link>
            </div>
          </div>
        </section>

        {/* 3. WHAT YOU CAN FIND */}
        <section className={styles.storySection} id="categories">
          <div className={styles.sectionHeader} data-reveal>
            <span className={styles.sectionLabel}>WHAT YOU CAN FIND</span>
            <h2>One marketplace.<br /><em>So many possibilities.</em></h2>
          </div>

          <div className={styles.categoryGrid}>
            {categories.map((cat) => (
              <div className={styles.categoryCard} data-reveal key={cat.name}>
                <div className={styles.categoryHeader}>
                  <span className={styles.categoryNumber}>{cat.number}</span>
                  <h4>{cat.name}</h4>
                </div>
                <div className={styles.categoryPills}>
                  {cat.items.map((item) => (
                    <span key={item} className={styles.pill}>{item}</span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* 4. WHY YOU CAN TRUST VAROOM */}
        <section className={styles.storySection} id="trust">
          <div className={styles.trustBlock} data-reveal>
            <div className={styles.trustText}>
              <span className={styles.sectionLabel}>WHY YOU CAN TRUST VAROOM</span>
              <h2>Real places.<br />Real people.<br /><em>More confidence.</em></h2>
              <p className={styles.trustIntro}>
                We build confidence directly into the search experience so you can explore and book with complete peace of mind.
              </p>
            </div>

            <ul className={styles.trustList}>
              {trustPoints.map((point) => (
                <li key={point}>
                  <ShieldIcon />
                  <span>{point}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* 5. PREMIUM HOST PLATFORM */}
        <section className={styles.storySection} id="host-platform">
          <div className={styles.platformBlock} data-reveal>
            <div className={styles.platformHeader}>
              <span className={styles.sectionLabel}>PREMIUM HOST PLATFORM</span>
              <h2>A premium platform<br /><em>for your space.</em></h2>
              <p className={styles.platformSub}>
                Powerful tools to showcase, manage and grow your presence on VaRoom.
              </p>
            </div>

            <div className={styles.featureGrid}>
              {platformFeatures.map((feat, idx) => (
                <div className={styles.featureCard} key={feat}>
                  <span className={styles.featureIndex}>0{idx + 1}</span>
                  <span className={styles.featureName}>{feat}</span>
                </div>
              ))}
            </div>

            <div className={styles.platformCtaRow}>
              <Link className={styles.primaryButton} href="/signup-host">
                Become a Host <ArrowIcon />
              </Link>
            </div>
          </div>
        </section>

        {/* 6. FINAL VA ROOM MESSAGE & CTA */}
        <section className={styles.finalSection}>
          <div className={styles.finalContent} data-reveal>
            <span className={styles.sectionLabel}>VA ROOM</span>
            <h2>Find the place<br /><em>that feels like yours.</em></h2>
            <p className={styles.finalSub}>
              Whether you're looking for somewhere to stay, work, gather, build or invest — start with VaRoom.
            </p>
            <div className={styles.finalCtaGroup}>
              <Link className={styles.primaryButton} href="/marketplace">
                Explore Marketplace <ArrowIcon />
              </Link>
              <Link className={styles.secondaryButton} href="/signup-host">
                Become a Host <ArrowIcon />
              </Link>
            </div>
          </div>

          <footer className={styles.footer}>
            <Link className={styles.logo} href="/">
              <span>Va</span>Room
            </Link>
            <span className={styles.footerText}>Real spaces, right where you are.</span>
            <a href="#top" className={styles.backTop}>Back to top ↑</a>
          </footer>
        </section>

        {/* Role Modal */}
        {isRoleModalOpen && (
          <div
            className={styles.modalOverlay}
            role="presentation"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) setRoleModalOpen(false);
            }}
          >
            <section
              className={styles.roleModal}
              role="dialog"
              aria-modal="true"
              aria-labelledby="join-title"
            >
              <button
                className={styles.modalClose}
                type="button"
                onClick={() => setRoleModalOpen(false)}
                aria-label="Close account type selection"
              >
                ×
              </button>
              <h2 id="join-title">Join VaRoom</h2>
              <p className={styles.modalSubtitle}>How are you using VaRoom?</p>
              <div className={styles.roleOptions}>
                {roleOptions.map((option) => (
                  <Link
                    className={styles.roleOption}
                    href={signupHref(option.href)}
                    key={option.href}
                  >
                    <span className={styles.roleTitle}>{option.title}</span>
                    <span className={styles.roleDescription}>{option.description}</span>
                  </Link>
                ))}
              </div>
            </section>
          </div>
        )}
      </div>
    </>
  );
}
