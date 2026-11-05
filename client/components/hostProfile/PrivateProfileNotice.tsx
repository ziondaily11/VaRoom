import React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { CalendarDays, MessageCircle } from 'lucide-react';
import { loginUrl } from '../../lib/safeRedirect';

interface PrivateProfileNoticeProps {
  /** The username from the address, when the profile was opened by username. */
  handle: string | null;
  signedIn: boolean;
}

/**
 * Shown when a host set Settings → Privacy → Profile visibility to Private and
 * the viewer has no chat or booking with them. Uses the host-profile colours
 * where the page defines them (light or dark), and dark ones otherwise.
 */
export default function PrivateProfileNotice({ handle, signedIn }: PrivateProfileNoticeProps) {
  const router = useRouter();
  const name = handle ? `@${handle.replace(/^@+/, '')}` : 'This host';
  const goBack = () => {
    if (typeof window !== 'undefined' && window.history.length > 1) router.back();
    else void router.push('/marketplace');
  };

  return (
    <section className="private-profile" role="status" aria-labelledby="private-profile-title">
      <div className="private-profile-card">
        <div className="private-profile-art" aria-hidden="true">
          <svg viewBox="0 0 120 120" width="120" height="120" fill="none">
            <circle cx="60" cy="60" r="56" className="pp-halo" />
            <path d="M30 58 60 34l30 24v32a4 4 0 0 1-4 4H34a4 4 0 0 1-4-4V58Z" className="pp-house" />
            <path d="M24 62 60 32l36 30" className="pp-roof" />
            <rect x="48" y="64" width="24" height="20" rx="4" className="pp-lock" />
            <path d="M53 64v-5a7 7 0 0 1 14 0v5" className="pp-shackle" />
            <circle cx="60" cy="73" r="2.6" className="pp-keyhole" />
            <path d="M60 75v4" className="pp-keyhole-line" />
          </svg>
        </div>
        <p className="private-profile-kicker">Behind closed doors</p>
        <h1 id="private-profile-title">This profile is private</h1>
        <p className="private-profile-lead">
          {name} only opens their profile to people they already know on VaRoom.
        </p>
        <ul className="private-profile-ways">
          <li><MessageCircle size={18} aria-hidden="true" /><span>Already chatting with them? Their profile opens to you.</span></li>
          <li><CalendarDays size={18} aria-hidden="true" /><span>Booked one of their spaces? You can see it too.</span></li>
        </ul>
        <div className="private-profile-actions">
          <Link href="/marketplace" className="private-profile-btn primary">Explore spaces</Link>
          {signedIn ? (
            <button type="button" className="private-profile-btn" onClick={goBack}>Go back</button>
          ) : (
            <Link href={loginUrl(router.asPath)} className="private-profile-btn">Sign in</Link>
          )}
        </div>
      </div>
      <style jsx>{`
        .private-profile {
          min-height: 100%; display: grid; place-items: center; padding: 56px 20px;
          color: var(--host-profile-text, #f2f2f2);
          font-family: inherit;
        }
        .private-profile-card {
          width: 100%; max-width: 440px; text-align: center; padding: 36px 28px 30px;
          background: var(--host-profile-surface, #0e0e0e);
          border: 1px solid var(--host-profile-border, #1f1f1f);
          border-radius: 20px;
        }
        .private-profile-art { display: flex; justify-content: center; margin-bottom: 18px; }
        .pp-halo { fill: rgba(196, 30, 58, .08); }
        .pp-house { fill: var(--host-profile-surface-raised, #1a1a1a); stroke: var(--host-profile-border, #333); stroke-width: 2; }
        .pp-roof { stroke: var(--host-profile-text, #f2f2f2); stroke-width: 4; stroke-linecap: round; stroke-linejoin: round; }
        .pp-lock { fill: #c41e3a; }
        .pp-shackle { stroke: #c41e3a; stroke-width: 4; stroke-linecap: round; }
        .pp-keyhole { fill: #fff; }
        .pp-keyhole-line { stroke: #fff; stroke-width: 2.4; stroke-linecap: round; }
        .private-profile-kicker {
          margin: 0 0 6px; color: #c41e3a; font-size: 0.75rem; font-weight: 700;
          letter-spacing: .08em; text-transform: uppercase;
        }
        h1 { margin: 0; font-size: 1.5rem; font-weight: 700; line-height: 1.25; }
        .private-profile-lead {
          margin: 10px 0 0; color: var(--host-profile-muted, #b5b5b5); font-size: 0.9375rem; line-height: 1.55;
        }
        .private-profile-ways {
          list-style: none; margin: 22px 0 0; padding: 0; display: grid; gap: 10px; text-align: left;
        }
        .private-profile-ways li {
          display: flex; align-items: center; gap: 12px; padding: 12px 14px; border-radius: 12px;
          background: var(--host-profile-surface-raised, #161616);
          color: var(--host-profile-text, #f2f2f2); font-size: 0.875rem; line-height: 1.4;
        }
        .private-profile-ways li :global(svg) { flex: 0 0 auto; color: #c41e3a; }
        .private-profile-actions { display: flex; gap: 10px; justify-content: center; flex-wrap: wrap; margin-top: 24px; }
        .private-profile-actions :global(.private-profile-btn) {
          display: inline-flex; align-items: center; justify-content: center; min-width: 140px; padding: 11px 20px;
          border-radius: 999px; border: 1px solid var(--host-profile-border, #3a3a3a); background: transparent;
          color: var(--host-profile-text, #f2f2f2); font: inherit; font-size: 0.875rem; font-weight: 600;
          text-decoration: none; cursor: pointer; transition: background .15s ease, transform .15s ease;
        }
        .private-profile-actions :global(.private-profile-btn:hover) { background: var(--host-profile-surface-raised, #1a1a1a); }
        .private-profile-actions :global(.private-profile-btn.primary) { background: #c41e3a; border-color: #c41e3a; color: #fff; }
        .private-profile-actions :global(.private-profile-btn.primary:hover) { background: #a8182f; }
        .private-profile-actions :global(.private-profile-btn:focus-visible) { outline: 2px solid #c41e3a; outline-offset: 2px; }
        @media (max-width: 480px) {
          .private-profile { padding: 32px 16px; }
          .private-profile-card { padding: 28px 18px 24px; }
          .private-profile-actions :global(.private-profile-btn) { flex: 1 1 100%; }
        }
      `}</style>
    </section>
  );
}
