"use client";

import Head from "next/head";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

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

function Rich({ node }: { node: Inline }) {
  if (typeof node === "string") return <>{node}</>;
  if ("strong" in node) return <strong>{node.strong}</strong>;
  const isExternal = node.href.startsWith("http");
  return (
    <a
      href={node.href}
      target={isExternal ? "_blank" : undefined}
      rel={isExternal ? "noopener noreferrer" : undefined}
    >
      {node.text}
    </a>
  );
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
  onSelectSection,
}: {
  sections: Section[];
  active: string;
  label: string;
  dense: boolean;
  onSelectSection: (id: string) => void;
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
              onClick={(e) => {
                e.preventDefault();
                setOpen(false);
                onSelectSection(s.id);
              }}
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
  const [active, setActive] = useState<string>(sectionIds[0] ?? "");
  const contentPaneRef = useRef<HTMLDivElement>(null);

  const handleSelectSection = useCallback((id: string) => {
    const target = document.getElementById(id);
    if (!target) return;

    const pane = contentPaneRef.current;
    if (pane && typeof window !== "undefined" && window.innerWidth > 900) {
      const paneRect = pane.getBoundingClientRect();
      const targetRect = target.getBoundingClientRect();
      const offsetTop = targetRect.top - paneRect.top + pane.scrollTop - 24;

      pane.scrollTo({
        top: Math.max(0, offsetTop),
        behavior: "smooth",
      });
    } else {
      target.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }

    if (typeof window !== "undefined" && window.history && window.history.pushState) {
      window.history.pushState(null, "", `#${id}`);
    }
    setActive(id);
  }, []);

  // Tag document for desktop overflow containment & handle direct hash navigation
  useEffect(() => {
    document.documentElement.classList.add("has-legal-page");
    document.body.classList.add("has-legal-page");

    if (typeof window !== "undefined" && window.location.hash) {
      const hash = window.location.hash.replace(/^#/, "");
      if (hash) {
        const timer = setTimeout(() => {
          handleSelectSection(hash);
        }, 120);
        return () => {
          clearTimeout(timer);
          document.documentElement.classList.remove("has-legal-page");
          document.body.classList.remove("has-legal-page");
        };
      }
    }

    return () => {
      document.documentElement.classList.remove("has-legal-page");
      document.body.classList.remove("has-legal-page");
    };
  }, [handleSelectSection]);

  // Synchronize active section during scrolling on both desktop pane and mobile window
  useEffect(() => {
    const pane = contentPaneRef.current;

    const updateActiveSection = () => {
      const isDesktop = typeof window !== "undefined" && window.innerWidth > 900;
      const container = isDesktop && pane ? pane : null;

      let current = "";
      for (const id of sectionIds) {
        const el = document.getElementById(id);
        if (!el) continue;

        if (container) {
          const paneRect = container.getBoundingClientRect();
          const elRect = el.getBoundingClientRect();
          if (elRect.top - paneRect.top <= 140) {
            current = id;
          }
        } else {
          const elRect = el.getBoundingClientRect();
          if (elRect.top <= 180) {
            current = id;
          }
        }
      }

      if (current) {
        setActive(current);
      }
    };

    const isDesktop = typeof window !== "undefined" && window.innerWidth > 900;
    const scrollTarget = isDesktop && pane ? pane : typeof window !== "undefined" ? window : null;

    if (scrollTarget) {
      scrollTarget.addEventListener("scroll", updateActiveSection, { passive: true });
    }
    if (typeof window !== "undefined") {
      window.addEventListener("resize", updateActiveSection, { passive: true });
    }

    return () => {
      if (scrollTarget) {
        scrollTarget.removeEventListener("scroll", updateActiveSection);
      }
      if (typeof window !== "undefined") {
        window.removeEventListener("resize", updateActiveSection);
      }
    };
  }, [sectionIds]);

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
        <TableOfContents
          sections={sections}
          active={active}
          label={navLabel}
          dense={denseNav}
          onSelectSection={handleSelectSection}
        />
        <div className="pp-content-pane" ref={contentPaneRef}>
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
          <footer className="pp-footer">© 2026 Varoom. All rights reserved.</footer>
        </div>
      </div>
    </div>
  );
}
