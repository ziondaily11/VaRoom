import React, { useCallback, useEffect, useRef, useState } from 'react';
import Head from 'next/head';
import { useAuth } from '../lib/auth/AuthProvider';
import { getSupabaseClient } from '../lib/supabase/client';
import { accountRole } from '../lib/types/profile';
import { HELP_ARTICLES, findHelpArticle, stepParts, type HelpArticle, type SupportFlow } from '../lib/support/support';
import SupportDialog from '../components/support/SupportDialog';
import { SUPPORT_STYLES } from '../components/support/supportStyles';

// Help & Support (migrated from legacy-pages/support.html): help search over
// the common articles, support actions that open a ticket / bug / feature /
// account dialog, and the footer. A standalone page on a fixed black canvas.
// Identity and role come from AuthProvider; no request of its own.

const ACTIONS: Array<{ flow: SupportFlow; icon: string; title: string; text: string }> = [
  { flow: 'ticket', icon: '▤', title: 'Create a support ticket', text: "Need help with a specific issue? Send us a message and we'll get back to you." },
  { flow: 'bug', icon: '⚙', title: 'Report a bug', text: "Found something that's not working? Let us know so we can fix it." },
  { flow: 'feature', icon: '♧', title: 'Request a feature', text: 'Have an idea? Help us build a better VaRoom.' },
  { flow: 'account', icon: '♙', title: 'Need help with account', text: 'Update your details, reset your password, or manage your account.' },
];

function Article({ article, matched, articleRef }: { article: HelpArticle; matched: boolean; articleRef: (node: HTMLElement | null) => void }) {
  return (
    <article ref={articleRef} className={`article${matched ? ' match' : ''}`} data-article={article.id}>
      <div className="article-head"><span className="article-icon">{article.icon}</span><h3>{article.title}</h3></div>
      <p className="article-description">{article.description}</p>
      <ol>
        {article.steps.map((step) => (
          <li key={step}>{stepParts(step).map((part, index) => (part.bold ? <strong key={index}>{part.text}</strong> : <React.Fragment key={index}>{part.text}</React.Fragment>))}</li>
        ))}
      </ol>
      {article.note && <p className="article-note">{article.note}</p>}
    </article>
  );
}

export default function SupportPage() {
  const { session, user, profile } = useAuth();
  const [query, setQuery] = useState('');
  const [noMatch, setNoMatch] = useState(false);
  const [matchedId, setMatchedId] = useState<string | null>(null);
  const [flow, setFlow] = useState<SupportFlow | null>(null);
  const articleNodes = useRef(new Map<string, HTMLElement>());
  const matchTimer = useRef<number | null>(null);

  const role = accountRole(profile && user && profile.id === user.id ? profile : null);
  const homeHref = role === 'host' ? '/host-home' : '/client-home';
  const metadata = (user?.user_metadata || {}) as { full_name?: string; name?: string };
  const name = (profile && user && profile.id === user.id && profile.full_name)
    || metadata.full_name || metadata.name
    || (user?.email ? user.email.split('@')[0] : 'VaRoom member');
  const initial = user ? (name.trim()[0] || 'A').toUpperCase() : 'A';

  // The legacy dark-theme rules key on this body class.
  useEffect(() => {
    document.body.classList.add('support-page-body');
    return () => {
      document.body.classList.remove('support-page-body');
      if (matchTimer.current) window.clearTimeout(matchTimer.current);
    };
  }, []);

  const search = (event: React.FormEvent) => {
    event.preventDefault();
    setNoMatch(false);
    setMatchedId(null);
    if (!query.trim()) return;
    const found = findHelpArticle(query);
    if (!found) {
      setNoMatch(true);
      return;
    }
    // Restart the highlight (legacy: 2.4 s) and bring the article into view.
    window.requestAnimationFrame(() => setMatchedId(found.id));
    articleNodes.current.get(found.id)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    if (matchTimer.current) window.clearTimeout(matchTimer.current);
    matchTimer.current = window.setTimeout(() => setMatchedId(null), 2400);
  };

  const getAccessToken = useCallback(async () => {
    if (session?.access_token) return session.access_token;
    const client = getSupabaseClient();
    return client ? (await client.auth.getSession()).data.session?.access_token ?? null : null;
  }, [session]);

  const closeDialog = useCallback(() => setFlow(null), []);

  return (
    <>
      <Head>
        <title>Support — VaRoom</title>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,600;9..144,700&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
      </Head>
      <style dangerouslySetInnerHTML={{ __html: SUPPORT_STYLES }} />
      <div className="page support-page">
        <header className="topbar">
          <a className="logo" href={homeHref} id="support-home-logo"><span className="va">Va</span>Room</a>
          <nav className="nav" aria-label="Primary navigation">
            <a href={homeHref} id="support-home-link">Home</a>
            <a href="/marketplace">Marketplace</a>
            <a href="/chats">Messages</a>
            <a href="/bookings">Bookings</a>
            <a className="active" href="/support" aria-current="page">Support</a>
          </nav>
          <a className="account" href="/profile"><span className="avatar">{initial}</span><span>Account</span><span aria-hidden="true">⌄</span></a>
        </header>

        <main>
          <section className="hero" aria-labelledby="support-heading">
            <div className="eyebrow">Support</div>
            <h1 id="support-heading">How can we help you today?</h1>
            <p className="hero-copy">Find quick answers, learn how to use VaRoom, resolve common problems, or get in touch with our support team.</p>
            <form className="search" id="help-search" role="search" onSubmit={search}>
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></svg>
              <input id="search-input" type="search" placeholder="Search for help articles, guides, or topics..." autoComplete="off" aria-label="Search help articles" value={query} onChange={(event) => setQuery(event.target.value)} />
              <button type="submit" aria-label="Search"><span aria-hidden="true">→</span></button>
            </form>
            <p className="empty" id="search-empty" hidden={!noMatch}>No matching help article yet. More support guidance will be added here soon.</p>
          </section>

          <section className="support-actions" aria-label="Support actions">
            {ACTIONS.map((action) => (
              <button
                key={action.flow}
                className={`action${flow === action.flow ? ' is-active' : ''}`}
                type="button"
                data-support-action={action.flow}
                onClick={() => setFlow(action.flow)}
              >
                <span className="action-icon">{action.icon}</span>
                <h2>{action.title}</h2>
                <p>{action.text}</p>
              </button>
            ))}
          </section>

          <section className="write-card" aria-labelledby="write-heading">
            <div><h2 id="write-heading">Write to VaRoom Support</h2><p>Our team can help when you can&apos;t find what you&apos;re looking for.</p></div>
            <button className="write-button" type="button" data-support-action="contact" onClick={() => setFlow('ticket')}>Contact support</button>
          </section>

          {flow && (
            <SupportDialog
              flow={flow}
              user={{ name, email: user?.email || '' }}
              getAccessToken={getAccessToken}
              onFlowChange={setFlow}
              onClose={closeDialog}
            />
          )}

          <section className="articles" aria-labelledby="articles-heading">
            <div className="section-label">Common help</div>
            <h2 id="articles-heading">Things people are looking for</h2>
            <div className="article-grid">
              {HELP_ARTICLES.map((article) => (
                <Article
                  key={article.id}
                  article={article}
                  matched={matchedId === article.id}
                  articleRef={(node) => {
                    if (node) articleNodes.current.set(article.id, node);
                    else articleNodes.current.delete(article.id);
                  }}
                />
              ))}
            </div>
          </section>
        </main>

        <footer>
          <strong><span className="logo"><span className="va">Va</span>Room</span></strong>
          <nav aria-label="Footer navigation">
            <a href="/terms" target="_blank" rel="noopener noreferrer">Terms &amp; Conditions</a>
            <a href="/privacy" target="_blank" rel="noopener noreferrer">Privacy Policy</a>
            <a href="#">Community Guidelines</a>
            <a href="#">Cookie Preferences</a>
            <a href="/support">Support / Help</a>
          </nav>
          <span>© 2026 VaRoom. All rights reserved.</span>
        </footer>
      </div>
    </>
  );
}

// The app's mobile navigation shows here, as it did on the legacy page (the
// page's own links are hidden on phones).
(SupportPage as unknown as { appNavigation: boolean }).appNavigation = true;
