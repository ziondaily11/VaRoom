"use client";

import Head from "next/head";
import { useEffect, useMemo, useState } from "react";
// Content model shared by the legal documents (Privacy Policy, Terms of Service).
export type Inline = string | { strong: string } | { text: string; href: string };

export type Block =
  | { type: "p"; content: Inline[] }
  | { type: "h3"; text: string }
  | { type: "ul"; items: string[] }
  | { type: "notice"; content: Inline[] }
  | { type: "contact"; title: string; lines: Inline[][] };

export interface Section {
  id: string;
  title: string;
  blocks: Block[];
}

// Shared layout for the legal documents (Privacy Policy, Terms of Service).
// Visual styling lives in privacy.css under the `pp-` class prefix.

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
  /** Optional <title> / meta description for the page */
  headTitle?: string;
  headDescription?: string;
}

function useActiveSection(ids: string[]): string {
  const [active, setActive] = useState(ids[0] ?? "");

  useEffect(() => {
    const els = ids
      .map((id) => document.getElementById(id))
      .filter((el): el is HTMLElement => el !== null);
    if (!els.length) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActive(visible[0].target.id);
      },
      { rootMargin: "-15% 0px -75% 0px" }
    );
    els.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [ids]);

  return active;
}

function Rich({ node }: { node: Inline }) {
  if (typeof node === "string") return <>{node}</>;
  if ("strong" in node) return <strong>{node.strong}</strong>;
  return <a href={node.href}>{node.text}</a>;
}

function BlockView({ block }: { block: Block }) {
  switch (block.type) {
    case "p":
      return (
        <p>
          {block.content.map((n, i) => (
            <Rich key={i} node={n} />
          ))}
        </p>
      );
    case "h3":
      return <h3>{block.text}</h3>;
    case "ul":
      return (
        <ul>
          {block.items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      );
    case "notice":
      return (
        <div className="pp-notice">
          <p>
            {block.content.map((n, i) => (
              <Rich key={i} node={n} />
            ))}
          </p>
        </div>
      );
    case "contact":
      return (
        <div className="pp-contact">
          <strong>{block.title}</strong>
          {block.lines.map((line, i) => (
            <div key={i}>
              {line.map((n, j) => (
                <Rich key={j} node={n} />
              ))}
            </div>
          ))}
        </div>
      );
  }
}

function TableOfContents({
  sections,
  active,
  label,
  dense,
}: {
  sections: Section[];
  active: string;
  label: string;
  dense: boolean;
}) {
  const [open, setOpen] = useState(false);

  return (
    <nav className={dense ? "pp-toc pp-toc--dense" : "pp-toc"} aria-label={label}>
      <button
        type="button"
        className="pp-toc-toggle"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        Jump to section
      </button>
      <ul className={open ? "pp-toc-list is-open" : "pp-toc-list"}>
        {sections.map((s, i) => (
          <li key={s.id}>
            <a
              href={`#${s.id}`}
              aria-current={active === s.id ? "true" : undefined}
              onClick={() => setOpen(false)}
            >
              {i + 1}. {s.title}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

export default function LegalDocumentPage({
  title,
  lastUpdated,
  intro,
  sections,
  navLabel,
  denseNav = false,
  headTitle,
  headDescription,
}: LegalDocumentPageProps) {
  const sectionIds = useMemo(() => sections.map((s) => s.id), [sections]);
  const active = useActiveSection(sectionIds);

  return (
    <div className="pp-root">
      {headTitle ? (
        <Head>
          <title>{headTitle}</title>
          {headDescription ? <meta name="description" content={headDescription} /> : null}
        </Head>
      ) : null}

      <header className="pp-hero">
        <a className="pp-brand" href="/">
          <span>Va</span>
          <span>Room</span>
        </a>
        <h1>{title}</h1>
        <p className="pp-updated">Last updated: {lastUpdated}</p>
      </header>

      <div className="pp-body">
        <TableOfContents sections={sections} active={active} label={navLabel} dense={denseNav} />
        <article className="pp-content">
          {intro.map((block, i) => (
            <BlockView key={i} block={block} />
          ))}
          {sections.map((s, i) => (
            <section key={s.id} id={s.id} aria-labelledby={`${s.id}-title`}>
              <h2 id={`${s.id}-title`}>
                {i + 1}. {s.title}
              </h2>
              {s.blocks.map((block, j) => (
                <BlockView key={j} block={block} />
              ))}
            </section>
          ))}
        </article>
      </div>

      <footer className="pp-footer">© 2026 Varoom. All rights reserved.</footer>
    </div>
  );
}
