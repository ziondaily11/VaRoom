import React, { useEffect, useRef, useState } from "react";
import { Search } from "lucide-react";
import { searchAdmin, type SearchResults } from "../../lib/admin/adminApi";
import { Avatar, StatusPill } from "./AdminUi";

// The top-bar search: accounts (email, name, username, id), listings (title,
// id), tickets (subject, email, #REF) and payments (reference). It waits for
// a pause in typing, and a newer search cancels the one before it. "/" or
// Ctrl/⌘+K focuses it.

export function SearchBox({ openAccount, openTicket }: { openAccount: (id: string) => void; openTicket: (id: string) => void }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResults | null>(null);
  const [open, setOpen] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) { setResults(null); return undefined; }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      searchAdmin(q, controller.signal).then(setResults).catch(() => { if (!controller.signal.aborted) setResults(null); });
    }, 300);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [query]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const typing = event.target instanceof HTMLElement && /^(INPUT|TEXTAREA|SELECT)$/.test(event.target.tagName);
      if ((event.key === "k" && (event.metaKey || event.ctrlKey)) || (event.key === "/" && !typing)) {
        event.preventDefault();
        input.current?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const pick = (action: () => void) => () => { action(); setOpen(false); setQuery(""); };
  const empty = results && !results.users.length && !results.listings.length && !results.tickets.length && !results.payments.length;
  const keep = (event: React.MouseEvent) => event.preventDefault();

  return (
    <div style={{ position: "relative", flex: "1 1 280px", maxWidth: 560 }}>
      <label className="adm-search" style={{ maxWidth: "none" }}>
        <Search size={16} aria-hidden="true" />
        <input
          ref={input}
          type="search"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onBlur={() => window.setTimeout(() => setOpen(false), 150)}
          onKeyDown={(e) => { if (e.key === "Escape") { setOpen(false); input.current?.blur(); } }}
          placeholder="Search accounts, listings, tickets, payments…"
          aria-label="Search accounts, listings, tickets and payments"
        />
        <span className="adm-kbd" aria-hidden="true">/</span>
      </label>
      {open && results && (
        <div className="adm-popover" role="listbox" aria-label="Search results">
          {empty && <div className="adm-empty">Nothing found for “{query.trim()}”.</div>}
          {results.users.length > 0 && <div className="adm-popover__head">Accounts</div>}
          {results.users.map((u) => (
            <button key={u.id} type="button" onMouseDown={keep} onClick={pick(() => openAccount(u.id))} className="adm-popover__item">
              <Avatar name={u.full_name || u.username || u.email} id={u.id} size="sm" />
              <span style={{ minWidth: 0, display: "flex", flexDirection: "column" }}><strong className="adm-ellipsis">{u.full_name || u.username || u.email || "Unnamed"}</strong>{u.email && <span className="adm-small adm-muted adm-ellipsis">{u.email}</span>}</span>
            </button>
          ))}
          {results.listings.length > 0 && <div className="adm-popover__head">Listings · opens the owner</div>}
          {results.listings.map((l) => (
            <button key={l.id} type="button" onMouseDown={keep} onClick={pick(() => openAccount(l.host_id))} className="adm-popover__item">
              <span className="adm-strong adm-ellipsis" style={{ flex: 1 }}>{l.title}</span>{l.moderation_status !== "active" && <StatusPill status={l.moderation_status} />}
            </button>
          ))}
          {results.tickets.length > 0 && <div className="adm-popover__head">Tickets</div>}
          {results.tickets.map((t) => (
            <button key={t.id} type="button" onMouseDown={keep} onClick={pick(() => openTicket(t.id))} className="adm-popover__item">
              <span style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}><strong className="adm-ellipsis">{t.subject}</strong><span className="adm-small adm-muted adm-ellipsis">{t.email}</span></span><StatusPill status={t.status} />
            </button>
          ))}
          {results.payments.length > 0 && <div className="adm-popover__head">Payments · opens the payer</div>}
          {results.payments.map((p) => (
            <button key={p.id} type="button" onMouseDown={keep} onClick={pick(() => openAccount(p.host_id))} className="adm-popover__item">
              <span className="adm-mono" style={{ flex: 1 }}>{p.provider_reference}</span><span className="adm-small adm-muted">{p.currency} {(p.amount_minor / 100).toLocaleString()}</span><StatusPill status={p.status} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
