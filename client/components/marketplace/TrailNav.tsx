import React from 'react';
import Link from 'next/link';
import { isModifiedClick } from '../../lib/navigation/clicks';
import type { Crumb } from '../../lib/marketplace/drilldown';

/**
 * The Marketplace breadcrumb (Marketplace › Property › Buy › Apartment), on
 * the Marketplace and on a listing opened from it. Every part but the last is
 * a link back; `onBack` lets the Marketplace go back in place instead of
 * loading the address (a modified click still opens a new tab).
 */
export default function TrailNav({ crumbs, current, onBack }: {
  crumbs: Crumb[];
  /** A last part that is not a link (the listing's name); else the last crumb is the current one. */
  current?: string;
  onBack?: (index: number) => void;
}) {
  const links = current ? crumbs : crumbs.slice(0, -1);
  const here = current || (crumbs.length ? crumbs[crumbs.length - 1].label : '');
  if (!links.length) return null;
  return (
    <nav className="mkt-crumbs" aria-label="Breadcrumb">
      <ol>
        {links.map((crumb, index) => (
          <li key={crumb.href}>
            <Link
              href={crumb.href}
              scroll={false}
              onClick={(event) => {
                if (!onBack || isModifiedClick(event)) return;
                event.preventDefault();
                onBack(index);
              }}
            >{crumb.label}</Link>
          </li>
        ))}
        <li><span aria-current="page">{here}</span></li>
      </ol>
    </nav>
  );
}

/** Breadcrumb styles, shared by the Marketplace and the listing page (scoped by .mkt-crumbs). */
export const TRAIL_STYLES = `
  .mkt-crumbs { min-width: 0; margin: 0 0 .75rem; }
  .mkt-crumbs ol { display: flex; flex-wrap: wrap; align-items: center; gap: .15rem .35rem; margin: 0; padding: 0; list-style: none; font-size: .82rem; line-height: 1.4; }
  .mkt-crumbs li { display: inline-flex; align-items: center; gap: .35rem; min-width: 0; }
  .mkt-crumbs li + li::before { content: '›'; color: var(--muted, #6b7280); }
  .mkt-crumbs a { color: var(--muted, #6b7280); text-decoration: none; border-radius: 4px; }
  .mkt-crumbs a:hover { color: var(--ink, #111); text-decoration: underline; }
  .mkt-crumbs a:focus-visible { outline: 2px solid currentColor; outline-offset: 2px; }
  .mkt-crumbs [aria-current="page"] { color: var(--ink, #111); font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 60vw; }
`;
