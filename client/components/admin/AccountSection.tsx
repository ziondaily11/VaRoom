import React, { useState } from "react";
import type { AccountOverview, GivablePlan } from "../../lib/admin/adminApi";
import { ConsequentialButton, SectionHeader, StatusPill } from "./AdminUi";

// One account, everything about it (GET /admin/users/:id): who they are,
// linked accounts and teams, listings, bookings, reports, tickets, billing,
// V-Coins, warnings and suspensions, private notes and the admin trail.
// Names open the other person's account; tickets open in Support.

const when = (value: string | null | undefined) => (value ? new Date(value).toLocaleString() : "—");
const formatMoney = (minor: number, currency: string) => `${currency} ${(minor / 100).toLocaleString()}`;

function Card({ title, count, children }: { title: string; count?: number; children: React.ReactNode }) {
  return (
    <div className="border border-[#E4E1DA] rounded-sm bg-white p-4">
      <div className="text-xs tracking-wide text-[#8a857c] mb-2">{title}{count !== undefined ? ` · ${count}` : ""}</div>
      {children}
    </div>
  );
}

const Empty = () => <div className="text-sm text-[#8a857c]">None</div>;

export interface AccountMoney {
  loadPlans: (userId: string) => Promise<GivablePlan[]>;
  givePlan: (userId: string, planId: string, days: number, reason: string) => Promise<boolean>;
  endPlan: (userId: string, reason: string) => Promise<boolean>;
  grantVcoins: (userId: string, amount: number, reason: string) => Promise<boolean>;
}

const field = "border border-[#E4E1DA] rounded-sm p-1 text-sm";

/** Give a free plan of the host's niche (or extend the one they have), end it, or grant V-Coins. Super admins only (server). */
function MoneyControls({ account, money }: { account: AccountOverview; money: AccountMoney }) {
  const userId = account.user.id;
  const [plans, setPlans] = useState<GivablePlan[] | null>(null);
  const [planId, setPlanId] = useState("");
  const [days, setDays] = useState("30");
  const [coins, setCoins] = useState("100");
  const comp = account.billing.subscriptions.find((s) => s.comp && ["active", "past_due", "cancel_requested"].includes(s.status));
  const paid = account.billing.subscriptions.find((s) => !s.comp && ["pending", "active", "past_due", "cancel_requested"].includes(s.status));
  async function showPlans() {
    const list = await money.loadPlans(userId).catch(() => []);
    setPlans(list);
    setPlanId(comp?.plan_id || list[0]?.id || "");
  }
  return (
    <div className="mt-3 pt-3 border-t border-[#E4E1DA] space-y-2 text-sm">
      {paid ? <div className="text-xs text-[#8a857c]">This host pays through Paystack; change their plan there.</div>
        : plans === null ? <button onClick={() => { void showPlans(); }} className="text-xs text-[#1F6F5C]">{comp ? "Extend or change the free plan…" : "Give a free plan…"}</button>
          : plans.length === 0 ? <div className="text-xs text-[#8a857c]">No plans for this host's niche.</div>
            : <div className="flex flex-wrap items-center gap-2">
              <select value={planId} onChange={(e) => setPlanId(e.target.value)} className={field}>{plans.map((p) => <option key={p.id} value={p.id}>{p.name} (KES {p.monthly.toLocaleString()}/mo)</option>)}</select>
              <input type="number" min={1} max={365} value={days} onChange={(e) => setDays(e.target.value)} className={`${field} w-16`} aria-label="Days" /> days
              <ConsequentialButton label={comp ? "Extend free plan" : "Give free plan"} onConfirm={(reason) => money.givePlan(userId, planId, Number(days), reason)} />
            </div>}
      {comp && <ConsequentialButton label="End free plan" tone="danger" onConfirm={(reason) => money.endPlan(userId, reason)} />}
      <div className="flex flex-wrap items-center gap-2">
        <input type="number" min={1} max={10000} value={coins} onChange={(e) => setCoins(e.target.value)} className={`${field} w-20`} aria-label="V-Coins" />
        <ConsequentialButton label="Grant V-Coins" onConfirm={(reason) => money.grantVcoins(userId, Number(coins), reason)} />
      </div>
    </div>
  );
}

function List<T>({ rows, render }: { rows: T[]; render: (row: T, index: number) => React.ReactNode }) {
  return rows.length ? <ul className="text-sm space-y-1.5">{rows.map((row, index) => <li key={index}>{render(row, index)}</li>)}</ul> : <Empty />;
}

const DOCUMENT_LABELS: Record<string, string> = {
  ownership_management: "Ownership or management", property_policy: "Property policy", commercial_policy: "Commercial policy", floor_plan: "Floor plan",
};

export function Account({ account, loading, onBack, openAccount, openTicket, updateStatus, addNote, money, setVerified }: {
  account: AccountOverview | null;
  loading: boolean;
  onBack: () => void;
  openAccount: (id: string) => void;
  openTicket: (id: string) => void;
  updateStatus: (id: string, status: string, reason: string, days?: number) => Promise<unknown>;
  addNote: (userId: string, body: string) => Promise<boolean>;
  money: AccountMoney;
  setVerified: (userId: string, verified: boolean, reason: string) => Promise<boolean>;
}) {
  const [note, setNote] = useState("");
  if (!account) return <div className="text-sm text-[#8a857c]">{loading ? "Loading the account…" : "This account could not be loaded."}</div>;
  const { user } = account;
  const status = user.account?.status || "active";
  const person = (id: string, name: string | null) => <button onClick={() => openAccount(id)} className="text-[#1F6F5C] hover:underline">{name || id.slice(0, 8)}</button>;

  return (
    <div>
      <button onClick={onBack} className="text-xs text-[#8a857c] mb-3">← Back</button>
      <SectionHeader title={user.profile?.full_name || user.profile?.username || user.email} description={`${user.email} · ${user.profile?.role || "no role"} · signs in with ${user.provider}`} />
      <div className="flex flex-wrap items-center gap-2 mb-5">
        <StatusPill status={status} />
        {status === "suspended" && <span className="text-xs text-[#8a857c]">{user.account?.suspended_until ? `until ${when(user.account.suspended_until)}` : "until reviewed"}{user.account?.rule_key ? " · automatic" : ""}</span>}
        {user.account?.reason && status !== "active" && <span className="text-xs text-[#8a857c]">· {user.account.reason}</span>}
        <span className="ml-auto flex flex-wrap gap-2">
          {status === "active" ? <>
            <ConsequentialButton label="Warn" tone="danger" onConfirm={(reason) => updateStatus(user.id, "warning", reason)} />
            <ConsequentialButton label="Suspend 7 days" tone="danger" onConfirm={(reason) => updateStatus(user.id, "suspended", reason, 7)} />
            <ConsequentialButton label="Suspend until reviewed" tone="danger" onConfirm={(reason) => updateStatus(user.id, "suspended", reason)} />
            <ConsequentialButton label="Disable" tone="danger" onConfirm={(reason) => updateStatus(user.id, "disabled", reason)} />
          </> : <ConsequentialButton label="Restore" onConfirm={(reason) => updateStatus(user.id, "active", reason)} />}
        </span>
      </div>

      <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
        <Card title="Profile">
          <dl className="text-sm grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
            <dt className="text-[#8a857c]">Username</dt><dd>{user.profile?.username || "—"}</dd>
            <dt className="text-[#8a857c]">Phone</dt><dd>{user.profile?.phone || "—"}</dd>
            <dt className="text-[#8a857c]">City</dt><dd>{user.profile?.city || "—"}</dd>
            <dt className="text-[#8a857c]">Host type</dt><dd>{user.profile?.business_name || user.profile?.host_type || "—"}</dd>
            <dt className="text-[#8a857c]">Verified host</dt><dd>{user.profile?.verified ? "Yes" : "No"}</dd>
            <dt className="text-[#8a857c]">Joined</dt><dd>{when(user.created_at)}</dd>
            <dt className="text-[#8a857c]">Last sign-in</dt><dd>{when(user.last_sign_in_at)}</dd>
            {user.profile?.deactivated_at && <><dt className="text-[#8a857c]">Deactivated</dt><dd>{when(user.profile.deactivated_at)}</dd></>}
          </dl>
        </Card>

        <Card title="Linked accounts" count={account.linked.length}>
          <List rows={account.linked} render={(l) => <>{person(l.id, l.name)} <StatusPill status={l.status} /></>} />
        </Card>

        <Card title="Team" count={account.team.length}>
          <List rows={account.team} render={(t) => <>{t.as === "owner" ? "Member: " : "Works for: "}{person(t.id, t.name)} <span className="text-xs text-[#8a857c]">{(t.roles || []).join(", ")} · {t.status}</span></>} />
        </Card>

        <Card title="Listings" count={account.listings.length}>
          <List rows={account.listings} render={(l) => <>
            <a href={`/booking?listing=${l.id}`} target="_blank" rel="noopener noreferrer" className="text-[#1F6F5C] hover:underline">{l.title}</a>
            {" "}<span className="text-xs text-[#8a857c]">{l.category} · {l.publication_state || l.availability_status}</span>
            {l.moderation_status !== "active" && <> <StatusPill status={l.moderation_status} /></>}
          </>} />
        </Card>

        <Card title="Bookings as host" count={account.bookings.asHost.count}>
          <List rows={account.bookings.asHost.recent} render={(b) => <>{b.listing || "Listing"} · guest {person(b.other_id, b.other)} <span className="text-xs text-[#8a857c]">{b.status} · {when(b.created_at)}</span></>} />
        </Card>

        <Card title="Bookings as guest" count={account.bookings.asGuest.count}>
          <List rows={account.bookings.asGuest.recent} render={(b) => <>host {person(b.other_id, b.other)} <span className="text-xs text-[#8a857c]">{b.status} · {when(b.created_at)}</span></>} />
        </Card>

        <Card title="Reports about this person" count={account.reports.received.length + account.reports.onListings.length}>
          <List rows={[...account.reports.received, ...account.reports.onListings]} render={(r) => <>
            {r.listing ? `Listing "${r.listing}"` : "Chat"}: {r.reason} · by {r.other_id ? person(r.other_id, r.other || null) : "unknown"}
            {" "}<StatusPill status={r.status} />{r.details && <div className="text-xs text-[#8a857c]">{r.details}</div>}
          </>} />
        </Card>

        <Card title="Reports this person filed" count={account.reports.filed.length + account.reports.filedOnListings.length}>
          <List rows={[...account.reports.filed, ...account.reports.filedOnListings]} render={(r) => <>
            {r.other_id ? <>About {person(r.other_id, r.other || null)}</> : "About a listing"}: {r.reason} <StatusPill status={r.status} />
          </>} />
        </Card>

        <Card title="Support tickets" count={account.tickets.length}>
          <List rows={account.tickets} render={(t) => <><button onClick={() => openTicket(t.id)} className="text-[#1F6F5C] hover:underline text-left">{t.subject}</button> <StatusPill status={t.status} /></>} />
        </Card>

        <Card title="Plans and payments">
          <List rows={account.billing.subscriptions} render={(s) => <>{s.plan_id}{s.niche ? ` (${s.niche})` : ""}{s.comp ? " · free from VaRoom" : ""} <StatusPill status={s.status} /> <span className="text-xs text-[#8a857c]">to {when(s.current_period_end)}{s.cancel_at_period_end ? " · cancels" : ""}</span></>} />
          <div className="mt-3" />
          <List rows={account.billing.payments} render={(p) => <>{formatMoney(p.amount_minor, p.currency)} · {p.payment_kind || p.plan_id} <StatusPill status={p.status} /> <span className="text-xs text-[#8a857c] font-mono">{p.provider_reference}</span></>} />
        </Card>

        <Card title={`V-Coins · balance ${account.vcoins.balance}`}>
          <List rows={account.vcoins.recent} render={(v) => <>{v.delta > 0 ? "+" : ""}{v.delta} · {v.kind} <span className="text-xs text-[#8a857c]">{when(v.created_at)}</span></>} />
          <MoneyControls account={account} money={money} />
        </Card>

        <Card title="Warnings, suspensions and restores" count={account.actions.length}>
          <List rows={account.actions} render={(a) => <><span className="font-medium">{a.action}</span>{a.suspended_until ? ` until ${when(a.suspended_until)}` : ""} · {a.reason} <span className="text-xs text-[#8a857c]">{a.admin?.name || "System"} · {when(a.created_at)}</span></>} />
        </Card>
      </div>

      <div className="grid md:grid-cols-2 gap-4 mt-4">
        <Card title="Private notes (admins only)" count={account.notes.length}>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={4000} rows={3} placeholder="Add a note for other admins" className="w-full border border-[#E4E1DA] rounded-sm p-2 text-sm resize-none mb-2" />
          <button disabled={!note.trim()} onClick={async () => { if (await addNote(user.id, note.trim())) setNote(""); }} className="px-3 py-1.5 text-sm bg-[#1F6F5C] text-white rounded-sm disabled:opacity-50 mb-3">Add note</button>
          <List rows={account.notes} render={(n) => <><div className="whitespace-pre-wrap">{n.body}</div><div className="text-xs text-[#8a857c]">{n.admin?.name || "Admin"} · {when(n.created_at)}</div></>} />
        </Card>
        <Card title="Documents and verification" count={account.documents.length}>
          <List rows={account.documents} render={(d) => <>
            <a href={`/admin/documents/${d.id}/open`} target="_blank" rel="noopener noreferrer" className="text-[#1F6F5C] hover:underline">{DOCUMENT_LABELS[d.document_type] || d.document_type}</a>
            {" "}<span className="text-xs text-[#8a857c]">{d.listing || "Listing"} · {d.original_filename} · {d.visibility === "host_only" ? "private" : "on the listing"}</span>
          </>} />
          <div className="mt-3 pt-3 border-t border-[#E4E1DA] text-xs text-[#8a857c] mb-2">Opening a document is recorded. The Verified host badge shows on this host's listings and profile.</div>
          {user.profile?.verified
            ? <ConsequentialButton label="Remove Verified host" tone="danger" onConfirm={(reason) => setVerified(user.id, false, reason)} />
            : <ConsequentialButton label="Mark as Verified host" onConfirm={(reason) => setVerified(user.id, true, reason)} />}
        </Card>
        <Card title="Admin activity on this account" count={account.activity.length}>
          <List rows={account.activity} render={(a) => <>{a.action.replaceAll("_", " ")}{a.reason ? ` · ${a.reason}` : ""} <span className="text-xs text-[#8a857c]">{a.admin?.name || "System"} · {when(a.created_at)}</span></>} />
        </Card>
      </div>
    </div>
  );
}
