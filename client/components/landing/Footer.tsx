import React from 'react';
import Link from 'next/link';
import styles from './Footer.module.css';

interface FooterProps {
  onTryElie: (e: React.MouseEvent) => void;
}

const SocialIcon: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <span className={styles.socialIcon} role="img" aria-label={label}>
    {children}
  </span>
);

export const Footer: React.FC<FooterProps> = ({ onTryElie }) => {
  return (
    <footer className={styles.footer}>
      <div className={styles.content}>
        <div className={styles.top}>
          <div className={styles.brand}>
            <Link href="/" className={styles.logo} aria-label="VaRoom home">
              <span>Va</span>Room
            </Link>
            <p>
              Kenya’s marketplace for verified stays,
              <br className={styles.desktopBreak} /> spaces, and authentic hosting.
            </p>
          </div>

          <nav className={styles.column} aria-label="Explore and stays">
            <h2>Explore &amp; Stays</h2>
            <ul>
              <li><Link href="/marketplace">Discover</Link></li>
              <li><Link href="/marketplace">Marketplace</Link></li>
              <li><a href="#client-section">For Clients</a></li>
              <li><a href="/login" onClick={onTryElie}>Elie AI Assistant</a></li>
            </ul>
          </nav>

          <nav className={styles.column} aria-label="Hosting and about">
            <h2>Hosting &amp; About</h2>
            <ul>
              <li><Link href="/signup-host">For Hosts</Link></li>
              <li><a href="#why-us">Why VaRoom</a></li>
              <li><Link href="/support">Help &amp; FAQs</Link></li>
              <li><Link href="/support">Contact</Link></li>
            </ul>
          </nav>

          <nav className={styles.column} aria-label="Legal and safety">
            <h2>Legal &amp; Safety</h2>
            <ul>
              <li><Link href="/privacy">Privacy</Link></li>
              <li><Link href="/terms">Terms</Link></li>
              <li><Link href="/cookies">Cookies Policy</Link></li>
            </ul>
          </nav>
        </div>

        <div className={styles.bottom}>
          <p className={styles.copyright}>© 2025 VaRoom. All rights reserved.</p>
          <div className={styles.socials}>
            <span className={styles.follow}>Follow VaRoom</span>
            <span className={styles.socialDivider} aria-hidden="true" />
            <SocialIcon label="Instagram">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <rect x="3.5" y="3.5" width="17" height="17" rx="4.5" />
                <circle cx="12" cy="12" r="4" />
                <circle className={styles.iconFill} cx="17.7" cy="6.6" r="1" />
              </svg>
            </SocialIcon>
            <SocialIcon label="Facebook">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <circle className={styles.iconFill} cx="12" cy="12" r="10" />
                <path className={styles.facebookMark} d="M13.5 20v-7h2.4l.4-2.8h-2.8V8.4c0-.8.2-1.3 1.4-1.3h1.5V4.6c-.3 0-1.2-.1-2.3-.1-2.3 0-3.8 1.4-3.8 3.9v1.8H8v2.8h2.3v7h3.2Z" />
              </svg>
            </SocialIcon>
            <SocialIcon label="TikTok">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path className={styles.iconFill} d="M19.6 8.2a7.5 7.5 0 0 1-4.5-1.5v7.1a5.8 5.8 0 1 1-5-5.7v3.6a2.3 2.3 0 1 0 1.5 2.2V2.5h3.5c.2 2 1.8 3.6 4.5 3.8v1.9Z" />
              </svg>
            </SocialIcon>
            <SocialIcon label="X">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="m4 3 16 18M20 3 4 21M4.5 3h4.2l11 18h-4.2L4.5 3Z" />
              </svg>
            </SocialIcon>
            <SocialIcon label="LinkedIn">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <rect className={styles.iconFill} x="2.5" y="2.5" width="19" height="19" rx="2.5" />
                <path className={styles.linkedinMark} d="M7 10v7M7 7v.1M11 17v-7h3.2v1c.5-.8 1.2-1.2 2.3-1.2 1.9 0 2.8 1.2 2.8 3.3V17h-3v-3.4c0-1-.3-1.6-1.2-1.6s-1.2.7-1.2 1.7V17h-2.9Z" />
              </svg>
            </SocialIcon>
          </div>
        </div>
      </div>
    </footer>
  );
};
