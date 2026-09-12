import Head from 'next/head';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import styles from '../styles/landing.module.css';

function PinIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 10.5c0 5.2-8 10.5-8 10.5S4 15.7 4 10.5a8 8 0 1 1 16 0Z" /><circle cx="12" cy="10" r="2.4" /></svg>;
}

function ShieldIcon({ lock = false }) {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 20 6v5.3c0 4.6-3.2 7.8-8 9.7-4.8-1.9-8-5.1-8-9.7V6l8-3Z" />{lock ? <><rect x="9" y="10" width="6" height="5" rx="1" /><path d="M10.5 10V8.8a1.5 1.5 0 0 1 3 0V10" /></> : <path d="m8.5 12 2.2 2.2 4.8-5" />}</svg>;
}

function ArrowIcon() {
  return <span aria-hidden="true" className={styles.arrow}>↗</span>;
}

const trustItems = [
  { label: 'GPS verified locations', icon: <PinIcon /> },
  { label: 'Trusted hosts', icon: <ShieldIcon /> },
  { label: 'Secure bookings', icon: <ShieldIcon lock /> },
];

const hostSteps = ['Create your host account', 'List your space', 'Get discovered', 'Manage everything'];
const clientSteps = ['Tell us what you need', 'Explore real spaces', 'Know before you book', 'Book with confidence'];
const categories = [
  { number: '01', name: 'STAY', items: 'Airbnbs · Short stays · Hotels', image: '/assets/landing101.jpg' },
  { number: '02', name: 'WORK', items: 'Offices · Meeting spaces · Workspaces', image: '/assets/ui.jpg' },
  { number: '03', name: 'GATHER', items: 'Event grounds · Wedding venues · Party spaces · Conference venues', image: '/assets/landing102.jpg' },
  { number: '04', name: 'BUSINESS', items: 'Shops · Commercial spaces · Property to let or buy', image: '/assets/hero-nairobi-skyline.jpg' },
];
const trustPoints = ['GPS-verified locations', 'Trusted hosts', 'Real space information', 'Photos and videos', 'Secure bookings'];
const platformPoints = ['Listing management', 'Photos and video', 'Property information', 'Booking management', 'Client communication', 'Host tools'];

const roleOptions = [
  { title: 'Register as Host', description: 'List and showcase your spaces — Airbnbs, hotels, venues, offices, shops, or property.', href: '/signup-host' },
  { title: 'Register as Client', description: 'Find suitable places for events, stays, workspaces and more.', href: '/signup-client' },
];

function StorySection({ className = '', children, id }) {
  return <section className={`${styles.storySection} ${className}`} id={id}>{children}</section>;
}

export default function LandingPage() {
  const router = useRouter();
  const [isRoleModalOpen, setRoleModalOpen] = useState(false);

  useEffect(() => {
    if (router.isReady && router.query.signup === '1') setRoleModalOpen(true);
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
        if (entry.isIntersecting) {
          entry.target.classList.add(styles.visible);
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12 });
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
      </Head>
      <main className={styles.page}>
        <section className={styles.hero} id="top">
          <div className={styles.heroImage} aria-hidden="true" />
          <div className={styles.heroShade} aria-hidden="true" />
          <header className={styles.header}>
            <Link className={styles.logo} href="/" aria-label="VaRoom home"><span>Va</span>Room</Link>
            <nav className={styles.desktopNav} aria-label="Main navigation">
              <Link href="/properties">Properties</Link>
              <Link href="/marketplace">Marketplace</Link>
              <a href="#about">About</a>
              <a href="#contact">Contact</a>
            </nav>
            <div className={styles.headerActions}>
              <Link className={styles.signIn} href="/login">Sign in</Link>
              <a className={styles.startButton} href="/?signup=1" onClick={openRoleModal}>Get started</a>
            </div>
          </header>
          <div className={styles.heroContent}>
            <div className={styles.eyebrow}><PinIcon /> Real locations. Real people. Real spaces.</div>
            <h1>Find the perfect<br />place for what<br /><em>matters to you.</em></h1>
            <p className={styles.description}>From cozy stays to inspiring workspaces, vibrant venues and prime properties — VaRoom connects you with real, verified spaces, right where you are.</p>
            <Link className={styles.primaryButton} href="/marketplace">Marketplace <ArrowIcon /></Link>
            <div className={styles.trustRow} aria-label="VaRoom trust indicators">
              {trustItems.map((item) => <div className={styles.trustItem} key={item.label}>{item.icon}<span>{item.label}</span></div>)}
            </div>
          </div>
          <a className={styles.scrollHint} href="#how-it-works"><span>Scroll to explore</span><i /></a>
        </section>

        <StorySection className={styles.intro} id="how-it-works">
          <div className={styles.sectionKicker}>01 / THE VAROOM WAY</div>
          <div className={styles.introGrid}>
            <h2 data-reveal>One place to find<br /><em>what fits.</em></h2>
            <p data-reveal>VaRoom brings the spaces that shape our lives into one considered marketplace — making it easier to find somewhere to stay, work, gather, build or invest.</p>
          </div>
        </StorySection>

        <StorySection className={styles.roles}>
          <div className={styles.sectionHeading} data-reveal><div className={styles.sectionKicker}>02 / HOW VAROOM WORKS</div><h2>Two sides.<br /><em>One simple journey.</em></h2></div>
          <div className={styles.roleGrid}>
            <article className={styles.rolePanel} data-reveal>
              <div className={styles.roleTop}><span>FOR HOSTS</span><span>01 — 04</span></div>
              <h3>Have a space?<br /><em>Put it where people are looking.</em></h3>
              <p>Enjoy a premium platform with powerful tools designed to help you showcase, manage and grow your presence on VaRoom.</p>
              <ol>{hostSteps.map((step, index) => <li key={step}><b>0{index + 1}</b><span>{step}</span></li>)}</ol>
              <Link className={styles.textButton} href="/signup-host">Become a Host <ArrowIcon /></Link>
            </article>
            <article className={`${styles.rolePanel} ${styles.clientPanel}`} data-reveal>
              <div className={styles.roleTop}><span>FOR CLIENTS</span><span>01 — 04</span></div>
              <h3>Looking for a place?<br /><em>Start with VaRoom.</em></h3>
              <p>Discover real spaces, explore photos and videos, understand the details and connect with trusted hosts.</p>
              <ol>{clientSteps.map((step, index) => <li key={step}><b>0{index + 1}</b><span>{step}</span></li>)}</ol>
              <Link className={styles.textButton} href="/marketplace">Explore Marketplace <ArrowIcon /></Link>
            </article>
          </div>
        </StorySection>

        <StorySection className={styles.categories} id="about">
          <div className={styles.sectionHeading} data-reveal><div className={styles.sectionKicker}>03 / WHAT YOU CAN FIND</div><h2>One marketplace.<br /><em>So many possibilities.</em></h2></div>
          <div className={styles.categoryList}>
            {categories.map((category) => <article className={styles.category} data-reveal key={category.name}>
              <div className={styles.categoryImage} style={{ backgroundImage: `url("${category.image}")` }} />
              <div className={styles.categoryInfo}><span>{category.number}</span><h3>{category.name}</h3><p>{category.items}</p><ArrowIcon /></div>
            </article>)}
          </div>
        </StorySection>

        <StorySection className={styles.trustSection}>
          <div className={styles.trustVisual} aria-hidden="true"><div className={styles.trustOrb} /><span>REAL<br />SPACES</span></div>
          <div className={styles.trustCopy} data-reveal><div className={styles.sectionKicker}>04 / WHY VAROOM</div><h2>Real places.<br />Real people.<br /><em>More confidence.</em></h2><p>Every detail should help you feel certain. VaRoom is built around clarity, connection and the confidence to make your next move.</p><ul>{trustPoints.map((point) => <li key={point}><span>+</span>{point}</li>)}</ul></div>
        </StorySection>

        <StorySection className={styles.platform}>
          <div className={styles.platformCopy} data-reveal><div className={styles.sectionKicker}>05 / FOR HOSTS</div><h2>A premium platform<br /><em>for your space.</em></h2><p>Powerful tools to showcase, manage and grow your presence on VaRoom.</p><Link className={styles.textButton} href="/signup-host">Become a Host <ArrowIcon /></Link></div>
          <div className={styles.platformFrame} data-reveal><div className={styles.platformBar}><span>VaRoom / host space</span><span>↗</span></div><div className={styles.platformImage} /><div className={styles.platformFeatures}>{platformPoints.map((point, index) => <span key={point}><b>0{index + 1}</b>{point}</span>)}</div></div>
        </StorySection>

        <StorySection className={styles.ecosystem}>
          <div className={styles.sectionHeading} data-reveal><div className={styles.sectionKicker}>06 / THE ECOSYSTEM</div><h2>Built for both sides<br /><em>of the same story.</em></h2></div>
          <div className={styles.ecosystemGrid}>
            <div data-reveal><span className={styles.ecoLabel}>HOSTS</span><h3>Have a space?</h3><p>List <i>→</i> Showcase <i>→</i> Manage <i>→</i> Connect</p></div>
            <div data-reveal><span className={styles.ecoLabel}>CLIENTS</span><h3>Need a space?</h3><p>Search <i>→</i> Explore <i>→</i> Compare <i>→</i> Book</p></div>
          </div>
        </StorySection>

        <StorySection className={styles.finalCta} id="contact">
          <div className={styles.finalImage} aria-hidden="true" />
          <div className={styles.finalShade} aria-hidden="true" />
          <div className={styles.finalContent} data-reveal><div className={styles.sectionKicker}>07 / START HERE</div><h2>Find the place<br /><em>that feels like yours.</em></h2><p>Whether you're looking for somewhere to stay, work, gather, build or invest — start with VaRoom.</p><div className={styles.finalButtons}><Link className={styles.primaryButton} href="/marketplace">Explore Marketplace <ArrowIcon /></Link><Link className={styles.outlineButton} href="/signup-host">Become a Host <ArrowIcon /></Link></div></div>
          <footer><Link className={styles.logo} href="/"><span>Va</span>Room</Link><span>Real spaces, right where you are.</span><a href="#top">Back to top ↑</a></footer>
        </StorySection>

        {isRoleModalOpen && <div className={styles.modalOverlay} role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setRoleModalOpen(false); }}>
          <section className={styles.roleModal} role="dialog" aria-modal="true" aria-labelledby="join-title">
            <button className={styles.modalClose} type="button" onClick={() => setRoleModalOpen(false)} aria-label="Close account type selection">×</button>
            <h2 id="join-title">Join VaRoom</h2><p className={styles.modalSubtitle}>How are you using VaRoom?</p>
            <div className={styles.roleOptions}>{roleOptions.map((option) => <Link className={styles.roleOption} href={signupHref(option.href)} key={option.href}><span className={styles.roleTitle}>{option.title}</span><span className={styles.roleDescription}>{option.description}</span></Link>)}</div>
          </section>
        </div>}
      </main>
    </>
  );
}
