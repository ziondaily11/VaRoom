import React, { useEffect, useState } from "react";
import { Search } from "lucide-react";
import { searchAdmin, type SearchResults } from "../../lib/admin/adminApi";

// The header search: accounts (email, name, username, id), listings (title,
// id), tickets (subject, email, #REF) and payments (reference). It waits for
// a pause in typing, and a newer search cancels the one before it.

export function SearchBox({ openAccount, openTicket }: { openAccount: (id: string) => void; openTicket: (id: string) => void }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResults | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) { setResults(null); return undefined; }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      searchAdmin(q, controller.signal).then(setResults).catch(() => { if (!controller.signal.aborted) setResults(null); });
    }, 300);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [query]);

  const pick = (action: () => void) => () => { action(); setOpen(false); setQuery(""); };
  const empty = results && !results.users.length && !results.listings.length && !results.tickets.length && !results.payments.length;
  const row = "w-full text-left px-3 py-1.5 text-sm hover:bg-[#F7F6F3] block";
  const heading = "px-3 pt-2 pb-1 text-xs text-[#8a857c]";

  return (
    <div className="relative w-full max-w-md">
      <div className="flex items-center gap-2 text-[#8a857c] text-sm">
        <Search size={15} />
        <input
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onBlur={() => window.setTimeout(() => setOpen(false), 150)}
          onKeyDown={(e) => { if (e.key === "Escape") setOpen(false); }}
          placeholder="Search users, listings, tickets…"
          aria-label="Search users, listings, tickets and payments"
          className="flex-1 bg-transparent border-0 outline-none text-sm text-[#24211E] placeholder:text-[#8a857c]"
        />
      </div>
      {open && results && (
        <div className="absolute left-0 right-0 top-9 z-20 border border-[#E4E1DA] rounded-sm bg-white shadow-sm max-h-96 overflow-auto py-1">
          {empty && <div className="px-3 py-2 text-sm text-[#8a857c]">Nothing found.</div>}
          {results.users.length > 0 && <div className={heading}>Accounts</div>}
          {results.users.map((u) => (
            <button key={u.id} onMouseDown={(e) => e.preventDefault()} onClick={pick(() => openAccount(u.id))} className={row}>
              {u.full_name || u.username || u.email || u.id} {u.email && <span className="text-xs text-[#8a857c]">{u.email}</span>}
            </button>
          ))}
          {results.listings.length > 0 && <div className={heading}>Listings (opens the owner)</div>}
          {results.listings.map((l) => (
            <button key={l.id} onMouseDown={(e) => e.preventDefault()} onClick={pick(() => openAccount(l.host_id))} className={row}>
              {l.title} {l.moderation_status !== "active" && <span className="text-xs text-[#B5482E]">{l.moderation_status}</span>}
            </button>
          ))}
          {results.tickets.length > 0 && <div className={heading}>Tickets</div>}
          {results.tickets.map((t) => (
            <button key={t.id} onMouseDown={(e) => e.preventDefault()} onClick={pick(() => openTicket(t.id))} className={row}>
              {t.subject} <span className="text-xs text-[#8a857c]">{t.email} · {t.status}</span>
            </button>
          ))}
          {results.payments.length > 0 && <div className={heading}>Payments (opens the payer)</div>}
          {results.payments.map((p) => (
            <button key={p.id} onMouseDown={(e) => e.preventDefault()} onClick={pick(() => openAccount(p.host_id))} className={row}>
              <span className="font-mono text-xs">{p.provider_reference}</span> <span className="text-xs text-[#8a857c]">{p.currency} {(p.amount_minor / 100).toLocaleString()} · {p.status}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
