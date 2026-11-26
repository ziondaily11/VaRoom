import Head from 'next/head';
import Link from 'next/link';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BRAND_FONT_HREF } from '../../lib/brandFont';
import { prefersReducedMotion } from '../../lib/motion/reducedMotion';
import { usePresence } from '../../lib/motion/usePresence';
import {
  activeSectionId, activeSectionLimit, isInAppLink, isPaneLayout, legalLinkTarget, paneScrollTopFor,
  type Block, type Inline, type Section,
} from '../../lib/legal/legalDocument';
import { LEGAL_STYLES } from './legalStyles';

// Shared layout for the legal documents (Terms of Service, Privacy Policy):
// a black curved header, the section list, and the text. Above 900 px one
// pane under the header scrolls: the list sticks beside the text and finishes
// level with it; below 900 px the window scrolls and the list opens from a
// menu that stays at the top of the screen.
// Styles: ./legalStyles.ts (pp- prefix), rendered only on these pages.

export interface LegalDocumentPageProps {
  title: string;
  lastUpdated: string;
  intro: Block[];
  sections: Section[];
  /** aria-label for the section navigation, e.g. "Privacy policy sections" */
  navLabel: string;
  /**
   * Tighter desktop spacing for the sticky section navigation. Use for documents
   * with many sections so the list still fits on screen without its own scrollbar.
   */
  denseNav?: boolean;
  headTitle: string;
  headDescription: string;
}

function Rich({ node }: { node: Inline }) {
  if (typeof node === 'string') return <>{node}</>;
  if ('strong' in node) return <strong>{node.strong}</strong>;
  // Another legal page opens without reloading the app.
  if (isInAppLink(node.href)) return <Link href={node.href}>{node.text}</Link>;
  const { target, rel } = legalLinkTarget(node.href);
  return <a href={node.href} target={target} rel={rel}>{node.text}</a>;
}

function Line({ content }: { content: Inline[] }) {
  return <>{content.map((node, i) => <Rich key={i} node={node} />)}</>;
}

function BlockView({ block }: { block: Block }) {
  switch (block.type) {
    case 'p':
      return <p><Line content={block.content} /></p>;
    case 'h3':
      return <h3>{block.text}</h3>;
    case 'ul':
      return <ul>{block.items.map((item) => <li key={item}>{item}</li>)}</ul>;
    case 'notice':
      return <div className="pp-notice"><p><Line content={block.content} /></p></div>;
    case 'contact':
      return (
        <div className="pp-contact">
          <strong>{block.title}</strong>
          {block.lines.map((line, i) => <div key={i}><Line content={line} /></div>)}
        </div>
      );
  }
}

const Chevron = () => (
  <svg className="pp-toc-chevron" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="m6 9 6 6 6-6" />
  </svg>
);

function TableOfContents({ sections, active, label, dense, onSelectSection }: {
  sections: Section[];
  active: string;
  label: string;
  dense: boolean;
  onSelectSection: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const { closing } = usePresence(open, 160);
  const navRef = useRef<HTMLElement | null>(null);
  const activeIndex = sections.findIndex((section) => section.id === active);

  // Desktop: the list keeps the active section in view (centred when it can be).
  useEffect(() => {
    const nav = navRef.current;
    const link = nav?.querySelector<HTMLElement>('a[aria-current="true"]');
    if (!nav || !link || !isPaneLayout(window.innerWidth)) return;
    const top = link.getBoundingClientRect().top - nav.getBoundingClientRect().top + nav.scrollTop;
    nav.scrollTo({ top: top - (nav.clientHeight - link.offsetHeight) / 2, behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
  }, [active]);

  // Phones: a tap outside the menu, or Escape, closes it.
  useEffect(() => {
    if (!open) return undefined;
    const onPointer = (event: PointerEvent) => {
      if (navRef.current && !navRef.current.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        navRef.current?.querySelector<HTMLButtonElement>('.pp-toc-toggle')?.focus();
      }
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <nav ref={navRef} className={dense ? 'pp-toc pp-toc--dense' : 'pp-toc'} aria-label={label}>
      <button
        type="button"
        className="pp-toc-toggle"
        aria-expanded={open}
        aria-controls="pp-toc-list"
        onClick={() => setOpen((value) => !value)}
      >
        <span className="pp-toc-toggle-current">
          {activeIndex >= 0 ? `${activeIndex + 1}. ${sections[activeIndex].title}` : 'Jump to section'}
        </span>
        <Chevron />
      </button>
      <ul id="pp-toc-list" className={open ? 'pp-toc-list is-open' : closing ? 'pp-toc-list is-closing' : 'pp-toc-list'}>
        {sections.map((section, i) => (
          <li key={section.id}>
            <a
              href={`#${section.id}`}
              aria-current={active === section.id ? 'true' : undefined}
              onClick={(event) => {
                event.preventDefault();
                setOpen(false);
                onSelectSection(section.id);
              }}
            >
              {i + 1}. {section.title}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

export default function LegalDocumentPage({
  title, lastUpdated, intro, sections, navLabel, denseNav = false, headTitle, headDescription,
}: LegalDocumentPageProps) {
  const sectionIds = useMemo(() => sections.map((section) => section.id), [sections]);
  const [active, setActive] = useState<string>(sectionIds[0] ?? '');
  const contentPaneRef = useRef<HTMLDivElement>(null);

  const scrollToSection = useCallback((id: string) => {
    const target = document.getElementById(id);
    if (!target) return false;
    const behavior: ScrollBehavior = prefersReducedMotion() ? 'auto' : 'smooth';
    const pane = contentPaneRef.current;
    if (pane && isPaneLayout(window.innerWidth)) {
      const paneRect = pane.getBoundingClientRect();
      pane.scrollTo({ top: paneScrollTopFor(target.getBoundingClientRect().top, paneRect.top, pane.scrollTop), behavior });
    } else {
      target.scrollIntoView({ behavior, block: 'start' });
    }
    setActive(id);
    return true;
  }, []);

  const handleSelectSection = useCallback((id: string) => {
    if (!scrollToSection(id)) return;
    // The address names the section (shareable), without a history step per
    // click: Back leaves the page. Next.js's own history state is kept.
    window.history.replaceState(window.history.state, '', `#${id}`);
  }, [scrollToSection]);

  // Tag the document for the desktop overflow lock, and open a linked section (#id).
  useEffect(() => {
    document.documentElement.classList.add('has-legal-page');
    document.body.classList.add('has-legal-page');
    const hash = window.location.hash.replace(/^#/, '');
    const timer = hash ? window.setTimeout(() => { scrollToSection(decodeURIComponent(hash)); }, 120) : null;
    return () => {
      if (timer !== null) window.clearTimeout(timer);
      document.documentElement.classList.remove('has-legal-page');
      document.body.classList.remove('has-legal-page');
    };
  }, [scrollToSection]);

  // The active section follows the reader at any width: the pane scrolls on
  // desktop, the window on phones, and the layout can change while reading.
  useEffect(() => {
    const pane = contentPaneRef.current;
    let frame = 0;
    const update = () => {
      frame = 0;
      const container = pane && isPaneLayout(window.innerWidth) ? pane : null;
      const containerTop = container ? container.getBoundingClientRect().top : 0;
      const tops: Array<{ id: string; top: number }> = [];
      for (const id of sectionIds) {
        const element = document.getElementById(id);
        if (element) tops.push({ id, top: element.getBoundingClientRect().top - containerTop });
      }
      // The last section counts as reached once its end is on screen: it is
      // often too short for its heading to climb to the line.
      const last = document.getElementById(sectionIds[sectionIds.length - 1] ?? '');
      const viewBottom = container ? container.getBoundingClientRect().bottom : window.innerHeight;
      const current = last && last.getBoundingClientRect().bottom <= viewBottom
        ? last.id
        : activeSectionId(tops, activeSectionLimit(Boolean(container)));
      if (current) setActive(current);
    };
    const schedule = () => { if (!frame) frame = window.requestAnimationFrame(update); };
    pane?.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule, { passive: true });
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      pane?.removeEventListener('scroll', schedule);
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
    };
  }, [sectionIds]);

  return (
    <div className="pp-root">
      <Head>
        <title>{headTitle}</title>
        <meta name="description" content={headDescription} />
        <link rel="stylesheet" href={BRAND_FONT_HREF} key="brand-font" />
      </Head>
      <style dangerouslySetInnerHTML={{ __html: LEGAL_STYLES }} />

      <header className="pp-hero">
        <Link className="pp-brand" href="/">
          <span>Va</span>
          <span>Room</span>
        </Link>
        <h1>{title}</h1>
        <p className="pp-updated">Last updated: {lastUpdated}</p>
      </header>

      <div className="pp-content-pane" ref={contentPaneRef}>
        <div className="pp-body">
          {/* The list sticks only within this pair, so it ends level with the text. */}
          <div className="pp-columns">
            <TableOfContents sections={sections} active={active} label={navLabel} dense={denseNav} onSelectSection={handleSelectSection} />
            <article className="pp-content">
              {intro.map((block, i) => <BlockView key={i} block={block} />)}
              {sections.map((section, i) => (
                <section key={section.id} id={section.id} aria-labelledby={`${section.id}-title`}>
                  <h2 id={`${section.id}-title`}>{i + 1}. {section.title}</h2>
                  {section.blocks.map((block, j) => <BlockView key={j} block={block} />)}
                </section>
              ))}
            </article>
          </div>
          {/* Decorative sign-off: a faint wordmark that lights up in colour on hover. */}
          <div className="pp-wordmark" aria-hidden="true">
            <span className="pp-wordmark-base">VaRoom</span>
            <span className="pp-wordmark-glow">VaRoom</span>
          </div>
          <footer className="pp-footer">© 2026 Varoom. All rights reserved.</footer>
        </div>
      </div>
    </div>
  );
}
