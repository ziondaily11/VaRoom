import React, { useRef } from 'react';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { authorRoleLabel, reviewAuthorHandle, type FeaturedReview } from '../../lib/reviews/varoomReviews';
import { useSectionEntrance } from '../../lib/landing/entrance';
import { SOCIAL_LINKS } from '../shell/socialIcons';
import { ReviewAvatar } from './ReviewAuthor';
import styles from './TrustSection.module.css';

interface TrustSectionProps {
  /** The newest approved review of VaRoom; null shows a heading instead. */
  review: FeaturedReview | null;
  /** Opens sign-up as a host, growing out of the pressed button. */
  onListSpace: (trigger: HTMLElement) => void;
}

// What VaRoom really does to make booking safe (each one is a feature in the app).
const TRUST_POINTS: Array<[title: string, text: string]> = [
  ['GPS-checked locations', 'Listings show where the space really is.'],
  ['Talk before you book', 'Message the host about anything first.'],
  ['Hosts approve bookings', 'Every booking is confirmed by the host.'],
];

// A long review gets smaller words, so the page still fits one screen.
const LONG_REVIEW = 180;

const at = (i: number) => ({ '--i': i }) as React.CSSProperties;

/** Page 4 of the landing page: a review, why VaRoom is safe, a last call, and the footer. */
export const TrustSection: React.FC<TrustSectionProps> = ({ review, onListSpace }) => {
  const sectionRef = useRef<HTMLElement>(null);
  const entrance = useSectionEntrance(sectionRef, 'varoom_landing_trust_played');

  return (
    <section
      ref={sectionRef}
      id="trust"
      className={`snap-page ${styles.section}`}
      aria-labelledby="trust-heading"
      data-entrance={entrance === 'none' ? undefined : entrance}
    >
      <div className={styles.main}>
        {review ? (
          <figure className={`${styles.review} ${styles.enter}`} style={at(0)}>
            <h2 id="trust-heading" className={styles.srOnly}>What people say about VaRoom</h2>
            <div className={styles.stars} role="img" aria-label={`Rated ${review.rating} out of 5`}>
              {Array.from({ length: 5 }, (_, i) => (
                <span key={i} aria-hidden="true" className={i < review.rating ? undefined : styles.starOff}>★</span>
              ))}
            </div>
            <blockquote className={`${styles.quote}${review.comment.length > LONG_REVIEW ? ` ${styles.quoteLong}` : ''}`}>
              “{review.comment}”
            </blockquote>
            <figcaption className={styles.author}>
              <ReviewAvatar review={review} />
              <span>
                <span className={styles.handle}>{reviewAuthorHandle(review)}</span>
                <span aria-hidden="true"> · </span>
                {authorRoleLabel(review.authorRole)}
              </span>
            </figcaption>
          </figure>
        ) : (
          <h2 id="trust-heading" className={`${styles.heading} ${styles.enter}`} style={at(0)}>
            Book with <em>confidence.</em>
          </h2>
        )}

        <ul className={styles.trust}>
          {TRUST_POINTS.map(([title, text], i) => (
            <li key={title} className={styles.enter} style={at(i + 2)}>
              <span className={styles.trustTitle}>{title}</span>
              <span className={styles.trustText}>{text}</span>
            </li>
          ))}
        </ul>

        <div className={`${styles.cta} ${styles.enter}`} style={at(6)}>
          <Link href="/marketplace" className={`landing-cta landing-cta-primary landing-cta-large ${styles.ctaButton} ${styles.primary}`}>
            Find a space <ArrowRight size={17} aria-hidden="true" />
          </Link>
          <button
            type="button"
            onClick={(event) => onListSpace(event.currentTarget)}
            className={`landing-cta landing-cta-secondary landing-cta-large ${styles.ctaButton} ${styles.ghost}`}
          >
            List your space
          </button>
        </div>
      </div>

      <footer className={styles.footer}>
        <div className={styles.brand}>
          <span className={styles.logo}><span className={styles.logoVa}>Va</span>Room</span>
          <span className={styles.copy}>© {new Date().getFullYear()} VaRoom</span>
        </div>
        <nav className={styles.links} aria-label="Footer">
          <Link href="/property-news">Property News</Link>
          <Link href="/support">Help &amp; Support</Link>
          <Link href="/terms">Terms</Link>
          <Link href="/privacy">Privacy</Link>
          <a href={SOCIAL_LINKS.instagram} target="_blank" rel="noopener noreferrer">Instagram</a>
          <a href={SOCIAL_LINKS.tiktok} target="_blank" rel="noopener noreferrer">TikTok</a>
        </nav>
      </footer>
    </section>
  );
};
