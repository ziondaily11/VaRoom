import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { useAuth } from '../lib/auth/AuthProvider';
import { getSupabaseClient } from '../lib/supabase/client';
import { accountRole } from '../lib/types/profile';
import { HELP_ARTICLES, HELP_TOPICS, searchHelpArticles, stepParts, supportHomeHref, type HelpArticle, type HelpTopic, type SupportFlow } from '../lib/support/support';
import SupportDialog from '../components/support/SupportDialog';
import RateVaroom from '../components/support/RateVaroom';
import { takeSupportHandoff } from '../lib/support/handoff';
import { SUPPORT_STYLES } from '../components/support/supportStyles';
import MenuButton from '../components/shell/MenuButton';

// Help & Support: search the help articles (results as you type), browse them
// by topic, open the steps for one, and if that does not solve it, contact
// the team (ticket, bug, feature, account help), then Rate VaRoom. A
// standalone page on a black canvas that opens in its own tab (like the legal
// pages), so it has no app navigation. Identity and role come from AuthProvider.
//
// From the sign-in panel ("Trouble signing in?") it opens on account help
// (?topic=account) with the email typed there, handed over through
// localStorage and shown masked. An article can be linked as #help-<id>.

const ACTIONS: Array<{ flow: SupportFlow; icon: string; title: string; text: string }> = [
  { flow: 'ticket', icon: '✉', title: 'Contact support', text: "Tell us what you need. We'll reply by email." },
  { flow: 'account', icon: '◎', title: 'Help with my account', text: "Can't sign in, suspended, deactivated, or a code that didn't arrive." },
  { flow: 'bug', icon: '⚙', title: 'Report a bug', text: "Something not working? Tell us what happened." },
  { flow: 'feature', icon: '✦', title: 'Suggest a feature', text: 'An idea that would make VaRoom better.' },
];

const TOPIC_ICONS: Record<HelpTopic, string> = { start: '✧', bookings: '▦', hosting: '⌂', chats: '✉', account: '◎', safety: '⚑' };

const articleAnchor = (id: string) => `help-${id}`;

function ArticleItem({ article, open, onToggle, nodeRef }: { article: HelpArticle; open: boolean; onToggle: () => void; nodeRef: (node: HTMLElement | null) => void }) {
  const panelId = `${articleAnchor(article.id)}-panel`;
  return (
    <article ref={nodeRef} id={articleAnchor(article.id)} className={`help-item${open ? ' is-open' : ''}`} data-article={article.id}>
      <button type="button" className="help-item-head" aria-expanded={open} aria-controls={panelId} onClick={onToggle}>
        <span className="help-item-titles"><span className="help-item-title">{article.title}</span><span className="help-item-summary">{article.summary}</span></span>
        <span className="help-item-chevron" aria-hidden="true" />
      </button>
      <div className="help-item-panel" id={panelId} role="region" aria-label={article.title} aria-hidden={!open} inert={!open}>
        <div className="help-item-inner">
          <ol>
            {article.steps.map((step) => (
              <li key={step}>{stepParts(step).map((part, index) => (part.bold ? <strong key={index}>{part.text}</strong> : <React.Fragment key={index}>{part.text}</React.Fragment>))}</li>
            ))}
          </ol>
          {article.note && <p className="help-item-note">{article.note}</p>}
          {article.link && <a className="help-item-link" href={article.link.href} target="_blank" rel="noopener noreferrer">{article.link.label} →</a>}
        </div>
      </div>
    </article>
  );
}

export default function SupportPage() {
  const { session, user, profile } = useAuth();
  const router = useRouter();
  const [handoffEmail, setHandoffEmail] = useState('');
  const [query, setQuery] = useState('');
  const [topic, setTopic] = useState<HelpTopic | 'all'>('all');
  const [openId, setOpenId] = useState<string | null>(null);
  const [flow, setFlow] = useState<SupportFlow | null>(null);
  const articleNodes = useRef(new Map<string, HTMLElement>());
  const articlesRef = useRef<HTMLElement | null>(null);
  const contactRef = useRef<HTMLElement | null>(null);

  const role = accountRole(profile && user && profile.id === user.id ? profile : null);
  const homeHref = supportHomeHref(role);
  const metadata = (user?.user_metadata || {}) as { full_name?: string; name?: string };
  const name = (profile && user && profile.id === user.id && profile.full_name)
    || metadata.full_name || metadata.name
    || (user?.email ? user.email.split('@')[0] : 'VaRoom member');

  const results = useMemo(() => searchHelpArticles(query), [query]);
  const searching = query.trim() !== '';
  const shown = topic === 'all' ? HELP_ARTICLES : HELP_ARTICLES.filter((article) => article.topic === topic);

  // Arriving from the sign-in panel: the email typed there, and account help open.
  useEffect(() => {
    const email = takeSupportHandoff();
    if (email) setHandoffEmail(email);
  }, []);
  useEffect(() => {
    if (router.isReady && router.query.topic === 'account') setFlow('account');
  }, [router.isReady, router.query.topic]);

  /** Open an article and bring it into view (it may first need its topic shown). */
  const openArticle = useCallback((id: string) => {
    const article = HELP_ARTICLES.find((item) => item.id === id);
    if (!article) return;
    setTopic((current) => (current === 'all' || current === article.topic ? current : 'all'));
    setOpenId(id);
    try { window.history.replaceState(null, '', `#${articleAnchor(id)}`); } catch { /* the address is only a convenience */ }
    window.requestAnimationFrame(() => articleNodes.current.get(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  }, []);

  // A linked article (#help-<id>) opens on arrival.
  useEffect(() => {
    const id = window.location.hash.replace(/^#help-/, '');
    if (id && id !== window.location.hash) openArticle(id);
  }, [openArticle]);

  const toggle = (id: string) => {
    setOpenId((current) => (current === id ? null : id));
    try { window.history.replaceState(null, '', openId === id ? window.location.pathname + window.location.search : `#${articleAnchor(id)}`); } catch { /* ignore */ }
  };

  const chooseTopic = (next: HelpTopic | 'all') => {
    setTopic(next);
    setOpenId(null);
    articlesRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const search = (event: React.FormEvent) => {
    event.preventDefault();
    if (results[0]) { openArticle(results[0].id); setQuery(''); }
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
        <title>Help & Support — VaRoom</title>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,600;9..144,700&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
      </Head>
      <style dangerouslySetInnerHTML={{ __html: SUPPORT_STYLES }} />
      <div className="page support-page">
        <header className="topbar">
          <MenuButton />
          <a className="logo" href={user ? homeHref : '/'} id="support-home-logo"><span className="va">Va</span>Room</a>
          <span className="topbar-title">Help &amp; Support</span>
          <button type="button" className="topbar-contact" onClick={() => contactRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>Contact us</button>
        </header>

        <main>
          <section className="hero" aria-labelledby="support-heading">
            <div className="eyebrow">Help &amp; Support</div>
            <h1 id="support-heading">How can we help?</h1>
            <p className="hero-copy">Search for an answer, browse by topic, or contact our team.</p>
            <form className="search" id="help-search" role="search" onSubmit={search}>
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></svg>
              <input id="search-input" type="search" placeholder="Try “cancel booking”, “password” or “list a space”" autoComplete="off"
                aria-label="Search help" aria-controls="search-results" value={query} onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => { if (event.key === 'Escape') setQuery(''); }} />
              <button type="submit" aria-label="Open the best match"><span aria-hidden="true">→</span></button>
            </form>
            {searching && (
              <div className="search-results" id="search-results" aria-live="polite">
                {results.length ? (
                  <>
                    <p className="search-count">{results.length === 1 ? '1 answer' : `${results.length} answers`}</p>
                    <ul>
                      {results.slice(0, 6).map((article) => (
                        <li key={article.id}>
                          <button type="button" onClick={() => { openArticle(article.id); setQuery(''); }}>
                            <span className="search-result-title">{article.title}</span>
                            <span className="search-result-topic">{HELP_TOPICS.find((item) => item.id === article.topic)?.title}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </>
                ) : (
                  <div className="search-empty" id="search-empty">
                    <p>No answer for “{query.trim()}” yet.</p>
                    <button type="button" className="write-button" onClick={() => setFlow('ticket')}>Ask our team</button>
                  </div>
                )}
              </div>
            )}
          </section>

          <section className="topics" aria-label="Help topics">
            {HELP_TOPICS.map((item) => {
              const count = HELP_ARTICLES.filter((article) => article.topic === item.id).length;
              return (
                <button key={item.id} type="button" className={`topic${topic === item.id ? ' is-active' : ''}`} aria-pressed={topic === item.id} onClick={() => chooseTopic(topic === item.id ? 'all' : item.id)}>
                  <span className="topic-icon" aria-hidden="true">{TOPIC_ICONS[item.id]}</span>
                  <span className="topic-title">{item.title}</span>
                  <span className="topic-text">{item.text}</span>
                  <span className="topic-count">{count === 1 ? '1 article' : `${count} articles`}</span>
                </button>
              );
            })}
          </section>

          <section className="articles" aria-labelledby="articles-heading" ref={articlesRef}>
            <div className="articles-head">
              <div>
                <div className="section-label">Answers</div>
                <h2 id="articles-heading">{topic === 'all' ? 'All help articles' : HELP_TOPICS.find((item) => item.id === topic)?.title}</h2>
              </div>
              {topic !== 'all' && <button type="button" className="write-button" onClick={() => chooseTopic('all')}>Show all</button>}
            </div>
            <div className="help-list">
              {shown.map((article) => (
                <ArticleItem key={article.id} article={article} open={openId === article.id} onToggle={() => toggle(article.id)}
                  nodeRef={(node) => { if (node) articleNodes.current.set(article.id, node); else articleNodes.current.delete(article.id); }} />
              ))}
            </div>
          </section>

          <section className="contact" aria-labelledby="contact-heading" ref={contactRef}>
            <div className="section-label">Still need help?</div>
            <h2 id="contact-heading">Contact the VaRoom team</h2>
            <p className="contact-copy">We reply by email. Tell us as much as you can, so we can help the first time.</p>
            <div className="support-actions">
              {ACTIONS.map((action) => (
                <button key={action.flow} className={`action${flow === action.flow ? ' is-active' : ''}`} type="button" data-support-action={action.flow} onClick={() => setFlow(action.flow)}>
                  <span className="action-icon" aria-hidden="true">{action.icon}</span>
                  <h3>{action.title}</h3>
                  <p>{action.text}</p>
                </button>
              ))}
            </div>
          </section>

          <RateVaroom userId={user?.id || null} />

          {flow && (
            <SupportDialog
              flow={flow}
              user={{ name, email: user?.email || handoffEmail }}
              getAccessToken={getAccessToken}
              onClose={closeDialog}
            />
          )}
        </main>

        <footer>
          <strong><span className="logo"><span className="va">Va</span>Room</span></strong>
          <nav aria-label="Footer navigation">
            <a href="/terms" target="_blank" rel="noopener noreferrer">Terms &amp; Conditions</a>
            <a href="/privacy" target="_blank" rel="noopener noreferrer">Privacy Policy</a>
            <a href="/terms#prohibited-conduct" target="_blank" rel="noopener noreferrer">Community rules</a>
            <a href="/privacy#cookies" target="_blank" rel="noopener noreferrer">Cookies</a>
          </nav>
          <span>© {new Date().getFullYear()} VaRoom. All rights reserved.</span>
        </footer>
      </div>
    </>
  );
}

// Phones: the hamburger opens the account's sidebar as a drawer (_app mounts it).
SupportPage.phoneMenu = true;
