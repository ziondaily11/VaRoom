import React, { useEffect, useRef, useState } from "react";
import { MoreHorizontal, type LucideIcon } from "lucide-react";
import { humanize, initials, toneFor } from "../../lib/admin/format";

// The admin page's shared pieces. Their look is the adm- classes in
// styles/admin.css (light and dark tokens); nothing here names a colour.

export type Tone = "neutral" | "good" | "warn" | "bad" | "info" | "accent" | "violet";

export function SectionHeader({ title, description, eyebrow, actions }: { title: string; description?: string; eyebrow?: string; actions?: React.ReactNode }) {
  return (
    <div className="adm-head">
      <div className="adm-head__text">
        {eyebrow && <div className="adm-eyebrow">{eyebrow}</div>}
        <h1 className="adm-title">{title}</h1>
        {description && <p className="adm-subtitle">{description}</p>}
      </div>
      {actions && <div className="adm-head__actions">{actions}</div>}
    </div>
  );
}

export function Card({ title, count, actions, children, flush, className = "" }: {
  title?: React.ReactNode; count?: number; actions?: React.ReactNode; children: React.ReactNode; flush?: boolean; className?: string;
}) {
  return (
    <section className={`adm-card${flush ? " adm-card--flush" : ""} ${className}`}>
      {(title || actions) && (
        <div className="adm-card__head" style={flush ? { padding: "16px 18px 0" } : undefined}>
          {title && <h2 className="adm-h2">{title}</h2>}
          {count !== undefined && <span className="adm-card__count">{count}</span>}
          {actions && <div className="adm-card__actions">{actions}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

export function StatCard({ label, value, sub, icon: Icon, tone }: { label: string; value: React.ReactNode; sub?: string; icon?: LucideIcon; tone?: "bad" | "warn" }) {
  return (
    <div className="adm-card adm-stat" data-tone={tone}>
      <div className="adm-stat__top">
        {Icon && <span className="adm-stat__icon"><Icon size={18} aria-hidden="true" /></span>}
        <span>{label}</span>
      </div>
      <div className="adm-stat__value">{value}</div>
      {sub && <div className="adm-stat__sub">{sub}</div>}
    </div>
  );
}

export function Pill({ tone = "neutral", dot, children }: { tone?: Tone; dot?: boolean; children: React.ReactNode }) {
  return <span className="adm-pill" data-tone={tone}>{dot && <span className="adm-pill__dot" aria-hidden="true" />}{children}</span>;
}

// Every status the admin page shows, with its words and colour.
const STATUS: Record<string, [string, Tone]> = {
  open: ["Open", "info"], in_progress: ["Waiting on them", "warn"], resolved: ["Resolved", "good"], closed: ["Closed", "neutral"],
  pending: ["Pending", "warn"], reviewed: ["Reviewed", "info"], actioned: ["Actioned", "good"], dismissed: ["Dismissed", "neutral"],
  active: ["Active", "good"], suspended: ["Suspended", "warn"], disabled: ["Disabled", "bad"], warning: ["Warned", "warn"], restored: ["Restored", "good"],
  hidden: ["Hidden", "warn"], removed: ["Removed", "bad"], published: ["Published", "good"], draft: ["Draft", "neutral"], unpublished: ["Unpublished", "neutral"],
  approved: ["Approved", "good"], available: ["Available", "good"], unavailable: ["Unavailable", "neutral"], paused: ["Paused", "neutral"],
  payment_pending: ["Awaiting payment", "warn"],
  succeeded: ["Paid", "good"], failed: ["Failed", "bad"], abandoned: ["Abandoned", "neutral"], refunded: ["Refunded", "warn"], initialized: ["Started", "neutral"],
  expired: ["Expired", "neutral"], cancel_requested: ["Cancelling", "warn"], past_due: ["Past due", "warn"], cancelled: ["Cancelled", "neutral"],
  off: ["Off", "neutral"], shadow: ["Shadow", "info"], enforce: ["Enforce", "accent"],
  flagged: ["Flagged", "warn"], sent: ["Sent", "good"], received: ["Received", "info"],
  job_ok: ["Running", "good"], job_late: ["Late", "warn"], job_failing: ["Failing", "bad"], job_waiting: ["Waiting to run", "neutral"],
};

/** A status as a coloured label: "suspended" → Suspended (amber). Rule results like "would_suspended" read "Would suspend". */
export function StatusPill({ status }: { status: string | null | undefined }) {
  const key = String(status || "");
  if (key.startsWith("would_")) return <Pill tone="info" dot>Would {humanize(key.slice(6)).toLowerCase()}</Pill>;
  const [label, tone] = STATUS[key] || [humanize(key) || "—", "neutral" as Tone];
  return <Pill tone={tone} dot>{label}</Pill>;
}

export function Avatar({ name, id, size }: { name: string | null | undefined; id?: string | null; size?: "sm" | "lg" }) {
  return <span className={`adm-avatar${size ? ` adm-avatar--${size}` : ""}`} data-tone={toneFor(id || name)} aria-hidden="true">{initials(name)}</span>;
}

/** A person with avatar and a second line; the name opens their account when `onOpen` is given. */
export function Person({ name, sub, id, onOpen }: { name: string | null | undefined; sub?: React.ReactNode; id?: string | null; onOpen?: () => void }) {
  const label = name || "Unnamed";
  return (
    <span className="adm-person">
      <Avatar name={label} id={id} />
      <span className="adm-person__text">
        {onOpen ? <button type="button" onClick={onOpen} className="adm-link adm-link--plain adm-ellipsis">{label}</button> : <strong className="adm-ellipsis">{label}</strong>}
        {sub && <span className="adm-small adm-muted adm-ellipsis">{sub}</span>}
      </span>
    </span>
  );
}

export function Table<T>({ columns, rows, renderRow, empty = "Nothing here yet.", toolbar, footer, minWidth = 720 }: {
  columns: string[]; rows: T[]; renderRow: (row: T, index: number) => React.ReactNode; empty?: string;
  toolbar?: React.ReactNode; footer?: React.ReactNode; minWidth?: number;
}) {
  return (
    <div className="adm-table-card">
      {toolbar && <div className="adm-toolbar">{toolbar}</div>}
      <div className="adm-table-scroll">
        <table className="adm-table" style={{ minWidth }}>
          <thead>
            <tr>{columns.map((c, i) => <th key={`${c}-${i}`}>{c || <span className="sr-only">Actions</span>}</th>)}</tr>
          </thead>
          <tbody>
            {rows.length ? rows.map(renderRow) : <tr><td colSpan={columns.length} className="adm-empty">{empty}</td></tr>}
          </tbody>
        </table>
      </div>
      {footer && <div className="adm-table-foot">{footer}</div>}
    </div>
  );
}

export function Tabs<K extends string>({ tabs, value, onChange, label }: {
  tabs: Array<{ key: K; label: string; count?: number }>; value: K; onChange: (key: K) => void; label: string;
}) {
  return (
    <div className="adm-tabs" role="tablist" aria-label={label}>
      {tabs.map((tab) => (
        <button key={tab.key} type="button" role="tab" aria-selected={tab.key === value} className="adm-tab" onClick={() => onChange(tab.key)}>
          {tab.label}{tab.count !== undefined && <span className="adm-tab__count">{tab.count}</span>}
        </button>
      ))}
    </div>
  );
}

/** Asks for the audit reason (required for dangerous actions) and confirms dangerous ones. Null when cancelled. */
export function askReason(label: string, danger: boolean): string | null {
  const reason = window.prompt(`${label}: enter the reason for the audit record.`);
  if (reason === null) return null;
  if (!reason.trim() && danger) {
    window.alert("A reason is required for this action.");
    return null;
  }
  if (danger && !window.confirm(`${label} will take effect across VaRoom. Continue?`)) return null;
  return reason.trim();
}

/** An audited action button: asks for the reason, and confirms dangerous ones. */
export function ConsequentialButton({ label, tone = "normal", primary, small = true, onConfirm }: {
  label: string; tone?: "normal" | "danger"; primary?: boolean; small?: boolean; onConfirm: (reason: string) => Promise<unknown>;
}) {
  const handleClick = async () => {
    const reason = askReason(label, tone === "danger");
    if (reason !== null) await onConfirm(reason);
  };
  const variant = primary ? " adm-btn--primary" : tone === "danger" ? " adm-btn--danger" : "";
  return <button type="button" onClick={() => { void handleClick(); }} className={`adm-btn${small ? " adm-btn--sm" : ""}${variant}`}>{label}</button>;
}

export interface MenuAction { label: string; danger?: boolean; onConfirm: (reason: string) => Promise<unknown>; separatorBefore?: boolean }

/** The ⋯ menu of audited actions on a row; each asks for its reason like ConsequentialButton. */
export function ActionMenu({ label, actions }: { label: string; actions: MenuAction[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return undefined;
    const close = (event: MouseEvent | KeyboardEvent) => {
      if (event instanceof KeyboardEvent ? event.key === "Escape" : !ref.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", close); };
  }, [open]);
  if (!actions.length) return null;
  return (
    <div className="adm-menu" ref={ref}>
      <button type="button" className="adm-btn adm-btn--sm adm-btn--icon" aria-label={label} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <MoreHorizontal size={16} aria-hidden="true" />
      </button>
      {open && (
        <div className="adm-menu__list" role="menu">
          {actions.map((action) => (
            <React.Fragment key={action.label}>
              {action.separatorBefore && <div className="adm-menu__sep" role="separator" />}
              <button type="button" role="menuitem" className="adm-menu__item" data-tone={action.danger ? "danger" : undefined}
                onClick={() => {
                  setOpen(false);
                  const reason = askReason(action.label, Boolean(action.danger));
                  if (reason !== null) void action.onConfirm(reason);
                }}>
                {action.label}
              </button>
            </React.Fragment>
          ))}
        </div>
      )}
    </div>
  );
}

/** A day-by-day bar chart in the theme's colours; `series` 1 or 2 values per day. */
export function Bars({ days, values, label, format = String }: {
  days: string[]; values: number[][]; label: string; format?: (n: number) => string;
}) {
  const max = Math.max(1, ...values.flat());
  const first = days[0];
  const last = days[days.length - 1];
  const middle = days[Math.floor(days.length / 2)];
  const short = (day?: string) => (day ? new Date(`${day}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : "");
  return (
    <div>
      <div className="adm-bars" role="img" aria-label={label}>
        {days.map((day, i) => (
          <div key={day} className="adm-bars__col" title={`${short(day)}: ${values[i].map(format).join(" · ")}`}>
            {values[i].map((v, s) => (
              <span key={s} className="adm-bars__bar" data-series={s} data-on={v > 0} style={{ height: v > 0 ? `${Math.max(4, (v / max) * 100)}%` : undefined }} />
            ))}
          </div>
        ))}
      </div>
      <div className="adm-bars__axis"><span>{short(first)}</span><span>{short(middle)}</span><span>{short(last)}</span></div>
    </div>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <div className="adm-empty">{children}</div>;
}
