import Head from 'next/head';
import Link from 'next/link';
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

const trustItems = [
  { label: <>GPS verified<br />locations</>, icon: <PinIcon /> },
  { label: <>Trusted<br />hosts</>, icon: <ShieldIcon /> },
  { label: <>Secure<br />bookings</>, icon: <ShieldIcon lock /> },
];

export default function LandingPage() {
  return (
    <>
      <Head>
        <title>VaRoom | Real spaces, right where you are</title>
        <meta name="description" content="Discover real, verified spaces with VaRoom." />
        <link rel="icon" href="/favicon/favicon.ico" sizes="any" />
        <style>{'html, body { margin: 0; min-height: 100%; } * { box-sizing: border-box; }'}</style>
      </Head>
      <main className={styles.page}>
        <div className={styles.heroImage} aria-hidden="true" />
        <div className={styles.heroShade} aria-hidden="true" />

        <header className={styles.header}>
          <Link className={styles.logo} href="/" aria-label="VaRoom home">
            <span>Va</span>Room
          </Link>
          <nav className={styles.desktopNav} aria-label="Main navigation">
            <Link href="/properties">Properties <span className={styles.chevron}>⌄</span></Link>
            <Link href="/marketplace">Explore <span className={styles.chevron}>⌄</span></Link>
            <a href="#about">About</a>
            <a href="#contact">Contact</a>
          </nav>
          <div className={styles.headerActions}>
            <Link className={styles.signIn} href="/login">Sign in</Link>
            <Link className={styles.startButton} href="/register">Get started</Link>
          </div>
        </header>

        <section className={styles.heroContent} aria-labelledby="hero-title">
          <div className={styles.eyebrow}><PinIcon /> Real locations. Real people. Real spaces.</div>
          <h1 id="hero-title">Find the perfect<br />place for what<br /><em>matters to you.</em></h1>
          <p className={styles.description}>
            From cozy stays to inspiring workspaces, vibrant venues<br className={styles.desktopBreak} />
            {' '}and prime properties — VaRoom connects you with<br className={styles.desktopBreak} />
            {' '}real, verified spaces, right where you are.
          </p>
          <Link className={styles.primaryButton} href="/marketplace">Explore listings <span aria-hidden="true">→</span></Link>

          <div className={styles.trustRow} aria-label="VaRoom trust indicators">
            {trustItems.map((item, index) => (
              <div className={styles.trustItem} key={index}>
                {item.icon}
                <span>{item.label}</span>
              </div>
            ))}
          </div>
        </section>
      </main>
    </>
  );
}
