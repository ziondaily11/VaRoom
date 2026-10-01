"use client";

import { useEffect, useState } from "react";
import { LAST_UPDATED, intro, sections, type Block, type Inline } from "./privacyContent";

const sectionIds = sections.map((s) => s.id);

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

function TableOfContents({ active }: { active: string }) {
  const [open, setOpen] = useState(false);

  return (
    <nav className="pp-toc" aria-label="Privacy policy sections">
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

export default function PrivacyPolicyPage() {
  const active = useActiveSection(sectionIds);

  return (
    <div className="pp-root">
      <header className="pp-hero">
        <a className="pp-brand" href="/">
          <span>V</span>aRoom
        </a>
        <h1>Privacy Policy</h1>
        <p className="pp-updated">Last updated: {LAST_UPDATED}</p>
      </header>

      <div className="pp-body">
        <TableOfContents active={active} />
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
