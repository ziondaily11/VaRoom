import React from 'react';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import styles from './HostFeaturesSection.module.css';

interface HostFeaturesSectionProps {
  /** Opens sign-up as a host, growing out of the pressed button. */
  onListSpace: (trigger: HTMLElement) => void;
}

const BARS: Array<[height: number, dark: boolean]> = [
  [30, false], [42, true], [38, false], [55, true], [48, false],
  [66, true], [60, false], [78, true], [70, false], [92, true],
];

interface Feature {
  tone: string;
  title: string;
  text: string;
  visual: React.ReactNode;
}

// Each card shows a small, simplified piece of the real VaRoom interface.
// The pieces are pictures (aria-hidden): the title and text carry the meaning.
const FEATURES: Feature[] = [
  {
    tone: styles.tone1,
    title: 'List any kind of space',
    text: 'Stays, offices, venues, hotel rooms and property, with photos and video.',
    visual: (
      <div className={`${styles.panel} ${styles.listingPanel}`}>
        <div className={styles.label}>What are you listing?</div>
        <div className={styles.niches}>
          <span className={styles.nicheOn}>Stay</span>
          <span>Office &amp; shop</span>
          <span>Venue</span>
          <span>Hotel room</span>
          <span>Property</span>
        </div>
        <div className={styles.tiles}>
          <div className={styles.tile}><span className={styles.play}>▶</span></div>
          <div className={`${styles.tile} ${styles.tileDark}`} />
          <div className={`${styles.tile} ${styles.tileAdd}`}>+</div>
        </div>
      </div>
    ),
  },
  {
    tone: styles.tone2,
    title: 'A location guests trust',
    text: 'Guests see where your space really is, before they book.',
    visual: (
      <>
        <div className={styles.map} />
        <div className={styles.halo} />
        <div className={styles.pin} />
        <div className={`${styles.panel} ${styles.badge}`}>
          <span className={styles.tick}>✓</span>
          <div>
            <div className={styles.badgeTitle}>Location checked</div>
            <div className={styles.badgeNote}>GPS pin on the listing</div>
          </div>
        </div>
      </>
    ),
  },
  {
    tone: styles.tone3,
    title: 'You approve every booking',
    text: 'Requests come to you. Block the days you are not available.',
    visual: (
      <>
        <div className={`${styles.panel} ${styles.request}`}>
          <div className={styles.row}>
            <span className={styles.avatar}>G</span>
            <div style={{ flex: 1 }}>
              <div className={styles.requestTitle}>Booking request</div>
              <div className={styles.requestNote}>[Guest] · 2 nights</div>
            </div>
            <span className={styles.pending}>Pending</span>
          </div>
          <div className={styles.choices}>
            <span>Decline</span>
            <span className={styles.approve}>Approve</span>
          </div>
        </div>
        <div className={`${styles.panel} ${styles.calendar}`}>
          <span className={styles.dayOff}>1</span>
          <span className={styles.dayOff}>2</span>
          <span>3</span>
          <span className={styles.dayEdge}>4</span>
          <span className={styles.dayIn}>5</span>
          <span className={styles.dayEdge}>6</span>
          <span>7</span>
        </div>
      </>
    ),
  },
  {
    tone: styles.tone4,
    title: 'Reply, even when you’re busy',
    text: 'Quick replies, business hours and an away message.',
    visual: (
      <div className={`${styles.panel} ${styles.chat}`}>
        <span className={styles.away}>Away · replies after business hours</span>
        <div className={`${styles.bubble} ${styles.bubbleIn}`}>Is it free this weekend?</div>
        <div className={`${styles.bubble} ${styles.bubbleOut}`}>Yes, it is. Send a request and I’ll approve it.</div>
        <div className={styles.quickReplies}>
          <span>Yes, it’s available</span>
          <span>Send me the price</span>
        </div>
      </div>
    ),
  },
  {
    tone: styles.tone5,
    title: 'See what’s working',
    text: 'Views, saves, enquiries and requests for every listing.',
    visual: (
      <div className={`${styles.panel} ${styles.analytics}`}>
        <div className={`${styles.row} ${styles.analyticsTop}`}>
          <div className={styles.metrics}>
            <span>Views</span>
            <span>Saves</span>
            <span className={styles.metricExtra}>Enquiries</span>
          </div>
          <div className={styles.ranges}>
            <span className={styles.rangeOn}>7D</span>
            <span>30D</span>
            <span>All</span>
          </div>
        </div>
        <div className={styles.bars}>
          {BARS.map(([height, dark], i) => (
            <span key={i} className={dark ? styles.barDark : undefined} style={{ height: `${height}%` }} />
          ))}
        </div>
        <div className={styles.legend}>
          <span><i className={styles.dot} />Requests</span>
          <span><i className={`${styles.dot} ${styles.dotLight}`} />Views</span>
        </div>
      </div>
    ),
  },
  {
    tone: styles.tone6,
    title: 'Run it as a team',
    text: 'Give people the access they need: listings, chats or billing.',
    visual: (
      <div className={`${styles.panel} ${styles.team}`}>
        {([['A', 'Manager', styles.roleManager], ['B', 'Messaging', styles.roleMessaging], ['C', 'Finance', styles.roleFinance]] as const).map(([initial, role, tone]) => (
          <div key={role} className={styles.member}>
            <span className={styles.avatar}>{initial}</span>
            <span className={styles.memberName}>[Team member]</span>
            <span className={`${styles.role} ${tone}`}>{role}</span>
          </div>
        ))}
        <div className={styles.invite}>+ Invite by username</div>
      </div>
    ),
  },
];

/** Page 3 of the landing page: what hosts get, as six product cards. */
export const HostFeaturesSection: React.FC<HostFeaturesSectionProps> = ({ onListSpace }) => (
  <section id="hosts" className={`snap-page ${styles.section}`} aria-labelledby="hosts-heading">
    <div className={styles.head}>
      <p className={styles.eyebrow}>For hosts</p>
      <h2 id="hosts-heading" className={styles.headline}>
        List your space. Get booked.
        <em>Run it your way.</em>
      </h2>
      <p className={styles.sub}>Listings, bookings, chats and analytics in one place.</p>
    </div>

    <div className={styles.grid}>
      {FEATURES.map((feature) => (
        <article key={feature.title} className={`${styles.card} ${feature.tone}`}>
          <div className={`${styles.visual} ${styles.ui}`} aria-hidden="true">
            {feature.visual}
          </div>
          <h3 className={styles.cardTitle}>{feature.title}</h3>
          <p className={styles.cardText}>{feature.text}</p>
        </article>
      ))}
    </div>

    <div className={styles.cta}>
      <button
        type="button"
        onClick={(event) => onListSpace(event.currentTarget)}
        className={`landing-cta landing-cta-primary landing-cta-large ${styles.ctaButton} ${styles.primary}`}
      >
        List your space <ArrowRight size={17} aria-hidden="true" />
      </button>
      <Link href="/pricing" className={`landing-cta landing-cta-secondary landing-cta-large ${styles.ctaButton}`}>
        See plans
      </Link>
    </div>
  </section>
);
