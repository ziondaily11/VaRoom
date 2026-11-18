import React from 'react';

// The grey box every Settings section is built from (the Plans & Billing
// style): an optional header with an icon and title, then rows (which carry
// their own padding) or, with `padded`, free content such as a form.

export default function SettingsBox({ title, icon, id, padded = false, style, children }: {
  title?: string;
  icon?: React.ReactNode;
  id?: string;
  padded?: boolean;
  style?: React.CSSProperties;
  children: React.ReactNode;
}) {
  return (
    <section className="plan-box" id={id} style={style}>
      {title && <header className="plan-box-head">{icon}<span>{title}</span></header>}
      {padded ? <div className="plan-box-body">{children}</div> : children}
    </section>
  );
}

/**
 * A row's panel that opens under it (edit a detail, change the password,
 * deactivate, delete). It grows and shrinks smoothly (animation.md C5, grid
 * rows); while closed it is hidden from keyboard and screen readers.
 */
export function ExpandPanel({ open, id, children }: { open: boolean; id?: string; children: React.ReactNode }) {
  return (
    <div className={`expand-panel${open ? ' show' : ''}`} id={id} aria-hidden={!open} inert={!open}>
      <div className="expand-inner"><div className="expand-pad">{children}</div></div>
    </div>
  );
}
