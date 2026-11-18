import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { isBelowScreen, playedThisTab, rememberPlayed, type Reveal } from '../../lib/landing/entrance';
import { prefersReducedMotion } from '../../lib/motion/reducedMotion';
import styles from './HostFeaturesSection.module.css';

interface HostFeaturesSectionProps {
  /** Opens sign-up as a host, growing out of the pressed button. */
  onListSpace: (trigger: HTMLElement) => void;
}

/** The order a detail settles in, inside its card (see the entrance in the CSS). */
const at = (i: number) => ({ '--i': i }) as React.CSSProperties;

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
      <div className={`${styles.panel} ${styles.fill}`}>
        <div className={`${styles.label} ${styles.settle}`} style={at(0)}>What are you listing?</div>
        <div className={styles.niches}>
          <span className={`${styles.nicheOn} ${styles.settle}`} style={at(1)}>Stay</span>
          <span className={styles.settle} style={at(2)}>Office &amp; shop</span>
          <span className={styles.settle} style={at(3)}>Venue</span>
          <span className={styles.settle} style={at(4)}>Hotel room</span>
          <span className={styles.settle} style={at(5)}>Property</span>
        </div>
        <div className={styles.tiles}>
          <div className={`${styles.tile} ${styles.settle} ${styles.pop}`} style={at(6)}><span className={styles.play}>▶</span></div>
          <div className={`${styles.tile} ${styles.tileDark} ${styles.settle} ${styles.pop}`} style={at(7)} />
          <div className={`${styles.tile} ${styles.tileAdd} ${styles.settle} ${styles.pop}`} style={at(8)}>+</div>
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
        <div className={`${styles.halo} ${styles.settle} ${styles.ring}`} style={at(2)} />
        <div className={`${styles.pin} ${styles.settle} ${styles.drop}`} style={at(0)} />
        <div className={`${styles.panel} ${styles.badge} ${styles.settle}`} style={at(4)}>
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
      <div className={`${styles.fill} ${styles.bookingStack}`}>
        <div className={`${styles.panel} ${styles.request} ${styles.settle}`} style={at(0)}>
          <div className={styles.row}>
            <span className={styles.avatar}>G</span>
            <div style={{ flex: 1 }}>
              <div className={styles.requestTitle}>Booking request</div>
              <div className={styles.requestNote}>[Guest] · 2 nights</div>
            </div>
            <span className={styles.pending}>Pending</span>
          </div>
          <div className={styles.choices}>
            <span className={styles.settle} style={at(2)}>Decline</span>
            <span className={`${styles.approve} ${styles.settle}`} style={at(3)}>Approve</span>
          </div>
        </div>
        <div className={`${styles.panel} ${styles.calendar} ${styles.settle}`} style={at(4)}>
          <span className={styles.dayOff}>1</span>
          <span className={styles.dayOff}>2</span>
          <span>3</span>
          <span className={`${styles.dayEdge} ${styles.settle} ${styles.pop}`} style={at(6)}>4</span>
          <span className={`${styles.dayIn} ${styles.settle} ${styles.pop}`} style={at(7)}>5</span>
          <span className={`${styles.dayEdge} ${styles.settle} ${styles.pop}`} style={at(8)}>6</span>
          <span>7</span>
        </div>
      </div>
    ),
  },
  {
    tone: styles.tone4,
    title: 'Reply, even when you’re busy',
    text: 'Quick replies, business hours and an away message.',
    visual: (
      <div className={`${styles.panel} ${styles.fill} ${styles.chat}`}>
        <span className={`${styles.away} ${styles.settle}`} style={at(0)}>Away · replies after business hours</span>
        <div className={`${styles.bubble} ${styles.bubbleIn} ${styles.settle} ${styles.fromLeft}`} style={at(1)}>Is it free this weekend?</div>
        <div className={`${styles.bubble} ${styles.bubbleOut} ${styles.settle} ${styles.fromRight}`} style={at(4)}>Yes, it is. Send a request and I’ll approve it.</div>
        <div className={styles.quickReplies}>
          <span className={styles.settle} style={at(6)}>Yes, it’s available</span>
          <span className={styles.settle} style={at(7)}>Send me the price</span>
        </div>
      </div>
    ),
  },
  {
    tone: styles.tone5,
    title: 'See what’s working',
    text: 'Views, saves, enquiries and requests for every listing.',
    visual: (
      <div className={`${styles.panel} ${styles.fill} ${styles.analytics}`}>
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
            <span key={i} className={`${dark ? `${styles.barDark} ` : ''}${styles.settle} ${styles.grow}`} style={{ height: `${height}%`, ...at(i) }} />
          ))}
        </div>
        <div className={`${styles.legend} ${styles.settle}`} style={at(10)}>
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
      <div className={`${styles.panel} ${styles.fill} ${styles.team}`}>
        {([['A', 'Manager', styles.roleManager], ['B', 'Messaging', styles.roleMessaging], ['C', 'Finance', styles.roleFinance]] as const).map(([initial, role, tone], i) => (
          <div key={role} className={`${styles.member} ${styles.settle}`} style={at(i * 2)}>
            <span className={styles.avatar}>{initial}</span>
            <span className={styles.memberName}>[Team member]</span>
            <span className={`${styles.role} ${tone}`}>{role}</span>
          </div>
        ))}
        <div className={`${styles.invite} ${styles.settle}`} style={at(6)}>+ Invite by username</div>
      </div>
    ),
  },
];

const PAGES = 2; // On shorter laptop screens the cards show three at a time.
const SWIPE_PX = 40;

const PLAYED_KEY = 'varoom_landing_hosts_played';

/** Page 3 of the landing page: what hosts get, as six product cards. */
export const HostFeaturesSection: React.FC<HostFeaturesSectionProps> = ({ onListSpace }) => {
  // Which three cards show in the one-row layout (CSS decides when that layout applies).
  const [page, setPage] = useState(0);
  const swipeStart = useRef<number | null>(null);
  const go = (next: number) => setPage(Math.max(0, Math.min(PAGES - 1, next)));

  // Entrance, the same way as the Spaces cards: everything renders visible
  // (also without JavaScript); only what is still off screen when the page
  // loads waits, and plays once when it comes into view. Coming back to the
  // page with the cards already on screen replays nothing. A card hidden
  // beside the others (the one-row layout) only settles its details when the
  // arrows bring it in.
  const sectionRef = useRef<HTMLElement>(null);
  const [entrance, setEntrance] = useState<Reveal>('none');
  const [reveal, setReveal] = useState<Reveal[]>(() => FEATURES.map(() => 'none'));
  const [rises, setRises] = useState<boolean[]>(() => FEATURES.map(() => false));
  const [order, setOrder] = useState<number[]>(() => FEATURES.map(() => 0));
  useEffect(() => {
    const section = sectionRef.current;
    if (!section || typeof IntersectionObserver === 'undefined' || prefersReducedMotion() || playedThisTab(PLAYED_KEY)) return undefined;
    const observers: IntersectionObserver[] = [];

    // Measured two frames after mounting, once the browser has restored the
    // scroll position (Back, or a link to #hosts): what is on screen then
    // stays as it is.
    const begin = () => {
      const cards = Array.from(section.querySelectorAll('article'));
      // The one-row layout clips the cards beside the others at its own edges, not the window's.
      const clip = (cards[0]?.parentElement?.parentElement ?? section).getBoundingClientRect();
      const below = isBelowScreen;
      const beside = (rect: DOMRect) => rect.left >= clip.right - 1 || rect.right <= clip.left + 1;
      const rects = cards.map((card) => card.getBoundingClientRect());
      const waits = rects.map((rect) => below(rect) || rect.bottom <= 0 || beside(rect));
      const sectionWaits = below(section.getBoundingClientRect());
      if (!sectionWaits && !waits.some(Boolean)) return;

      if (sectionWaits) setEntrance('waiting');
      setRises(rects.map((rect, i) => waits[i] && !beside(rect)));
      setReveal(waits.map((wait) => (wait ? 'waiting' : 'none')));

      if (sectionWaits) {
        const sectionObserver = new IntersectionObserver((entries) => {
          if (!entries.some((entry) => entry.isIntersecting)) return;
          setEntrance('playing');
          rememberPlayed(PLAYED_KEY);
          sectionObserver.disconnect();
        }, { threshold: 0.15 });
        sectionObserver.observe(section);
        observers.push(sectionObserver);
      }

      const pending = new Set(cards.filter((_, i) => waits[i]));
      const cardObserver = new IntersectionObserver((entries) => {
        const arrived = entries
          .filter((entry) => entry.isIntersecting && pending.has(entry.target as HTMLElement))
          .map((entry) => cards.indexOf(entry.target as HTMLElement))
          .sort((a, b) => a - b);
        if (!arrived.length) return;
        arrived.forEach((i) => { pending.delete(cards[i]); cardObserver.unobserve(cards[i]); });
        // Cards that arrive together follow each other in reading order.
        setOrder((was) => was.map((n, i) => (arrived.includes(i) ? arrived.indexOf(i) : n)));
        setReveal((was) => was.map((state, i) => (arrived.includes(i) ? 'playing' : state)));
        rememberPlayed(PLAYED_KEY);
        if (!pending.size) cardObserver.disconnect();
      }, { threshold: 0.35 });
      pending.forEach((card) => cardObserver.observe(card));
      observers.push(cardObserver);
    };

    let frame = requestAnimationFrame(() => { frame = requestAnimationFrame(begin); });
    return () => {
      cancelAnimationFrame(frame);
      observers.forEach((observer) => observer.disconnect());
    };
  }, []);

  return (
  <section
    ref={sectionRef}
    id="hosts"
    className={`snap-page ${styles.section}`}
    aria-labelledby="hosts-heading"
    data-entrance={entrance === 'none' ? undefined : entrance}
  >
    <div className={styles.head}>
      <p className={styles.eyebrow}>For hosts</p>
      <h2 id="hosts-heading" className={styles.headline}>
        List your space. Get booked.
        <em>Run it your way.</em>
      </h2>
      <p className={styles.sub}>Listings, bookings, chats and analytics in one place.</p>
    </div>

    <div
      className={styles.viewport}
      style={{ '--page': page } as React.CSSProperties}
      onPointerDown={(event) => { if (event.pointerType !== 'mouse') swipeStart.current = event.clientX; }}
      onPointerUp={(event) => {
        if (swipeStart.current === null) return;
        const dx = event.clientX - swipeStart.current;
        swipeStart.current = null;
        if (Math.abs(dx) >= SWIPE_PX) go(page + (dx < 0 ? 1 : -1));
      }}
      onPointerCancel={() => { swipeStart.current = null; }}
    >
    <div className={styles.grid}>
      {FEATURES.map((feature, i) => (
        <article
          key={feature.title}
          className={`${styles.card} ${feature.tone}`}
          data-reveal={reveal[i] === 'none' ? undefined : reveal[i]}
          data-rise={rises[i] || undefined}
          style={{ '--order': order[i] } as React.CSSProperties}
        >
          <div className={`${styles.visual} ${styles.ui}`} aria-hidden="true">
            {feature.visual}
          </div>
          <h3 className={styles.cardTitle}>{feature.title}</h3>
          <p className={styles.cardText}>{feature.text}</p>
        </article>
      ))}
    </div>
    </div>

    <div
      className={styles.pager}
      role="group"
      aria-label="More host features"
      onKeyDown={(event) => {
        if (event.key === 'ArrowLeft') { event.preventDefault(); go(page - 1); }
        if (event.key === 'ArrowRight') { event.preventDefault(); go(page + 1); }
      }}
    >
      <button type="button" className={styles.arrow} onClick={() => go(page - 1)} disabled={page === 0} aria-label="Previous host features">
        <ArrowLeft size={18} aria-hidden="true" />
      </button>
      <div className={styles.dots}>
        {Array.from({ length: PAGES }, (_, i) => (
          <button
            key={i}
            type="button"
            className={`${styles.pageDot}${i === page ? ` ${styles.pageDotOn}` : ''}`}
            onClick={() => go(i)}
            aria-label={`Show cards ${i * 3 + 1} to ${i * 3 + 3}`}
            aria-current={i === page ? 'true' : undefined}
          />
        ))}
      </div>
      <button type="button" className={styles.arrow} onClick={() => go(page + 1)} disabled={page === PAGES - 1} aria-label="Next host features">
        <ArrowRight size={18} aria-hidden="true" />
      </button>
      <span className={styles.srOnly} aria-live="polite">{`Cards ${page * 3 + 1} to ${page * 3 + 3} of 6`}</span>
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
};
